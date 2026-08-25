#!/usr/bin/env python3
import http.client
import http.server
import importlib.util
import json
import mimetypes
import os
import secrets
import select
import socket
import socketserver
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

ROOT = Path('/personal/zashboard/dist').resolve()
UPSTREAM_HOST = '127.0.0.1'
UPSTREAM_PORT = 9090
PANEL_PASSWORD_FILE = Path('/personal/zashboard/panel.password')
RECONCILER_PATH = Path('/personal/clash/rules-reconciler.py')

_reconciler_mtime = 0
_reconciler_module = None


def is_pxed_host() -> bool:
    return os.path.exists('/data/tuntunshu') or 'pxed' in socket.gethostname()


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def record_node_ip():
    try:
        ip = get_local_ip()
        node_name = 'pxed' if is_pxed_host() else 'tebi'
        node_dir = Path(f'/personal/{node_name}')
        node_dir.mkdir(parents=True, exist_ok=True)
        (node_dir / 'internal-ip').write_text(ip)
    except Exception as e:
        print(f"Failed to record node ip: {e}", flush=True)


def get_remote_node_ip(target_node: str) -> str:
    ip_file = Path(f'/personal/{target_node}/internal-ip')
    if ip_file.exists():
        try:
            ip = ip_file.read_text().strip()
            if ip:
                return ip
        except Exception:
            pass
    if target_node == 'pxed':
        return '10.5.103.87'
    if target_node == 'tebi':
        return '10.5.103.26'
    return '127.0.0.1'


def get_reconciler():
    global _reconciler_mtime, _reconciler_module
    if not RECONCILER_PATH.exists():
        return None
    try:
        current_mtime = os.path.getmtime(RECONCILER_PATH)
        if _reconciler_module is None or current_mtime > _reconciler_mtime:
            spec = importlib.util.spec_from_file_location("rules_reconciler", str(RECONCILER_PATH))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                _reconciler_module = mod
                _reconciler_mtime = current_mtime
        return _reconciler_module
    except Exception as e:
        print(f"Failed to load/reload reconciler module: {e}", flush=True)
        return _reconciler_module


def panel_password():
    if PANEL_PASSWORD_FILE.exists():
        return PANEL_PASSWORD_FILE.read_text().strip()
    return "2625451001"


STREAM_ENDPOINTS = {'/traffic', '/connections', '/logs', '/memory'}

# ---------------------------------------------------------------------------
# In-memory (stale-while-revalidate) cache for idempotent / re-readable GETs.
# Key = (node, method, api_path, query); nodes are 'local' (this host's own
# mihomo) and 'pxed'/'tebi' (remote node reached over the VPC). caches are
# per-node isolated so we never mix two backends' data. We serve whatever we
# have (even stale) so a transient upstream (pxed VPC) hiccup never snowballs
# into a 10s+ cold <= frontend /version health check timing out; the background
# warmer refreshes every ~10s and mutation invalidation clears on change.
# ---------------------------------------------------------------------------
CACHE_LOCK = threading.Lock()
CACHE = {}
CACHE_MAX_BYTES = 20 * 1024 * 1024
CACHE_MAX_ENTRIES = 512
REFRESH_HEADER = 'X-Zashboard-Refresh'


def _is_cacheable(method: str, api_p: str) -> bool:
    if method != 'GET':
        return False
    if api_p in STREAM_ENDPOINTS:          # real-time streams -> never cache
        return False
    if api_p == '/delay' or api_p.endswith('/delay'):
        return False                      # live latency tests
    if api_p.endswith('/healthcheck'):
        return False
    if api_p.startswith('/user-rules') or api_p.startswith('/storage'):
        return False
    return True


def cache_get(node: str, method: str, api_p: str, query: str):
    if not _is_cacheable(method, api_p):
        return None
    key = (node, method, api_p, query)
    with CACHE_LOCK:
        ent = CACHE.get(key)
        if not ent:
            return None
        # stale-while-revalidate: serve whatever we have; the background
        # warmer refreshes it within the interval. TTL is no longer a hard
        # eviction door so a transient upstream hiccup never snowballs into
        # a 10s+ cold <= frontend health check timing out.
        return ent


def cache_put(node: str, method: str, api_p: str, query: str, status: int, headers, body: bytes):
    if not _is_cacheable(method, api_p):
        return
    if len(body) > CACHE_MAX_BYTES:
        return
    key = (node, method, api_p, query)
    with CACHE_LOCK:
        existing = CACHE.get(key)
        # Preserve content-encoding if the upstream response was compressed;
        # serve with the same header so cached bytes decode identically to the
        # live path. (we also force identity upstream, but stay correct anyway)
        if existing is not None:
            CACHE[key] = {**existing, 'ts': time.time(), 'status': status, 'headers': headers, 'body': body}
            return
        if len(CACHE) >= CACHE_MAX_ENTRIES:
            # evict the oldest entry by ts to bound memory on long-running hosts
            try:
                oldest_key = min(CACHE, key=lambda k: CACHE[k]['ts'])
                CACHE.pop(oldest_key, None)
            except ValueError:
                CACHE.clear()
        CACHE[key] = {'ts': time.time(), 'status': status, 'headers': headers, 'body': body}


def cache_invalidate(node: str):
    with CACHE_LOCK:
        for k in [k for k in CACHE if k[0] == node]:
            CACHE.pop(k, None)


def cache_stats():
    with CACHE_LOCK:
        return len(CACHE)


def api_path(raw_path):
    return urlsplit(raw_path).path.split('/panel/api', 1)[-1] or '/'


def authorized(handler):
    value = handler.headers.get('Authorization', '')
    if value:
        return secrets.compare_digest(value, 'Bearer ' + panel_password())
    token = parse_qs(urlsplit(handler.path).query).get('token', [''])[0]
    return secrets.compare_digest(token, panel_password())


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _reply_cached(self, ent):
        self.send_response(ent['status'])
        for k, v in ent['headers']:
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(ent['body'])))
        self.end_headers()
        self.wfile.write(ent['body'])

    def _handle_user_rules(self, method: str, rel_path: str):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.send_header('WWW-Authenticate', 'Bearer')
            self.end_headers()
            return

        reconciler = get_reconciler()
        if not reconciler:
            self.send_json(500, {'error': 'Rules reconciler module is unavailable'})
            return

        subpath = rel_path[len('/panel/api/user-rules'):].strip('/')

        if method == 'GET':
            if subpath == 'targets':
                targets = sorted(list(reconciler.get_available_targets()))
                self.send_json(200, {'targets': targets})
                return
            data = reconciler.load_user_rules()
            targets = sorted(list(reconciler.get_available_targets()))
            self.send_json(200, {
                'version': data.get('version', 1),
                'rules': data.get('rules', []),
                'available_targets': targets,
            })
            return

        length = int(self.headers.get('Content-Length', '0'))
        body_bytes = self.rfile.read(length) if length else b''
        payload = {}
        if body_bytes:
            try:
                payload = json.loads(body_bytes.decode('utf-8'))
            except Exception as e:
                self.send_json(400, {'error': f'Invalid JSON body: {e}'})
                return

        if method == 'POST':
            if subpath == 'reconcile':
                res = reconciler.reconcile()
                if res.get('success'):
                    cache_invalidate('local')
                self.send_json(200 if res.get('success') else 500, res)
                return
            if not isinstance(payload, dict):
                self.send_json(400, {'error': 'Payload must be a JSON object'})
                return
            if 'id' not in payload:
                payload['id'] = f"user-{secrets.token_hex(6)}"
            res = reconciler.add_or_update_rule(payload)
            if res.get('success'):
                cache_invalidate('local')
            self.send_json(200 if res.get('success') else 400, res)
            return

        if method == 'PUT':
            if not subpath:
                self.send_json(400, {'error': 'Missing rule ID in path'})
                return
            rule_id = subpath
            if not isinstance(payload, dict):
                self.send_json(400, {'error': 'Payload must be a JSON object'})
                return
            payload['id'] = rule_id
            res = reconciler.add_or_update_rule(payload)
            self.send_json(200 if res.get('success') else 400, res)
            return

        if method == 'PATCH':
            if not subpath:
                self.send_json(400, {'error': 'Missing rule ID in path'})
                return
            rule_id = subpath
            if not isinstance(payload, dict):
                self.send_json(400, {'error': 'Payload must be a JSON object'})
                return
            data = reconciler.load_user_rules()
            rules = data.get('rules', [])
            target_rule = next((r for r in rules if r.get('id') == rule_id), None)
            if not target_rule:
                self.send_json(404, {'error': f"Rule ID '{rule_id}' not found"})
                return
            target_rule.update(payload)
            target_rule['id'] = rule_id
            res = reconciler.add_or_update_rule(target_rule)
            if res.get('success'):
                cache_invalidate('local')
            self.send_json(200 if res.get('success') else 400, res)
            return

        if method == 'DELETE':
            if not subpath:
                self.send_json(400, {'error': 'Missing rule ID in path'})
                return
            rule_id = subpath
            res = reconciler.delete_rule(rule_id)
            if res.get('success'):
                cache_invalidate('local')
            self.send_json(200 if res.get('success') else 404, res)
            return

        self.send_json(405, {'error': f'Method {method} not allowed'})

    def _proxy(self, method: str, rel_path: str):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.send_header('WWW-Authenticate', 'Bearer')
            self.end_headers()
            return
        if api_path(rel_path) in STREAM_ENDPOINTS and self.headers.get('Upgrade', '').lower() != 'websocket':
            self.send_response(426)
            self.send_header('Content-Length', '0')
            self.send_header('Upgrade', 'websocket')
            self.end_headers()
            return

        if method not in ('GET', 'HEAD', 'OPTIONS'):
            cache_invalidate('local')

        # Path: /panel/api/<clash-api-path> -> localhost:9090/<path>
        suffix = rel_path[len('/panel/api'):]
        query_params = parse_qs(urlsplit(self.path).query)
        if suffix.endswith('/delay') or suffix.endswith('/healthcheck'):
            test_url = query_params.get('url', [''])[0]
            if test_url in (
                'http://www.gstatic.com/generate_204',
                'https://www.gstatic.com/generate_204',
                'http://1.1.1.1/cdn-cgi/trace',
                'https://1.1.1.1/cdn-cgi/trace',
            ):
                query_params['url'] = ['https://cloudflare.com/cdn-cgi/trace']
        query = ('?' + urlencode(query_params, doseq=True)) if query_params else ''
        target = suffix or '/'

        # Cache fast-path for re-readable GETs (skip on refresh header).
        if method == 'GET' and target not in STREAM_ENDPOINTS and not suffix.endswith(('/delay', '/healthcheck')):
            refresh = self.headers.get(REFRESH_HEADER, '') == '1'
            api_p = api_path(rel_path)
            ent = None if refresh else cache_get('local', method, api_p, query)
            if ent is not None:
                self._reply_cached(ent)
                return

        conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'content-length')}
        # Never request a compressed body from upstream: we may cache it and
        # replay it without re-fetching, and the cache only preserves a fixed
        # header subset. Forcing identity keeps cached bytes self-describing.
        headers.pop('Accept-Encoding', None)
        headers['Accept-Encoding'] = 'identity'
        headers['Host'] = '127.0.0.1:9090'
        controller_secret = ''
        secret_file = Path('/personal/clash/.controller-secret')
        if secret_file.exists():
            controller_secret = secret_file.read_text().strip()
        headers['Authorization'] = 'Bearer ' + controller_secret
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        try:
            conn.request(method, target + query, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            if method == 'GET' and resp.status == 200 and target not in STREAM_ENDPOINTS and not suffix.endswith(('/delay', '/healthcheck')):
                saved_headers = [(k, v) for k, v in resp.getheaders()
                                 if k.lower() in ('content-type', 'content-encoding', 'vary')]
                cache_put('local', method, api_path(rel_path), query, resp.status, saved_headers, data)
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in ('connection', 'transfer-encoding', 'content-length'):
                    self.send_header(k, v)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, str(e))
        finally:
            conn.close()

    def _websocket(self, rel_path: str):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        upstream = socket.create_connection((UPSTREAM_HOST, UPSTREAM_PORT), timeout=10)
        try:
            path = rel_path[len('/panel/api'):]
            controller_secret = ''
            secret_file = Path('/personal/clash/.controller-secret')
            if secret_file.exists():
                controller_secret = secret_file.read_text().strip()
            upstream_query = {'token': controller_secret}
            lines = [f'GET {path or "/"}?{urlencode(upstream_query)} HTTP/1.1',
                     'Host: 127.0.0.1:9090',
                     'Connection: Upgrade',
                     'Upgrade: websocket',
                     'Authorization: Bearer ' + controller_secret]
            for key, value in self.headers.items():
                if key.lower() not in ('host', 'connection', 'upgrade', 'authorization'):
                    lines.append(f'{key}: {value}')
            upstream.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode())
            response = b''
            while b'\r\n\r\n' not in response:
                chunk = upstream.recv(4096)
                if not chunk:
                    break
                response += chunk
            self.connection.sendall(response)
            if b' 101 ' not in response:
                return
            self.connection.setblocking(False)
            upstream.setblocking(False)
            sockets = [self.connection, upstream]
            while True:
                readable, _, exceptional = select.select(sockets, [], sockets, 60)
                if exceptional or not readable:
                    break
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    target = upstream if source is self.connection else self.connection
                    target.sendall(data)
        except Exception:
            return
        finally:
            upstream.close()

    def _forward_remote_http(self, method: str, remote_ip: str, remote_port: int, remote_path_with_query: str, node: str):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.send_header('WWW-Authenticate', 'Bearer')
            self.end_headers()
            return

        rel_path = remote_path_with_query.split('?', 1)[0]
        raw_query = remote_path_with_query.split('?', 1)[1] if '?' in remote_path_with_query else ''
        query = ('?' + raw_query) if raw_query else ''

        if method not in ('GET', 'HEAD', 'OPTIONS'):
            cache_invalidate(node)


        if method == 'GET' and not rel_path.endswith(('/delay', '/healthcheck')):
            refresh = self.headers.get(REFRESH_HEADER, '') == '1'
            api_p = api_path(rel_path)
            ent = None if refresh else cache_get(node, method, api_p, query)
            if ent is not None:
                self._reply_cached(ent)
                return

        conn = http.client.HTTPConnection(remote_ip, remote_port, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'content-length')}
        headers.pop('Accept-Encoding', None)
        headers['Accept-Encoding'] = 'identity'
        headers['Host'] = f'{remote_ip}:{remote_port}'
        if 'Authorization' not in headers:
            headers['Authorization'] = 'Bearer ' + panel_password()
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        try:
            conn.request(method, remote_path_with_query, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            if method == 'GET' and resp.status == 200 and not rel_path.endswith(('/delay', '/healthcheck')):
                saved_headers = [(k, v) for k, v in resp.getheaders()
                                 if k.lower() in ('content-type', 'content-encoding', 'vary')]
                cache_put(node, method, api_path(rel_path), query, resp.status, saved_headers, data)
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in ('connection', 'transfer-encoding', 'content-length'):
                    self.send_header(k, v)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, f"Remote gateway error ({remote_ip}:{remote_port}): {e}")
        finally:
            conn.close()

    def _forward_remote_ws(self, remote_ip: str, remote_port: int, remote_path_with_query: str):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        upstream = socket.create_connection((remote_ip, remote_port), timeout=10)
        try:
            lines = [f'GET {remote_path_with_query} HTTP/1.1',
                     f'Host: {remote_ip}:{remote_port}',
                     'Connection: Upgrade',
                     'Upgrade: websocket']
            for key, value in self.headers.items():
                if key.lower() not in ('host', 'connection', 'upgrade'):
                    lines.append(f'{key}: {value}')
            if not any(k.lower() == 'authorization' for k in self.headers):
                lines.append('Authorization: Bearer ' + panel_password())
            upstream.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode())
            response = b''
            while b'\r\n\r\n' not in response:
                chunk = upstream.recv(4096)
                if not chunk:
                    break
                response += chunk
            self.connection.sendall(response)
            if b' 101 ' not in response:
                return
            self.connection.setblocking(False)
            upstream.setblocking(False)
            sockets = [self.connection, upstream]
            while True:
                readable, _, exceptional = select.select(sockets, [], sockets, 60)
                if exceptional or not readable:
                    break
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    target = upstream if source is self.connection else self.connection
                    target.sendall(data)
        except Exception:
            return
        finally:
            upstream.close()

    def _dispatch(self, method: str, is_ws: bool = False, is_head: bool = False):
        raw_path = self.path
        path = raw_path.split('?', 1)[0]
        query = ('?' + raw_path.split('?', 1)[1]) if '?' in raw_path else ''

        target_node = 'local'
        rel_path = path

        if path.startswith('/panel/pxed/api'):
            target_node = 'pxed'
            rel_path = '/panel/api' + path[len('/panel/pxed/api'):]
        elif path.startswith('/panel/tebi/api'):
            target_node = 'tebi'
            rel_path = '/panel/api' + path[len('/panel/tebi/api'):]
        elif path.startswith('/panel/api'):
            target_node = 'local'
            rel_path = path

        is_remote = (target_node == 'pxed' and not is_pxed_host()) or (target_node == 'tebi' and is_pxed_host())

        if is_remote:
            remote_ip = get_remote_node_ip(target_node)
            remote_port = 2053
            if is_ws:
                return self._forward_remote_ws(remote_ip, remote_port, rel_path + query)
            if method == 'OPTIONS':
                self.send_response(204)
                self.end_headers()
                return
            return self._forward_remote_http(method, remote_ip, remote_port, rel_path + query, target_node)

        # Local handling
        if is_ws:
            return self._websocket(rel_path)

        if method == 'OPTIONS':
            if rel_path.startswith('/panel/api/'):
                return self._proxy('OPTIONS', rel_path)
            self.send_response(204)
            self.end_headers()
            return

        if rel_path.startswith('/panel/api/user-rules'):
            return self._handle_user_rules(method, rel_path)

        if rel_path.startswith('/panel/api/'):
            return self._proxy(method, rel_path)

        if method == 'GET':
            return self._static()
        if method == 'HEAD':
            return self._static(head_only=True)

        self.send_error(404)

    def do_CONNECT(self):
        self.send_error(405)

    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() == 'websocket' and ('/api/' in self.path or self.path.endswith('/api')):
            return self._dispatch('GET', is_ws=True)
        return self._dispatch('GET')

    def do_HEAD(self):
        return self._dispatch('HEAD', is_head=True)

    def do_POST(self):
        return self._dispatch('POST')

    def do_PUT(self):
        return self._dispatch('PUT')

    def do_PATCH(self):
        return self._dispatch('PATCH')

    def do_OPTIONS(self):
        return self._dispatch('OPTIONS')

    def do_DELETE(self):
        return self._dispatch('DELETE')

    def _static(self, head_only=False):
        path = self.path.split('?', 1)[0]
        if path in ('', '/', '/panel', '/panel/'):
            rel = 'index.html'
        elif path.startswith('/panel/'):
            rel = path[len('/panel/'):]
        else:
            rel = path.lstrip('/')
        target = (ROOT / rel).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return
        if target.is_dir():
            target /= 'index.html'
        if not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(data)))
        if target.name == 'index.html':
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        print('%s %s' % (self.address_string(), fmt % args), flush=True)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc = __import__('sys').exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


if __name__ == '__main__':
    record_node_ip()

    WARM_INTERVAL = 10
    WARM_ENDPOINTS = ['/version', '/proxies', '/rules', '/configs']

    def _warm_loop():
        # Only warm this host's OWN local mihomo (/panel/api). Each gateway keeps
        # its own local cache warm; we deliberately do NOT poll the remote node
        # over the slow VPC (e.g. tebi poking pxed). That remote polling was
        # redundant (pxed warms itself) and, when pxed was overloaded, spammed
        # 502s into the other host's gateway log -- exactly the "pxed error on
        # tebi" the user saw. Local-only warming keeps every node fast and quiet.
        token = panel_password()
        while True:
            for ep in WARM_ENDPOINTS:
                try:
                    conn = http.client.HTTPConnection('127.0.0.1', 2053, timeout=15)
                    conn.request('GET', '/panel/api' + ep, headers={
                        'Authorization': 'Bearer ' + token,
                        REFRESH_HEADER: '1',
                    })
                    resp = conn.getresponse()
                    resp.read()
                    conn.close()
                except Exception:
                    try:
                        conn.close()
                    except Exception:
                        pass
            time.sleep(WARM_INTERVAL)

    threading.Thread(target=_warm_loop, daemon=True).start()

    Server(('0.0.0.0', 2053), Handler).serve_forever()
