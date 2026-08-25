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
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

ROOT = Path('/personal/zashboard/dist').resolve()
UPSTREAM_HOST = '127.0.0.1'
UPSTREAM_PORT = 9090
PANEL_PASSWORD_FILE = Path('/personal/zashboard/panel.password')
RECONCILER_PATH = Path('/personal/clash/rules-reconciler.py')

_reconciler_mtime = 0
_reconciler_module = None


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
    return PANEL_PASSWORD_FILE.read_text().strip()


STREAM_ENDPOINTS = {'/traffic', '/connections', '/logs', '/memory'}


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

    def _handle_user_rules(self, method: str):
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

        path = self.path.split('?', 1)[0]
        subpath = path[len('/panel/api/user-rules'):].strip('/')

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
                self.send_json(200 if res.get('success') else 500, res)
                return
            if not isinstance(payload, dict):
                self.send_json(400, {'error': 'Payload must be a JSON object'})
                return
            if 'id' not in payload:
                payload['id'] = f"user-{secrets.token_hex(6)}"
            res = reconciler.add_or_update_rule(payload)
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
            self.send_json(200 if res.get('success') else 400, res)
            return

        if method == 'DELETE':
            if not subpath:
                self.send_json(400, {'error': 'Missing rule ID in path'})
                return
            rule_id = subpath
            res = reconciler.delete_rule(rule_id)
            self.send_json(200 if res.get('success') else 404, res)
            return

        self.send_json(405, {'error': f'Method {method} not allowed'})

    def _proxy(self, method):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.send_header('WWW-Authenticate', 'Bearer')
            self.end_headers()
            return
        if api_path(self.path) in STREAM_ENDPOINTS and self.headers.get('Upgrade', '').lower() != 'websocket':
            self.send_response(426)
            self.send_header('Content-Length', '0')
            self.send_header('Upgrade', 'websocket')
            self.end_headers()
            return
        # Same-origin public path: /panel/api/<clash-api-path> -> localhost:9090/<path>
        suffix = self.path.split('?', 1)[0][len('/panel/api'):]
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
        conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'content-length')}
        headers['Host'] = '127.0.0.1:9090'
        headers['Authorization'] = 'Bearer ' + open('/personal/clash/.controller-secret').read().strip()
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        try:
            conn.request(method, target + query, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
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

    def _websocket(self):
        if not authorized(self):
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        upstream = socket.create_connection((UPSTREAM_HOST, UPSTREAM_PORT), timeout=10)
        try:
            path = self.path.split('?', 1)[0][len('/panel/api'):]
            upstream_secret = open('/personal/clash/.controller-secret').read().strip()
            upstream_query = {'token': upstream_secret}
            lines = [f'GET {path or "/"}?{urlencode(upstream_query)} HTTP/1.1',
                     'Host: 127.0.0.1:9090',
                     'Connection: Upgrade',
                     'Upgrade: websocket',
                     'Authorization: Bearer ' + open('/personal/clash/.controller-secret').read().strip()]
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

    def do_CONNECT(self):
        self.send_error(405)

    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() == 'websocket' and self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._websocket()
        if self.path.split('?', 1)[0].startswith('/panel/api/user-rules'):
            return self._handle_user_rules('GET')
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('GET')
        return self._static()

    def do_HEAD(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('HEAD')
        return self._static(head_only=True)

    def do_POST(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/user-rules'):
            return self._handle_user_rules('POST')
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('POST')
        self.send_error(404)

    def do_PUT(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/user-rules'):
            return self._handle_user_rules('PUT')
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('PUT')
        self.send_error(404)

    def do_PATCH(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/user-rules'):
            return self._handle_user_rules('PATCH')
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('PATCH')
        self.send_error(404)

    def do_OPTIONS(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('OPTIONS')
        self.send_response(204)
        self.end_headers()

    def do_DELETE(self):
        if self.path.split('?', 1)[0].startswith('/panel/api/user-rules'):
            return self._handle_user_rules('DELETE')
        if self.path.split('?', 1)[0].startswith('/panel/api/'):
            return self._proxy('DELETE')
        self.send_error(404)

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
    Server(('127.0.0.1', 2053), Handler).serve_forever()
