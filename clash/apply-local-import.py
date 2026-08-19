#!/usr/bin/env python3
"""Persist verified local nodes and an explicit denylist into live Clash configs.

The script is idempotent and safe for the keeper loop: unchanged files are not
rewritten or backed up; a changed live config is reloaded once through 9090.
It never probes nodes or rewrites unrelated groups.
"""
from __future__ import annotations

import shutil
import urllib.request
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path('/personal/clash')
AIRPORT = ROOT / 'airports/airport-9-verge-local.yaml'
DISABLED = ROOT / 'airports/disabled-nodes.txt'
TARGETS = (ROOT / 'config.mac-merged.yaml', ROOT / 'config.yaml')
GROUP = '🌐 本机导入'
SECRET_FILE = ROOT / '.controller-secret'


def load_disabled() -> set[str]:
    if not DISABLED.exists():
        return set()
    return {
        line.strip()
        for line in DISABLED.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    }


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
    secret = SECRET_FILE.read_text().strip()
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


def main() -> None:
    imported = (yaml.safe_load(AIRPORT.read_text()) or {}).get('proxies', [])
    disabled = load_disabled()
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    changed_live = False
    for target in TARGETS:
        data, added, removed = build_data(target, imported, disabled)
        rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120)
        current = target.read_text()
        if rendered == current:
            print(f'{target.name}: unchanged added=0 removed=0')
            continue
        backup = Path(str(target) + f'.pre-local-persist-{timestamp}')
        shutil.copy2(target, backup)
        target.write_text(rendered)
        print(f'{target.name}: changed added={added} removed={removed}')
        if target.name == 'config.yaml':
            changed_live = True
    if changed_live:
        print(f'live_reload={reload_live()}')


if __name__ == '__main__':
    main()
