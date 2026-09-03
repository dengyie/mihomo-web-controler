#!/usr/bin/env python3
"""Subscription Manager for Mihomo / Clash on tebi / macOS.

Manages subscription sources, parses various subscription formats (Clash YAML,
Base64 node lists, proxy URIs: ss, vmess, vless, trojan, hysteria2/hy2),
filters out non-proxy announcement nodes, isolates names with subscription prefixes,
tracks metadata in subscriptions/meta.json, caches raw subscription bodies,
and aggregates active proxies into airports/airport-merged-sub.yaml with file locking
and atomic writes.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import yaml

# ROOT configuration supporting CLASH_ROOT environment variable
CLASH_ROOT_ENV = os.environ.get('CLASH_ROOT')
ROOT = Path(CLASH_ROOT_ENV).resolve() if CLASH_ROOT_ENV else Path('/personal/clash')

META_FILE = ROOT / 'subscriptions/meta.json'
RAW_CACHE_DIR = ROOT / 'subscriptions/raw'
MERGED_OUTPUT_FILE = ROOT / 'airports/airport-merged-sub.yaml'
LOCK_FILE = ROOT / 'subscriptions/.subscription.lock'
DISABLED_NODES_FILE = ROOT / 'airports/disabled-nodes.txt'

# Default regex pattern to filter out announcement / non-functional nodes
DEFAULT_EXCLUDE_FILTER = r'(剩余流量|更新日期|官网|套餐|重置|到期|过期|公告|流量|时间|群|客服|traffic|expire|reset|website|notice)'


def safe_atomic_write(target_path: Path, content: str, encoding: str = 'utf-8', mode: int = 0o660) -> None:
    """Atomically write content to target_path using unique temporary file and safe permissions."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tf = tempfile.NamedTemporaryFile('w', dir=target_path.parent, delete=False, encoding=encoding)
    try:
        tf.write(content)
        tf.flush()
        try:
            os.fchmod(tf.fileno(), mode)
        except OSError:
            pass
        tf.close()
        os.replace(tf.name, target_path)
    except Exception:
        if os.path.exists(tf.name):
            try:
                os.remove(tf.name)
            except OSError:
                pass
        raise


# Group name for auto-mounted subscription proxies
SUB_GROUP_NAME = '🌐 订阅导入'
GENERIC_GROUP_NAMES = {'PROXY', '🚀 节点选择', '🎯 全球直连', '节点选择', 'Proxy', 'proxy'}


def is_safe_public_url(url: str, allow_private: bool = False) -> Tuple[bool, str]:
    """Validate that a URL is a safe public HTTP/HTTPS endpoint to prevent SSRF attacks.
    
    Checks scheme (only http/https), resolves hostname to IP addresses, and ensures
    no IP resolves to private, loopback, link-local, reserved, multicast, or unspecified ranges.
    Can be bypassed if allow_private is True or ALLOW_PRIVATE_SUBSCRIPTIONS=1 is set in env.
    """
    if allow_private or os.environ.get('ALLOW_PRIVATE_SUBSCRIPTIONS') == '1':
        return True, ""

    if not url or not isinstance(url, str):
        return False, "Invalid or empty URL"

    try:
        parsed = urllib.parse.urlsplit(url)
    except Exception as e:
        return False, f"Failed to parse URL: {e}"

    scheme = (parsed.scheme or "").lower()
    if scheme not in ('http', 'https'):
        return False, f"Disallowed URL scheme '{scheme}'. Only http and https are permitted."

    hostname = parsed.hostname
    if not hostname:
        return False, "URL does not contain a valid hostname"

    # Check if hostname is an IP literal
    try:
        ip_obj = ipaddress.ip_address(hostname.strip('[]'))
        if (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local 
                or ip_obj.is_reserved or ip_obj.is_multicast or ip_obj.is_unspecified):
            return False, "Disallowed internal/private IP or hostname"
        return True, ""
    except ValueError:
        # Not an IP literal, resolve domain
        pass

    try:
        # Resolve hostname using getaddrinfo
        addr_infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        if not addr_infos:
            return False, f"Could not resolve hostname '{hostname}'"
        
        for info in addr_infos:
            sockaddr = info[4]
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            if (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local 
                    or ip_obj.is_reserved or ip_obj.is_multicast or ip_obj.is_unspecified):
                return False, "Disallowed internal/private IP or hostname"
    except socket.gaierror as e:
        return False, f"DNS resolution failed for hostname '{hostname}': {e}"
    except Exception as e:
        return False, f"SSRF check error: {e}"

    return True, ""


# ---------------------------------------------------------
# YAML Acceleration (CSafeLoader / CSafeDumper if available)
# ---------------------------------------------------------
_YamlSafeLoader = getattr(yaml, 'CSafeLoader', yaml.SafeLoader)
_YamlSafeDumper = getattr(yaml, 'CSafeDumper', yaml.SafeDumper)


def fast_yaml_load(stream: Any) -> Any:
    """Load YAML stream using C bindings if available for ~7x speedup."""
    if hasattr(stream, 'read'):
        content = stream.read()
    else:
        content = stream
    if not content:
        return None
    return yaml.load(content, Loader=_YamlSafeLoader)


def fast_yaml_dump(data: Any, **kwargs: Any) -> str:
    """Dump YAML document using C bindings if available."""
    kwargs.setdefault('allow_unicode', True)
    kwargs.setdefault('sort_keys', False)
    kwargs.setdefault('width', 120)
    return yaml.dump(data, Dumper=_YamlSafeDumper, **kwargs)


def load_disabled_nodes(disabled_path: Optional[Path] = None) -> Set[str]:
    """Load denylist of confirmed dead/disabled node names from disabled-nodes.txt."""
    path = disabled_path or DISABLED_NODES_FILE
    if not path.exists():
        return set()
    try:
        return {
            line.strip()
            for line in path.read_text(encoding='utf-8', errors='ignore').splitlines()
            if line.strip() and not line.lstrip().startswith('#')
        }
    except Exception:
        return set()


def save_disabled_nodes(names: Set[str], disabled_path: Optional[Path] = None) -> None:
    """Safely append or update disabled nodes list preserving comments."""
    path = disabled_path or DISABLED_NODES_FILE
    existing_lines: List[str] = []
    if path.exists():
        try:
            existing_lines = path.read_text(encoding='utf-8', errors='ignore').splitlines()
        except Exception:
            existing_lines = []

    header_lines = [l for l in existing_lines if l.strip().startswith('#')]
    if not header_lines:
        header_lines = ["# Verified local import denylist; only explicitly confirmed dead nodes."]

    existing_set = {
        l.strip() for l in existing_lines
        if l.strip() and not l.strip().startswith('#')
    }
    merged_set = existing_set | {n.strip() for n in names if n.strip()}
    sorted_names = sorted(merged_set)

    content = "\n".join(header_lines) + "\n" + "\n".join(sorted_names) + "\n"
    safe_atomic_write(path, content)


def reconcile_target_config(
    target_path: Path,
    active_proxies: Optional[List[Dict[str, Any]]] = None,
    disabled_nodes: Optional[Set[str]] = None,
) -> bool:
    """Safely inject active subscription proxies into target config and maintain SUB_GROUP_NAME.
    
    If active_proxies is None, only filters out disabled_nodes without resetting subscription proxies.
    """
    if not target_path.exists():
        return False
    try:
        data = fast_yaml_load(target_path.read_text(encoding='utf-8', errors='ignore')) or {}
        if not isinstance(data, dict):
            return False
    except Exception:
        return False

    proxies = data.get('proxies')
    if not isinstance(proxies, list):
        proxies = []
        data['proxies'] = proxies

    groups = data.get('proxy-groups')
    if not isinstance(groups, list):
        groups = []
        data['proxy-groups'] = groups

    denylist = disabled_nodes if disabled_nodes is not None else load_disabled_nodes()

    # 1. Find previous sub group to identify previous subscription nodes
    sub_group = next((g for g in groups if isinstance(g, dict) and g.get('name') == SUB_GROUP_NAME), None)
    old_sub_node_names: Set[str] = set()
    if sub_group and isinstance(sub_group.get('proxies'), list):
        old_sub_node_names = {str(n) for n in sub_group['proxies']}

    if active_proxies is not None:
        active_proxy_names = [p['name'] for p in active_proxies if isinstance(p, dict) and 'name' in p and p['name'] not in denylist]
        active_name_set = set(active_proxy_names)

        # Filter out stale subscription nodes and denylisted nodes from proxies and add active proxies
        kept_proxies = []
        for p in proxies:
            if isinstance(p, dict):
                p_name = p.get('name')
                if p_name in denylist:
                    continue
                if p_name in old_sub_node_names and p_name not in active_name_set:
                    continue
                if p_name in active_name_set:
                    continue
                kept_proxies.append(p)
        for p in active_proxies:
            if isinstance(p, dict) and p.get('name') not in denylist:
                kept_proxies.append(p)
    else:
        # Only prune denylisted nodes
        kept_proxies = [p for p in proxies if isinstance(p, dict) and p.get('name') not in denylist]
        active_proxy_names = [n for n in old_sub_node_names if n not in denylist]
        active_name_set = set(active_proxy_names)

    # Check if proxies actually changed
    proxies_changed = (proxies != kept_proxies)
    data['proxies'] = kept_proxies

    # 3. Maintain '🌐 订阅导入' proxy group
    groups_changed = False
    if sub_group is None and active_proxies is not None:
        sub_group = {'name': SUB_GROUP_NAME, 'type': 'select', 'proxies': ['DIRECT']}
        groups.append(sub_group)
        groups_changed = True

    if sub_group is not None:
        target_sub_proxies = list(active_proxy_names) if active_proxy_names else ['DIRECT']
        if sub_group.get('proxies') != target_sub_proxies:
            sub_group['proxies'] = target_sub_proxies
            groups_changed = True

    # 4. Clean up stale subscription node names and disabled nodes from all other proxy groups
    stale_sub_nodes = (old_sub_node_names - active_name_set) if active_proxies is not None else set()
    removal_set = stale_sub_nodes | denylist
    for g in groups:
        if isinstance(g, dict) and 'proxies' in g and isinstance(g['proxies'], list):
            if g.get('name') == SUB_GROUP_NAME:
                continue
            cleaned = [n for n in g['proxies'] if n not in removal_set]
            if not cleaned:
                cleaned = ['DIRECT']
            if cleaned != g['proxies']:
                g['proxies'] = cleaned
                groups_changed = True

    # 5. Auto-mount SUB_GROUP_NAME into generic routing groups if present
    for g in groups:
        if isinstance(g, dict) and g.get('name') in GENERIC_GROUP_NAMES:
            g_proxies = g.get('proxies')
            if isinstance(g_proxies, list):
                if SUB_GROUP_NAME not in g_proxies:
                    g_proxies.append(SUB_GROUP_NAME)
                    groups_changed = True

    # Fast short-circuit: if neither proxies nor groups changed, skip expensive dump & disk write!
    if not proxies_changed and not groups_changed:
        return True

    # Write atomically
    rendered = fast_yaml_dump(data)
    safe_atomic_write(target_path, rendered)
    return True


def get_paths(root: Optional[Path] = None) -> Tuple[Path, Path, Path, Path, Path, Path]:
    base = root.resolve() if root else (Path(os.environ.get('CLASH_ROOT')).resolve() if os.environ.get('CLASH_ROOT') else ROOT)
    meta = base / 'subscriptions/meta.json'
    raw_dir = base / 'subscriptions/raw'
    merged = base / 'airports/airport-merged-sub.yaml'
    lock = base / 'subscriptions/.subscription.lock'
    disabled = base / 'airports/disabled-nodes.txt'
    return base, meta, raw_dir, merged, lock, disabled


class SubscriptionLock:
    """Context manager for fcntl file locking."""

    def __init__(self, lock_file: Optional[Path] = None):
        if lock_file is None:
            _, _, _, _, self.lock_path, _ = get_paths()
        else:
            self.lock_path = lock_file
        self.lock_fd = None

    def __enter__(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_fd = open(self.lock_path, 'w')
        fcntl.flock(self.lock_fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.lock_fd:
            try:
                fcntl.flock(self.lock_fd, fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                self.lock_fd.close()
            except Exception:
                pass
            self.lock_fd = None


def decode_base64_safely(data: Union[str, bytes]) -> str:
    """Decode base64 string or bytes safely, handling URL-safe variants and missing padding."""
    if isinstance(data, str):
        s = data.strip().replace(' ', '').replace('\n', '').replace('\r', '')
        s_b64 = s.replace('-', '+').replace('_', '/')
        missing_padding = len(s_b64) % 4
        if missing_padding != 0:
            s_b64 += '=' * (4 - missing_padding)
        try:
            return base64.b64decode(s_b64.encode('utf-8')).decode('utf-8', errors='ignore')
        except Exception:
            try:
                return base64.b64decode(s.encode('utf-8')).decode('utf-8', errors='ignore')
            except Exception:
                return ""
    elif isinstance(data, bytes):
        missing_padding = len(data) % 4
        if missing_padding != 0:
            data += b'=' * (4 - missing_padding)
        try:
            return base64.b64decode(data).decode('utf-8', errors='ignore')
        except Exception:
            return ""
    return ""


# ---------------------------------------------------------
# URI Parsers
# ---------------------------------------------------------

def parse_ss_uri(uri: str) -> Optional[Dict[str, Any]]:
    """Parse Shadowsocks URI (ss://...).
    
    Supports:
      - ss://BASE64(method:password@hostname:port)[#tag]
      - ss://BASE64(method:password)@hostname:port[#tag]
      - ss://method:password@hostname:port[#tag]
      - SIP002 query parameters like plugin / plugin-opts
    """
    if not uri.startswith('ss://'):
        return None
    rest = uri[5:]
    tag = ""
    if '#' in rest:
        rest, tag = rest.split('#', 1)
        tag = urllib.parse.unquote(tag).strip()

    method, password, server, port = None, None, None, None
    plugin, plugin_opts = None, {}

    # Case 1: ss://BASE64(...) where decoded part contains method:password@server:port
    if '@' not in rest:
        decoded = decode_base64_safely(rest)
        if '@' in decoded:
            rest = decoded

    if '@' in rest:
        user_info, host_port = rest.rsplit('@', 1)
        if ':' not in user_info:
            user_info = decode_base64_safely(user_info)

        if ':' in user_info:
            method, password = user_info.split(':', 1)
        else:
            return None

        if '?' in host_port:
            host_port, query = host_port.split('?', 1)
            qs = urllib.parse.parse_qs(query)
            if 'plugin' in qs:
                plugin_str = qs['plugin'][0]
                if ';' in plugin_str:
                    plugin_parts = plugin_str.split(';')
                    plugin = plugin_parts[0]
                    for p in plugin_parts[1:]:
                        if '=' in p:
                            k, v = p.split('=', 1)
                            plugin_opts[k] = v
                else:
                    plugin = plugin_str

        if host_port.startswith('['):
            if ']:' in host_port:
                server, port_str = host_port[1:].split(']:', 1)
            else:
                return None
        elif ':' in host_port:
            server, port_str = host_port.split(':', 1)
        else:
            return None

        try:
            port = int(port_str)
        except ValueError:
            return None
    else:
        return None

    if not server or not port or not method or not password:
        return None

    node: Dict[str, Any] = {
        'name': tag or f"SS-{server}:{port}",
        'type': 'ss',
        'server': server,
        'port': port,
        'cipher': method,
        'password': password,
    }
    if plugin:
        node['plugin'] = plugin
        if plugin_opts:
            node['plugin-opts'] = plugin_opts

    return node


def parse_vmess_uri(uri: str) -> Optional[Dict[str, Any]]:
    """Parse VMess URI (vmess://BASE64_JSON)."""
    if not uri.startswith('vmess://'):
        return None
    raw = uri[8:]
    decoded = decode_base64_safely(raw)
    try:
        data = json.loads(decoded)
    except Exception:
        return None

    if not isinstance(data, dict):
        return None

    server = str(data.get('add', '')).strip()
    port_val = data.get('port')
    uuid = str(data.get('id', '')).strip()
    if not server or not port_val or not uuid:
        return None

    try:
        port = int(port_val)
    except (ValueError, TypeError):
        return None

    name = str(data.get('ps', '')).strip() or f"VMess-{server}:{port}"
    alter_id = 0
    try:
        alter_id = int(data.get('aid', 0))
    except (ValueError, TypeError):
        pass

    cipher = str(data.get('scy', 'auto')).strip() or 'auto'
    net = str(data.get('net', 'tcp')).strip().lower()
    tls_val = str(data.get('tls', '')).strip().lower()
    is_tls = tls_val in ('tls', '1', 'true')

    node: Dict[str, Any] = {
        'name': name,
        'type': 'vmess',
        'server': server,
        'port': port,
        'uuid': uuid,
        'alterId': alter_id,
        'cipher': cipher,
        'network': net,
    }

    if is_tls:
        node['tls'] = True
        sni = str(data.get('sni', data.get('host', ''))).strip()
        if sni:
            node['servername'] = sni

    path = str(data.get('path', '')).strip()
    host = str(data.get('host', '')).strip()

    if net == 'ws':
        ws_opts: Dict[str, Any] = {}
        if path:
            ws_opts['path'] = path
        if host:
            ws_opts['headers'] = {'Host': host}
        if ws_opts:
            node['ws-opts'] = ws_opts
    elif net == 'grpc':
        grpc_opts: Dict[str, Any] = {}
        service_name = str(data.get('path', data.get('serviceName', ''))).strip()
        if service_name:
            grpc_opts['grpc-service-name'] = service_name
        if grpc_opts:
            node['grpc-opts'] = grpc_opts
    elif net == 'h2' or net == 'http':
        h2_opts: Dict[str, Any] = {}
        if path:
            h2_opts['path'] = [path] if isinstance(path, str) else path
        if host:
            h2_opts['host'] = [host] if isinstance(host, str) else host
        if h2_opts:
            node['h2-opts'] = h2_opts

    return node


def parse_vless_uri(uri: str) -> Optional[Dict[str, Any]]:
    """Parse VLESS URI (vless://uuid@host:port?query#tag)."""
    if not uri.startswith('vless://'):
        return None
    try:
        u = urllib.parse.urlsplit(uri)
    except Exception:
        return None

    uuid = u.username
    server = u.hostname
    port = u.port
    tag = urllib.parse.unquote(u.fragment).strip() if u.fragment else ""

    if not uuid or not server or not port:
        return None

    qs = urllib.parse.parse_qs(u.query)
    security = qs.get('security', [''])[0].lower()
    net = qs.get('type', ['tcp'])[0].lower()
    sni = qs.get('sni', [''])[0]
    flow = qs.get('flow', [''])[0]
    pbk = qs.get('pbk', [''])[0]
    sid = qs.get('sid', [''])[0]
    fp = qs.get('fp', [''])[0]

    node: Dict[str, Any] = {
        'name': tag or f"VLESS-{server}:{port}",
        'type': 'vless',
        'server': server,
        'port': port,
        'uuid': uuid,
        'network': net,
    }

    if flow:
        node['flow'] = flow

    if security in ('tls', 'reality'):
        node['tls'] = True
        if sni:
            node['servername'] = sni
        if fp:
            node['client-fingerprint'] = fp

        if security == 'reality':
            reality_opts: Dict[str, Any] = {}
            if pbk:
                reality_opts['public-key'] = pbk
            if sid:
                reality_opts['short-id'] = sid
            if reality_opts:
                node['reality-opts'] = reality_opts

    path = qs.get('path', [''])[0]
    host = qs.get('host', [''])[0]
    service_name = qs.get('serviceName', [''])[0]

    if net == 'ws':
        ws_opts: Dict[str, Any] = {}
        if path:
            ws_opts['path'] = path
        if host:
            ws_opts['headers'] = {'Host': host}
        if ws_opts:
            node['ws-opts'] = ws_opts
    elif net == 'grpc':
        grpc_opts: Dict[str, Any] = {}
        g_name = service_name or path
        if g_name:
            grpc_opts['grpc-service-name'] = g_name
        if grpc_opts:
            node['grpc-opts'] = grpc_opts

    return node


def parse_trojan_uri(uri: str) -> Optional[Dict[str, Any]]:
    """Parse Trojan URI (trojan://password@host:port?query#tag)."""
    if not uri.startswith('trojan://'):
        return None
    try:
        u = urllib.parse.urlsplit(uri)
    except Exception:
        return None

    password = u.username or u.password
    server = u.hostname
    port = u.port
    tag = urllib.parse.unquote(u.fragment).strip() if u.fragment else ""

    if not password or not server or not port:
        return None

    qs = urllib.parse.parse_qs(u.query)
    sni = qs.get('sni', qs.get('peer', ['']))[0]
    net = qs.get('type', ['tcp'])[0].lower()
    alpn = qs.get('alpn', [])

    node: Dict[str, Any] = {
        'name': tag or f"Trojan-{server}:{port}",
        'type': 'trojan',
        'server': server,
        'port': port,
        'password': password,
    }

    if sni:
        node['sni'] = sni
    if alpn:
        node['alpn'] = alpn[0].split(',') if len(alpn) == 1 and ',' in alpn[0] else alpn

    path = qs.get('path', [''])[0]
    host = qs.get('host', [''])[0]
    if net == 'ws':
        node['network'] = 'ws'
        ws_opts: Dict[str, Any] = {}
        if path:
            ws_opts['path'] = path
        if host:
            ws_opts['headers'] = {'Host': host}
        if ws_opts:
            node['ws-opts'] = ws_opts
    elif net == 'grpc':
        node['network'] = 'grpc'
        service_name = qs.get('serviceName', [path])[0]
        if service_name:
            node['grpc-opts'] = {'grpc-service-name': service_name}

    return node


def parse_hysteria2_uri(uri: str) -> Optional[Dict[str, Any]]:
    """Parse Hysteria2 / hy2 URI (hysteria2://pass@host:port?query#tag or hy2://...)."""
    if not (uri.startswith('hysteria2://') or uri.startswith('hy2://')):
        return None
    norm_uri = uri
    if uri.startswith('hy2://'):
        norm_uri = 'hysteria2://' + uri[6:]

    try:
        u = urllib.parse.urlsplit(norm_uri)
    except Exception:
        return None

    auth = u.username or u.password
    server = u.hostname
    port = u.port
    tag = urllib.parse.unquote(u.fragment).strip() if u.fragment else ""

    if not auth or not server or not port:
        return None

    qs = urllib.parse.parse_qs(u.query)
    sni = qs.get('sni', [''])[0]
    obfs = qs.get('obfs', [''])[0]
    obfs_password = qs.get('obfs-password', [''])[0]
    insecure = qs.get('insecure', ['0'])[0] in ('1', 'true')

    node: Dict[str, Any] = {
        'name': tag or f"Hy2-{server}:{port}",
        'type': 'hysteria2',
        'server': server,
        'port': port,
        'password': auth,
    }

    if sni:
        node['sni'] = sni
    if insecure:
        node['skip-cert-verify'] = True
    if obfs:
        node['obfs'] = obfs
        if obfs_password:
            node['obfs-password'] = obfs_password

    return node


def parse_proxy_uri(line: str) -> Optional[Dict[str, Any]]:
    """Dispatch raw URI string to corresponding protocol parser."""
    line = line.strip()
    if not line:
        return None
    if line.startswith('ss://'):
        return parse_ss_uri(line)
    elif line.startswith('vmess://'):
        return parse_vmess_uri(line)
    elif line.startswith('vless://'):
        return parse_vless_uri(line)
    elif line.startswith('trojan://'):
        return parse_trojan_uri(line)
    elif line.startswith('hysteria2://') or line.startswith('hy2://'):
        return parse_hysteria2_uri(line)
    return None


def parse_raw_node_list(text: str) -> List[Dict[str, Any]]:
    """Parse text which could be a Base64 blob or multi-line list of proxy URIs."""
    if not text or not text.strip():
        return []

    stripped = text.strip()
    is_plain_uris = any(stripped.startswith(prefix) for prefix in ('ss://', 'vmess://', 'vless://', 'trojan://', 'hy2://', 'hysteria2://'))
    is_plain_yaml = 'proxies:' in stripped or 'Proxy:' in stripped

    lines_to_process = []
    if not is_plain_uris and not is_plain_yaml:
        decoded = decode_base64_safely(stripped)
        if decoded and any(p in decoded for p in ('://', 'proxies:')):
            lines_to_process = decoded.splitlines()
        else:
            lines_to_process = stripped.splitlines()
    else:
        lines_to_process = stripped.splitlines()

    joined_text = '\n'.join(lines_to_process)
    if 'proxies:' in joined_text or 'Proxy:' in joined_text:
        try:
            yaml_data = fast_yaml_load(joined_text)
            if isinstance(yaml_data, dict):
                proxies = yaml_data.get('proxies') or yaml_data.get('Proxy')
                if isinstance(proxies, list):
                    return [p for p in proxies if isinstance(p, dict) and 'name' in p and 'type' in p]
        except Exception:
            pass

    nodes: List[Dict[str, Any]] = []
    for line in lines_to_process:
        line = line.strip()
        if not line:
            continue
        parsed = parse_proxy_uri(line)
        if parsed:
            nodes.append(parsed)

    return nodes


def parse_subscription_content(content: str) -> List[Dict[str, Any]]:
    """Parse raw subscription content (Clash YAML, Base64 list, or raw URI lines)."""
    if not content or not content.strip():
        return []

    try:
        data = fast_yaml_load(content)
        if isinstance(data, dict):
            proxies = data.get('proxies') or data.get('Proxy')
            if isinstance(proxies, list) and len(proxies) > 0:
                valid = [p for p in proxies if isinstance(p, dict) and 'name' in p and 'type' in p]
                if valid:
                    return valid
    except Exception:
        pass

    return parse_raw_node_list(content)


def filter_nodes(nodes: List[Dict[str, Any]], exclude_pattern: Optional[str] = None) -> List[Dict[str, Any]]:
    """Filter out announcement, non-proxy, and matching nodes."""
    pattern_str = exclude_pattern if exclude_pattern is not None else DEFAULT_EXCLUDE_FILTER
    compiled = re.compile(pattern_str, re.IGNORECASE) if pattern_str else None

    valid_nodes: List[Dict[str, Any]] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        name = str(node.get('name', '')).strip()
        if not name:
            continue

        if compiled and compiled.search(name):
            continue

        if not node.get('server') or not node.get('port') or not node.get('type'):
            continue

        valid_nodes.append(node)

    return valid_nodes


def apply_node_name_prefix(nodes: List[Dict[str, Any]], sub_name: str) -> List[Dict[str, Any]]:
    """Add sub_name prefix to avoid name collision between subscriptions."""
    prefix = f"[{sub_name}] "
    renamed_nodes = []
    for node in nodes:
        item = dict(node)
        orig_name = str(item.get('name', '')).strip()
        if not orig_name.startswith(prefix):
            item['name'] = f"{prefix}{orig_name}"
        renamed_nodes.append(item)
    return renamed_nodes


# ---------------------------------------------------------
# Metadata & Subscription Engine Management
# ---------------------------------------------------------

class SubscriptionEngine:
    """Manages subscriptions, metadata, aggregation, and atomic file operations."""

    def __init__(self, root: Optional[Path] = None):
        self.root, self.meta_file, self.raw_cache_dir, self.merged_output_file, self.lock_file, self.disabled_file = get_paths(root)

    def _get_cache_path(self, sub_id: str) -> Path:
        return self.raw_cache_dir / f"{sub_id}.raw"

    def load_cached_content(self, sub_id: str) -> str:
        cache_p = self._get_cache_path(sub_id)
        if cache_p.exists():
            return cache_p.read_text(encoding='utf-8', errors='ignore')
        return ""

    def save_cached_content(self, sub_id: str, content: str) -> None:
        cache_p = self._get_cache_path(sub_id)
        safe_atomic_write(cache_p, content)

    def load_meta(self) -> Dict[str, Any]:
        if not self.meta_file.exists():
            return {'version': 1, 'subscriptions': []}
        try:
            data = json.loads(self.meta_file.read_text())
            if isinstance(data, dict):
                data.setdefault('version', 1)
                data.setdefault('subscriptions', [])
                return data
        except Exception:
            pass
        return {'version': 1, 'subscriptions': []}

    def save_meta(self, data: Dict[str, Any]) -> None:
        content = json.dumps(data, ensure_ascii=False, indent=2)
        safe_atomic_write(self.meta_file, content)

    def fetch_url(self, url: str, timeout: int = 15) -> str:
        """Fetch subscription content from HTTP/HTTPS URL with proper User-Agent and SSRF protection."""
        safe, err = is_safe_public_url(url)
        if not safe:
            raise ValueError(f"SSRF check failed: {err}")

        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'ClashMeta/v1.18.0 mihomo/1.18.0'}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return raw.decode('utf-8', errors='ignore')

    def add_subscription(
        self,
        name: str,
        url: Optional[str] = None,
        sub_type: str = 'remote',
        raw_content: Optional[str] = None,
        exclude_filter: Optional[str] = None,
        enabled: bool = True,
    ) -> Dict[str, Any]:
        """Add a new subscription source to metadata and process nodes."""
        with SubscriptionLock(self.lock_file):
            data = self.load_meta()
            subs = data.get('subscriptions', [])

            clean_id = re.sub(r'[^a-zA-Z0-9_\-]', '', name.lower().replace(' ', '-'))
            sub_id = clean_id or f"sub-{len(subs) + 1}"
            suffix = 1
            existing_ids = {s.get('id') for s in subs}
            while sub_id in existing_ids:
                sub_id = f"{clean_id}-{suffix}"
                suffix += 1

            now_iso = datetime.now(timezone.utc).isoformat()
            sub_record: Dict[str, Any] = {
                'id': sub_id,
                'name': name,
                'type': sub_type,  # 'remote' or 'raw'
                'url': url or '',
                'enabled': enabled,
                'exclude_filter': exclude_filter if exclude_filter is not None else DEFAULT_EXCLUDE_FILTER,
                'createdAt': now_iso,
                'updatedAt': now_iso,
                'node_count': 0,
                'last_error': None,
            }

            content = ""
            if sub_type == 'raw' or raw_content:
                sub_record['raw_content'] = raw_content or ''
                content = raw_content or ''
                self.save_cached_content(sub_id, content)
            elif url:
                try:
                    content = self.fetch_url(url)
                    self.save_cached_content(sub_id, content)
                except Exception as e:
                    sub_record['last_error'] = f"Fetch failed: {e}"

            if content:
                try:
                    nodes = parse_subscription_content(content)
                    filtered = filter_nodes(nodes, sub_record.get('exclude_filter'))
                    sub_record['node_count'] = len(filtered)
                except Exception as e:
                    sub_record['last_error'] = f"Parse failed: {e}"

            subs.append(sub_record)
            data['subscriptions'] = subs
            self.save_meta(data)

            self.reconcile_merged()
            return {'success': True, 'subscription': sub_record}

    def update_subscription(
        self,
        sub_id: str,
        name: Optional[str] = None,
        url: Optional[str] = None,
        raw_content: Optional[str] = None,
        exclude_filter: Optional[str] = None,
        enabled: Optional[bool] = None,
        refresh: bool = False,
    ) -> Dict[str, Any]:
        """Update subscription metadata and optionally re-fetch/parse."""
        with SubscriptionLock(self.lock_file):
            data = self.load_meta()
            subs = data.get('subscriptions', [])
            sub = next((s for s in subs if s.get('id') == sub_id), None)
            if not sub:
                return {'success': False, 'error': f"Subscription '{sub_id}' not found"}

            if name is not None:
                sub['name'] = name
            if url is not None:
                sub['url'] = url
            if raw_content is not None:
                sub['raw_content'] = raw_content
                self.save_cached_content(sub_id, raw_content)
            if exclude_filter is not None:
                sub['exclude_filter'] = exclude_filter
            if enabled is not None:
                sub['enabled'] = enabled

            sub['updatedAt'] = datetime.now(timezone.utc).isoformat()

            if refresh:
                content = ""
                sub['last_error'] = None
                if sub.get('type') == 'raw' or sub.get('raw_content'):
                    content = sub.get('raw_content', '')
                    self.save_cached_content(sub_id, content)
                elif sub.get('url'):
                    try:
                        content = self.fetch_url(sub['url'])
                        self.save_cached_content(sub_id, content)
                    except Exception as e:
                        sub['last_error'] = f"Fetch failed: {e}"

                if content:
                    try:
                        nodes = parse_subscription_content(content)
                        filtered = filter_nodes(nodes, sub.get('exclude_filter'))
                        sub['node_count'] = len(filtered)
                    except Exception as e:
                        sub['last_error'] = f"Parse failed: {e}"

            self.save_meta(data)
            self.reconcile_merged()
            return {'success': True, 'subscription': sub}

    def delete_subscription(self, sub_id: str) -> Dict[str, Any]:
        """Delete a subscription by id."""
        with SubscriptionLock(self.lock_file):
            data = self.load_meta()
            subs = data.get('subscriptions', [])
            idx = next((i for i, s in enumerate(subs) if s.get('id') == sub_id), -1)
            if idx < 0:
                return {'success': False, 'error': f"Subscription '{sub_id}' not found"}

            deleted = subs.pop(idx)
            cache_p = self._get_cache_path(sub_id)
            if cache_p.exists():
                try:
                    cache_p.unlink()
                except Exception:
                    pass

            data['subscriptions'] = subs
            self.save_meta(data)
            self.reconcile_merged()
            return {'success': True, 'deleted': deleted}

    def prune_dead_nodes(
        self,
        batch_size: int = 15,
        max_workers: int = 5,
        timeout_ms: int = 2500,
        batch_pause_sec: float = 0.3,
        max_candidates: int = 30,
        test_url: str = "http://www.gstatic.com/generate_204",
        controller_api: str = "http://127.0.0.1:9090",
        controller_secret: Optional[str] = None,
        whitelist_prefixes: Tuple[str, ...] = ("GVPS-", "Aliyun-", "DIRECT", "REJECT"),
        apply_filter: bool = True,
    ) -> Dict[str, Any]:
        """Perform throttled, chunked health-check across active nodes and filter dead nodes into denylist.
        
        Key design requirements:
          - Never test too many nodes at once (strict chunking with pause between batches).
          - Low concurrency (default 5 workers) to avoid starving Mihomo controller or socket limits.
          - Never disable whitelisted critical infrastructure nodes (e.g. GVPS-*, Aliyun-*).
          - Atomic updates to disabled-nodes.txt and atomic reconciliation into config files.
        """
        import concurrent.futures
        import time

        secret = controller_secret
        if secret is None:
            secret_file = self.root / ".controller-secret"
            if secret_file.exists():
                try:
                    secret = secret_file.read_text(encoding="utf-8").strip()
                except Exception:
                    secret = ""

        headers = {}
        if secret:
            headers["Authorization"] = f"Bearer {secret}"

        # 1. Fetch current proxy list from Mihomo controller
        req = urllib.request.Request(f"{controller_api}/proxies", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                proxies_resp = json.loads(resp.read().decode("utf-8", errors="ignore"))
                proxies_map = proxies_resp.get("proxies", {})
        except Exception as e:
            return {"success": False, "error": f"Failed to fetch proxies from Mihomo: {e}"}

        # 2. Extract leaf proxies (exclude proxy groups and built-in specials)
        group_types = {
            "Selector", "URLTest", "Fallback", "LoadBalance", "Relay",
            "Direct", "Reject", "Compatible", "Pass", "PassRule", "RejectDrop"
        }
        leaf_names: List[str] = []
        for name, p in proxies_map.items():
            if not isinstance(p, dict):
                continue
            if p.get("type") in group_types:
                continue
            if name in ("DIRECT", "REJECT", "GLOBAL"):
                continue
            # Skip whitelisted prefixes
            if any(name.startswith(pfx) for pfx in whitelist_prefixes):
                continue
            leaf_names.append(name)

        # Exclude already disabled nodes from testing
        existing_disabled = load_disabled_nodes(self.disabled_file)
        to_test = [n for n in leaf_names if n not in existing_disabled]

        # Safety: default cap to max 30 candidates per invocation to prevent long-running blocking requests
        if max_candidates and len(to_test) > max_candidates:
            to_test = to_test[:max_candidates]

        total_to_test = len(to_test)
        tested_count = 0
        alive_nodes: List[Dict[str, Any]] = []
        newly_dead: List[str] = []

        def probe_node(name: str) -> Tuple[str, Optional[int]]:
            q_name = urllib.parse.quote(name, safe="")
            q_url = urllib.parse.quote(test_url, safe="")
            delay_url = f"{controller_api}/proxies/{q_name}/delay?timeout={timeout_ms}&url={q_url}"
            try:
                preq = urllib.request.Request(delay_url, headers=headers)
                with urllib.request.urlopen(preq, timeout=(timeout_ms / 1000.0) + 2.0) as presp:
                    res_data = json.loads(presp.read().decode("utf-8", errors="ignore"))
                    delay = res_data.get("delay")
                    if delay is not None and isinstance(delay, (int, float)):
                        return name, int(delay)
            except Exception:
                pass
            return name, None

        # 3. Process in chunks to prevent CPU / socket spikes
        for i in range(0, total_to_test, batch_size):
            chunk = to_test[i:i + batch_size]
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                results = list(executor.map(probe_node, chunk))

            for name, delay in results:
                tested_count += 1
                if delay is not None:
                    alive_nodes.append({"name": name, "delay": delay})
                else:
                    newly_dead.append(name)

            if i + batch_size < total_to_test and batch_pause_sec > 0:
                time.sleep(batch_pause_sec)

        # 4. Apply filter if requested
        targets_updated = []
        if apply_filter and newly_dead:
            with SubscriptionLock(self.lock_file):
                save_disabled_nodes(set(newly_dead), self.disabled_file)
                all_disabled = load_disabled_nodes(self.disabled_file)

                # Reconcile target configs (config.yaml, config.mac-merged.yaml)
                for target in (self.root / 'config.mac-merged.yaml', self.root / 'config.yaml'):
                    if target.exists():
                        if reconcile_target_config(target, None, disabled_nodes=all_disabled):
                            targets_updated.append(str(target))

        return {
            "success": True,
            "total_candidates": total_to_test,
            "tested_count": tested_count,
            "alive_count": len(alive_nodes),
            "dead_count": len(newly_dead),
            "newly_dead": newly_dead,
            "alive": alive_nodes[:20],  # Sample of alive nodes
            "applied_filter": apply_filter,
            "targets_updated": targets_updated,
        }

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        """List all subscriptions."""
        data = self.load_meta()
        return data.get('subscriptions', [])

    def import_raw_nodes(self, name: str, raw_text: str, exclude_filter: Optional[str] = None) -> Dict[str, Any]:
        """Import nodes from raw text (URIs or Base64)."""
        return self.add_subscription(
            name=name,
            sub_type='raw',
            raw_content=raw_text,
            exclude_filter=exclude_filter,
            enabled=True,
        )

    def reconcile_merged(self, fetch_remote: bool = False) -> Dict[str, Any]:
        """Aggregate all enabled subscriptions and write airports/airport-merged-sub.yaml."""
        data = self.load_meta()
        subs = data.get('subscriptions', [])

        all_proxies: List[Dict[str, Any]] = []
        seen_names: set[str] = set()

        for sub in subs:
            if not sub.get('enabled', True):
                continue

            sub_id = sub.get('id', '')
            content = ""

            # Check cache or memory
            if not fetch_remote:
                content = self.load_cached_content(sub_id) or sub.get('raw_content', '')

            # If fetch_remote or cache missing, fetch
            if not content:
                if sub.get('type') == 'raw' or sub.get('raw_content'):
                    content = sub.get('raw_content', '')
                    if content:
                        self.save_cached_content(sub_id, content)
                elif sub.get('url'):
                    try:
                        content = self.fetch_url(sub['url'])
                        self.save_cached_content(sub_id, content)
                    except Exception as e:
                        sub['last_error'] = str(e)
                        continue

            if not content:
                continue

            try:
                nodes = parse_subscription_content(content)
                filtered = filter_nodes(nodes, sub.get('exclude_filter'))
                sub['node_count'] = len(filtered)
                renamed = apply_node_name_prefix(filtered, sub.get('name', sub_id))

                for node in renamed:
                    n_name = node['name']
                    final_name = n_name
                    dup_idx = 1
                    while final_name in seen_names:
                        final_name = f"{n_name} ({dup_idx})"
                        dup_idx += 1
                    node['name'] = final_name
                    seen_names.add(final_name)
                    all_proxies.append(node)
            except Exception as e:
                sub['last_error'] = str(e)

        # Output YAML
        merged_doc = {
            'proxies': all_proxies,
        }

        rendered = fast_yaml_dump(merged_doc)
        safe_atomic_write(self.merged_output_file, rendered)

        # Load denylist to filter from target configs
        disabled_set = load_disabled_nodes(self.disabled_file)

        # Reconcile target configs (config.yaml, config.mac-merged.yaml) if they exist
        targets_updated = []
        for target in (self.root / 'config.mac-merged.yaml', self.root / 'config.yaml'):
            if target.exists():
                if reconcile_target_config(target, all_proxies, disabled_nodes=disabled_set):
                    targets_updated.append(str(target))

        return {
            'success': True,
            'proxy_count': len(all_proxies),
            'output_file': str(self.merged_output_file),
            'targets_updated': targets_updated,
        }


# ---------------------------------------------------------
# CLI Interface
# ---------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Clash Subscription Manager')
    parser.add_argument('--list', action='store_true', help='List all subscriptions')
    parser.add_argument('--add', nargs=2, metavar=('NAME', 'URL'), help='Add a remote subscription')
    parser.add_argument('--update', metavar='ID', help='Update/refresh a subscription by ID')
    parser.add_argument('--delete', metavar='ID', help='Delete a subscription by ID')
    parser.add_argument('--import-nodes', nargs=2, metavar=('NAME', 'TEXT'), help='Import nodes from raw text')
    parser.add_argument('--reconcile', action='store_true', help='Reconcile and regenerate merged airport config')
    parser.add_argument('--fetch', action='store_true', help='Force re-fetching remote subscriptions during reconcile')
    parser.add_argument('--prune-dead', action='store_true', help='Test and prune dead nodes into disabled denylist')
    parser.add_argument('--batch-size', type=int, default=15, help='Batch size for health checks (default: 15)')
    parser.add_argument('--max-workers', type=int, default=5, help='Max concurrent workers for health checks (default: 5)')
    parser.add_argument('--dry-run', action='store_true', help='Perform health checks without applying filter to configs')
    args = parser.parse_args()

    engine = SubscriptionEngine()

    if args.prune_dead:
        res = engine.prune_dead_nodes(
            batch_size=args.batch_size,
            max_workers=args.max_workers,
            apply_filter=not args.dry_run,
        )
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    if args.list:
        subs = engine.list_subscriptions()
        print(json.dumps(subs, ensure_ascii=False, indent=2))
        sys.exit(0)

    if args.add:
        name, url = args.add
        res = engine.add_subscription(name=name, url=url)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    if args.update:
        res = engine.update_subscription(sub_id=args.update, refresh=True)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    if args.delete:
        res = engine.delete_subscription(sub_id=args.delete)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    if args.import_nodes:
        name, text = args.import_nodes
        res = engine.import_raw_nodes(name=name, raw_text=text)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    if args.reconcile:
        res = engine.reconcile_merged(fetch_remote=args.fetch)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        sys.exit(0 if res.get('success') else 1)

    parser.print_help()


if __name__ == '__main__':
    main()
