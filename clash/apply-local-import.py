#!/usr/bin/env python3
"""Persist verified local nodes and an explicit denylist into live Clash configs.

The node file holds proxies plus simple name lists under ``groups``. This
script only fills ``🌐 本机导入`` from ``groups.vps-import``. url-test / PROXY /
Grok / Google strategy stays elsewhere. Unchanged files are not rewritten;
a changed live config is reloaded once through 9090.
"""
from __future__ import annotations

import os
import shutil
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(os.environ.get('CLASH_ROOT', '/personal/clash')).resolve()
GROUP = '🌐 本机导入'
VPS_GROUP = 'vps-import'


def resolve_airport(root: Path) -> Path:
    env = os.environ.get('APPLY_LOCAL_IMPORT_FILE', '').strip()
    if env:
        return Path(env).resolve()
    return (root / 'airports/local-nodes.yaml').resolve()


def load_disabled() -> set[str]:
    disabled = ROOT / 'airports/disabled-nodes.txt'
    if not disabled.exists():
        return set()
    return {
        line.strip()
        for line in disabled.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    }


def normalize_simple_groups(raw) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    if not isinstance(raw, dict):
        return groups
    for key, val in raw.items():
        label = str(key or '').strip()
        if not label:
            continue
        items = val.get('proxies') if isinstance(val, dict) else val
        if not isinstance(items, list):
            continue
        names: list[str] = []
        seen: set[str] = set()
        for item in items:
            if isinstance(item, str):
                name = item.strip()
            elif isinstance(item, dict):
                name = str(item.get('name') or '').strip()
            else:
                continue
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
        groups[label] = names
    return groups


def load_vps_import(path: Path) -> tuple[list[dict], list[str]] | None:
    data = yaml.safe_load(path.read_text()) or {}
    if isinstance(data, list):
        proxies = data
        groups: dict[str, list[str]] = {}
    elif isinstance(data, dict):
        proxies = data.get('proxies') or []
        groups = normalize_simple_groups(data.get('groups'))
    else:
        return None
    if VPS_GROUP not in groups:
        return None
    by_name = {
        proxy.get('name'): proxy
        for proxy in proxies
        if isinstance(proxy, dict) and proxy.get('name')
    }
    names = [name for name in groups[VPS_GROUP] if name in by_name]
    imported = [by_name[name] for name in names]
    return imported, names


def build_data(target: Path, imported: list[dict], disabled: set[str]) -> tuple[dict, int, int]:
    data = yaml.safe_load(target.read_text()) or {}
    proxies = data.get('proxies') or []
    existing = {
        proxy.get('name')
        for proxy in proxies
        if isinstance(proxy, dict)
    }
    added = [
        proxy for proxy in imported
        if proxy.get('name') not in existing and proxy.get('name') not in disabled
    ]
    if added:
        data.setdefault('proxies', []).extend(added)

    groups = data.setdefault('proxy-groups', [])
    group = next((item for item in groups if item.get('name') == GROUP), None)
    if group is None:
        group = {'name': GROUP, 'type': 'select', 'proxies': []}
        groups.append(group)
    all_names = {
        proxy.get('name')
        for proxy in data.get('proxies') or []
        if isinstance(proxy, dict)
    }
    group['proxies'] = [
        proxy.get('name')
        for proxy in imported
        if proxy.get('name') not in disabled and proxy.get('name') in all_names
    ]

    kept = []
    removed = 0
    for proxy in data.get('proxies') or []:
        if isinstance(proxy, dict) and proxy.get('name') in disabled:
            removed += 1
        else:
            kept.append(proxy)
    data['proxies'] = kept
    for item in data.get('proxy-groups') or []:
        if isinstance(item, dict):
            item['proxies'] = [
                name for name in (item.get('proxies') or [])
                if name not in disabled
            ]
    return data, len(added), removed


def reload_live() -> int:
    secret_file = ROOT / '.controller-secret'
    secret = secret_file.read_text().strip()
    req = urllib.request.Request(
        'http://127.0.0.1:9090/configs?force=true',
        data=('{"path":"%s"}' % (ROOT / 'config.yaml')).encode('utf-8'),
        method='PUT',
        headers={
            'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.status


def main() -> None:
    airport = resolve_airport(ROOT)
    try:
        airport.relative_to(ROOT / 'airports')
    except ValueError:
        print(f'refusing airport path outside {ROOT / "airports"}: {airport}', file=sys.stderr)
        sys.exit(2)
    if not airport.exists():
        print(f'{airport.name}: missing; skip')
        return
    loaded = load_vps_import(airport)
    if loaded is None:
        print(f'{airport.name}: no groups.{VPS_GROUP}; skip (refusing full-file dump)')
        return
    imported, names = loaded
    if not names:
        print(f'{airport.name}: groups.{VPS_GROUP} empty; skip')
        return
    disabled = load_disabled()
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    changed_live = False
    targets = tuple(
        path for path in (ROOT / 'config.mac-merged.yaml', ROOT / 'config.yaml')
        if path.exists()
    )
    if not targets:
        print('no clash config targets; skip')
        return
    for target in targets:
        data, added, removed = build_data(target, imported, disabled)
        rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120)
        current = target.read_text()
        if rendered == current:
            print(f'{target.name}: unchanged added=0 removed=0 members={len(names)}')
            continue
        backup = Path(str(target) + f'.pre-local-persist-{timestamp}')
        shutil.copy2(target, backup)
        target.write_text(rendered)
        print(f'{target.name}: changed added={added} removed={removed} members={len(names)}')
        if target.name == 'config.yaml':
            changed_live = True
    if changed_live:
        if not (ROOT / '.controller-secret').exists():
            print('live_reload skipped: missing .controller-secret')
        else:
            print(f'live_reload={reload_live()}')


if __name__ == '__main__':
    main()
