# mihomo-web-controler

Mihomo (Clash Meta) Web 控制面板与自定义规则管理网关套件。

- **项目主页**：[https://github.com/dengyie/mihomo-web-controler](https://github.com/dengyie/mihomo-web-controler)
- **作者**：dengyie
- **许可证**：MIT

---

## 🌟 核心特性

1. **可视化自定义规则管理**
   - 在 Web UI 规则页（`#/rules`）原生无缝集成自定义规则管理 Icon。
   - 支持 `DOMAIN-SUFFIX`、`DOMAIN`、`DOMAIN-KEYWORD`、`IP-CIDR`、`IP-CIDR6`、`GEOSITE`、`GEOIP` 等类型。
   - 自动获取当前所有可用策略组（Target）供下拉选择。
   - 规则语法实时生成预览、安全合法性校验（防字符注入）、删除二次确认与全字段 XSS 转义。

2. **多层安全与可靠性保障**
   - **语法预检**：写入前自动调用 `mihomo -t` 对候选配置进行真实语法校验。
   - **事务性回滚**：任一步骤失败（含 Controller 异常）自动通过历史备份原子恢复旧配置。
   - **精准前缀剥离**：删除用户自定义规则时，绝对不会误伤订阅原有的同名规则。
   - **NFS 跨进程排他锁**：使用 `fcntl.flock` 保障多并发操作安全。

3. **安全 API 网关 (`gateway.py`)**
   - 单源对外服务（静态资源托管 + API 反向代理 + WebSocket 流量转发）。
   - 服务端注入 Mihomo `.controller-secret`，前端全程零 Secret 暴露。
   - 复用 Panel 独立密码进行 Bearer 鉴权（恒定时间比较防时序攻击）。
   - 支持 Reconciler 模块按需热重载（基于文件修改时间戳 `mtime`）。

4. **Keeper 守护协同 (`clash-keeper-loop.sh`)**
   - 每 120s 周期自检与重放。
   - 基于 Hash 比对实现幂等合并：配置未变更时不写磁盘、不产生冗余备份、不触发重复 reload。
   - 订阅覆盖或主配置重建后，用户规则自动保活重放。

5. **网络与 CPA 强隔离**
   - 仅调用 Mihomo Controller HTTP API（`PUT /configs?force=true`）进行无损热重载。
   - 绝不使用全局 broad-kill（如 `start-clash.sh` / `pkill`），确保独立代理栈零中断。

---

## 🏗️ 架构拓扑

```text
浏览器 (Web UI)
  │ HTTPS
  ▼
Cloudflare Tunnel / 反向代理
  │
  ▼
127.0.0.1:2053 (gateway.py)
  ├── 静态资源: zashboard/dist/ (含 assets/user-rules-ui.js)
  ├── 代理 Controller API: /panel/api/* ──(注入 secret)──> 127.0.0.1:9090 (主 Mihomo Controller)
  └── 自定义规则 REST API: /panel/api/user-rules
                               │
                               ▼
            clash/rules-reconciler.py (排他锁 flock)
                               │
                               ├── 1. 严格 Schema / 域名 / CIDR 校验
                               ├── 2. 写入权威源: rules/user-rules.yaml
                               ├── 3. mihomo -t 候选语法预检
                               ├── 4. 自动生成 .pre-user-rules-<ts> 备份
                               ├── 5. 原子替换 config.yaml & config.mac-merged.yaml
                               └── 6. PUT /configs?force=true 热重载主 Controller
```

---

## 📂 目录结构

```text
.
├── clash/
│   ├── rules-reconciler.py     # 核心规则调度器 (校验、合并、事务回滚、Mihomo Controller 热重载)
│   ├── apply-local-import.py   # 本地节点持久化与注入脚本
│   └── clash-keeper-loop.sh    # Keeper 常驻守护脚本
└── zashboard/
    ├── gateway.py              # API 网关 (鉴权、反向代理、WebSocket、REST CRUD)
    └── dist/                   # Web 面板静态资源产物
        ├── assets/
        │   └── user-rules-ui.js # 二开前端规则管理扩展组件 (Modal、DOM 锚定、XSS 净化)
        └── index.html          # Web 面板入口
```

---

## 🚀 启动与部署

### 1. 部署与自动化打包 (CI/CD)
本项目已配置 GitHub Actions 自动化工作流：
- **触发条件**：每次 push 到 `main` 分支、发起 PR 或打 Tag（如 `v1.0.0`）。
- **打包产物**：自动生成 `mihomo-web-controler-latest.tar.gz` 及对应校验和并上传 Artifacts。
- **一键下载部署**：
  ```bash
  # 下载最新构建包并解压至目标目录
  tar -xzf mihomo-web-controler-latest.tar.gz -C /personal/
  ```

### 2. 启动 API 网关与 Web 面板
```bash
python3 zashboard/gateway.py
```

### 2. 手动执行规则同步与预检
```bash
# 语法预检 (Dry Run)
python3 clash/rules-reconciler.py --dry-run

# 执行合并与热重载
python3 clash/rules-reconciler.py --reconcile
```

---

## 🔐 敏感信息过滤与安全说明

- 本仓库已将生产真实密码（`panel.password`）与控制器密钥（`.controller-secret`）加入 `.gitignore`。
- 部署时请在 `zashboard/panel.password` 与 `clash/.controller-secret` 中填入对应环境的实际密钥。

---

## 📄 License & Attribution

- Author: **dengyie** ([https://github.com/dengyie](https://github.com/dengyie))
- Project: [https://github.com/dengyie/mihomo-web-controler](https://github.com/dengyie/mihomo-web-controler)
- License: MIT
