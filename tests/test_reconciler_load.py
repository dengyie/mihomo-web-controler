"""Regression tests for the reconciler-load observability fix.

Guards against the production incident where `get_reconciler()` silently
swallowed a ``ModuleNotFoundError`` (missing PyYAML) and returned ``None``,
surfacing a misleading "Rules reconciler module is unavailable" while the real
cause only lived in the supervisor log.

Contract after the fix:
  - reconciler source absent                  -> returns None (not an error)
  - source present but fails on FIRST load     -> raises ReconcilerLoadError
        carrying the real cause (missing dep / syntax)
  - a good module loads and is cached for reuse
"""
import importlib.util
import tempfile
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


def _write_reconciler(text: str) -> Path:
    p = Path(tempfile.mkdtemp()) / 'rules-reconciler.py'
    p.write_text(text, encoding='utf-8')
    return p


class ReconcilerLoadSemanticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = _load_gateway()
        cls.OrigPath = cls.gw.RECONCILER_PATH
        cls.orig_module = cls.gw._reconciler_module
        cls.orig_mtime = cls.gw._reconciler_mtime

    def setUp(self):
        # Snapshot + reset the module cache so each test starts "fresh, never
        # loaded". `_reconciler_module=None` makes the next call a *first* load,
        # which is exactly the path that must raise on error.
        self._saved_module = self.gw._reconciler_module
        self._saved_mtime = self.gw._reconciler_mtime
        self.gw._reconciler_module = None
        self.gw._reconciler_mtime = 0

    def tearDown(self):
        self.gw.RECONCILER_PATH = self.OrigPath
        self.gw._reconciler_module = self._saved_module
        self.gw._reconciler_mtime = self._saved_mtime

    def test_missing_file_returns_none(self):
        self.gw.RECONCILER_PATH = Path('/nonexistent/rules-reconciler.py')
        self.assertIsNone(self.gw.get_reconciler())

    def test_bad_syntax_raises_with_real_cause(self):
        self.gw.RECONCILER_PATH = _write_reconciler(
            "def broken(:\n  return 1\n"   # <-- deliberate syntax error
        )
        with self.assertRaises(self.gw.ReconcilerLoadError) as ctx:
            self.gw.get_reconciler()
        msg = str(ctx.exception)
        self.assertIn('rules-reconciler.py', msg)
        # real cause must be present, not a static generic sentence
        self.assertIn('SyntaxError', msg)

    def test_missing_dependency_raises_with_real_cause(self):
        self.gw.RECONCILER_PATH = _write_reconciler(
            "import made_up_module_that_does_not_exist_xyz\n"
            "def load_user_rules(a):\n    return a\n"
        )
        with self.assertRaises(self.gw.ReconcilerLoadError) as ctx:
            self.gw.get_reconciler()
        self.assertIn('made_up_module_that_does_not_exist_xyz', str(ctx.exception))

    def test_good_module_loads_and_caches(self):
        self.gw.RECONCILER_PATH = _write_reconciler(
            "def load_user_rules():\n    return {'version': 1, 'rules': []}\n"
        )
        mod = self.gw.get_reconciler()
        self.assertIsNotNone(mod)
        self.assertIs(self.gw.get_reconciler(), mod)   # cached, no re-import


if __name__ == '__main__':
    unittest.main()