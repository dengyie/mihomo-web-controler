"""Minimal unit tests for the gateway's read-API cache layer.

These exercise the pure cache functions (isolation, staleness, invalidation,
and the bounded-eviction / content-encoding behaviour) without needing the
live mihomo backends. Import gateway.py purely as a module; nothing in its
top-level executes (the server only starts under __main__).
"""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_gateway():
    spec = importlib.util.spec_from_file_location(
        "gateway_under_test",
        ROOT / "zashboard" / "gateway.py",
    )
    mod = importlib.util.module_from_spec(spec)
    # module top-level does not start the server (guarded by __main__)
    spec.loader.exec_module(mod)
    return mod


class CacheIsolationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = _load_gateway()

    def setUp(self):
        # isolate each test against a clean cache
        with self.gw.CACHE_LOCK:
            self.gw.CACHE.clear()

    def test_is_cacheable_matrix(self):
        gw = self.gw
        cacheable = ['/proxies', '/rules', '/configs', '/version', '/providers/proxies']
        non_cacheable = [
            '/traffic', '/connections', '/logs', '/memory',   # streams
            '/proxies/abc/delay', '/providers/proxies/x/healthcheck',  # live checks
            '/user-rules', '/storage/zashboard',
        ]
        for p in cacheable:
            self.assertTrue(gw._is_cacheable('GET', p), f'{p} should be cacheable')
            self.assertFalse(gw._is_cacheable('POST', p), f'{p} POST should NOT cache')
        for p in non_cacheable:
            self.assertFalse(gw._is_cacheable('GET', p), f'{p} should NOT cache')

    def test_node_isolation(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/proxies', '', 200, [], b'local-data')
        gw.cache_put('pxed', 'GET', '/proxies', '', 200, [], b'pxed-data')
        self.assertEqual(
            gw.cache_get('local', 'GET', '/proxies', '')['body'], b'local-data')
        self.assertEqual(
            gw.cache_get('pxed', 'GET', '/proxies', '')['body'], b'pxed-data')

    def test_stale_served_after_backdate(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        with gw.CACHE_LOCK:
            gw.CACHE[('local', 'GET', '/version', '')]['ts'] = 0  # ancient
        ent = gw.cache_get('local', 'GET', '/version', '')
        self.assertIsNotNone(ent, 'stale-while-revalidate must still serve stale')
        self.assertEqual(ent['body'], b'{"v":"1"}')

    def test_invalidate_node_isolation(self):
        gw = self.gw
        gw.cache_put('local', 'GET', '/proxies', '', 200, [], b'l')
        gw.cache_put('pxed', 'GET', '/proxies', '', 200, [], b'p')
        gw.cache_invalidate('pxed')
        self.assertIsNone(gw.cache_get('pxed', 'GET', '/proxies', ''))
        self.assertIsNotNone(gw.cache_get('local', 'GET', '/proxies', ''))

    def test_max_entries_evicts_oldest(self):
        gw = self.gw
        old_max = gw.CACHE_MAX_ENTRIES
        gw.CACHE_MAX_ENTRIES = 3
        try:
            # insert 3 entries with distinct-ish ts
            for i in range(3):
                gw.cache_put('local', 'GET', f'/p{i}', '', 200, [], b'x')
                # force increasing ts
            # backdate the first so it is oldest
            with gw.CACHE_LOCK:
                gw.CACHE[('local', 'GET', '/p0', '')]['ts'] = 1
            gw.cache_put('local', 'GET', '/p3', '', 200, [], b'x')  # should evict /p0
            with gw.CACHE_LOCK:
                self.assertNotIn(('local', 'GET', '/p0', ''), gw.CACHE)
                self.assertLessEqual(len(gw.CACHE), 3)
        finally:
            gw.CACHE_MAX_ENTRIES = old_max

    def test_oversized_body_not_cached(self):
        gw = self.gw
        big = b'x' * (gw.CACHE_MAX_BYTES + 1)
        gw.cache_put('local', 'GET', '/big', '', 200, [], big)
        self.assertIsNone(gw.cache_get('local', 'GET', '/big', ''))

    def test_second_write_overwrites_body_and_headers(self):
        """A re-fetch of an existing key must fully replace the cached body and
        headers, not merge leftovers (guards the {**existing, ...} branch)."""
        gw = self.gw
        gw.cache_put('local', 'GET', '/proxies', '', 200,
                     [('content-type', 'application/json'), ('content-encoding', 'br')],
                     b'old-json')
        # second refetch returns identity and a fresh body; headers shrink
        gw.cache_put('local', 'GET', '/proxies', '', 200,
                     [('content-type', 'application/json')],
                     b'fresh-json')
        ent = gw.cache_get('local', 'GET', '/proxies', '')
        self.assertEqual(ent['body'], b'fresh-json', 'body must be the fresh one')
        header_keys = [k for k, _ in ent['headers']]
        self.assertNotIn('content-encoding', header_keys,
                         'content-encoding must not survive an identity refresh')

    def test_consecutive_failure_bypasses_stale(self):
        """Once a node fails enough consecutive upstream reads, cached (stale)
        data must NOT be served -- surfacing the real outage. A successful
        cache_put resets the counter so the node recovers automatically."""
        gw = self.gw
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        # 5 failures reaches the threshold
        for _ in range(gw.CACHE_MAX_CONSECUTIVE_FAILS):
            gw.cache_fail('local')
        self.assertIsNone(gw.cache_get('local', 'GET', '/version', ''),
                          'stale must be bypassed after sustained failures')
        # a successful refetch clears the counter and stale is served again
        gw.cache_put('local', 'GET', '/version', '', 200, [], b'{"v":"1"}')
        self.assertIsNotNone(gw.cache_get('local', 'GET', '/version', ''),
                             'counter should reset on success')
        # another node is unaffected
        self.assertIsNone(gw.cache_get('pxed', 'GET', '/version', ''))


if __name__ == '__main__':
    unittest.main(verbosity=2)