"""Minimal unit tests for the gateway's read/reverse-proxy cache behavior.

Covers the cache functions (isolation, staleness, invalidation, bounded
eviction, oversize guard, consecutive-failure gate) AND the correctness
contract that a client-side disconnect must NOT increment the per-node
failure counter (only genuine upstream read failures should).
"""
import importlib.util
import io
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def _load_gateway():
    spec = importlib.util.spec_from_file_location(
        "gateway_under_test",
        ROOT / "zashboard" / "gateway.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _StaticBackend:
    """Minimal stand-in for http.client.HTTPConnection up to getresponse().

    status/headers/body are configurable; raising is provided by the test via
    factory-side exception injection.
    """

    def __init__(self, body=b'{}', status=200, headers=(), raise_on_request=None):
        self.body = body
        self.status = status
        self.headers = headers
        self._raise = raise_on_request

    def request(self, *a, **k):
        if self._raise is not None:
            raise self._raise

    def getresponse(self):
        return self  # mimic HTTPResponse surface used

    def getheaders(self):
        return list(self.headers)

    def read(self):
        return self.body

    def close(self):
        pass


class _HandlerHarness:
    """Drive a real Handler instance with fake upstream/client I/O."""

    def __init__(self, gw, backend, wfile=None, auth=True):
        from email.message import Message
        self.gateway = gw
        h = object.__new__(gw.Handler)
        headers = Message()
        headers['Authorization'] = 'Bearer ' + (gw.panel_password() if auth else 'wrong')
        headers['Accept-Encoding'] = 'gzip, deflate'
        h.headers = headers
        h.path = '/panel/api/version'
        h.command = 'GET'
        h.rfile = io.BytesIO()
        self.wfile = wfile if wfile is not None else io.BytesIO()
        h.wfile = self.wfile
        h.connection = io.BytesIO()
        h.requestline = 'GET /panel/api/version HTTP/1.1'
        # response plumbing
        self.captured = {'status': None, 'headers': [], 'body': b''}
        h.send_response = lambda code: self.captured.__setitem__('status', code)
        h.send_header = lambda k, v: self.captured['headers'].append((k, v))
        h.end_headers = lambda: None
        h.send_error = lambda code, msg=None: self.captured.__setitem__('status', code)
        # HTTP upstream factory, patched by caller
        self.backend = backend
        self.h = h

    def call_proxy(self):
        with mock.patch('http.client.HTTPConnection', return_value=self.backend):
            self.h._proxy('GET', '/panel/api/version')


class CacheSharedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = _load_gateway()

    def setUp(self):
        with self.gw.CACHE_LOCK:
            self.gw.CACHE.clear()
            self.gw.CACHE_FAILS.clear()


class CacheSemanticsTests(CacheSharedTests):
    def test_is_cacheable_matrix(self):
        gw = self.gw
        cacheable = ['/proxies', '/rules', '/configs', '/version', '/providers/proxies']
        non_cacheable = [
            '/traffic', '/connections', '/logs', '/memory',
            '/proxies/abc/delay', '/providers/proxies/x/healthcheck',
            '/user-rules', '/storage/zashboard',
        ]
        for p in cacheable:
            self.assertTrue(gw._is_cacheable('GET', p), f'{p} should cache')
            self.assertFalse(gw._is_cacheable('POST', p), f'{p} POST should not cache')
        for p in non_cacheable:
            self.assertFalse(gw._is_cacheable('GET', p), f'{p} should not cache')

    def test_node_isolation(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/proxies', '', 200, [], b'local')
        gw.cache_put('pxed', 'GET', '/proxies', '', 200, [], b'pxed')
        self.assertEqual(gw.cache_get('local', 'GET', '/proxies', '')['body'], b'local')
        self.assertEqual(gw.cache_get('pxed', 'GET', '/proxies', '')['body'], b'pxed')

    def test_stale_served_after_backdate(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        with gw.CACHE_LOCK:
            gw.CACHE[('local', 'GET', '/version', '')]['ts'] = 0
        ent = gw.cache_get('local', 'GET', '/version', '')
        self.assertIsNotNone(ent)
        self.assertEqual(ent['body'], b'{"v":"1"}')

    def test_invalidate_node_isolation(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/a', '', 200, [], b'l')
        gw.cache_put('pxed', 'GET', '/a', '', 200, [], b'p')
        gw.cache_invalidate('pxed')
        self.assertIsNone(gw.cache_get('pxed', 'GET', '/a', ''))
        self.assertIsNotNone(gw.cache_get('local', 'GET', '/a', ''))

    def test_max_entries_evicts_oldest(self):
        gw = self.gw
        old = gw.CACHE_MAX_ENTRIES
        gw.CACHE_MAX_ENTRIES = 3
        try:
            for i in range(3):
                gw.cache_put('local', 'GET', f'/p{i}', '', 200, [], b'x')
            with gw.CACHE_LOCK:
                gw.CACHE[('local', 'GET', '/p0', '')]['ts'] = 1
            gw.cache_put('local', 'GET', '/p3', '', 200, [], b'x')
            with gw.CACHE_LOCK:
                self.assertNotIn(('local', 'GET', '/p0', ''), gw.CACHE)
                self.assertLessEqual(len(gw.CACHE), 3)
        finally:
            gw.CACHE_MAX_ENTRIES = old

    def test_oversized_body_not_cached(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/big', '', 200, [], b'x' * (gw.CACHE_MAX_BYTES + 1))
        self.assertIsNone(gw.cache_get('local', 'GET', '/big', ''))

    def test_second_write_overwrites_body_and_headers(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/proxies', '', 200,
                     [('content-type', 'application/json'), ('content-encoding', 'br')],
                     b'old')
        gw.cache_put('local', 'GET', '/proxies', '', 200,
                     [('content-type', 'application/json')], b'fresh')
        ent = gw.cache_get('local', 'GET', '/proxies', '')
        self.assertEqual(ent['body'], b'fresh')
        self.assertNotIn('content-encoding', [k for k, _ in ent['headers']])

    def test_consecutive_failure_bypasses_stale_and_recovers(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        for _ in range(gw.CACHE_MAX_CONSECUTIVE_FAILS):
            gw.cache_fail('local')
        self.assertIsNone(gw.cache_get('local', 'GET', '/version', ''))
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        self.assertIsNotNone(gw.cache_get('local', 'GET', '/version', ''))


class ClientDisconnectTests(CacheSharedTests):
    """A client that drops mid-write must NOT count as an upstream failure."""

    def test_client_broken_pipe_does_not_cache_fail(self):
        gw = self.gw
        # upstream is healthy (returns 200 + body); only the client write fails
        backend = _StaticBackend(status=200, body=b'{}')
        writer = io.BytesIO()

        def boom(data):
            raise BrokenPipeError(32, 'Broken pipe')

        writer.write = boom
        harness = _HandlerHarness(gw, backend, wfile=writer)
        harness.call_proxy()
        with gw.CACHE_LOCK:
            self.assertEqual(gw.CACHE_FAILS.get('local', 0), 0,
                             'client disconnect must NOT increment upstream failure')

    def test_upstream_error_does_cache_fail(self):
        gw = self.gw
        backend = _StaticBackend(raise_on_request=OSError('upstream down'))
        harness = _HandlerHarness(gw=gw, backend=backend)
        harness.call_proxy()
        with gw.CACHE_LOCK:
            self.assertEqual(gw.CACHE_FAILS.get('local', 0), 1,
                             'upstream failure MUST increment per-node counter')


if __name__ == '__main__':
    unittest.main(verbosity=2)