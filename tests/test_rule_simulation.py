"""Unit tests for rules-reconciler rule simulation and DNS pollution detection."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_reconciler():
    spec = importlib.util.spec_from_file_location(
        "reconciler_under_test",
        REPO_ROOT / "clash" / "rules-reconciler.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class RuleSimulationTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.reconciler = _load_reconciler()

        self.sample_config = {
            'dns': {
                'enable': True,
                'nameserver': ['223.5.5.5', '114.114.114.114'],
                'nameserver-policy': {
                    '+.openai.com': 'https://1.1.1.1/dns-query',
                    'geosite:cn': '223.5.5.5',
                    '*.github.com': 'tls://8.8.8.8',
                    'custom.internal': '10.0.0.1',
                },
            },
            'rules': [
                'DOMAIN,special.internal.net,DIRECT',
                'DOMAIN-SUFFIX,google.com,PROXY',
                'DOMAIN-KEYWORD,twitter,PROXY',
                'IP-CIDR,192.168.0.0/16,DIRECT',
                'IP-CIDR6,2001:db8::/32,DIRECT',
                'GEOSITE,cn,DIRECT',
                'GEOSITE,openai,PROXY',
                'GEOIP,CN,DIRECT',
                'MATCH,FINAL_PROXY',
            ],
            'proxy-groups': [
                {'name': 'PROXY', 'type': 'select', 'proxies': ['DIRECT']},
                {'name': 'FINAL_PROXY', 'type': 'select', 'proxies': ['DIRECT']},
            ]
        }
        self.config_path = self.root / 'config.yaml'
        self.config_path.write_text(yaml.safe_dump(self.sample_config))

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_simulate_domain_exact_match(self):
        res = self.reconciler.simulate_routing('special.internal.net', self.config_path)
        self.assertTrue(res['success'])
        self.assertEqual(res['matched_rule']['type'], 'DOMAIN')
        self.assertEqual(res['matched_rule']['payload'], 'special.internal.net')
        self.assertEqual(res['matched_rule']['target'], 'DIRECT')

    def test_simulate_domain_suffix_match(self):
        res = self.reconciler.simulate_routing('mail.google.com', self.config_path)
        self.assertTrue(res['success'])
        self.assertEqual(res['matched_rule']['type'], 'DOMAIN-SUFFIX')
        self.assertEqual(res['matched_rule']['payload'], 'google.com')
        self.assertEqual(res['matched_rule']['target'], 'PROXY')

        # exact match on the suffix itself
        res2 = self.reconciler.simulate_routing('google.com', self.config_path)
        self.assertTrue(res2['success'])
        self.assertEqual(res2['matched_rule']['type'], 'DOMAIN-SUFFIX')

    def test_simulate_domain_keyword_match(self):
        res = self.reconciler.simulate_routing('mobile-twitter-api.net', self.config_path)
        self.assertTrue(res['success'])
        self.assertEqual(res['matched_rule']['type'], 'DOMAIN-KEYWORD')
        self.assertEqual(res['matched_rule']['payload'], 'twitter')
        self.assertEqual(res['matched_rule']['target'], 'PROXY')

    def test_simulate_ip_cidr_v4_and_v6(self):
        res_v4 = self.reconciler.simulate_routing('192.168.1.100', self.config_path)
        self.assertTrue(res_v4['success'])
        self.assertTrue(res_v4['is_ip'])
        self.assertEqual(res_v4['matched_rule']['type'], 'IP-CIDR')
        self.assertEqual(res_v4['matched_rule']['target'], 'DIRECT')

        res_v6 = self.reconciler.simulate_routing('2001:db8::1', self.config_path)
        self.assertTrue(res_v6['success'])
        self.assertTrue(res_v6['is_ip'])
        self.assertEqual(res_v6['matched_rule']['type'], 'IP-CIDR6')
        self.assertEqual(res_v6['matched_rule']['target'], 'DIRECT')

    def test_simulate_geosite_match(self):
        res_cn = self.reconciler.simulate_routing('baidu.com', self.config_path)
        self.assertTrue(res_cn['success'])
        self.assertEqual(res_cn['matched_rule']['type'], 'GEOSITE')
        self.assertEqual(res_cn['matched_rule']['payload'], 'cn')
        self.assertEqual(res_cn['matched_rule']['target'], 'DIRECT')

        res_openai = self.reconciler.simulate_routing('chatgpt.com', self.config_path)
        self.assertTrue(res_openai['success'])
        self.assertEqual(res_openai['matched_rule']['type'], 'GEOSITE')
        self.assertEqual(res_openai['matched_rule']['payload'], 'openai')
        self.assertEqual(res_openai['matched_rule']['target'], 'PROXY')

    def test_simulate_match_fallback(self):
        res = self.reconciler.simulate_routing('random-unmatched-site-xyz123.org', self.config_path)
        self.assertTrue(res['success'])
        self.assertEqual(res['matched_rule']['type'], 'MATCH')
        self.assertEqual(res['matched_rule']['target'], 'FINAL_PROXY')

    def test_simulate_dns_policy_and_pollution_detection(self):
        # 1. Matched policy with safe overseas DNS -> no warning
        res_openai = self.reconciler.simulate_routing('api.openai.com', self.config_path)
        self.assertEqual(res_openai['dns']['policy_rule'], '+.openai.com')
        self.assertIn('https://1.1.1.1/dns-query', res_openai['dns']['nameservers'])
        self.assertEqual(len(res_openai['dns']['warnings']), 0)

        # 2. Sensitive overseas domain without policy -> falls back to domestic DNS -> WARNING
        sensitive_cfg = {
            'dns': {
                'enable': True,
                'nameserver': ['223.5.5.5', '114.114.114.114'],
                'nameserver-policy': {
                    'geosite:cn': '223.5.5.5',
                }
            },
            'rules': ['MATCH,DIRECT']
        }
        cfg_p = self.root / 'pollution_config.yaml'
        cfg_p.write_text(yaml.safe_dump(sensitive_cfg))

        res_claude = self.reconciler.simulate_routing('claude.ai', cfg_p)
        self.assertIsNone(res_claude['dns']['policy_rule'])
        self.assertIn('223.5.5.5', res_claude['dns']['nameservers'])
        self.assertTrue(len(res_claude['dns']['warnings']) > 0)
        self.assertIn('DNS pollution risk', res_claude['dns']['warnings'][0])

    def test_cli_simulate(self):
        cmd = [
            sys.executable,
            str(REPO_ROOT / 'clash' / 'rules-reconciler.py'),
            '--simulate', 'api.openai.com',
            '--config', str(self.config_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0)
        data = json.loads(proc.stdout)
        self.assertTrue(data['success'])
        self.assertEqual(data['domain'], 'api.openai.com')
        self.assertIn('dns', data)

    def test_parse_advanced_rules(self):
        # DST-PORT, SRC-PORT, IN-TYPE, PROCESS-NAME
        r1 = self.reconciler.parse_rule_line("DST-PORT,80,DIRECT")
        self.assertIsNotNone(r1)
        self.assertEqual(r1['type'], 'DST-PORT')
        self.assertEqual(r1['payload'], '80')
        self.assertEqual(r1['target'], 'DIRECT')
        self.assertTrue(r1['is_advanced'])

        r2 = self.reconciler.parse_rule_line("PROCESS-NAME,curl,DIRECT")
        self.assertIsNotNone(r2)
        self.assertEqual(r2['type'], 'PROCESS-NAME')
        self.assertTrue(r2['is_advanced'])

        # AND, OR composite rules
        r3 = self.reconciler.parse_rule_line("AND,((DOMAIN,example.com),(DST-PORT,443)),PROXY")
        self.assertIsNotNone(r3)
        self.assertEqual(r3['type'], 'AND')
        self.assertTrue(r3['is_advanced'])

        r4 = self.reconciler.parse_rule_line("OR,((SRC-PORT,12345),(DST-PORT,80)),DIRECT")
        self.assertIsNotNone(r4)
        self.assertEqual(r4['type'], 'OR')
        self.assertTrue(r4['is_advanced'])

    def test_advanced_rules_simulation_and_skipped_list(self):
        adv_config = {
            'rules': [
                'DST-PORT,80,DIRECT',
                'PROCESS-NAME,curl,DIRECT',
                'AND,((DOMAIN,example.com),(DST-PORT,443)),PROXY',
                'DOMAIN,example.com,PROXY',
                'MATCH,DIRECT',
            ]
        }
        adv_path = self.root / 'adv_config.yaml'
        adv_path.write_text(yaml.safe_dump(adv_config))

        res = self.reconciler.simulate_routing('example.com', adv_path)
        self.assertTrue(res['success'])
        self.assertEqual(res['matched_rule']['type'], 'DOMAIN')
        self.assertEqual(res['matched_rule']['payload'], 'example.com')
        self.assertEqual(res['matched_rule']['target'], 'PROXY')

        # Check skipped_advanced_rules
        skipped = res.get('skipped_advanced_rules', [])
        self.assertEqual(len(skipped), 3)
        skipped_types = [s['type'] for s in skipped]
        self.assertIn('DST-PORT', skipped_types)
        self.assertIn('PROCESS-NAME', skipped_types)
        self.assertIn('AND', skipped_types)


if __name__ == '__main__':
    unittest.main()
