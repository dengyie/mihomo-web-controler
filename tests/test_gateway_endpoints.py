"""Unit tests for the new gateway endpoints: authentication, subscription management,
egress IP race diagnostics, and rule simulation.
"""
import importlib.util
import io
import json
import os
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest import mock
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_gateway():
    spec = importlib.util.spec_from_file_location(
        "gateway_under_test",
        REPO_ROOT / "zashboard" / "gateway.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeRequestHarness:
    """Helper to simulate HTTP requests against Handler methods."""

    def __init__(self, gw, method='GET', path='/panel/api/subscriptions', body=None, auth_token=None):
        self.gw = gw
        self.handler = object.__new__(gw.Handler)
        self.handler.command = method
        self.handler.path = path
        self.handler.requestline = f"{method} {path} HTTP/1.1"

        headers = Message()
        if auth_token is not None:
            headers['Authorization'] = f"Bearer {auth_token}"
        if body:
            body_bytes = body.encode('utf-8') if isinstance(body, str) else body
            headers['Content-Length'] = str(len(body_bytes))
            self.handler.rfile = io.BytesIO(body_bytes)
        else:
            headers['Content-Length'] = '0'
            self.handler.rfile = io.BytesIO(b'')

        self.handler.headers = headers
        self.handler.wfile = io.BytesIO()

        # Capture response status and headers
        self.response_status = None
        self.response_headers = {}

        def _send_response(status, message=None):
            self.response_status = status

        def _send_header(k, v):
            self.response_headers[k] = v

        def _end_headers():
            pass

        self.handler.send_response = _send_response
        self.handler.send_header = _send_header
        self.handler.end_headers = _end_headers

    def get_json(self):
        output = self.handler.wfile.getvalue().decode('utf-8')
        if not output:
            return None
        return json.loads(output)


class GatewayEndpointsTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.test_dir = Path(self.tmpdir.name)
        self.clash_dir = self.test_dir / 'clash'
        self.clash_dir.mkdir(parents=True, exist_ok=True)

        self.orig_env = dict(os.environ)
        os.environ['CLASH_ROOT'] = str(self.clash_dir)
        os.environ['ZASHBOARD_DIST'] = str(self.test_dir / 'dist')

        self.password_file = self.test_dir / 'panel.password'
        self.password_file.write_text('secret-token-123')
        os.environ['PANEL_PASSWORD_FILE'] = str(self.password_file)

        # Copy subscription-manager.py and rules-reconciler.py into clash_dir
        (self.clash_dir / 'subscription-manager.py').write_text(
            (REPO_ROOT / 'clash' / 'subscription-manager.py').read_text()
        )
        (self.clash_dir / 'rules-reconciler.py').write_text(
            (REPO_ROOT / 'clash' / 'rules-reconciler.py').read_text()
        )

        # Create basic config.yaml in clash_dir
        sample_config = {
            'dns': {
                'enable': True,
                'nameserver': ['223.5.5.5', '114.114.114.114'],
                'nameserver-policy': {
                    '+.openai.com': 'https://1.1.1.1/dns-query'
                }
            },
            'rules': [
                'DOMAIN-SUFFIX,openai.com,PROXY',
                'MATCH,DIRECT',
            ],
            'proxy-groups': [
                {'name': 'PROXY', 'type': 'select', 'proxies': ['DIRECT']},
            ]
        }
        (self.clash_dir / 'config.yaml').write_text(yaml.safe_dump(sample_config))

        self.gw = _load_gateway()
        self.gw.PANEL_PASSWORD_FILE = self.password_file
        self.gw.CLASH_ROOT = self.clash_dir
        self.gw.SUBSCRIPTION_MANAGER_PATH = self.clash_dir / 'subscription-manager.py'
        self.gw.RECONCILER_PATH = self.clash_dir / 'rules-reconciler.py'
        self.token = 'secret-token-123'

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.orig_env)
        self.tmpdir.cleanup()

    # -------------------------------------------------------------
    # Authentication Protection Tests for all new endpoints
    # -------------------------------------------------------------
    def test_unauthenticated_requests_are_rejected(self):
        endpoints = [
            ('GET', '/panel/api/subscriptions', None),
            ('POST', '/panel/api/subscriptions', '{"name": "test"}'),
            ('POST', '/panel/api/subscriptions/sub-1/update', '{}'),
            ('POST', '/panel/api/subscriptions/sub-1/toggle', '{}'),
            ('DELETE', '/panel/api/subscriptions/sub-1', None),
            ('POST', '/panel/api/subscriptions/import-nodes', '{"text": "ss://..."}'),
            ('GET', '/panel/api/diagnostics/egress-ip', None),
            ('POST', '/panel/api/rules/simulate', '{"domain": "openai.com"}'),
        ]
        for method, path, body in endpoints:
            harness = _FakeRequestHarness(self.gw, method=method, path=path, body=body, auth_token=None)
            self.gw.Handler._dispatch(harness.handler, method)
            self.assertEqual(harness.response_status, 401, f"Expected 401 for unauth {method} {path}")

    # -------------------------------------------------------------
    # Subscription Manager API Tests
    # -------------------------------------------------------------
    def test_subscriptions_crud_flow(self):
        # 1. GET empty subscriptions
        h1 = _FakeRequestHarness(self.gw, 'GET', '/panel/api/subscriptions', auth_token=self.token)
        self.gw.Handler._dispatch(h1.handler, 'GET')
        self.assertEqual(h1.response_status, 200)
        res1 = h1.get_json()
        self.assertEqual(res1['status'], 'ok')
        self.assertEqual(len(res1['data']['subscriptions']), 0)

        # 2. POST add subscription (raw content with SS node)
        ss_uri = "ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.4:8388#TestNode1"
        payload = {
            'name': 'MyAirPort',
            'type': 'raw',
            'raw_content': ss_uri,
        }
        h2 = _FakeRequestHarness(self.gw, 'POST', '/panel/api/subscriptions', body=json.dumps(payload), auth_token=self.token)
        self.gw.Handler._dispatch(h2.handler, 'POST')
        self.assertEqual(h2.response_status, 200)
        res2 = h2.get_json()
        self.assertEqual(res2['status'], 'ok')
        sub_id = res2['data']['subscription']['id']
        self.assertEqual(res2['data']['subscription']['node_count'], 1)

        # 3. GET verify subscription exists
        h3 = _FakeRequestHarness(self.gw, 'GET', '/panel/api/subscriptions', auth_token=self.token)
        self.gw.Handler._dispatch(h3.handler, 'GET')
        res3 = h3.get_json()
        self.assertEqual(len(res3['data']['subscriptions']), 1)
        self.assertEqual(res3['data']['subscriptions'][0]['id'], sub_id)

        # 4. POST toggle subscription
        h4 = _FakeRequestHarness(self.gw, 'POST', f'/panel/api/subscriptions/{sub_id}/toggle', auth_token=self.token)
        self.gw.Handler._dispatch(h4.handler, 'POST')
        self.assertEqual(h4.response_status, 200)
        res4 = h4.get_json()
        self.assertFalse(res4['data']['subscription']['enabled'])

        # 4b. PATCH toggle / update subscription
        h4b = _FakeRequestHarness(self.gw, 'PATCH', f'/panel/api/subscriptions/{sub_id}',
                                  body=json.dumps({'enabled': True}), auth_token=self.token)
        self.gw.Handler._dispatch(h4b.handler, 'PATCH')
        self.assertEqual(h4b.response_status, 200)
        res4b = h4b.get_json()
        self.assertTrue(res4b['data']['subscription']['enabled'])

        # 5. POST update subscription
        h5 = _FakeRequestHarness(self.gw, 'POST', f'/panel/api/subscriptions/{sub_id}/update',
                                 body=json.dumps({'name': 'UpdatedAirport', 'enabled': True}), auth_token=self.token)
        self.gw.Handler._dispatch(h5.handler, 'POST')
        self.assertEqual(h5.response_status, 200)
        res5 = h5.get_json()
        self.assertEqual(res5['data']['subscription']['name'], 'UpdatedAirport')
        self.assertTrue(res5['data']['subscription']['enabled'])

        # 6. DELETE subscription
        h6 = _FakeRequestHarness(self.gw, 'DELETE', f'/panel/api/subscriptions/{sub_id}', auth_token=self.token)
        self.gw.Handler._dispatch(h6.handler, 'DELETE')
        self.assertEqual(h6.response_status, 200)

        # 7. GET verify deleted
        h7 = _FakeRequestHarness(self.gw, 'GET', '/panel/api/subscriptions', auth_token=self.token)
        self.gw.Handler._dispatch(h7.handler, 'GET')
        res7 = h7.get_json()
        self.assertEqual(len(res7['data']['subscriptions']), 0)

    def test_subscriptions_import_nodes(self):
        raw_text = "ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.4:8388#ImportedNode1\nss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.5:8388#ImportedNode2"
        payload = {
            'name': 'BatchImport',
            'text': raw_text,
        }
        h = _FakeRequestHarness(self.gw, 'POST', '/panel/api/subscriptions/import-nodes', body=json.dumps(payload), auth_token=self.token)
        self.gw.Handler._dispatch(h.handler, 'POST')
        self.assertEqual(h.response_status, 200)
        res = h.get_json()
        self.assertEqual(res['status'], 'ok')
        self.assertEqual(res['data']['subscription']['node_count'], 2)

    # -------------------------------------------------------------
    # Egress IP Race Diagnostics API Tests
    # -------------------------------------------------------------
    def test_diagnostics_egress_ip(self):
        def fake_probe(src, timeout=3.5, use_proxy=True, proxy_port=7897):
            name = src.get('name')
            if name == 'cloudflare':
                return {
                    'ip': '198.51.100.1',
                    'country': 'US',
                    'city': 'San Jose',
                    'org': 'AS13335 Cloudflare, Inc.',
                }
            elif name == 'ipinfo.io':
                return {
                    'ip': '198.51.100.2',
                    'country': 'US',
                    'city': 'San Jose',
                    'org': 'ipinfo',
                }
            return None

        with mock.patch.object(self.gw, '_probe_egress_source', side_effect=fake_probe):
            h = _FakeRequestHarness(self.gw, 'GET', '/panel/api/diagnostics/egress-ip?proxy=true&proxy_port=7897', auth_token=self.token)
            self.gw.Handler._dispatch(h.handler, 'GET')
            self.assertEqual(h.response_status, 200)
            res = h.get_json()
            self.assertEqual(res['status'], 'ok')
            self.assertTrue(res['data']['success'])
            self.assertIsNotNone(res['data']['fastest'])
            self.assertIn(res['data']['fastest']['data']['ip'], ['198.51.100.1', '198.51.100.2'])
            self.assertTrue(len(res['data']['all_results']) >= 1)

    def test_diagnostics_all_failed(self):
        with mock.patch.object(self.gw, '_probe_egress_source', return_value=None):
            h = _FakeRequestHarness(self.gw, 'GET', '/panel/api/diagnostics/egress-ip', auth_token=self.token)
            self.gw.Handler._dispatch(h.handler, 'GET')
            self.assertEqual(h.response_status, 200)
            res = h.get_json()
            self.assertEqual(res['status'], 'ok')
            self.assertFalse(res['data']['success'])
            self.assertIn('failed', res['data']['message'])

    def test_query_token_authentication(self):
        h = _FakeRequestHarness(self.gw, 'GET', f'/panel/api/subscriptions?token={self.token}', auth_token=None)
        self.gw.Handler._dispatch(h.handler, 'GET')
        self.assertEqual(h.response_status, 200)

        h_bad = _FakeRequestHarness(self.gw, 'GET', '/panel/api/subscriptions?token=wrong_token', auth_token=None)
        self.gw.Handler._dispatch(h_bad.handler, 'GET')
        self.assertEqual(h_bad.response_status, 401)

    # -------------------------------------------------------------
    # Rule Simulation API Tests
    # -------------------------------------------------------------
    def test_rules_simulate_api(self):
        payload = {'domain': 'api.openai.com'}
        h = _FakeRequestHarness(self.gw, 'POST', '/panel/api/rules/simulate', body=json.dumps(payload), auth_token=self.token)
        self.gw.Handler._dispatch(h.handler, 'POST')
        self.assertEqual(h.response_status, 200)
        res = h.get_json()
        self.assertEqual(res['status'], 'ok')
        self.assertTrue(res['data']['success'])
        self.assertEqual(res['data']['matched_rule']['type'], 'DOMAIN-SUFFIX')
        self.assertEqual(res['data']['matched_rule']['payload'], 'openai.com')
        self.assertEqual(res['data']['matched_rule']['target'], 'PROXY')
        self.assertIn('https://1.1.1.1/dns-query', res['data']['dns']['nameservers'])


if __name__ == '__main__':
    unittest.main()
