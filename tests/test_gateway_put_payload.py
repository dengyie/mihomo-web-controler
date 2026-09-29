"""Regression tests for the PUT edit payload backfill in gateway.py.

Guards the review finding: the web form only edits type/payload/target, so a
PUT to /user-rules/<id> would rebuild the whole stored entry and silently drop
extra fields (``params``) that were added via API or a later YAML edit.
``_backfill_edit_payload`` carries those fields over from the stored entry.

Contract:
  - payload already carrying ``params`` keeps it (UI now sends it: no clobber)
  - stored rule with ``params`` + payload without it -> params preserved
  - stored rule with whitespace-only/absent params -> nothing injected
  - unknown rule id -> payload untouched
  - ``id`` itself is still the URL-derived id after backfill
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


class BackfillEditPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = _load_gateway()

    def test_preserves_params_from_stored_entry(self):
        existing = [
            {'id': 'user-abc', 'type': 'IP-CIDR', 'payload': '10.2.0.0/16',
             'target': 'REJECT', 'params': '!no-resolve'},
        ]
        out = self.gw._backfill_edit_payload(
            {'id': 'user-abc', 'type': 'IP-CIDR', 'payload': '10.2.0.0/16', 'target': 'DIRECT'},
            existing, 'user-abc',
        )
        self.assertEqual(out['params'], '!no-resolve', 'params carried over')
        self.assertEqual(out['id'], 'user-abc', 'id set by caller is untouched')

    def test_explicit_params_in_payload_wins(self):
        existing = [
            {'id': 'user-1', 'params': '!no-resolve'},
        ]
        out = self.gw._backfill_edit_payload(
            {'type': 'DOMAIN', 'payload': 'x', 'target': 'DIRECT', 'params': '!force-remote'},
            existing, 'user-1',
        )
        self.assertEqual(out['params'], '!force-remote', 'caller params win')

    def test_params_explicitly_cleared_stays_cleared(self):
        # "" is sent when the operator typed the field empty; blanking it is an
        # explicit intent and must not be resurrected from the stored entry.
        existing = [
            {'id': 'user-1', 'params': '!no-resolve'},
        ]
        out = self.gw._backfill_edit_payload(
            {'type': 'DOMAIN', 'payload': 'x', 'target': 'DIRECT', 'params': ''},
            existing, 'user-1',
        )
        self.assertEqual(out['params'], '', 'explicit blank is preserved')

    def test_stored_without_params_adds_nothing(self):
        existing = [
            {'id': 'user-1', 'params': ''},
        ]
        out = self.gw._backfill_edit_payload(
            {'type': 'DOMAIN', 'payload': 'x', 'target': 'DIRECT'},
            existing, 'user-1',
        )
        self.assertNotIn('params', out, 'no phantom params key')

    def test_unknown_id_returns_payload_unchanged(self):
        payload = {'type': 'DOMAIN', 'payload': 'x', 'target': 'DIRECT'}
        out = self.gw._backfill_edit_payload(payload, [{'id': 'user-9'}], 'user-1')
        self.assertEqual(out, payload)


if __name__ == '__main__':
    unittest.main()