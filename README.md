# mihomo-web-controler

Mihomo (Clash Meta) Web 控制面板、自定义规则管理、多源订阅聚合与智能分流诊断网关套件。

- **项目主页**：[https://github.com/dengyie/mihomo-web-controler](https://github.com/dengyie/mihomo-web-controler)
- **作者**：dengyie
- **许可证**：MIT

---

## 🌟 核心特性

### 1. 订阅与节点全生命周期管理 (`subscription-manager.py`)
- **多格式全协议自适应解析**：
  - 支持 **Clash 原生 YAML** 配置、**Base64 订阅源**。
  - 支持单节点与批量节点 URI 解析，涵盖 **Shadowsocks (`ss://`)**（含 SIP002/Plugin 扩展）、**VMess (`vmess://`)**、**VLESS (`vless://`)**、**Trojan (`trojan://`)**、**Hysteria2 (`hysteria2://` / `hy2://`)**。
  - 健壮的 Base64 容错解码（自动适配 URL-Safe 字符与缺失填充符）。
- **智能垃圾节点过滤**：
  - 内置智能正则过滤器，自动剔除包含“剩余流量 / 官网 / 套餐 / 到期 / 公告 / 流量 / 重置 / 交流群 / 客服”等非代理展示性节点。
  - 支持按订阅自定义独立的排除正则规则。
- **命名空间前缀隔离**：
  - 自动为节点名注入 `[{订阅名称}] {节点原名}` 前缀，彻底规避跨机场订阅的节点同名冲突。
- **元数据跟踪与原子聚合**：
  - 订阅状态、更新时间、节点计数持久化存储于 `subscriptions/meta.json`。
  - 原始响应自动缓存于 `subscriptions/raw/` 目录，便于离线恢复与历史审计。
  - 基于 `fcntl.flock` 跨进程排他锁与临时文件原子重命名机制，聚合输出至 `airports/airport-merged-sub.yaml`。
- **Web UI 订阅管理中心**：
  - 规则页顶部一键唤起模态窗，支持一键添加订阅、启用/停用切换、手动刷新拉取、批量 RAW 节点粘贴导入与订阅删除。

---

### 2. 出口 IP 毫秒级多源竞速诊断 (`gateway.py`)
- **多数据源并发竞速探测**：
  - 并发探测全球优质 IP 识别节点（`ipinfo.io`、`cloudflare.com/cdn-cgi/trace`、`api.ipify.org`、`ip-api.com`），设置严格的 3.5s 单源超时控制。
  - 毫秒级统计各数据源 RTT 往返时延，动态甄选首位最快响应数据（`fastest`）并输出全量比对结果（`all_results`）。
- **多维度出口特征解析**：
  - 实时获取当前实际公网出口 IP、国家/地区代码（自动映射为 Flag Emoji 旗帜）、所属城市、ISP 运营商与 ASN 路由信息。
  - 支持指定代理端口（默认 `7897`）走 Mihomo 代理栈探测，或直连测试本地网络。
- **Web 导航栏悬浮 Badge & 交互式 Popover**：
  - 顶部导航栏常驻展示当前出口 IP、国旗与测速延迟，状态即时更新。
  - 点击弹出交互式信息卡，直观展示 ISP、ASN、地理位置与多源竞速延迟列表，并支持一键强制刷新探测。

---

### 3. 规则分流与 DNS 污染推演模拟器 (`rules-reconciler.py`)
- **真实分流链推演匹配**：
  - 严格依据 Mihomo 内核的分流匹配优先级与语义模拟推演：`DOMAIN` ➡️ `DOMAIN-SUFFIX` ➡️ `DOMAIN-KEYWORD` ➡️ `IP-CIDR / IP-CIDR6` ➡️ `GEOSITE`（内置主流分类启发式映射）➡️ `GEOIP` ➡️ `MATCH` / `DEFAULT`。
  - 自动加载当前生效配置（`config.mac-merged.yaml` 或 `config.yaml`），精确定位命中的规则类型、匹配载荷（Payload）、分流策略目标（Target）及规则索引行号。
- **DNS 解析策略 (Nameserver Policy) 回溯**：
  - 模拟当前激活配置中的 `dns.nameserver-policy` 规则（前缀通配 `+.`、通配符 `*.`、`geosite:`、特定域名），回溯推导该域名使用的上游 DNS 服务器组。
- **海外敏感服务 DNS 污染风险研判**：
  - 内置主流海外敏感及 AI 服务特征库（OpenAI、Claude、Anthropic、ChatGPT、GitHub、Google、YouTube、Twitter/X、Telegram、Netflix、Spotify、Discord、HuggingFace、Copilot 等）。
  - 实时监测：若敏感域名被国内未加密 DNS（如 `114.114.114.114`、`223.5.5.5`、DNSPod 等）解析，自动触发 **DNS 污染风险警报 (DNS Pollution Risk Alert)**，并提示配置安全分流。
- **Web 规则页嵌入式推演栏 & 规则联动高亮**：
  - 规则页（`#/rules`）顶部常驻单行推演输入栏，按回车或点击“推演”秒级呈现匹配结果、目标策略组、DNS 服务器及风险告警。
  - 命中规则卡片自动在页面中滚动定位并高亮闪烁提示。
- **CLI 离线推演支持**：
  - 支持通过终端命令 `python3 clash/rules-reconciler.py --simulate <domain/ip>` 快速离线调试。

---

### 4. 可视化自定义规则管理 (`rules-reconciler.py` & UI)
- **Web UI 原生集成**：
  - 规则页原生集成自定义规则管理 Icon 与操作抽屉。
  - 支持 `DOMAIN-SUFFIX`、`DOMAIN`、`DOMAIN-KEYWORD`、`IP-CIDR`、`IP-CIDR6`、`GEOSITE`、`GEOIP` 等标准规则类型。
  - 动态获取当前所有可用策略组（Target）供下拉选择。
  - 规则语法实时生成预览、安全合法性校验（防字符注入）、删除二次确认与全字段 XSS 转义。

---

### 5. 多层安全与可靠性保障
- **语法预检**：写入前自动调用 `mihomo -t` 对候选配置进行真实语法校验。
- **事务性回滚**：任一步骤失败（含 Controller 异常）自动通过历史备份原子恢复旧配置。
- **精准前缀剥离**：删除用户自定义规则时，绝对不会误伤订阅原有的同名规则。
- **NFS 跨进程排他锁**：使用 `fcntl.flock` 保障多并发操作安全。
- **恒定时间鉴权**：使用 `secrets.compare_digest` 校验 Bearer Token，彻底防御时序侧信道攻击。
- **模块热重载**：网关检测到 Reconciler 与 Subscription Manager 脚本时间戳（`mtime`）变更时自动热重载，无需重启网关进程。

---

### 6. 安全 API 网关与双机跨节点协同 (`gateway.py`)
- 单源对外服务（静态资源托管 + API 反向代理 + WebSocket 流量转发）。
- 服务端注入 Mihomo `.controller-secret`，前端全程零 Secret 暴露。
- **双机集群智能路由**：自动识别本端环境（`tebi` macOS 主机 / `pxed` Linux VPS 主机），透明代理跨节点流量（如 `/panel/pxed/api/*` 与 `/panel/tebi/api/*`）。
- **NFS 静态字节缓存**：针对分布式 NFS 文件系统设计高效的静态资源内存缓存（`_STATIC_CACHE`），结合 `mtime_ns` / `size` 自动失效。

---

### 7. Keeper 守护协同 (`clash-keeper-loop.sh`)
- 每 120s 周期自检与重放。
- 基于 Hash 比对实现幂等合并：配置未变更时不写磁盘、不产生冗余备份、不触发重复 reload。
- 订阅覆盖或主配置重建后，用户规则自动保活重放。
- 仅调用 Mihomo Controller HTTP API（`PUT /configs?force=true`）进行无损热重载，确保独立代理栈零中断。

---

## 🏗️ 架构拓扑

```text
                                  浏览器 (Web UI / Zashboard)
                                                │ HTTPS
                                                ▼
                                    Cloudflare Tunnel / 反向代理
                                                │
                                                ▼
                     ┌─────────────────────────────────────────────────────┐
                     │           127.0.0.1:2053 (gateway.py)              │
                     │  - Bearer Token 恒定时间鉴权                         │
                     │  - NFS 静态资源内存缓存 (_STATIC_CACHE)               │
                     │  - 跨节点智能透明转发 (/panel/pxed/* <-> /panel/tebi/*)│
                     └──────┬───────────────────────┬──────────────────────┘
                            │                       │
      ┌─────────────────────┼───────────────────────┼────────────────────────┐
      ▼                     ▼                       ▼                        ▼
[静态资源托管]       [代理 Controller API]    [出口 IP 竞速诊断]        [业务扩展 REST API]
zashboard/dist/      /panel/api/*             /panel/api/diagnostics/  /panel/api/subscriptions*
assets/user-rules-ui   │ (注入 Secret)         egress-ip                /panel/api/rules/simulate
                       ▼ (HTTP / WebSocket)         │                   /panel/api/user-rules*
                 127.0.0.1:9090                     │                        │
             (主 Mihomo Controller)                 ▼                        ▼
                                             并发竞速探测:            ┌───────────────────────┐
                                             - ipinfo.io              │ clash/                │
                                             - cloudflare trace       │ rules-reconciler.py   │
                                             - api.ipify.org          │ subscription-manager.py│
                                             - ip-api.com             └──────────┬────────────┘
                                                                                 │
                            ┌────────────────────────────────────────────────────┴───────────────────────────────────────┐
                            │                                                                                            │
                            ▼ (fcntl.flock 排他锁)                                                                       ▼ (fcntl.flock 排他锁)
           ┌──────────────────────────────────────┐                                                    ┌──────────────────────────────────────┐
           │        Subscription Engine           │                                                    │            Rules Engine              │
           ├──────────────────────────────────────┤                                                    ├──────────────────────────────────────┤
           │ 1. 多格式协议解析 (YAML/B64/URI)      │                                                    │ 1. 严格 Schema / 域名 / CIDR 校验     │
           │ 2. 正则垃圾公告节点过滤               │                                                    │ 2. 写入权威源: rules/user-rules.yaml │
           │ 3. 命名空间前缀隔离 [{sub}] {node}    │                                                    │ 3. 路由规则推演 & DNS 污染风险研判   │
           │ 4. 元数据存储: subscriptions/meta.json │                                                    │ 4. mihomo -t 候选语法预检            │
           │ 5. 缓存持久化: subscriptions/raw/     │                                                    │ 5. 自动生成 .pre-user-rules 备份     │
           │ 6. 原子聚合: airport-merged-sub.yaml │                                                    │ 6. 原子替换 config.yaml / mac-merged │
           └──────────────────────────────────────┘                                                    │ 7. PUT /configs?force=true 热重载    │
                                                                                                       └──────────────────────────────────────┘
```

---

## 📂 目录结构

```text
.
├── clash/
│   ├── rules-reconciler.py         # 核心规则调度器 (校验、合并、事务回滚、Mihomo Controller 热重载、分流/DNS推演)
│   ├── subscription-manager.py     # 订阅与节点聚合管理器 (多协议解析、垃圾过滤、命名隔离、原子输出)
│   ├── apply-local-import.py       # 本地节点持久化与注入脚本
│   └── clash-keeper-loop.sh        # Keeper 常驻守护脚本 (120s 周期幂等自检)
├── zashboard/
│   ├── gateway.py                  # 安全 API 网关 (鉴权、反向代理、WebSocket、静态缓存、多源竞速诊断)
│   ├── start-gateway.sh            # 网关启动包装脚本
│   ├── src/
│   │   └── user-rules-ui.js        # 前端扩展组件源码 (订阅管理、出口IP微标、规则推演栏、自定义规则Modal)
│   └── dist/                       # Web 面板静态资源产物
│       ├── assets/
│       │   └── user-rules-ui.js    # 生产构建后的扩展组件
│       └── index.html              # Web 面板单页入口
├── tests/
│   ├── test_auth.py                # 网关鉴权与时序安全测试
│   ├── test_cache.py               # NFS 静态缓存与性能测试
│   ├── test_gateway_endpoints.py   # 网关核心 API 端点功能测试
│   ├── test_reconciler_load.py     # Reconciler 模块动态热重载测试
│   ├── test_rule_simulation.py     # 规则分流与 DNS 污染推演测试
│   ├── test_subscription_manager.py # 订阅管理器全协议解析与聚合测试
│   └── test_ui_bundle.mjs          # 前端 DOM 注入与交互组件测试
└── package.json                    # 前端构建与测试套件配置
```

---

## 🔌 REST API 接口规范

网关在 `/panel/api/*` 路径下提供完整的 RESTful 接口体系，调用时需携带 `Authorization: Bearer <PANEL_PASSWORD>` 请求头：

| 请求方法 | 接口路径 | 说明 | 请求体 / 查询参数示例 |
| :--- | :--- | :--- | :--- |
| `GET` | `/panel/api/subscriptions` | 获取全量订阅列表及元数据 | 无 |
| `POST` | `/panel/api/subscriptions` | 添加远程或本地订阅源 | `{"name":"Sub1","url":"https://...","exclude_filter":""}` |
| `POST` | `/panel/api/subscriptions/import-nodes` | 批量导入 RAW 节点文本/链接 | `{"name":"Manual","text":"ss://... \n vmess://..."}` |
| `POST` | `/panel/api/subscriptions/<sub_id>/update` | 更新订阅配置或强制刷新拉取 | `{"name":"Sub1","refresh":true}` |
| `POST` | `/panel/api/subscriptions/<sub_id>/toggle` | 启用 / 停用指定订阅 | `{"enabled": true}` |
| `DELETE` | `/panel/api/subscriptions/<sub_id>` | 删除指定订阅并重新聚合 | 无 |
| `GET` | `/panel/api/diagnostics/egress-ip` | 出口 IP 多源竞速诊断与测速 | `?proxy=true&proxy_port=7897` |
| `POST` | `/panel/api/rules/simulate` | 规则分流匹配与 DNS 污染推演 | `{"domain": "api.openai.com"}` |
| `GET` | `/panel/api/user-rules` | 获取当前所有自定义规则列表 | 无 |
| `POST` | `/panel/api/user-rules` | 新增自定义规则并执行热重载 | `{"type":"DOMAIN-SUFFIX","payload":"anthropic.com","target":"PROXY"}` |
| `DELETE` | `/panel/api/user-rules/<rule_id>` | 删除自定义规则并执行热重载 | 无 |
| `GET` | `/panel/api/user-rules/targets` | 获取当前可用的全部策略组列表 | 无 |

---

## 🚀 启动与使用指南

### 1. 启动 API 网关与 Web 面板
```bash
# 方式 1: 直接使用 Python 启动
python3 zashboard/gateway.py

# 方式 2: 使用包装脚本启动
bash zashboard/start-gateway.sh
```
网关默认监听 `0.0.0.0:2053`，浏览器访问 `http://127.0.0.1:2053/panel/` 即可进入 Web 控制面板。

---

### 2. 命令行工具实战 (CLI)

#### 订阅管理器 (`subscription-manager.py`)
```bash
# 查看所有已配置订阅与节点数量
python3 clash/subscription-manager.py --list

# 添加远程订阅源
python3 clash/subscription-manager.py --add "机场A" "https://example.com/api/v1/client/subscribe?token=xxx"

# 从纯文本/节点链接批量导入
python3 clash/subscription-manager.py --import-nodes "备用节点" "ss://YWVzLTI1Ni1nY206cGFzc0AxMi4zNC41Ni43ODo4Mzg4#HK-Node1"

# 手动更新指定订阅 (ID 通过 --list 查看)
python3 clash/subscription-manager.py --update "sub_xxxxxx"

# 强制全量重新拉取远程订阅并原子生成合并配置
python3 clash/subscription-manager.py --reconcile --fetch

# 删除指定订阅
python3 clash/subscription-manager.py --delete "sub_xxxxxx"
```

#### 规则调度与推演器 (`rules-reconciler.py`)
```bash
# 模拟指定域名的分流策略与 DNS 解析（含 DNS 污染风险研判）
python3 clash/rules-reconciler.py --simulate "api.openai.com"
python3 clash/rules-reconciler.py --simulate "114.114.114.114"

# 指定特定配置文件进行推演
python3 clash/rules-reconciler.py --simulate "github.com" --config "/personal/clash/config.yaml"

# 列出当前配置中所有可用代理策略组 (Target)
python3 clash/rules-reconciler.py --list-targets

# 执行规则语法预检 (Dry Run)
python3 clash/rules-reconciler.py --dry-run

# 执行规则合并与 Controller 热重载
python3 clash/rules-reconciler.py --reconcile
```

---

### 3. 运行自动化测试套件
本项目包含完整的后端 Python 单元测试与前端 UI 模拟测试：

```bash
# 运行全部 Python 测试 (鉴权、缓存、订阅管理、推演、API 网关)
python3 -m pytest tests/

# 运行前端 UI 模拟单元测试
node tests/test_ui_bundle.mjs
```

---

## 🔐 敏感信息过滤与安全说明

- 本仓库严格遵循安全最佳实践，生产环境真实密码（`panel.password`）与控制器密钥（`.controller-secret`）均已纳入 `.gitignore`。
- 首次部署时，请在 `zashboard/panel.password` 与 `clash/.controller-secret` 中填入对应环境的实际口令密钥。

---

## 📄 License & Attribution

- **Author**: dengyie ([https://github.com/dengyie](https://github.com/dengyie))
- **Repository**: [https://github.com/dengyie/mihomo-web-controler](https://github.com/dengyie/mihomo-web-controler)
- **License**: MIT
