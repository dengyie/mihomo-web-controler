#!/usr/bin/env python3
"""User rules reconciler and validator for Mihomo on tebi.

This script manages /personal/clash/rules/user-rules.yaml, validates schema
and Mihomo configuration syntax, and atomically reconciles user rules into
/personal/clash/config.yaml and /personal/clash/config.mac-merged.yaml.
"""
from __future__ import annotations

import argparse
import fcntl
import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml

ROOT = Path('/personal/clash')
RULES_FILE = ROOT / 'rules/user-rules.yaml'
TARGETS = (ROOT / 'config.mac-merged.yaml', ROOT / 'config.yaml')
SECRET_FILE = ROOT / '.controller-secret'
BIN = ROOT / 'mihomo'
LOCK_FILE = ROOT / '.user-rules.lock'
TRACKER_FILE = ROOT / 'rules/.injected_rules.json'

VALID_RULE_TYPES = {
    'DOMAIN',
    'DOMAIN-SUFFIX',
    'DOMAIN-KEYWORD',
    'IP-CIDR',
    'IP-CIDR6',
    'PROCESS-NAME',
    'GEOSITE',
    'GEOIP',
}

BUILTIN_TARGETS = {'DIRECT', 'REJECT', 'GLOBAL'}


def get_lock():
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_fd = open(LOCK_FILE, 'w')
    fcntl.flock(lock_fd, fcntl.LOCK_EX)
    return lock_fd


def get_controller_secret() -> str:
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text().strip()
    return ''


def get_available_targets(target_path: Path = ROOT / 'config.yaml') -> Set[str]:
    targets = set(BUILTIN_TARGETS)
    if not target_path.exists():
        return targets
    try:
        data = yaml.safe_load(target_path.read_text()) or {}
        for g in data.get('proxy-groups', []):
            if isinstance(g, dict) and 'name' in g:
                targets.add(g['name'])
    except Exception:
        pass
    return targets


def validate_rule_item(rule: Dict[str, Any], allowed_targets: Optional[Set[str]] = None) -> Tuple[bool, str]:
    if not isinstance(rule, dict):
        return False, "Rule item must be an object"

    rule_id = rule.get('id')
    if not rule_id or not isinstance(rule_id, str):
        return False, "Missing or invalid 'id'"

    rule_type = str(rule.get('type', '')).upper()
    if rule_type not in VALID_RULE_TYPES:
        return False, f"Invalid rule type: '{rule_type}'. Allowed: {sorted(VALID_RULE_TYPES)}"

    payload = str(rule.get('payload', '')).strip()
    if not payload:
        return False, "Payload cannot be empty"
    if ',' in payload or '\n' in payload or '\r' in payload:
        return False, "Payload cannot contain commas or newlines"

    if rule_type in ('DOMAIN', 'DOMAIN-SUFFIX'):
        if not re.match(r'^[a-zA-Z0-9_\.\-]+$', payload) or payload.startswith('.') or payload.endswith('.'):
            return False, f"Invalid domain payload: '{payload}'"
    elif rule_type == 'IP-CIDR':
        try:
            net = ipaddress.IPv4Network(payload, strict=False)
            rule['payload'] = str(net)
        except Exception as e:
            return False, f"Invalid IPv4 CIDR: {e}"
    elif rule_type == 'IP-CIDR6':
        try:
            net = ipaddress.IPv6Network(payload, strict=False)
            rule['payload'] = str(net)
        except Exception as e:
            return False, f"Invalid IPv6 CIDR: {e}"

    target = str(rule.get('target', '')).strip()
    if not target:
        return False, "Target cannot be empty"
    if allowed_targets and target not in allowed_targets:
        return False, f"Target '{target}' is not an existing proxy-group or built-in target"

    return True, ""


def rule_to_string(rule: Dict[str, Any]) -> str:
    rule_type = str(rule['type']).upper()
    payload = str(rule['payload']).strip()
    if rule_type == 'IP-CIDR':
        try:
            payload = str(ipaddress.IPv4Network(payload, strict=False))
        except Exception:
            pass
    elif rule_type == 'IP-CIDR6':
        try:
            payload = str(ipaddress.IPv6Network(payload, strict=False))
        except Exception:
            pass
    target = str(rule['target']).strip()
    params = rule.get('params')
    if params and isinstance(params, str) and params.strip():
        return f"{rule_type},{payload},{target},{params.strip()}"
    return f"{rule_type},{payload},{target}"


def load_user_rules() -> Dict[str, Any]:
    if not RULES_FILE.exists():
        return {'version': 1, 'rules': []}
    try:
        data = yaml.safe_load(RULES_FILE.read_text()) or {}
        if not isinstance(data, dict):
            return {'version': 1, 'rules': []}
        data.setdefault('version', 1)
        data.setdefault('rules', [])
        return data
    except Exception:
        return {'version': 1, 'rules': []}


def save_user_rules_file(data: Dict[str, Any]) -> None:
    RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp_file = RULES_FILE.with_suffix('.tmp')
    rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120)
    tmp_file.write_text(rendered)
    os.replace(tmp_file, RULES_FILE)


def load_injected_rules() -> List[str]:
    if not TRACKER_FILE.exists():
        return []
    try:
        data = json.loads(TRACKER_FILE.read_text())
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def save_injected_rules(injected: List[str]) -> None:
    TRACKER_FILE.parent.mkdir(parents=True, exist_ok=True)
    TRACKER_FILE.write_text(json.dumps(injected, ensure_ascii=False, indent=2))


def merge_rules_into_config(cfg: Dict[str, Any], user_rules_list: List[Dict[str, Any]], previous_injected: List[str]) -> Tuple[Dict[str, Any], List[str]]:
    original_rules = cfg.get('rules', [])
    if not isinstance(original_rules, list):
        original_rules = []

    # Safe removal: If previous_injected matches the top block exactly, strip it.
    # Otherwise, filter out rules matching previous_injected only from the prefix.
    prev_len = len(previous_injected)
    if prev_len > 0 and original_rules[:prev_len] == previous_injected:
        base_rules = original_rules[prev_len:]
    else:
        # Fallback: remove only the first occurrence of previously injected items
        base_rules = list(original_rules)
        for prev in previous_injected:
            if prev in base_rules:
                base_rules.remove(prev)

    # Build new enabled user rules
    current_enabled_rules = [
        rule_to_string(r)
        for r in user_rules_list
        if r.get('enabled', True)
    ]

    # Prepend new user rules without stripping base rules that happen to match
    cfg['rules'] = current_enabled_rules + base_rules
    return cfg, current_enabled_rules


def test_candidate_config(candidate_path: Path) -> Tuple[bool, str]:
    if not BIN.exists():
        return True, ""
    try:
        res = subprocess.run(
            [str(BIN), '-t', '-d', str(ROOT), '-f', str(candidate_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
        if res.returncode == 0:
            return True, ""
        return False, (res.stderr or res.stdout).strip()
    except Exception as e:
        return False, str(e)


def reload_live() -> int:
    secret = get_controller_secret()
    req = urllib.request.Request(
        'http://127.0.0.1:9090/configs?force=true',
        data=b'{"path":"/personal/clash/config.yaml"}',
        method='PUT',
        headers={
            'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.status


def reconcile(dry_run: bool = False) -> Dict[str, Any]:
    user_rules_data = load_user_rules()
    user_rules_list = user_rules_data.get('rules', [])
    allowed_targets = get_available_targets()

    # Validate all user rules
    for idx, rule in enumerate(user_rules_list):
        ok, err = validate_rule_item(rule, allowed_targets)
        if not ok:
            return {'success': False, 'error': f"Rule #{idx} ({rule.get('id')}): {err}"}

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    changed_any = False
    details = {}
    candidate_renders = {}

    # Test build & validate candidates for each target
    previous_injected = load_injected_rules()
    latest_injected = []

    for target in TARGETS:
        if not target.exists():
            continue
        try:
            cfg = yaml.safe_load(target.read_text()) or {}
        except Exception as e:
            return {'success': False, 'error': f"Failed to parse {target.name}: {e}"}

        merged_cfg, injected_list = merge_rules_into_config(cfg, user_rules_list, previous_injected)
        latest_injected = injected_list
        rendered = yaml.safe_dump(merged_cfg, allow_unicode=True, sort_keys=False, width=120)
        current = target.read_text()

        if rendered == current:
            details[target.name] = 'unchanged'
            continue

        candidate = target.with_suffix('.candidate')
        candidate.write_text(rendered)
        ok, err = test_candidate_config(candidate)
        if not ok:
            if candidate.exists():
                candidate.unlink()
            return {'success': False, 'error': f"Mihomo syntax validation failed for {target.name}: {err}"}

        if candidate.exists():
            candidate.unlink()

        candidate_renders[target] = rendered
        details[target.name] = 'changed'
        changed_any = True

    if dry_run or not changed_any:
        return {'success': True, 'changed': changed_any, 'details': details}

    # Transactional execution: track backups for instant rollback if any step fails
    created_backups = []
    try:
        for target, rendered in candidate_renders.items():
            backup = Path(str(target) + f'.pre-user-rules-{timestamp}')
            shutil.copy2(target, backup)
            created_backups.append((target, backup))

            tmp_file = target.with_suffix('.tmp')
            tmp_file.write_text(rendered)
            os.replace(tmp_file, target)

        save_injected_rules(latest_injected)

        # Reload controller if config.yaml was touched
        reload_status = None
        if details.get('config.yaml') == 'changed':
            reload_status = reload_live()
            if reload_status not in (200, 204):
                raise RuntimeError(f"Controller reload returned unexpected HTTP {reload_status}")

        return {'success': True, 'changed': changed_any, 'reload_status': reload_status, 'details': details}

    except Exception as exc:
        # Rollback all modified files to backups
        for target, backup in created_backups:
            if backup.exists():
                shutil.copy2(backup, target)
        # Attempt to reload previous config if needed
        try:
            reload_live()
        except Exception:
            pass
        return {'success': False, 'error': f"Transaction failed, rolled back: {exc}", 'details': details}


def add_or_update_rule(rule_dict: Dict[str, Any]) -> Dict[str, Any]:
    lock_fd = get_lock()
    try:
        allowed_targets = get_available_targets()
        ok, err = validate_rule_item(rule_dict, allowed_targets)
        if not ok:
            return {'success': False, 'error': err}

        data = load_user_rules()
        rules = data.get('rules', [])
        old_rules_backup = [dict(r) for r in rules]
        now_iso = datetime.now(timezone.utc).isoformat()

        rule_id = rule_dict['id']
        found_idx = next((i for i, r in enumerate(rules) if r.get('id') == rule_id), -1)

        rule_type = str(rule_dict['type']).upper()
        payload = str(rule_dict['payload']).strip()
        if rule_type == 'IP-CIDR':
            try:
                payload = str(ipaddress.IPv4Network(payload, strict=False))
            except Exception:
                pass
        elif rule_type == 'IP-CIDR6':
            try:
                payload = str(ipaddress.IPv6Network(payload, strict=False))
            except Exception:
                pass

        rule_entry = {
            'id': rule_id,
            'type': rule_type,
            'payload': payload,
            'target': str(rule_dict['target']).strip(),
            'enabled': bool(rule_dict.get('enabled', True)),
            'source': 'ui-user',
            'updatedAt': now_iso,
        }
        if 'params' in rule_dict and str(rule_dict['params']).strip():
            rule_entry['params'] = str(rule_dict['params']).strip()

        if found_idx >= 0:
            rule_entry['createdAt'] = rules[found_idx].get('createdAt', now_iso)
            rules.pop(found_idx)
            rules.insert(0, rule_entry)
        else:
            rule_entry['createdAt'] = now_iso
            rules.insert(0, rule_entry)

        data['rules'] = rules
        save_user_rules_file(data)

        rec_res = reconcile()
        if not rec_res.get('success'):
            data['rules'] = old_rules_backup
            save_user_rules_file(data)
            return {'success': False, 'error': rec_res.get('error', 'Reconcile failed'), 'reconcile': rec_res}

        return {'success': True, 'rule': rule_entry, 'reconcile': rec_res}
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()


def delete_rule(rule_id: str) -> Dict[str, Any]:
    lock_fd = get_lock()
    try:
        data = load_user_rules()
        rules = data.get('rules', [])
        old_rules_backup = [dict(r) for r in rules]
        found_idx = next((i for i, r in enumerate(rules) if r.get('id') == rule_id), -1)
        if found_idx < 0:
            return {'success': False, 'error': f"Rule ID '{rule_id}' not found"}

        deleted = rules.pop(found_idx)
        data['rules'] = rules
        save_user_rules_file(data)

        rec_res = reconcile()
        if not rec_res.get('success'):
            data['rules'] = old_rules_backup
            save_user_rules_file(data)
            return {'success': False, 'error': rec_res.get('error', 'Reconcile failed'), 'reconcile': rec_res}

        return {'success': True, 'deleted': deleted, 'reconcile': rec_res}
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='User Rules Reconciler')
    parser.add_argument('--reconcile', action='store_true', help='Reconcile user-rules.yaml into clash configs')
    parser.add_argument('--dry-run', action='store_true', help='Check and test candidate configs without writing')
    parser.add_argument('--list-targets', action='store_true', help='List allowed targets')
    args = parser.parse_args()

    if args.list_targets:
        targets = sorted(get_available_targets())
        print(json.dumps(targets, ensure_ascii=False, indent=2))
        sys.exit(0)

    if args.reconcile or args.dry_run or len(sys.argv) == 1:
        lock_fd = get_lock()
        try:
            res = reconcile(dry_run=args.dry_run)
            print(json.dumps(res, ensure_ascii=False, indent=2))
            sys.exit(0 if res.get('success') else 1)
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()
