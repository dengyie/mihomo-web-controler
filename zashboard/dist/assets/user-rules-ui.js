// zashboard 自定义规则管理、独立工具箱页面与网络聚合套件
// 源码: zashboard/src/user-rules-ui.js
// 构建脚本: scripts/build-ui.mjs -> zashboard/dist/assets/user-rules-ui.js
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const code = countryCode.toUpperCase();
    const codePoints = [...code].map((c) => 127397 + c.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌐';
    }
  }

  // ==========================================
  // 全局状态定义
  // ==========================================
  let authSecret = '';
  let activeBackendUuid = 'backend-tebi-default';

  // 出口 IP 状态
  let egressBadgeState = {
    loading: false,
    error: null,
    data: null,
    lastFetched: 0,
  };

  // 订阅管理状态
  let subscriptionState = {
    loading: false,
    error: null,
    list: [],
    modalOpen: false,
    addFormVisible: false,
    activeTab: 'sub', // 'sub' or 'nodes'
    subInputName: '',
    subInputUrl: '',
    subInputFilter: '',
    nodesInputName: '',
    nodesInputContent: '',
    actionInProgress: null,
  };

  // 规则与 DNS 推演状态
  let ruleSimulatorState = {
    input: '',
    loading: false,
    result: null,
    error: null,
  };

  // 用户自定义规则状态
  let userRulesState = {
    open: false,
    rules: [],
    loading: false,
    submitting: false,
    error: null,
    successMsg: null,
    newRuleType: 'DOMAIN-SUFFIX',
    newRulePayload: '',
    newRuleTarget: 'DIRECT',
    newRuleComment: '',
    proxyGroups: [],
    searchKeyword: '',
    activeTab: 'rules',
  };

  // ==========================================
  // CSS 样式注入 (标准 DaisyUI 风格加固)
  // ==========================================
  const STYLE_ID = 'zashboard-toolkit-modal-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .ur-modal-backdrop {
      animation: urFadeIn 0.15s ease-out;
    }
    @keyframes urFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(120, 120, 120, 0.3);
      border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(120, 120, 120, 0.5);
    }
    `;
    document.head.appendChild(style);
  }

  // ==========================================
  // 凭证与后端识别
  // ==========================================
  function resolveBackendAndSecret() {
    try {
      activeBackendUuid = localStorage.getItem('setup/active-uuid') || 'backend-tebi-default';
      const apiListRaw = localStorage.getItem('setup/api-list');
      if (apiListRaw) {
        const apiList = JSON.parse(apiListRaw);
        const cur = apiList.find((item) => item.uuid === activeBackendUuid);
        if (cur && cur.password) {
          authSecret = cur.password;
        }
      }
    } catch {
      // ignore
    }
  }

  function getApiBase() {
    if (activeBackendUuid === 'backend-pxed-default') {
      return '/panel/pxed/api';
    }
    return '/panel/api';
  }

  function getAuthHeaders(extra = {}) {
    resolveBackendAndSecret();
    const headers = { ...extra };
    if (authSecret) {
      headers['Authorization'] = `Bearer ${authSecret}`;
    }
    return headers;
  }

  function checkBackendChange() {
    const currentUuid = localStorage.getItem('setup/active-uuid') || 'backend-tebi-default';
    if (currentUuid !== activeBackendUuid) {
      activeBackendUuid = currentUuid;
      resolveBackendAndSecret();
      egressBadgeState.data = null;
      egressBadgeState.lastFetched = 0;
      subscriptionState.list = [];
      ruleSimulatorState.result = null;
    }
  }

  // ==========================================
  // 出口 IP 竞速诊断
  // ==========================================
  async function fetchEgressIp(force = false) {
    const now = Date.now();
    if (!force && egressBadgeState.data && now - egressBadgeState.lastFetched < 180000) {
      return;
    }
    egressBadgeState.loading = true;
    renderToolkitModalContent();

    try {
      const resp = await fetch(`${getApiBase()}/diagnostics/egress-ip`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const json = await resp.json();
      if (json.status === 'ok') {
        egressBadgeState.data = json.data;
        egressBadgeState.error = null;
        egressBadgeState.lastFetched = Date.now();
      } else {
        egressBadgeState.error = json.error || '诊断失败';
      }
    } catch (err) {
      egressBadgeState.error = err.message || '网络连接异常';
    } finally {
      egressBadgeState.loading = false;
      renderToolkitModalContent();
    }
  }

  // ==========================================
  // 订阅与节点管理 API
  // ==========================================
  async function fetchSubscriptions() {
    subscriptionState.loading = true;
    renderToolkitModalContent();

    try {
      const resp = await fetch(`${getApiBase()}/subscriptions`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.status === 'ok') {
        subscriptionState.list = json.data?.subscriptions || [];
        subscriptionState.error = null;
      } else {
        subscriptionState.error = json.error || '拉取订阅失败';
      }
    } catch (err) {
      subscriptionState.error = err.message || '无法获取订阅列表';
    } finally {
      subscriptionState.loading = false;
      renderToolkitModalContent();
    }
  }

  async function addSubscriptionUrl(name, url, excludeFilter) {
    subscriptionState.actionInProgress = 'add-sub';
    renderToolkitModalContent();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, url, exclude_filter: excludeFilter }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      subscriptionState.addFormVisible = false;
      subscriptionState.subInputName = '';
      subscriptionState.subInputUrl = '';
      subscriptionState.subInputFilter = '';
      await fetchSubscriptions();
    } catch (err) {
      alert('添加订阅失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitModalContent();
    }
  }

  async function importRawNodes(name, content) {
    subscriptionState.actionInProgress = 'import-nodes';
    renderToolkitModalContent();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/import-nodes`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, content }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      subscriptionState.addFormVisible = false;
      subscriptionState.nodesInputName = '';
      subscriptionState.nodesInputContent = '';
      await fetchSubscriptions();
    } catch (err) {
      alert('导入节点失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitModalContent();
    }
  }

  async function updateSubscription(subId) {
    subscriptionState.actionInProgress = `update-${subId}`;
    renderToolkitModalContent();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      await fetchSubscriptions();
    } catch (err) {
      alert('更新订阅失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitModalContent();
    }
  }

  async function toggleSubscription(subId, enabled) {
    subscriptionState.actionInProgress = `toggle-${subId}`;
    renderToolkitModalContent();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      await fetchSubscriptions();
    } catch (err) {
      alert('切换状态失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitModalContent();
    }
  }

  async function deleteSubscription(subId, name) {
    if (!confirm(`确定要删除订阅源 "${name}" 吗？其聚合节点将被同步移除。`)) return;
    subscriptionState.actionInProgress = `delete-${subId}`;
    renderToolkitModalContent();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      await fetchSubscriptions();
    } catch (err) {
      alert('删除失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitModalContent();
    }
  }

  // ==========================================
  // 规则与 DNS 推演 API
  // ==========================================
  async function runRuleSimulation(inputDomain) {
    const query = (inputDomain || ruleSimulatorState.input || '').trim();
    if (!query) {
      alert('请输入测试域名或 IP');
      return;
    }

    ruleSimulatorState.loading = true;
    ruleSimulatorState.error = null;
    ruleSimulatorState.result = null;
    ruleSimulatorState.input = query;
    renderToolkitModalContent();

    try {
      const resp = await fetch(`${getApiBase()}/rules/simulate?domain=${encodeURIComponent(query)}`, {
        headers: getAuthHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') {
        throw new Error(json.error || (json.data && json.data.error) || `HTTP ${resp.status}`);
      }
      ruleSimulatorState.result = json.data;
    } catch (err) {
      ruleSimulatorState.error = err.message || '推演失败';
    } finally {
      ruleSimulatorState.loading = false;
      renderToolkitModalContent();
    }
  }

  // ==========================================
  // 工具箱 Modal 骨架与事件交互
  // ==========================================
  let isToolkitModalOpen = false;

  function openToolkitModal() {
    isToolkitModalOpen = true;
    let modal = document.getElementById('zashboard-toolkit-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'zashboard-toolkit-modal';
      modal.className = 'modal modal-bottom sm:modal-middle';
      modal.innerHTML = `
        <div class="modal-box max-w-5xl w-11/12 max-h-[90vh] p-4 md:p-6 bg-base-100 text-base-content shadow-2xl border border-base-300 custom-scrollbar flex flex-col relative">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 text-base-content/60 hover:text-base-content" id="btn-close-toolkit-modal">✕</button>
          <div id="zashboard-toolkit-modal-body" class="flex-1 overflow-y-auto custom-scrollbar pr-1"></div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button id="btn-backdrop-close-toolkit">关闭</button>
        </form>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-toolkit-modal')?.addEventListener('click', closeToolkitModal);
      modal.querySelector('#btn-backdrop-close-toolkit')?.addEventListener('click', closeToolkitModal);
    }

    modal.showModal();
    fetchEgressIp(false);
    fetchSubscriptions();
    renderToolkitModalContent();
  }

  function closeToolkitModal() {
    isToolkitModalOpen = false;
    const modal = document.getElementById('zashboard-toolkit-modal');
    if (modal && modal.open) {
      modal.close();
    }
  }

  // ==========================================
  // 渲染工具箱 Modal 内容
  // ==========================================
  function renderToolkitModalContent() {
    const body = document.getElementById('zashboard-toolkit-modal-body');
    if (!body || !isToolkitModalOpen) return;

    // 1. 出口 IP 视图构建
    const fastest = egressBadgeState.data?.fastest;
    const ipData = fastest?.data;
    const latency = fastest?.latency_ms ? Math.round(fastest.latency_ms) : null;
    const flag = ipData?.country_code ? getFlagEmoji(ipData.country_code) : '🌐';
    const isEgressLoading = egressBadgeState.loading;

    let egressCardHtml = `
      <div class="card bg-base-200/50 border border-base-300 p-4 mb-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="text-3xl">${flag}</span>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base font-bold font-mono">${escapeHtml(ipData?.ip || (isEgressLoading ? '正在竞速测速...' : '未获取'))}</span>
                ${latency != null ? `<span class="badge badge-sm badge-success font-mono">${latency}ms</span>` : ''}
              </div>
              <p class="text-xs text-base-content/60">
                ${escapeHtml(ipData?.country || '')} ${escapeHtml(ipData?.city || '')}
                ${ipData?.org ? `· <span class="font-mono">${escapeHtml(ipData.org)}</span>` : ''}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end sm:self-auto">
            <button class="btn btn-xs btn-outline gap-1" id="btn-modal-reprobe-egress" ${isEgressLoading ? 'disabled' : ''}>
              ${isEgressLoading ? '<span class="loading loading-spinner loading-xs"></span>' : '⚡'} 重新测速
            </button>
            <button class="btn btn-xs btn-ghost text-base-content/60" id="btn-toggle-egress-details">
              竞速明细 ▼
            </button>
          </div>
        </div>

        <div id="egress-details-container" class="hidden mt-3 pt-3 border-t border-base-300/50">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            ${(egressBadgeState.data?.probes || []).map(p => `
              <div class="p-2 rounded bg-base-100 border border-base-300/40">
                <div class="flex justify-between font-bold">
                  <span>${escapeHtml(p.source)}</span>
                  <span class="${p.success ? 'text-success' : 'text-error'}">${p.success ? `${Math.round(p.latency_ms)}ms` : '失败'}</span>
                </div>
                <div class="text-[10px] text-base-content/60 truncate mt-0.5">${escapeHtml(p.ip || p.error || 'N/A')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // 2. 订阅与节点中心构建
    const subs = subscriptionState.list || [];
    const isSubLoading = subscriptionState.loading;

    let subsTableRows = '';
    if (subs.length === 0) {
      subsTableRows = `
        <tr>
          <td colspan="5" class="text-center py-6 text-base-content/40 text-xs">
            暂无已导入订阅源，点击右上角 "+ 添加订阅" 快速添加
          </td>
        </tr>
      `;
    } else {
      subsTableRows = subs.map((s) => {
        const isAction = subscriptionState.actionInProgress;
        const isUpdating = isAction === `update-${s.id}`;
        const isToggling = isAction === `toggle-${s.id}`;
        const isDeleting = isAction === `delete-${s.id}`;

        return `
          <tr class="hover:bg-base-200/40">
            <td>
              <div class="font-bold text-xs">${escapeHtml(s.name)}</div>
              <div class="text-[10px] text-base-content/40 truncate max-w-xs font-mono">${escapeHtml(s.url || (s.type === 'raw' ? '单节点批量导入' : '本地源'))}</div>
            </td>
            <td>
              <span class="badge badge-sm badge-ghost font-mono">${s.node_count || 0} 节点</span>
            </td>
            <td>
              <span class="badge badge-sm ${s.enabled ? 'badge-success' : 'badge-ghost'} font-normal">
                ${s.enabled ? '已挂载' : '已停用'}
              </span>
            </td>
            <td class="text-right space-x-1">
              ${s.type !== 'raw' ? `
                <button class="btn btn-xs btn-ghost sub-btn-update" data-id="${escapeHtml(s.id)}" ${isUpdating ? 'disabled' : ''}>
                  ${isUpdating ? '<span class="loading loading-spinner loading-xs"></span>' : '🔄'}
                </button>
              ` : ''}
              <button class="btn btn-xs btn-ghost sub-btn-toggle" data-id="${escapeHtml(s.id)}" data-enabled="${s.enabled}" ${isToggling ? 'disabled' : ''}>
                ${s.enabled ? '⏸️' : '▶️'}
              </button>
              <button class="btn btn-xs btn-ghost text-error sub-btn-delete" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" ${isDeleting ? 'disabled' : ''}>
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    let subAddFormHtml = '';
    if (subscriptionState.addFormVisible) {
      const isSubTab = subscriptionState.activeTab === 'sub';
      subAddFormHtml = `
        <div class="bg-base-200/60 p-3 rounded-lg border border-base-300 mb-3 space-y-3">
          <div class="flex items-center justify-between">
            <div class="tabs tabs-boxed bg-base-100 p-0.5">
              <a class="tab tab-xs ${isSubTab ? 'tab-active' : ''}" id="tab-switch-sub">🔗 Clash 订阅链接</a>
              <a class="tab tab-xs ${!isSubTab ? 'tab-active' : ''}" id="tab-switch-nodes">📝 节点分享链接导入</a>
            </div>
            <button class="btn btn-xs btn-ghost" id="btn-cancel-add-sub">✕ 取消</button>
          </div>

          ${isSubTab ? `
            <div class="space-y-2">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input id="input-sub-name" class="input input-sm input-bordered" placeholder="订阅名称 (如: 某某机场)" value="${escapeHtml(subscriptionState.subInputName)}" />
                <input id="input-sub-filter" class="input input-sm input-bordered" placeholder="排除正则 (默认已过滤公告)" value="${escapeHtml(subscriptionState.subInputFilter)}" />
                <input id="input-sub-url" class="input input-sm input-bordered sm:col-span-3" placeholder="https://airport.com/api/v1/client/subscribe?token=..." value="${escapeHtml(subscriptionState.subInputUrl)}" />
              </div>
              <div class="flex justify-end">
                <button class="btn btn-sm btn-primary" id="btn-submit-add-sub" ${subscriptionState.actionInProgress === 'add-sub' ? 'disabled' : ''}>
                  ${subscriptionState.actionInProgress === 'add-sub' ? '<span class="loading loading-spinner loading-xs"></span>' : '拉取并挂载'}
                </button>
              </div>
            </div>
          ` : `
            <div class="space-y-2">
              <input id="input-nodes-name" class="input input-sm input-bordered w-full" placeholder="前缀别名 (如: 自建香港)" value="${escapeHtml(subscriptionState.nodesInputName)}" />
              <textarea id="input-nodes-content" class="textarea textarea-sm textarea-bordered w-full font-mono text-xs" rows="3" placeholder="支持批量粘贴: ss://, vmess://, vless://, trojan://, hy2://">${escapeHtml(subscriptionState.nodesInputContent)}</textarea>
              <div class="flex justify-end">
                <button class="btn btn-sm btn-primary" id="btn-submit-import-nodes" ${subscriptionState.actionInProgress === 'import-nodes' ? 'disabled' : ''}>
                  ${subscriptionState.actionInProgress === 'import-nodes' ? '<span class="loading loading-spinner loading-xs"></span>' : '解析并导入'}
                </button>
              </div>
            </div>
          `}
        </div>
      `;
    }

    // 3. 规则推演与 DNS 污染视图构建
    const simResult = ruleSimulatorState.result;
    const simLoading = ruleSimulatorState.loading;
    const simError = ruleSimulatorState.error;

    let simOutputHtml = '';
    if (simLoading) {
      simOutputHtml = `
        <div class="p-4 text-center text-xs text-base-content/60">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          <div class="mt-1">正在逐层模拟分流匹配与回溯 DNS policy...</div>
        </div>
      `;
    } else if (simError) {
      simOutputHtml = `
        <div class="alert alert-error text-xs py-2">
          <span>❌ 推演失败: ${escapeHtml(simError)}</span>
        </div>
      `;
    } else if (simResult) {
      const match = simResult.matched_rule;
      const dns = simResult.dns;
      const warnings = dns?.warnings || [];

      simOutputHtml = `
        <div class="p-3 bg-base-100 rounded-lg border border-base-300 space-y-2 text-xs">
          <div class="flex items-center justify-between border-b border-base-300/40 pb-2">
            <span class="text-base-content/60">分流策略匹配:</span>
            <span class="badge badge-success font-bold">${escapeHtml(match?.target || 'DIRECT')}</span>
          </div>
          <div class="font-mono text-[11px] bg-base-200 p-1.5 rounded truncate">
            ${escapeHtml(match?.raw || 'MATCH (Fallback)')}
          </div>
          ${warnings.length > 0 ? `
            <div class="alert alert-warning py-1.5 px-2 text-[11px] rounded">
              <span>⚠️ ${escapeHtml(warnings[0])}</span>
            </div>
          ` : `
            <div class="text-[11px] text-success">
              ✅ DNS 策略安全，未检测到境内明文解析污染
            </div>
          `}
        </div>
      `;
    }

    // 装配 Modal Body 内容
    body.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-base-300 pb-3">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold">🛠️ 网络聚合与诊断工具箱</h2>
            <span class="badge badge-sm badge-outline font-mono">${escapeHtml(activeBackendUuid.replace('backend-', '').replace('-default', ''))}</span>
          </div>
        </div>

        <!-- 顶部出口 IP 诊断 -->
        ${egressCardHtml}

        <!-- 左右并列卡片 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- 左栏：订阅与节点中心 -->
          <div class="card bg-base-200/50 border border-base-300 p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm">🔗 订阅与节点聚合</span>
                ${isSubLoading ? '<span class="loading loading-spinner loading-xs"></span>' : ''}
              </div>
              <button class="btn btn-xs btn-primary font-normal" id="btn-show-add-sub">
                + 添加源
              </button>
            </div>

            ${subAddFormHtml}

            <div class="overflow-x-auto max-h-60 custom-scrollbar">
              <table class="table table-xs w-full">
                <thead>
                  <tr class="text-base-content/60 border-b border-base-300">
                    <th>订阅别名</th>
                    <th>节点数</th>
                    <th>状态</th>
                    <th class="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${subsTableRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- 右栏：规则分流与 DNS 推演 -->
          <div class="card bg-base-200/50 border border-base-300 p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="font-bold text-sm">🎯 规则分流与 DNS 污染推演</span>
            </div>

            <div class="space-y-2 mb-3">
              <div class="join w-full">
                <input
                  id="toolkit-modal-sim-input"
                  class="input input-sm input-bordered join-item w-full font-mono text-xs"
                  placeholder="测试域名 (如: api.openai.com)"
                  value="${escapeHtml(ruleSimulatorState.input)}"
                />
                <button class="btn btn-sm btn-primary join-item font-normal" id="btn-toolkit-modal-sim" ${simLoading ? 'disabled' : ''}>
                  推演
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                <span class="text-[10px] text-base-content/40">快捷:</span>
                ${['api.openai.com', 'claude.ai', 'github.com', 'google.com'].map(d => `
                  <span class="badge badge-xs badge-ghost cursor-pointer hover:badge-primary quick-sim-tag font-mono text-[10px]" data-domain="${d}">
                    ${d}
                  </span>
                `).join('')}
              </div>
            </div>

            ${simOutputHtml}
          </div>
        </div>
      </div>
    `;

    // 绑定内部交互事件
    body.querySelector('#btn-modal-reprobe-egress')?.addEventListener('click', () => fetchEgressIp(true));
    body.querySelector('#btn-toggle-egress-details')?.addEventListener('click', () => {
      const container = body.querySelector('#egress-details-container');
      if (container) container.classList.toggle('hidden');
    });

    body.querySelector('#btn-show-add-sub')?.addEventListener('click', () => {
      subscriptionState.addFormVisible = !subscriptionState.addFormVisible;
      renderToolkitModalContent();
    });
    body.querySelector('#btn-cancel-add-sub')?.addEventListener('click', () => {
      subscriptionState.addFormVisible = false;
      renderToolkitModalContent();
    });

    body.querySelector('#tab-switch-sub')?.addEventListener('click', () => {
      subscriptionState.activeTab = 'sub';
      renderToolkitModalContent();
    });
    body.querySelector('#tab-switch-nodes')?.addEventListener('click', () => {
      subscriptionState.activeTab = 'nodes';
      renderToolkitModalContent();
    });

    body.querySelector('#btn-submit-add-sub')?.addEventListener('click', () => {
      const name = body.querySelector('#input-sub-name')?.value.trim();
      const url = body.querySelector('#input-sub-url')?.value.trim();
      const filter = body.querySelector('#input-sub-filter')?.value.trim();
      if (!name || !url) {
        alert('请完整填写订阅名称与 URL');
        return;
      }
      addSubscriptionUrl(name, url, filter);
    });

    body.querySelector('#btn-submit-import-nodes')?.addEventListener('click', () => {
      const name = body.querySelector('#input-nodes-name')?.value.trim();
      const content = body.querySelector('#input-nodes-content')?.value.trim();
      if (!name || !content) {
        alert('请填写别名前缀并粘贴节点分享链接');
        return;
      }
      importRawNodes(name, content);
    });

    body.querySelectorAll('.sub-btn-update').forEach(btn => {
      btn.addEventListener('click', () => updateSubscription(btn.dataset.id));
    });
    body.querySelectorAll('.sub-btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => toggleSubscription(btn.dataset.id, btn.dataset.enabled !== 'true'));
    });
    body.querySelectorAll('.sub-btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteSubscription(btn.dataset.id, btn.dataset.name));
    });

    const simInput = body.querySelector('#toolkit-modal-sim-input');
    const simBtn = body.querySelector('#btn-toolkit-modal-sim');
    simBtn?.addEventListener('click', () => runRuleSimulation(simInput?.value));
    simInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runRuleSimulation(simInput.value);
    });

    body.querySelectorAll('.quick-sim-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        if (simInput) simInput.value = tag.dataset.domain;
        runRuleSimulation(tag.dataset.domain);
      });
    });
  }

  // ==========================================
  // 入口按钮优雅注入 (顶栏控制区 + 规则页)
  // 零侵入、不污染 ul.sidebar-route-menu 结构
  // ==========================================
  function injectEntryButtons() {
    // 1. 顶栏右侧控制按钮组注入 (div.flex.gap-2.p-2)
    const topBar = document.querySelector('.flex.gap-2.p-2');
    if (topBar && !document.getElementById('btn-topbar-toolkit')) {
      const btn = document.createElement('button');
      btn.id = 'btn-topbar-toolkit';
      btn.className = 'btn btn-circle btn-sm';
      btn.title = '网络工具箱 (订阅聚合 / 出口竞速 / 分流推演)';
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
        </svg>
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openToolkitModal();
      });
      topBar.appendChild(btn);
    }

    // 2. 侧边栏底部操作区注入 (与内核管理按钮并列，完全不破坏 menu indicator)
    const sidebarBottomContainer = document.querySelector('.sidebar .mt-1.flex.flex-col.items-center .flex.flex-col.items-center.justify-center.gap-2');
    if (sidebarBottomContainer && !document.getElementById('btn-sidebar-bottom-toolkit')) {
      const sideBtn = document.createElement('button');
      sideBtn.id = 'btn-sidebar-bottom-toolkit';
      sideBtn.className = 'btn btn-circle btn-sm';
      sideBtn.title = '网络工具箱 (订阅/出口/推演)';
      sideBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      `;
      sideBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openToolkitModal();
      });
      sidebarBottomContainer.appendChild(sideBtn);
    }

    // 3. 在 #/rules 页面保留用户自定义规则管理入口
    injectRulesPageButton();
  }

  // ==========================================
  // 规则管理页模态注入 (保留原有用户规则功能)
  // ==========================================
  function injectRulesPageButton() {
    const isRulesPage = (location.hash || '').startsWith('#/rules');
    const existingBtn = document.getElementById('user-rules-top-action-btn');
    if (!isRulesPage) {
      if (existingBtn) existingBtn.remove();
      return;
    }
    if (existingBtn) return;

    const topBar = document.querySelector('.flex.gap-2.p-2');
    if (!topBar) return;

    const btn = document.createElement('button');
    btn.id = 'user-rules-top-action-btn';
    btn.className = 'btn btn-sm btn-outline gap-1.5 font-normal';
    btn.innerHTML = `<span>🛡️</span> 自定义规则`;
    btn.addEventListener('click', openUserRulesModal);
    topBar.appendChild(btn);
  }

  // 用户规则管理模态弹窗
  function openUserRulesModal() {
    let modal = document.getElementById('user-rules-manager-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'user-rules-manager-modal';
      modal.className = 'modal modal-bottom sm:modal-middle';
      modal.innerHTML = `
        <div class="modal-box max-w-4xl w-11/12 p-4 md:p-6 bg-base-100 text-base-content border border-base-300 shadow-2xl">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" id="btn-close-rules-modal">✕</button>
          <div class="flex items-center justify-between border-b border-base-300 pb-3 mb-4">
            <h3 class="font-bold text-base">🛡️ 用户自定义规则权威源管理</h3>
          </div>
          <div id="user-rules-modal-content" class="space-y-4">
            <p class="text-xs text-base-content/60">正在从权威源同步用户规则...</p>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>关闭</button>
        </form>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#btn-close-rules-modal')?.addEventListener('click', () => modal.close());
    }
    modal.showModal();
    fetchUserRules();
  }

  async function fetchUserRules() {
    const container = document.getElementById('user-rules-modal-content');
    if (!container) return;
    try {
      const resp = await fetch(`${getApiBase()}/user-rules`, { headers: getAuthHeaders() });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      userRulesState.rules = json.data?.rules || [];
      renderUserRulesModal();
    } catch (e) {
      container.innerHTML = `<div class="alert alert-error text-xs">加载失败: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderUserRulesModal() {
    const container = document.getElementById('user-rules-modal-content');
    if (!container) return;
    const rules = userRulesState.rules || [];
    container.innerHTML = `
      <div class="flex justify-between items-center text-xs">
        <span class="text-base-content/60">当前已生效自定义规则数: <b class="font-mono text-base-content">${rules.length}</b></span>
        <button class="btn btn-xs btn-outline gap-1" id="btn-refresh-user-rules">🔄 刷新</button>
      </div>
      <div class="overflow-x-auto max-h-64 border border-base-300 rounded-lg custom-scrollbar">
        <table class="table table-xs w-full">
          <thead>
            <tr class="bg-base-200 text-base-content/70">
              <th>类型</th>
              <th>匹配载荷</th>
              <th>目标策略组</th>
              <th>备注说明</th>
            </tr>
          </thead>
          <tbody>
            ${rules.length === 0 ? `
              <tr><td colspan="4" class="text-center py-6 text-base-content/40">暂无自定义规则</td></tr>
            ` : rules.map(r => `
              <tr class="hover:bg-base-200/40 font-mono">
                <td class="font-bold text-primary">${escapeHtml(r.type)}</td>
                <td>${escapeHtml(r.payload)}</td>
                <td><span class="badge badge-sm badge-ghost">${escapeHtml(r.target)}</span></td>
                <td class="text-base-content/50 font-sans">${escapeHtml(r.comment || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.querySelector('#btn-refresh-user-rules')?.addEventListener('click', fetchUserRules);
  }

  // ==========================================
  // 全局定时轻量保活调度 (零侵入、零卡顿)
  // ==========================================
  let isLoopRunning = false;
  function mainLoop() {
    if (isLoopRunning) return;
    isLoopRunning = true;
    try {
      checkBackendChange();
      injectStyles();
      injectEntryButtons();
    } finally {
      isLoopRunning = false;
    }
  }

  setInterval(mainLoop, 800);
  window.addEventListener('hashchange', mainLoop);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainLoop);
  } else {
    mainLoop();
  }
})();
