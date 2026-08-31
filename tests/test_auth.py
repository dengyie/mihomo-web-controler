"""Regression tests for the panel auth fail-closed behavior.

Guards against the P1 finding in the hardening work: when `panel_password()`
returns '' (missing/empty password file), `authorized()` must REJECT all
requests. The original code did

    token = parse_qs(...).get('token', [''])[0]
    return secrets.compare_digest(token, panel_password())

which, with an empty secret, evaluated `compare_digest('', '') == True`, i.e. a
completely unauthenticated request passed auth — the exact opposite of the
fail-closed intent.
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
    spec.loader.exec_module(mod)
    return mod


class _FakeHandler:
    """Minimal stand-in exposing the fields `authorized()` reads."""

    def __init__(self, path, header_value=""):
        self.path = path
        self.headers = {"Authorization": header_value} if header_value else {}


class AuthFailClosedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = _load_gateway()
        cls.orig = cls.gw.PANEL_PASSWORD_FILE

    def setUp(self):
        # Point the gateway at a NONEXISTENT password file so panel_password()
        # returns ''.
        self.gw.PANEL_PASSWORD_FILE = Path('/nonexistent/panel.password')

    def tearDown(self):
        self.gw.PANEL_PASSWORD_FILE = self.orig

    def test_empty_secret_rejects_header_path(self):
        h = _FakeHandler('/panel/api/user-rules', header_value='Bearer secret')
        self.assertFalse(self.gw.authorized(h))

    def test_empty_secret_rejects_query_token_path(self):
        # The historical bug: no token param at all -> token='' -> compare('','') True.
        h = _FakeHandler('/panel/api/user-rules?token=')
        self.assertFalse(self.gw.authorized(h))
        # No query at all:
        h2 = _FakeHandler('/panel/api/user-rules')
        self.assertFalse(self.gw.authorized(h2))

    def test_nonempty_secret_requires_matching_token(self):
        # Restore a real secret and check the happy path still works.
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
            f.write('s3cr3t')
            p = f.name
        self.gw.PANEL_PASSWORD_FILE = Path(p)
        try:
            # correct query token -> authorized
            h = _FakeHandler('/panel/api/user-rules?token=s3cr3t')
            self.assertTrue(self.gw.authorized(h))
            # wrong token -> denied
            h2 = _FakeHandler('/panel/api/user-rules?token=nope')
            self.assertFalse(self.gw.authorized(h2))
            # correct header -> authorized
            h3 = _FakeHandler('/panel/api/user-rules', header_value='Bearer s3cr3t')
            self.assertTrue(self.gw.authorized(h3))
        finally:
            Path(p).unlink(missing_ok=True)

    def test_empty_token_never_matches_real_secret(self):
        # Even with a real secret, an empty query token must be denied.
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
            f.write('s3cr3t')
            p = f.name
        self.gw.PANEL_PASSWORD_FILE = Path(p)
        try:
            h = _FakeHandler('/panel/api/user-rules?token=')
            self.assertFalse(self.gw.authorized(h))
        finally:
            Path(p).unlink(missing_ok=True)


if __name__ == '__main__':
    unittest.main()