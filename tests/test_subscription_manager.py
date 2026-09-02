import base64
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent

# Dynamically import clash/subscription-manager.py
_sub_manager_path = ROOT / "clash" / "subscription-manager.py"
_spec = importlib.util.spec_from_file_location("subscription_manager", _sub_manager_path)
sm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sm)

DEFAULT_EXCLUDE_FILTER = sm.DEFAULT_EXCLUDE_FILTER
SubscriptionEngine = sm.SubscriptionEngine
SubscriptionLock = sm.SubscriptionLock
apply_node_name_prefix = sm.apply_node_name_prefix
decode_base64_safely = sm.decode_base64_safely
filter_nodes = sm.filter_nodes
is_safe_public_url = sm.is_safe_public_url
parse_hysteria2_uri = sm.parse_hysteria2_uri
parse_proxy_uri = sm.parse_proxy_uri
parse_raw_node_list = sm.parse_raw_node_list
parse_ss_uri = sm.parse_ss_uri
parse_subscription_content = sm.parse_subscription_content
parse_trojan_uri = sm.parse_trojan_uri
parse_vless_uri = sm.parse_vless_uri
parse_vmess_uri = sm.parse_vmess_uri
main = sm.main


@pytest.fixture
def temp_clash_root(tmp_path, monkeypatch):
    root = tmp_path / "clash_test"
    root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("CLASH_ROOT", str(root))
    return root


def test_decode_base64_safely():
    # Normal base64
    raw = "hello world"
    encoded = base64.b64encode(raw.encode()).decode()
    assert decode_base64_safely(encoded) == "hello world"

    # Missing padding 1, 2, 3
    unpadded = encoded.rstrip("=")
    assert decode_base64_safely(unpadded) == "hello world"

    # Bytes input
    assert decode_base64_safely(base64.b64encode(b"byte content")) == "byte content"

    # URL-safe characters
    raw_special = "subjects?test_value=1&other+value=2"
    encoded_urlsafe = base64.urlsafe_b64encode(raw_special.encode()).decode().rstrip("=")
    assert decode_base64_safely(encoded_urlsafe) == raw_special

    # Empty and invalid
    assert decode_base64_safely("") == ""


def test_parse_ss_uri():
    # Standard ss with base64 userinfo
    userinfo_b64 = base64.b64encode(b"aes-256-gcm:password123").decode()
    uri1 = f"ss://{userinfo_b64}@1.2.3.4:8388#Japan%2001"
    node1 = parse_ss_uri(uri1)
    assert node1 is not None
    assert node1["name"] == "Japan 01"
    assert node1["type"] == "ss"
    assert node1["server"] == "1.2.3.4"
    assert node1["port"] == 8388
    assert node1["cipher"] == "aes-256-gcm"
    assert node1["password"] == "password123"

    # Plain userinfo without base64
    uri_plain = "ss://aes-128-gcm:plainpass@1.2.3.4:8388#PlainSS"
    node_plain = parse_ss_uri(uri_plain)
    assert node_plain is not None
    assert node_plain["name"] == "PlainSS"
    assert node_plain["cipher"] == "aes-128-gcm"
    assert node_plain["password"] == "plainpass"

    # Legacy full base64 ss URI
    full_b64 = base64.b64encode(b"aes-128-gcm:pass@5.6.7.8:1080").decode()
    uri2 = f"ss://{full_b64}#US_Node"
    node2 = parse_ss_uri(uri2)
    assert node2 is not None
    assert node2["name"] == "US_Node"
    assert node2["server"] == "5.6.7.8"
    assert node2["port"] == 1080
    assert node2["cipher"] == "aes-128-gcm"
    assert node2["password"] == "pass"

    # IPv6 SS URI
    uri3 = f"ss://{userinfo_b64}@[2001:db8::1]:8388#IPv6-SS"
    node3 = parse_ss_uri(uri3)
    assert node3 is not None
    assert node3["server"] == "2001:db8::1"
    assert node3["port"] == 8388

    # SS with plugin
    uri4 = f"ss://{userinfo_b64}@1.2.3.4:8388?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dexample.com#Plugin-SS"
    node4 = parse_ss_uri(uri4)
    assert node4 is not None
    assert node4["plugin"] == "obfs-local"
    assert node4["plugin-opts"] == {"obfs": "http", "obfs-host": "example.com"}

    # Invalid SS URIs
    assert parse_ss_uri("ss://invalid") is None
    assert parse_ss_uri("ss://not-base64@") is None
    assert parse_ss_uri("trojan://pass@1.2.3.4:443") is None


def test_parse_vmess_uri():
    vmess_obj = {
        "v": "2",
        "ps": "HK-VMess-01",
        "add": "hk.example.com",
        "port": 443,
        "id": "a3b899b7-1234-4567-89ab-cdef01234567",
        "aid": "0",
        "scy": "auto",
        "net": "ws",
        "type": "none",
        "host": "cdn.example.com",
        "path": "/v2ray",
        "tls": "tls",
        "sni": "cdn.example.com",
    }
    raw_json = json.dumps(vmess_obj)
    b64_json = base64.b64encode(raw_json.encode()).decode()
    uri = f"vmess://{b64_json}"

    node = parse_vmess_uri(uri)
    assert node is not None
    assert node["name"] == "HK-VMess-01"
    assert node["type"] == "vmess"
    assert node["server"] == "hk.example.com"
    assert node["port"] == 443
    assert node["uuid"] == "a3b899b7-1234-4567-89ab-cdef01234567"
    assert node["cipher"] == "auto"
    assert node["network"] == "ws"
    assert node["tls"] is True
    assert node["servername"] == "cdn.example.com"
    assert node["ws-opts"] == {
        "path": "/v2ray",
        "headers": {"Host": "cdn.example.com"},
    }

    # gRPC vmess
    vmess_grpc = {
        "v": "2",
        "ps": "SG-gRPC",
        "add": "sg.example.com",
        "port": "8443",
        "id": "uuid-123",
        "net": "grpc",
        "path": "gunService",
        "tls": "1",
    }
    uri_grpc = f"vmess://{base64.b64encode(json.dumps(vmess_grpc).encode()).decode()}"
    node_grpc = parse_vmess_uri(uri_grpc)
    assert node_grpc is not None
    assert node_grpc["network"] == "grpc"
    assert node_grpc["grpc-opts"] == {"grpc-service-name": "gunService"}

    # H2 vmess
    vmess_h2 = {
        "v": "2",
        "ps": "US-H2",
        "add": "us.example.com",
        "port": 443,
        "id": "uuid-456",
        "net": "h2",
        "host": "h2.example.com",
        "path": "/h2path",
    }
    uri_h2 = f"vmess://{base64.b64encode(json.dumps(vmess_h2).encode()).decode()}"
    node_h2 = parse_vmess_uri(uri_h2)
    assert node_h2 is not None
    assert node_h2["network"] == "h2"
    assert node_h2["h2-opts"] == {"path": ["/h2path"], "host": ["h2.example.com"]}

    # Invalid vmess
    assert parse_vmess_uri("vmess://not-json") is None
    assert parse_vmess_uri("vless://test") is None


def test_parse_vless_uri():
    # VLESS Reality with pbk, sid, flow, sni
    uri = "vless://uuid-vless-123@vless.example.com:443?security=reality&encryption=none&pbk=publicKey123&sid=shortId12&sni=yahoo.com&type=tcp&flow=xtls-rprx-vision&fp=chrome#VLESS-Reality"
    node = parse_vless_uri(uri)
    assert node is not None
    assert node["name"] == "VLESS-Reality"
    assert node["type"] == "vless"
    assert node["server"] == "vless.example.com"
    assert node["port"] == 443
    assert node["uuid"] == "uuid-vless-123"
    assert node["flow"] == "xtls-rprx-vision"
    assert node["tls"] is True
    assert node["servername"] == "yahoo.com"
    assert node["client-fingerprint"] == "chrome"
    assert node["reality-opts"] == {
        "public-key": "publicKey123",
        "short-id": "shortId12",
    }

    # VLESS WS
    uri_ws = "vless://uuid-456@ws.example.com:80?type=ws&path=%2Fws-path&host=ws.example.com#VLESS-WS"
    node_ws = parse_vless_uri(uri_ws)
    assert node_ws is not None
    assert node_ws["network"] == "ws"
    assert node_ws["ws-opts"] == {
        "path": "/ws-path",
        "headers": {"Host": "ws.example.com"},
    }

    # VLESS gRPC
    uri_grpc = "vless://uuid-789@grpc.example.com:443?type=grpc&serviceName=vlessGun#VLESS-gRPC"
    node_grpc = parse_vless_uri(uri_grpc)
    assert node_grpc is not None
    assert node_grpc["network"] == "grpc"
    assert node_grpc["grpc-opts"] == {"grpc-service-name": "vlessGun"}

    # Invalid vless
    assert parse_vless_uri("vless://") is None
    assert parse_vless_uri("vmess://abc") is None


def test_parse_trojan_uri():
    uri = "trojan://password999@trojan.example.com:443?sni=tr.example.com&alpn=h2,http/1.1#Trojan-01"
    node = parse_trojan_uri(uri)
    assert node is not None
    assert node["name"] == "Trojan-01"
    assert node["type"] == "trojan"
    assert node["server"] == "trojan.example.com"
    assert node["port"] == 443
    assert node["password"] == "password999"
    assert node["sni"] == "tr.example.com"
    assert node["alpn"] == ["h2", "http/1.1"]

    # Trojan WS
    uri_ws = "trojan://pass@trojan.example.com:443?type=ws&path=/trojan-ws&host=tr.example.com#Trojan-WS"
    node_ws = parse_trojan_uri(uri_ws)
    assert node_ws is not None
    assert node_ws["network"] == "ws"
    assert node_ws["ws-opts"] == {"path": "/trojan-ws", "headers": {"Host": "tr.example.com"}}

    # Trojan gRPC
    uri_grpc = "trojan://pass@trojan.example.com:443?type=grpc&serviceName=trGun#Trojan-gRPC"
    node_grpc = parse_trojan_uri(uri_grpc)
    assert node_grpc is not None
    assert node_grpc["network"] == "grpc"
    assert node_grpc["grpc-opts"] == {"grpc-service-name": "trGun"}

    # Invalid trojan
    assert parse_trojan_uri("trojan://") is None
    assert parse_trojan_uri("ss://abc") is None


def test_parse_hysteria2_uri():
    uri = "hysteria2://mysecretpass@hy2.example.com:443?sni=hy2.example.com&insecure=1&obfs=salamander&obfs-password=123#Hy2-Node"
    node = parse_hysteria2_uri(uri)
    assert node is not None
    assert node["name"] == "Hy2-Node"
    assert node["type"] == "hysteria2"
    assert node["server"] == "hy2.example.com"
    assert node["port"] == 443
    assert node["password"] == "mysecretpass"
    assert node["sni"] == "hy2.example.com"
    assert node["skip-cert-verify"] is True
    assert node["obfs"] == "salamander"
    assert node["obfs-password"] == "123"

    # hy2:// alias
    uri_alias = "hy2://secret@hy2.example.com:8443?sni=hy2.example.com#Hy2-Alias"
    node_alias = parse_hysteria2_uri(uri_alias)
    assert node_alias is not None
    assert node_alias["type"] == "hysteria2"
    assert node_alias["port"] == 8443
    assert node_alias["password"] == "secret"

    # Invalid hysteria2
    assert parse_hysteria2_uri("hysteria2://") is None
    assert parse_hysteria2_uri("vless://abc") is None


def test_parse_proxy_uri_dispatch():
    assert parse_proxy_uri("unknown://test") is None
    assert parse_proxy_uri("") is None


def test_parse_subscription_content_yaml_and_base64():
    # Clash YAML subscription format
    yaml_content = """
proxies:
  - name: "Clash-SS"
    type: ss
    server: 1.1.1.1
    port: 8388
    cipher: aes-128-gcm
    password: pass
  - name: "Clash-Trojan"
    type: trojan
    server: 2.2.2.2
    port: 443
    password: pass
"""
    nodes_yaml = parse_subscription_content(yaml_content)
    assert len(nodes_yaml) == 2
    assert nodes_yaml[0]["name"] == "Clash-SS"
    assert nodes_yaml[1]["name"] == "Clash-Trojan"

    # Proxy keyword in YAML
    yaml_content_old = """
Proxy:
  - name: "Old-Clash-SS"
    type: ss
    server: 1.1.1.1
    port: 8388
    cipher: aes-128-gcm
    password: pass
"""
    nodes_yaml_old = parse_subscription_content(yaml_content_old)
    assert len(nodes_yaml_old) == 1
    assert nodes_yaml_old[0]["name"] == "Old-Clash-SS"

    # Base64 encoded list of URIs
    uris = [
        "trojan://pass@1.1.1.1:443#TrojanNode",
        "hy2://pass@2.2.2.2:8443#Hy2Node",
    ]
    b64_content = base64.b64encode("\n".join(uris).encode()).decode()
    nodes_b64 = parse_subscription_content(b64_content)
    assert len(nodes_b64) == 2
    assert nodes_b64[0]["name"] == "TrojanNode"
    assert nodes_b64[1]["name"] == "Hy2Node"

    # Empty content
    assert parse_subscription_content("") == []


def test_filter_nodes_and_prefix():
    raw_nodes = [
        {"name": "剩余流量 500GB", "type": "ss", "server": "1.1.1.1", "port": 80},
        {"name": "官网: https://example.com", "type": "ss", "server": "1.1.1.1", "port": 80},
        {"name": "HK 01", "type": "ss", "server": "1.1.1.1", "port": 8388},
        {"name": "US 02", "type": "vmess", "server": "2.2.2.2", "port": 443},
        {"name": "Invalid Node Missing Port", "type": "ss", "server": "3.3.3.3"},
    ]

    filtered = filter_nodes(raw_nodes)
    assert len(filtered) == 2
    assert [n["name"] for n in filtered] == ["HK 01", "US 02"]

    # Custom regex filter
    custom_filtered = filter_nodes(raw_nodes, exclude_pattern=r"HK")
    assert len(custom_filtered) == 3
    assert "HK 01" not in [n["name"] for n in custom_filtered]

    # Prefix application
    prefixed = apply_node_name_prefix(filtered, "AirportA")
    assert [n["name"] for n in prefixed] == ["[AirportA] HK 01", "[AirportA] US 02"]

    # Idempotent prefixing
    prefixed_again = apply_node_name_prefix(prefixed, "AirportA")
    assert [n["name"] for n in prefixed_again] == ["[AirportA] HK 01", "[AirportA] US 02"]


def test_subscription_engine_crud_and_reconcile(temp_clash_root):
    engine = SubscriptionEngine(root=temp_clash_root)

    # 1. Add raw nodes subscription
    raw_nodes_text = """
trojan://pass1@node1.com:443#Node1
trojan://pass2@node2.com:443#Node2
trojan://pass3@node3.com:443#官网-公告
"""
    res1 = engine.import_raw_nodes(name="Sub Raw", raw_text=raw_nodes_text)
    assert res1["success"] is True
    sub1_id = res1["subscription"]["id"]

    # Check meta file
    meta = engine.load_meta()
    assert len(meta["subscriptions"]) == 1
    assert meta["subscriptions"][0]["id"] == sub1_id
    assert meta["subscriptions"][0]["node_count"] == 2  # Announcement filtered

    # Check merged output yaml
    merged_path = temp_clash_root / "airports/airport-merged-sub.yaml"
    assert merged_path.exists()
    merged_data = yaml.safe_load(merged_path.read_text())
    assert len(merged_data["proxies"]) == 2
    assert merged_data["proxies"][0]["name"] == "[Sub Raw] Node1"
    assert merged_data["proxies"][1]["name"] == "[Sub Raw] Node2"

    # 2. Add remote subscription with mock fetch
    mock_yaml_content = """
proxies:
  - name: "Remote-HK"
    type: ss
    server: 8.8.8.8
    port: 8388
    cipher: aes-128-gcm
    password: mock
"""
    with patch.object(SubscriptionEngine, "fetch_url", return_value=mock_yaml_content):
        res2 = engine.add_subscription(name="Remote Sub", url="https://sub.example.com/api")
        assert res2["success"] is True
        sub2_id = res2["subscription"]["id"]

    # Total proxies should now be 2 (from sub1) + 1 (from sub2) = 3
    merged_data = yaml.safe_load(merged_path.read_text())
    assert len(merged_data["proxies"]) == 3
    names = [p["name"] for p in merged_data["proxies"]]
    assert "[Remote Sub] Remote-HK" in names

    # 3. Update subscription (disable sub1)
    res_update = engine.update_subscription(sub_id=sub1_id, enabled=False)
    assert res_update["success"] is True
    # Merged proxies should only contain Remote Sub now
    merged_data = yaml.safe_load(merged_path.read_text())
    assert len(merged_data["proxies"]) == 1
    assert merged_data["proxies"][0]["name"] == "[Remote Sub] Remote-HK"

    # 4. List subscriptions
    subs = engine.list_subscriptions()
    assert len(subs) == 2
    assert subs[0]["id"] == sub1_id
    assert subs[0]["enabled"] is False

    # 5. Delete subscription
    res_del = engine.delete_subscription(sub_id=sub2_id)
    assert res_del["success"] is True
    subs_after_del = engine.list_subscriptions()
    assert len(subs_after_del) == 1
    assert subs_after_del[0]["id"] == sub1_id

    # Merged proxies should be 0 because sub1 is disabled
    merged_data = yaml.safe_load(merged_path.read_text())
    assert len(merged_data["proxies"]) == 0

    # Non-existent delete
    res_bad_del = engine.delete_subscription("non-existent-id")
    assert res_bad_del["success"] is False


def test_duplicate_node_name_handling(temp_clash_root):
    engine = SubscriptionEngine(root=temp_clash_root)
    raw_nodes_text = """
trojan://pass1@node1.com:443#Hong Kong
trojan://pass2@node2.com:443#Hong Kong
"""
    engine.import_raw_nodes(name="Airport", raw_text=raw_nodes_text)
    merged_path = temp_clash_root / "airports/airport-merged-sub.yaml"
    merged_data = yaml.safe_load(merged_path.read_text())
    names = [p["name"] for p in merged_data["proxies"]]
    assert names == ["[Airport] Hong Kong", "[Airport] Hong Kong (1)"]


def test_subscription_lock(temp_clash_root):
    lock_file = temp_clash_root / "subscriptions/.test.lock"
    with SubscriptionLock(lock_file):
        assert lock_file.exists()


def test_cli_interface(temp_clash_root, monkeypatch, capsys):
    # Test --import-nodes CLI
    raw_nodes = "trojan://pass@node.com:443#TestNode"
    with patch.object(sys, "argv", ["subscription-manager.py", "--import-nodes", "CLI Sub", raw_nodes]):
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 0
        captured = capsys.readouterr()
        assert '"success": true' in captured.out

    # Test --list CLI
    with patch.object(sys, "argv", ["subscription-manager.py", "--list"]):
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 0
        captured = capsys.readouterr()
        assert '"name": "CLI Sub"' in captured.out

    # Test --reconcile CLI
    with patch.object(sys, "argv", ["subscription-manager.py", "--reconcile"]):
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 0
        captured = capsys.readouterr()
        assert '"success": true' in captured.out


def test_ssrf_safety_checks(monkeypatch):
    # Scheme checks
    assert is_safe_public_url("file:///etc/passwd")[0] is False
    assert is_safe_public_url("gopher://127.0.0.1:6379")[0] is False
    assert is_safe_public_url("ftp://example.com/sub")[0] is False

    # IP address literals (private, loopback, link-local, cloud metadata)
    assert is_safe_public_url("http://127.0.0.1/sub.yaml")[0] is False
    assert is_safe_public_url("http://10.0.0.1:8080/sub")[0] is False
    assert is_safe_public_url("https://192.168.1.1/sub")[0] is False
    assert is_safe_public_url("http://172.16.0.5/sub")[0] is False
    assert is_safe_public_url("http://169.254.169.254/latest/meta-data/")[0] is False
    assert is_safe_public_url("http://0.0.0.0/sub")[0] is False
    assert is_safe_public_url("http://[::1]/sub")[0] is False

    # Mock domain resolution to private IP
    with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 80))]):
        assert is_safe_public_url("http://localhost/sub")[0] is False
        assert is_safe_public_url("https://internal.company.corp/sub")[0] is False

    # Mock domain resolution to public IP
    with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("8.8.8.8", 443))]):
        assert is_safe_public_url("https://public-sub.com/clash")[0] is True

    # Test ALLOW_PRIVATE_SUBSCRIPTIONS env bypass
    monkeypatch.setenv("ALLOW_PRIVATE_SUBSCRIPTIONS", "1")
    assert is_safe_public_url("http://127.0.0.1/sub.yaml")[0] is True


def test_policy_group_auto_mount_and_consistency(temp_clash_root):
    # Setup initial live config with PROXY group and generic groups
    config_path = temp_clash_root / "config.yaml"
    initial_config = {
        'proxies': [
            {'name': 'Existing Direct Node', 'type': 'direct'}
        ],
        'proxy-groups': [
            {'name': 'PROXY', 'type': 'select', 'proxies': ['Existing Direct Node', 'DIRECT']},
            {'name': '🚀 节点选择', 'type': 'select', 'proxies': ['DIRECT']},
        ]
    }
    config_path.write_text(yaml.safe_dump(initial_config))

    engine = SubscriptionEngine(root=temp_clash_root)

    # 1. Import raw subscription nodes
    raw_nodes = "trojan://pass1@1.1.1.1:443#Hong Kong\ntrojan://pass2@2.2.2.2:443#Japan"
    res1 = engine.import_raw_nodes(name="Airport Alpha", raw_text=raw_nodes)
    assert res1["success"] is True

    # Check that config.yaml has been updated with '🌐 订阅导入' group and auto-mounted into PROXY & 🚀 节点选择
    cfg_data = yaml.safe_load(config_path.read_text())
    proxy_names = [p["name"] for p in cfg_data["proxies"]]
    assert "Existing Direct Node" in proxy_names
    assert "[Airport Alpha] Hong Kong" in proxy_names
    assert "[Airport Alpha] Japan" in proxy_names

    groups_map = {g["name"]: g for g in cfg_data["proxy-groups"]}
    assert "🌐 订阅导入" in groups_map
    assert groups_map["🌐 订阅导入"]["proxies"] == ["[Airport Alpha] Hong Kong", "[Airport Alpha] Japan"]

    assert "🌐 订阅导入" in groups_map["PROXY"]["proxies"]
    assert "🌐 订阅导入" in groups_map["🚀 节点选择"]["proxies"]

    # 2. Add second subscription
    raw_nodes_2 = "trojan://pass3@3.3.3.3:443#Singapore"
    res2 = engine.import_raw_nodes(name="Airport Beta", raw_text=raw_nodes_2)
    assert res2["success"] is True
    sub2_id = res2["subscription"]["id"]

    cfg_data2 = yaml.safe_load(config_path.read_text())
    groups_map2 = {g["name"]: g for g in cfg_data2["proxy-groups"]}
    assert "[Airport Beta] Singapore" in groups_map2["🌐 订阅导入"]["proxies"]

    # 3. Delete Airport Beta subscription -> node should be cleanly removed from proxies & groups
    engine.delete_subscription(sub2_id)
    cfg_data3 = yaml.safe_load(config_path.read_text())
    proxy_names3 = [p["name"] for p in cfg_data3["proxies"]]
    assert "[Airport Beta] Singapore" not in proxy_names3
    assert "[Airport Alpha] Hong Kong" in proxy_names3
    groups_map3 = {g["name"]: g for g in cfg_data3["proxy-groups"]}
    assert "[Airport Beta] Singapore" not in groups_map3["🌐 订阅导入"]["proxies"]

