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
      .replace(/'/g, '&#39;');
  }

  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  // Inject Styles for Custom Panels, Badges, Toolkit View & Pills
  const style = document.createElement('style');
  style.id = 'user-rules-custom-styles';
  style.textContent = `
    .user-rules-modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      animation: urFadeIn 0.15s ease-out;
    }
    @keyframes urFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .user-rules-modal-content {
      background: var(--fallback-b1, #ffffff);
      color: var(--fallback-bc, #1f2937);
      width: 92%;
      max-width: 680px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      border-radius: var(--rounded-box, 1rem);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(128, 128, 128, 0.2);
      overflow: hidden;
    }
    .dark .user-rules-modal-content, [data-theme='dark'] .user-rules-modal-content {
      background: #1d232a;
      color: #a6adbb;
      border-color: #2b3038;
    }
    .user-rules-modal-header {
      padding: 0.875rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    }
    .user-rules-modal-body {
      padding: 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    #user-rules-top-action-btn {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin-right: 6px;
      flex-shrink: 0;
    }

    /* 全局悬浮出口 IP 胶囊 (Floating Pill) */
    #zashboard-floating-egress-pill {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      cursor: pointer;
      user-select: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      background: rgba(255, 255, 255, 0.88);
      color: #1f2937;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(128, 128, 128, 0.25);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dark #zashboard-floating-egress-pill, [data-theme='dark'] #zashboard-floating-egress-pill {
      background: rgba(29, 35, 42, 0.88);
      color: #e5e7eb;
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
    }
    #zashboard-floating-egress-pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    #zashboard-floating-egress-pill:active {
      transform: translateY(0);
    }

    /* 独立工具箱视图容器样式 */
    #zashboard-toolkit-view {
      height: 100%;
      width: 100%;
      overflow-y: auto;
      box-sizing: border-box;
      animation: urFadeIn 0.18s ease-out;
    }
    .toolkit-card {
      background: var(--fallback-b1, #ffffff);
      border: 1px solid rgba(128, 128, 128, 0.18);
      border-radius: var(--rounded-box, 0.875rem);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition: border-color 0.2s;
    }
    .dark .toolkit-card, [data-theme='dark'] .toolkit-card {
      background: #191e24;
      border-color: rgba(255, 255, 255, 0.08);
    }

    /* 测速并发源微型卡片 */
    .probe-source-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      background: rgba(128, 128, 128, 0.08);
      border: 1px solid rgba(128, 128, 128, 0.15);
    }
    .rule-sim-highlight {
      outline: 2px solid #10b981 !important;
      background-color: rgba(16, 185, 129, 0.12) !important;
      transition: all 0.3s ease;
    }
  `;
  if (!document.getElementById('user-rules-custom-styles')) {
    document.head.appendChild(style);
  }

  // ==========================================
  // Global State Management
  // ==========================================
  let userRulesState = {
    rules: [],
    targets: ['DIRECT', 'REJECT', 'GLOBAL'],
    loading: false,
    showModal: false,
    viewMode: 'list', // 'list' | 'add'
    lastActiveUuid: '',
  };

  let subManagerState = {
    subscriptions: [],
    loading: false,
    showAddForm: false,
    activeTab: 'url', // 'url' | 'raw'
    submitting: false,
  };

  let egressBadgeState = {
    loading: false,
    data: null,
    showDetails: false,
    error: null,
    lastChecked: 0,
  };

  let ruleSimulatorState = {
    input: '',
    loading: false,
    result: null,
    error: null,
  };

  // Toast System
  function showToast(message, type = 'info') {
    let toast = document.getElementById('user-rules-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'user-rules-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    const item = document.createElement('div');
    const isSuccess = type === 'success';
    const isError = type === 'error';
    item.className = `alert alert-sm ${isSuccess ? 'alert-success' : isError ? 'alert-error' : 'alert-info'} shadow-lg text-xs py-2 px-3 flex items-center gap-2 pointer-events-auto rounded-lg`;
    item.style.animation = 'urFadeIn 0.2s ease-out';
    item.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toast.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.3s ease';
      setTimeout(() => item.remove(), 300);
    }, 3000);
  }

  function getActiveBackend() {
    try {
      const activeUuid = localStorage.getItem('setup/active-uuid');
      const list = JSON.parse(localStorage.getItem('setup/api-list') || '[]');
      return list.find((x) => x.uuid === activeUuid) || list[0] || null;
    } catch (_) {
      return null;
    }
  }

  function getPanelApiBase(subPath = 'user-rules') {
    const active = getActiveBackend();
    if (active && active.secondaryPath) {
      let sp = active.secondaryPath.trim().replace(/\/+$/, '');
      if (sp && !sp.startsWith('/')) sp = '/' + sp;
      return sp + '/' + subPath;
    }
    return '/panel/api/' + subPath;
  }

  function getPanelAuthToken() {
    return getActiveBackend()?.password || '';
  }

  function getActiveBackendLabel() {
    const active = getActiveBackend();
    return active?.label || '默认节点';
  }

  function getAuthHeaders(includeJson = false) {
    const token = getPanelAuthToken();
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  function isToolkitRoute() {
    const h = location.hash || '';
    return h.startsWith('#/toolkit') || h.startsWith('#/subscriptions');
  }

  // ==========================================
  // 1. 出口 IP 竞速诊断数据层
  // ==========================================
  async function fetchEgressIp(force = false) {
    if (egressBadgeState.loading) return;
    const now = Date.now();
    if (!force && egressBadgeState.data && (now - egressBadgeState.lastChecked < 60000)) {
      renderFloatingEgressPill();
      if (isToolkitRoute()) renderToolkitPage();
      return;
    }

    egressBadgeState.loading = true;
    egressBadgeState.error = null;
    renderFloatingEgressPill();
    if (isToolkitRoute()) renderToolkitPage();

    try {
      const apiEndpoint = getPanelApiBase('diagnostics') + '/egress-ip';
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.status === 'ok' && json.data && json.data.success) {
        egressBadgeState.data = json.data;
        egressBadgeState.lastChecked = Date.now();
      } else {
        egressBadgeState.error = (json.data && json.data.message) || json.error || '探测失败';
      }
    } catch (e) {
      egressBadgeState.error = e.message || '网络连接异常';
    } finally {
      egressBadgeState.loading = false;
      renderFloatingEgressPill();
      if (isToolkitRoute()) renderToolkitPage();
    }
  }

  // ==========================================
  // 2. 全局悬浮出口 IP 胶囊 (Floating Pill)
  // ==========================================
  function renderFloatingEgressPill() {
    let pill = document.getElementById('zashboard-floating-egress-pill');
    if (!pill) return;

    let newHtml = '';
    if (egressBadgeState.loading) {
      newHtml = `
        <span class="loading loading-spinner loading-xs text-primary"></span>
        <span class="opacity-80">探测出口...</span>
      `;
    } else if (egressBadgeState.error) {
      newHtml = `
        <span class="text-error font-bold">⚠️</span>
        <span class="text-error text-xs">出口异常</span>
        <span class="badge badge-xs badge-ghost ml-1">重试</span>
      `;
    } else {
      const fastest = egressBadgeState.data?.fastest;
      if (!fastest || !fastest.data) {
        newHtml = `
          <span>🌐</span>
          <span class="opacity-80">测速出口 IP</span>
        `;
      } else {
        const ipData = fastest.data;
        const ip = ipData.ip || 'Unknown';
        const flag = getFlagEmoji(ipData.country_code);
        const latency = Math.round(fastest.latency_ms || 0);

        let latencyBadge = 'badge-success';
        if (latency > 300) latencyBadge = 'badge-error';
        else if (latency > 150) latencyBadge = 'badge-warning';

        newHtml = `
          <span class="text-base">${flag}</span>
          <span class="font-bold text-xs">${escapeHtml(ip)}</span>
          <span class="badge badge-xs ${latencyBadge} font-mono">${latency}ms</span>
          <span class="text-[10px] opacity-40 hover:opacity-100 ml-0.5" title="点击前往网络工具箱">➔</span>
        `;
      }
    }

    if (pill.innerHTML.trim() !== newHtml.trim()) {
      pill.innerHTML = newHtml;
    }
  }

  function injectFloatingEgressPill() {
    let pill = document.getElementById('zashboard-floating-egress-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'zashboard-floating-egress-pill';
      pill.title = '落地出口 IP 诊断 (点击前往网络工具箱)';
      pill.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (location.hash !== '#/toolkit') {
          location.hash = '#/toolkit';
        } else {
          fetchEgressIp(true);
        }
      };
      document.body.appendChild(pill);
    }
    renderFloatingEgressPill();
    if (!egressBadgeState.data && !egressBadgeState.loading) {
      fetchEgressIp(false);
    }
  }

  // ==========================================
  // 3. 订阅与节点聚合数据层
  // ==========================================
  async function fetchSubscriptions() {
    subManagerState.loading = true;
    if (isToolkitRoute()) renderToolkitPage();
    try {
      const apiEndpoint = getPanelApiBase('subscriptions');
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        subManagerState.subscriptions = json.data.subscriptions || [];
      } else {
        showToast('获取订阅列表失败: ' + (json.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('获取订阅列表异常: ' + e.message, 'error');
    } finally {
      subManagerState.loading = false;
      if (isToolkitRoute()) renderToolkitPage();
    }
  }

  async function submitAddSubscription(name, url, excludeRegex) {
    subManagerState.submitting = true;
    if (isToolkitRoute()) renderToolkitPage();
    try {
      const apiEndpoint = getPanelApiBase('subscriptions');
      const payload = { name, url, exclude_filter: excludeRegex };
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        showToast(`✅ 订阅「${name}」导入成功，新增 ${json.data?.node_count || 0} 个节点并自动聚合生效！`, 'success');
        subManagerState.showAddForm = false;
        await fetchSubscriptions();
      } else {
        showToast('导入订阅失败: ' + (json.error || json.message || '格式错误或连接超时'), 'error');
      }
    } catch (e) {
      showToast('提交异常: ' + e.message, 'error');
    } finally {
      subManagerState.submitting = false;
      if (isToolkitRoute()) renderToolkitPage();
    }
  }

  async function submitImportNodes(name, rawContent) {
    subManagerState.submitting = true;
    if (isToolkitRoute()) renderToolkitPage();
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/import-nodes';
      const payload = { name, content: rawContent };
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        showToast(`✅ 节点批量导入成功，聚合 ${json.data?.node_count || 0} 个有效节点！`, 'success');
        subManagerState.showAddForm = false;
        await fetchSubscriptions();
      } else {
        showToast('节点解析失败: ' + (json.error || json.message || '未匹配到合法链接'), 'error');
      }
    } catch (e) {
      showToast('提交异常: ' + e.message, 'error');
    } finally {
      subManagerState.submitting = false;
      if (isToolkitRoute()) renderToolkitPage();
    }
  }

  async function toggleSubscription(subId, enabled) {
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId) + '/toggle';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        showToast(`订阅已${enabled ? '启用' : '禁用'}，配置已同步热重载`, 'info');
        await fetchSubscriptions();
      } else {
        showToast('切换状态失败: ' + (json.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('请求异常: ' + e.message, 'error');
    }
  }

  async function updateSubscription(subId) {
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId) + '/update';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        showToast(`✅ 订阅更新成功，包含 ${json.data?.node_count || 0} 个有效节点`, 'success');
        await fetchSubscriptions();
      } else {
        showToast('更新失败: ' + (json.error || '拉取超时或格式错误'), 'error');
      }
    } catch (e) {
      showToast('更新异常: ' + e.message, 'error');
    }
  }

  async function deleteSubscription(subId, subName) {
    if (!confirm(`确认删除订阅「${subName}」吗？相关聚合节点将从配置中剥离。`)) return;
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId);
      const res = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        showToast(`订阅「${subName}」已删除`, 'info');
        await fetchSubscriptions();
      } else {
        showToast('删除失败: ' + (json.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('删除异常: ' + e.message, 'error');
    }
  }

  // ==========================================
  // 4. 规则分流与 DNS 污染推演模拟器
  // ==========================================
  async function runRuleSimulation(inputDomain) {
    const query = (inputDomain || ruleSimulatorState.input || '').trim();
    if (!query) {
      showToast('请输入待测试的域名或 IP', 'info');
      return;
    }

    ruleSimulatorState.input = query;
    ruleSimulatorState.loading = true;
    ruleSimulatorState.error = null;
    ruleSimulatorState.result = null;
    if (isToolkitRoute()) renderToolkitPage();

    try {
      const apiEndpoint = getPanelApiBase('rules') + '/simulate?domain=' + encodeURIComponent(query);
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        ruleSimulatorState.result = json.data;
      } else {
        ruleSimulatorState.error = json.error || '推演无匹配';
      }
    } catch (e) {
      ruleSimulatorState.error = e.message || '网络连接异常';
    } finally {
      ruleSimulatorState.loading = false;
      if (isToolkitRoute()) renderToolkitPage();
    }
  }

  // ==========================================
  // 5. 独立页面渲染: ToolkitView (#/toolkit)
  // ==========================================
  function renderToolkitPage() {
    const viewContainer = document.getElementById('zashboard-toolkit-view');
    if (!viewContainer) return;

    // --- Section 1: 出口 IP 看板 HTML ---
    const fastest = egressBadgeState.data?.fastest;
    const ipData = fastest?.data || {};
    const ip = ipData.ip || '未探测';
    const country = ipData.country || ipData.country_code || '未知地区';
    const city = ipData.city || '';
    const flag = getFlagEmoji(ipData.country_code);
    const org = ipData.org || ipData.isp || '未知组织';
    const asn = ipData.asn ? `AS${ipData.asn}` : '';
    const latency = fastest?.latency_ms ? `${Math.round(fastest.latency_ms)} ms` : '--';
    const source = fastest?.source || '--';
    const allResults = egressBadgeState.data?.all_results || [];

    let egressHeaderBadge = `<span class="badge badge-success badge-sm font-mono">${latency} (${escapeHtml(source)})</span>`;
    if (egressBadgeState.loading) {
      egressHeaderBadge = `<span class="badge badge-ghost badge-sm gap-1 animate-pulse"><span class="loading loading-spinner loading-xs"></span> 测速中...</span>`;
    } else if (egressBadgeState.error) {
      egressHeaderBadge = `<span class="badge badge-error badge-sm">⚠️ ${escapeHtml(egressBadgeState.error)}</span>`;
    }

    // --- Section 2: 订阅管理中心 HTML ---
    const subs = subManagerState.subscriptions || [];
    const totalNodes = subs.reduce((acc, cur) => acc + (cur.node_count || 0), 0);
    const activeSubs = subs.filter((s) => s.enabled).length;

    let subListHtml = '';
    if (subManagerState.loading && subs.length === 0) {
      subListHtml = `
        <div class="py-12 flex flex-col items-center justify-center text-base-content/60 text-xs">
          <span class="loading loading-spinner loading-md text-primary mb-2"></span>
          <span>正在拉取订阅列表与聚合状态...</span>
        </div>
      `;
    } else if (subs.length === 0) {
      subListHtml = `
        <div class="py-10 px-4 text-center border-2 border-dashed border-base-content/10 rounded-xl my-2">
          <div class="text-3xl mb-2">🛫</div>
          <div class="font-bold text-sm mb-1">暂无订阅源</div>
          <div class="text-xs text-base-content/60 max-w-sm mx-auto mb-4">
            支持一键添加 Clash / Mihomo 订阅 URL，或直接粘贴 ss/vmess/vless/trojan/hy2 分享链接批量导入。
          </div>
          <button class="btn btn-primary btn-sm font-normal" id="btn-empty-add-sub">
            + 导入第一个订阅
          </button>
        </div>
      `;
    } else {
      subListHtml = `
        <div class="space-y-3 mt-3">
          ${subs.map((s) => {
            const isRaw = s.type === 'raw_nodes';
            const nodeCount = s.node_count || 0;
            const updateTime = s.updated_at ? new Date(s.updated_at).toLocaleString() : '从不';
            return `
              <div class="p-3.5 rounded-xl bg-base-200/60 hover:bg-base-200 border border-base-content/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-base shrink-0 mt-0.5">
                    ${isRaw ? '📋' : '🔗'}
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-sm">${escapeHtml(s.name)}</span>
                      <span class="badge badge-xs ${s.enabled ? 'badge-success' : 'badge-ghost'}">
                        ${s.enabled ? '启用' : '已停用'}
                      </span>
                      <span class="badge badge-xs badge-outline font-mono text-[10px]">
                        ${nodeCount} 节点
                      </span>
                    </div>
                    <div class="text-[11px] text-base-content/60 mt-1 font-mono break-all line-clamp-1">
                      ${isRaw ? '文本格式单节点聚合' : escapeHtml(s.url || '')}
                    </div>
                    <div class="text-[10px] text-base-content/40 mt-0.5">
                      更新于: ${escapeHtml(updateTime)}
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button class="btn btn-ghost btn-xs btn-update-sub" data-id="${escapeHtml(s.id)}" title="立即同步更新">
                    🔄 更新
                  </button>
                  <button class="btn btn-ghost btn-xs btn-toggle-sub" data-id="${escapeHtml(s.id)}" data-enabled="${s.enabled ? '1' : '0'}">
                    ${s.enabled ? '⏸ 禁用' : '▶ 启用'}
                  </button>
                  <button class="btn btn-ghost btn-xs text-error btn-del-sub" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" title="删除订阅">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 添加表单 HTML
    let addFormHtml = '';
    if (subManagerState.showAddForm) {
      addFormHtml = `
        <div class="mt-4 p-4 rounded-xl bg-base-200/80 border border-primary/20 animate-fadeIn">
          <div class="flex items-center justify-between pb-2 mb-3 border-b border-base-content/10">
            <span class="font-bold text-xs flex items-center gap-1.5">
              <span>➕ 导入新订阅与节点</span>
            </span>
            <button class="btn btn-ghost btn-xs btn-circle" id="btn-cancel-add-sub">✕</button>
          </div>

          <div class="tabs tabs-boxed tabs-xs mb-3 w-fit">
            <a class="tab ${subManagerState.activeTab === 'url' ? 'tab-active' : ''}" id="tab-mode-url">Clash 订阅 URL</a>
            <a class="tab ${subManagerState.activeTab === 'raw' ? 'tab-active' : ''}" id="tab-mode-raw">粘贴单节点分享链接</a>
          </div>

          ${subManagerState.activeTab === 'url' ? `
            <div class="space-y-3">
              <div>
                <label class="label py-1"><span class="label-text text-xs">订阅别名 (前缀隔离)</span></label>
                <input id="input-sub-name" class="input input-sm input-bordered w-full text-xs" placeholder="例如: 飞鸟机场" />
              </div>
              <div>
                <label class="label py-1"><span class="label-text text-xs">订阅 URL (HTTP/HTTPS)</span></label>
                <input id="input-sub-url" class="input input-sm input-bordered w-full text-xs font-mono" placeholder="https://airport.com/api/v1/client/subscribe?token=..." />
              </div>
              <div>
                <label class="label py-1">
                  <span class="label-text text-xs">过滤正则 (排除公告/非代理节点)</span>
                  <span class="label-text-alt text-[10px] opacity-60">留空使用内置过滤</span>
                </label>
                <input id="input-sub-filter" class="input input-sm input-bordered w-full text-xs font-mono" placeholder="(剩余流量|官网|重置|过期|公告)" />
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button class="btn btn-sm btn-ghost" id="btn-close-sub-form">取消</button>
                <button class="btn btn-sm btn-primary" id="btn-submit-sub-url" ${subManagerState.submitting ? 'disabled' : ''}>
                  ${subManagerState.submitting ? '<span class="loading loading-spinner loading-xs"></span> 导入中...' : '确认导入并聚合'}
                </button>
              </div>
            </div>
          ` : `
            <div class="space-y-3">
              <div>
                <label class="label py-1"><span class="label-text text-xs">节点命名空间前缀</span></label>
                <input id="input-raw-name" class="input input-sm input-bordered w-full text-xs" placeholder="例如: 自建节点" />
              </div>
              <div>
                <label class="label py-1">
                  <span class="label-text text-xs">节点分享链接 (支持多行)</span>
                  <span class="label-text-alt text-[10px] opacity-60">ss:// | vmess:// | vless:// | trojan:// | hy2://</span>
                </label>
                <textarea id="input-raw-content" class="textarea textarea-bordered textarea-sm w-full text-xs font-mono h-24" placeholder="ss://...\nvless://...\nhysteria2://..."></textarea>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button class="btn btn-sm btn-ghost" id="btn-close-sub-form-2">取消</button>
                <button class="btn btn-sm btn-primary" id="btn-submit-sub-raw" ${subManagerState.submitting ? 'disabled' : ''}>
                  ${subManagerState.submitting ? '<span class="loading loading-spinner loading-xs"></span> 解析导入...' : '批量导入并生效'}
                </button>
              </div>
            </div>
          `}
        </div>
      `;
    }

    // --- Section 3: 规则分流与 DNS 推演 HTML ---
    const simRes = ruleSimulatorState.result;
    const simErr = ruleSimulatorState.error;
    const simLoading = ruleSimulatorState.loading;

    let simOutputHtml = '';
    if (simLoading) {
      simOutputHtml = `
        <div class="p-6 text-center text-xs text-base-content/60 font-mono">
          <span class="loading loading-spinner loading-sm text-primary mb-2"></span>
          <div>正在逐层模拟 Mihomo 规则链与 nameserver-policy...</div>
        </div>
      `;
    } else if (simErr) {
      simOutputHtml = `
        <div class="alert alert-error text-xs py-2.5 px-3 rounded-lg flex items-center justify-between">
          <span>❌ 推演失败: ${escapeHtml(simErr)}</span>
          <button class="btn btn-ghost btn-xs" id="btn-clear-sim">清除</button>
        </div>
      `;
    } else if (simRes && simRes.matched_rule) {
      const mr = simRes.matched_rule;
      const dns = simRes.dns || {};
      const warnings = dns.warnings || [];
      const nameservers = dns.nameservers || [];

      simOutputHtml = `
        <div class="p-4 rounded-xl bg-base-200/60 border border-base-content/10 space-y-3 animate-fadeIn">
          <div class="flex items-center justify-between">
            <span class="font-bold text-xs text-success flex items-center gap-1">
              <span>🎯 规则命中完成</span>
            </span>
            <button class="btn btn-ghost btn-xs btn-circle" id="btn-clear-sim" title="清除结果">✕</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            <div class="p-2.5 rounded-lg bg-base-100 border border-base-content/5">
              <div class="text-[10px] text-base-content/50 uppercase">匹配规则</div>
              <div class="font-bold mt-0.5 text-primary">${escapeHtml(mr.type)}</div>
              <div class="text-xs break-all opacity-80">${escapeHtml(mr.payload || '*')}</div>
            </div>
            <div class="p-2.5 rounded-lg bg-base-100 border border-base-content/5">
              <div class="text-[10px] text-base-content/50 uppercase">出口策略 / 目标</div>
              <div class="font-bold mt-0.5 text-success">${escapeHtml(mr.target || 'DIRECT')}</div>
              <div class="text-[10px] opacity-60">规则行号: #${mr.line_number || '--'}</div>
            </div>
          </div>

          <div class="p-2.5 rounded-lg bg-base-100 border border-base-content/5 text-xs">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] text-base-content/50 uppercase font-mono">DNS 解析策略</span>
              <span class="badge badge-xs badge-neutral font-mono">${escapeHtml(nameservers.join(', ') || '全局默认')}</span>
            </div>
            ${warnings.length > 0 ? `
              <div class="mt-2 p-2 rounded bg-warning/10 border border-warning/30 text-warning-content text-[11px] space-y-1">
                ${warnings.map(w => `<div class="flex items-start gap-1"><span>⚠️</span><span>${escapeHtml(w)}</span></div>`).join('')}
              </div>
            ` : `
              <div class="text-[11px] text-success flex items-center gap-1 mt-1">
                <span>🛡️</span><span>DNS 路由安全，未探测到明文污染风险</span>
              </div>
            `}
          </div>
        </div>
      `;
    } else {
      simOutputHtml = `
        <div class="py-8 px-4 text-center border border-dashed border-base-content/10 rounded-xl text-base-content/50 text-xs">
          输入任意域名或 IP（如 <code>api.openai.com</code> 或 <code>github.com</code>），实时模拟 Mihomo 命中分流规则与 DNS 污染防护。
        </div>
      `;
    }

    // --- 全局组装页面 ---
    viewContainer.innerHTML = `
      <div class="max-w-6xl mx-auto space-y-6 pb-12">
        <!-- 页面顶部 Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-content/10 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-bold tracking-tight">🛠️ 网络工具箱与聚合中心</h1>
              <span class="badge badge-sm badge-outline font-mono text-[10px]">${escapeHtml(getActiveBackendLabel())}</span>
            </div>
            <p class="text-xs text-base-content/60 mt-0.5">
              聚合多机场订阅、毫秒级多源出口 IP 诊断、Mihomo 分流与 DNS 污染实时推演
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-sm btn-ghost gap-1.5 font-normal" id="btn-refresh-all">
              <span>🔄</span> 刷新状态
            </button>
            <a href="#/proxies" class="btn btn-sm btn-outline gap-1 font-normal">
              <span>🚀</span> 节点代理页
            </a>
          </div>
        </div>

        <!-- 顶部全宽卡片: 出口 IP 毫秒级多源竞速看板 -->
        <div class="toolkit-card p-4 sm:p-5">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="text-4xl select-none">${flag}</div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xl font-extrabold tracking-tight">${escapeHtml(ip)}</span>
                  ${egressHeaderBadge}
                </div>
                <div class="text-xs text-base-content/70 mt-1 flex flex-wrap items-center gap-2">
                  <span>${escapeHtml(country)}</span>
                  ${city ? `<span>· ${escapeHtml(city)}</span>` : ''}
                  ${org ? `<span class="opacity-80">· ${escapeHtml(org)}</span>` : ''}
                  ${asn ? `<span class="badge badge-xs badge-ghost font-mono">${escapeHtml(asn)}</span>` : ''}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 self-end md:self-center">
              <button class="btn btn-sm btn-primary gap-1" id="btn-retest-egress" ${egressBadgeState.loading ? 'disabled' : ''}>
                ${egressBadgeState.loading ? '<span class="loading loading-spinner loading-xs"></span>' : '⚡'}
                <span>重新测速</span>
              </button>
              <button class="btn btn-sm btn-ghost" id="btn-toggle-egress-details">
                ${egressBadgeState.showDetails ? '收起明细 ▲' : '竞速明细 ▼'}
              </button>
            </div>
          </div>

          ${egressBadgeState.showDetails ? `
            <div class="mt-4 pt-4 border-t border-base-content/10 animate-fadeIn">
              <div class="text-xs font-bold mb-2 flex items-center justify-between">
                <span>多源并发竞速探针明细</span>
                <span class="text-[10px] text-base-content/50 font-normal">向 4 家权威 IP 数据库并发探针，以最快落地结果呈现</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                ${allResults.map((r) => {
                  const ms = Math.round(r.latency_ms || 0);
                  const ok = r.success;
                  return `
                    <div class="probe-source-badge justify-between ${ok ? '' : 'opacity-60 border-error/30'}">
                      <span class="font-semibold text-[11px]">${escapeHtml(r.source)}</span>
                      <div class="flex items-center gap-1.5">
                        <span class="font-mono ${ok ? 'text-success' : 'text-error'}">${ok ? ms + 'ms' : '失败'}</span>
                        <span class="text-[10px]">${ok ? '✅' : '❌'}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- 页面双栏主体: 订阅中心 (左) + 规则/DNS推演 (右) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- 左侧: 订阅与节点聚合中心 (7 Cols) -->
          <div class="lg:col-span-7 toolkit-card p-4 sm:p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-base-content/10 pb-3">
              <div>
                <div class="font-bold text-sm flex items-center gap-2">
                  <span>🔗 订阅与节点聚合中心</span>
                  <span class="badge badge-sm badge-primary badge-outline font-mono text-[10px]">
                    ${activeSubs} 启用 / ${subs.length} 源
                  </span>
                </div>
                <div class="text-[11px] text-base-content/50 mt-0.5 font-mono">
                  已聚合节点: <span class="font-bold text-primary">${totalNodes}</span> · 输出至 airport-merged-sub.yaml
                </div>
              </div>
              <button class="btn btn-primary btn-xs font-normal" id="btn-toggle-add-sub">
                ${subManagerState.showAddForm ? '✕ 收起' : '+ 添加订阅源'}
              </button>
            </div>

            ${addFormHtml}
            ${subListHtml}

            <div class="p-3 rounded-lg bg-base-200/40 border border-base-content/5 text-[11px] text-base-content/60 flex items-center justify-between">
              <span>💡 提示：聚合后的节点自动挂载进策略组 <code>🌐 订阅导入</code></span>
              <a href="#/proxies" class="link link-primary text-[11px]">去 Proxies 选择节点 ➔</a>
            </div>
          </div>

          <!-- 右侧: 规则分流与 DNS 污染推演模拟器 (5 Cols) -->
          <div class="lg:col-span-5 toolkit-card p-4 sm:p-5 space-y-4">
            <div class="border-b border-base-content/10 pb-3">
              <div class="font-bold text-sm flex items-center gap-2">
                <span>🎯 规则分流与 DNS 污染推演</span>
              </div>
              <div class="text-[11px] text-base-content/50 mt-0.5">
                模拟域名匹配 Mihomo 路由规则链及 nameserver-policy 解析策略
              </div>
            </div>

            <div class="space-y-2">
              <div class="join w-full">
                <input
                  id="toolkit-sim-input"
                  class="input input-sm input-bordered join-item w-full font-mono text-xs"
                  placeholder="测试域名或 IP (如: api.openai.com)"
                  value="${escapeHtml(ruleSimulatorState.input)}"
                />
                <button class="btn btn-sm btn-primary join-item font-normal" id="btn-toolkit-run-sim" ${simLoading ? 'disabled' : ''}>
                  推演
                </button>
              </div>

              <!-- 快捷测试标签 -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                <span class="text-[10px] text-base-content/40 mr-0.5">快捷:</span>
                ${['api.openai.com', 'claude.ai', 'github.com', 'google.com', 'bilibili.com'].map(d => `
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

    // --- 事件绑定 ---
    // 刷新全部
    viewContainer.querySelector('#btn-refresh-all')?.addEventListener('click', () => {
      fetchEgressIp(true);
      fetchSubscriptions();
    });

    // 出口看板按钮
    viewContainer.querySelector('#btn-retest-egress')?.addEventListener('click', () => fetchEgressIp(true));
    viewContainer.querySelector('#btn-toggle-egress-details')?.addEventListener('click', () => {
      egressBadgeState.showDetails = !egressBadgeState.showDetails;
      renderToolkitPage();
    });

    // 订阅操作按钮
    viewContainer.querySelector('#btn-toggle-add-sub')?.addEventListener('click', () => {
      subManagerState.showAddForm = !subManagerState.showAddForm;
      renderToolkitPage();
    });
    viewContainer.querySelector('#btn-empty-add-sub')?.addEventListener('click', () => {
      subManagerState.showAddForm = true;
      renderToolkitPage();
    });
    viewContainer.querySelector('#btn-cancel-add-sub')?.addEventListener('click', () => {
      subManagerState.showAddForm = false;
      renderToolkitPage();
    });
    viewContainer.querySelector('#btn-close-sub-form')?.addEventListener('click', () => {
      subManagerState.showAddForm = false;
      renderToolkitPage();
    });
    viewContainer.querySelector('#btn-close-sub-form-2')?.addEventListener('click', () => {
      subManagerState.showAddForm = false;
      renderToolkitPage();
    });

    // Tab 切换
    viewContainer.querySelector('#tab-mode-url')?.addEventListener('click', () => {
      subManagerState.activeTab = 'url';
      renderToolkitPage();
    });
    viewContainer.querySelector('#tab-mode-raw')?.addEventListener('click', () => {
      subManagerState.activeTab = 'raw';
      renderToolkitPage();
    });

    // 提交订阅 URL
    viewContainer.querySelector('#btn-submit-sub-url')?.addEventListener('click', () => {
      const name = (viewContainer.querySelector('#input-sub-name')?.value || '').trim();
      const url = (viewContainer.querySelector('#input-sub-url')?.value || '').trim();
      const filter = (viewContainer.querySelector('#input-sub-filter')?.value || '').trim();
      if (!name || !url) {
        showToast('请填写订阅名称和 URL', 'info');
        return;
      }
      submitAddSubscription(name, url, filter);
    });

    // 提交粘贴节点
    viewContainer.querySelector('#btn-submit-sub-raw')?.addEventListener('click', () => {
      const name = (viewContainer.querySelector('#input-raw-name')?.value || '').trim();
      const raw = (viewContainer.querySelector('#input-raw-content')?.value || '').trim();
      if (!name || !raw) {
        showToast('请填写前缀名称并粘贴节点链接', 'info');
        return;
      }
      submitImportNodes(name, raw);
    });

    // 订阅列表项操作
    viewContainer.querySelectorAll('.btn-update-sub').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) updateSubscription(id);
      });
    });
    viewContainer.querySelectorAll('.btn-toggle-sub').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const enabled = e.currentTarget.getAttribute('data-enabled') === '1';
        if (id) toggleSubscription(id, !enabled);
      });
    });
    viewContainer.querySelectorAll('.btn-del-sub').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        if (id) deleteSubscription(id, name);
      });
    });

    // 推演模拟操作
    const simInput = viewContainer.querySelector('#toolkit-sim-input');
    const simRunBtn = viewContainer.querySelector('#btn-toolkit-run-sim');
    simRunBtn?.addEventListener('click', () => runRuleSimulation(simInput?.value));
    simInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runRuleSimulation(simInput.value);
    });
    viewContainer.querySelector('#btn-clear-sim')?.addEventListener('click', () => {
      ruleSimulatorState.result = null;
      ruleSimulatorState.error = null;
      renderToolkitPage();
    });
    viewContainer.querySelectorAll('.quick-sim-tag').forEach((tag) => {
      tag.addEventListener('click', (e) => {
        const domain = e.currentTarget.getAttribute('data-domain');
        if (domain) {
          if (simInput) simInput.value = domain;
          runRuleSimulation(domain);
        }
      });
    });
  }

  // ==========================================
  // 6. 路由管理与页面切换调度 (严格幂等，避免无谓重绘)
  // ==========================================
  let lastRouteWasToolkit = false;
  function syncRouteView() {
    const isToolkit = isToolkitRoute();

    // 查找主内容区域
    const homePage = document.querySelector('.home-page');
    let mainArea = null;
    if (homePage) {
      mainArea = homePage.querySelector('.flex-1') || homePage.lastElementChild;
    }

    let toolkitView = document.getElementById('zashboard-toolkit-view');

    if (isToolkit) {
      if (mainArea) {
        // 只在初次切入或子元素未隐藏时遍历
        if (!lastRouteWasToolkit || (toolkitView && toolkitView.style.display === 'none')) {
          Array.from(mainArea.children).forEach((child) => {
            if (child.id !== 'zashboard-toolkit-view') {
              child.style.display = 'none';
            }
          });
        }

        if (!toolkitView) {
          toolkitView = document.createElement('div');
          toolkitView.id = 'zashboard-toolkit-view';
          toolkitView.className = 'p-4 md:p-6 bg-base-100 text-base-content';
          mainArea.appendChild(toolkitView);
          // 初次进入拉取数据
          fetchEgressIp(false);
          fetchSubscriptions();
        }
        toolkitView.style.display = 'block';
        if (!lastRouteWasToolkit) {
          renderToolkitPage();
        }
      }
      lastRouteWasToolkit = true;
    } else {
      // 切回原生页面（如 Overview, Proxies, Rules 等）
      if (lastRouteWasToolkit) {
        if (toolkitView) {
          toolkitView.style.display = 'none';
        }
        if (mainArea) {
          Array.from(mainArea.children).forEach((child) => {
            if (child.id !== 'zashboard-toolkit-view') {
              if (child.style.display === 'none') {
                child.style.display = '';
              }
            }
          });
        }
        lastRouteWasToolkit = false;
      }
    }

    // 侧边栏 Item 的 active 样式同步
    syncSidebarActive(isToolkit);
  }

  // ==========================================
  // 7. 侧边栏导航注入
  // ==========================================
  function syncSidebarActive(isToolkit) {
    const sidebarItem = document.getElementById('sidebar-item-toolkit');
    if (!sidebarItem) return;
    const a = sidebarItem.querySelector('a');
    if (!a) return;

    const activeCls = 'sidebar-tab-active justify-center relative z-10 py-2';
    const inactiveCls = 'hover:bg-base-300! justify-center relative z-10 py-2';

    if (isToolkit) {
      if (a.className !== activeCls) {
        a.className = activeCls;
      }
      // 移除原生菜单项的激活类，避免双高亮
      document.querySelectorAll('ul.sidebar-route-menu > li:not(#sidebar-item-toolkit) a.sidebar-tab-active').forEach((el) => {
        el.className = inactiveCls;
      });
    } else {
      if (a.className !== inactiveCls) {
        a.className = inactiveCls;
      }
    }
  }

  function injectSidebarItem() {
    const menuUl = document.querySelector('ul.sidebar-route-menu');
    if (!menuUl) return;

    let item = document.getElementById('sidebar-item-toolkit');
    if (!item) {
      item = document.createElement('li');
      item.id = 'sidebar-item-toolkit';
      item.className = '';
      item.innerHTML = `
        <a class="hover:bg-base-300! justify-center relative z-10 py-2" title="网络工具箱 (订阅聚合/出口诊断/分流推演)" href="#/toolkit">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        </a>
      `;
      item.querySelector('a')?.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = '#/toolkit';
      });

      // 插入在设置（通常是最后一个）之前，或直接追加
      const lastLi = menuUl.lastElementChild;
      if (lastLi && menuUl.children.length >= 4) {
        menuUl.insertBefore(item, lastLi);
      } else {
        menuUl.appendChild(item);
      }
    }

    syncSidebarActive(isToolkitRoute());
  }

  // ==========================================
  // 8. #/rules 页面保留的自定义规则管理 Modal
  // ==========================================
  async function fetchUserRules() {
    userRulesState.loading = true;
    try {
      const apiEndpoint = getPanelApiBase('user-rules');
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      userRulesState.rules = data.rules || [];
      userRulesState.targets = data.targets || ['DIRECT', 'REJECT', 'GLOBAL'];
    } catch (e) {
      showToast('拉取自定义规则失败: ' + e.message, 'error');
    } finally {
      userRulesState.loading = false;
      if (userRulesState.showModal && userRulesState.viewMode !== 'add') {
        renderModal();
      }
    }
  }

  async function saveUserRule(type, payload, target) {
    try {
      const apiEndpoint = getPanelApiBase('user-rules');
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ type, payload, target, enabled: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('✅ 规则保存成功并已热重载生效！', 'success');
        if (data.rule) {
          userRulesState.rules = [data.rule, ...userRulesState.rules.filter((r) => r.id !== data.rule.id)];
        }
        userRulesState.viewMode = 'list';
        renderModal();
        fetchUserRules();
      } else {
        showToast('保存失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('请求异常: ' + e.message, 'error');
    }
  }

  async function deleteUserRule(ruleId) {
    try {
      const apiEndpoint = getPanelApiBase('user-rules') + '/' + encodeURIComponent(ruleId);
      const res = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('规则已删除并热重载生效', 'info');
        await fetchUserRules();
      } else {
        showToast('删除失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('删除异常: ' + e.message, 'error');
    }
  }

  function renderModal() {
    let modalEl = document.getElementById('user-rules-manager-modal');
    if (!userRulesState.showModal) {
      if (modalEl) modalEl.remove();
      return;
    }

    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'user-rules-manager-modal';
      modalEl.className = 'user-rules-modal-backdrop';
      modalEl.onclick = (e) => {
        if (e.target === modalEl) {
          userRulesState.showModal = false;
          renderModal();
        }
      };
      document.body.appendChild(modalEl);
    }

    const isAdd = userRulesState.viewMode === 'add';
    modalEl.innerHTML = `
      <div class="user-rules-modal-content">
        <div class="user-rules-modal-header">
          <div class="flex items-center gap-2">
            <span class="text-lg">🛡️</span>
            <h3 class="font-bold text-sm">用户自定义分流规则</h3>
          </div>
          <button class="btn btn-ghost btn-xs btn-circle" id="btn-close-modal">✕</button>
        </div>
        <div class="user-rules-modal-body">
          ${isAdd ? `
            <div class="space-y-4">
              <div>
                <label class="label"><span class="label-text text-xs">规则类型 (Type)</span></label>
                <select class="select select-bordered select-sm w-full font-mono text-xs" id="modal-rule-type">
                  <option value="DOMAIN-SUFFIX">DOMAIN-SUFFIX (域名后缀)</option>
                  <option value="DOMAIN">DOMAIN (精确域名)</option>
                  <option value="DOMAIN-KEYWORD">DOMAIN-KEYWORD (域名关键字)</option>
                  <option value="IP-CIDR">IP-CIDR (目标 IP 段)</option>
                </select>
              </div>
              <div>
                <label class="label"><span class="label-text text-xs">匹配内容 (Payload)</span></label>
                <input class="input input-bordered input-sm w-full font-mono text-xs" id="modal-rule-payload" placeholder="例如: example.com 或 1.1.1.1/32" />
              </div>
              <div>
                <label class="label"><span class="label-text text-xs">出口目标 / 策略组 (Target)</span></label>
                <select class="select select-bordered select-sm w-full font-mono text-xs" id="modal-rule-target">
                  ${userRulesState.targets.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                </select>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button class="btn btn-ghost btn-sm" id="btn-cancel-add">返回列表</button>
                <button class="btn btn-primary btn-sm" id="btn-save-rule">保存并生效</button>
              </div>
            </div>
          ` : `
            <div>
              <div class="flex justify-between items-center mb-3">
                <span class="text-xs opacity-70">共 ${userRulesState.rules.length} 条自定义规则</span>
                <button class="btn btn-primary btn-xs" id="btn-go-add">+ 新增规则</button>
              </div>
              ${userRulesState.loading ? `
                <div class="py-8 text-center text-xs opacity-60">加载中...</div>
              ` : userRulesState.rules.length === 0 ? `
                <div class="py-8 text-center text-xs opacity-50 border border-dashed rounded-lg">暂无自定义规则</div>
              ` : `
                <div class="space-y-2">
                  ${userRulesState.rules.map((r) => `
                    <div class="p-2.5 rounded-lg bg-base-200 flex items-center justify-between gap-2 text-xs font-mono">
                      <div class="flex items-center gap-2 overflow-hidden">
                        <span class="badge badge-sm badge-outline">${escapeHtml(r.type)}</span>
                        <span class="font-bold truncate">${escapeHtml(r.payload)}</span>
                        <span class="opacity-50">➔</span>
                        <span class="badge badge-sm badge-neutral">${escapeHtml(r.target)}</span>
                      </div>
                      <button class="btn btn-ghost btn-xs text-error btn-del-rule" data-id="${escapeHtml(r.id)}">删除</button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    `;

    modalEl.querySelector('#btn-close-modal')?.addEventListener('click', () => {
      userRulesState.showModal = false;
      renderModal();
    });
    modalEl.querySelector('#btn-go-add')?.addEventListener('click', () => {
      userRulesState.viewMode = 'add';
      renderModal();
    });
    modalEl.querySelector('#btn-cancel-add')?.addEventListener('click', () => {
      userRulesState.viewMode = 'list';
      renderModal();
    });
    modalEl.querySelector('#btn-save-rule')?.addEventListener('click', () => {
      const type = modalEl.querySelector('#modal-rule-type')?.value;
      const payload = (modalEl.querySelector('#modal-rule-payload')?.value || '').trim();
      const target = modalEl.querySelector('#modal-rule-target')?.value;
      if (!payload) {
        showToast('请填写匹配内容', 'info');
        return;
      }
      saveUserRule(type, payload, target);
    });
    modalEl.querySelectorAll('.btn-del-rule').forEach((b) => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) deleteUserRule(id);
      });
    });
  }

  function createRulesButton() {
    const btn = document.createElement('button');
    btn.id = 'user-rules-top-action-btn';
    btn.className = 'btn btn-sm btn-ghost gap-1.5 border border-base-content/20 font-normal';
    btn.innerHTML = `<span>🛡️</span><span class="hidden sm:inline">自定义规则</span>`;
    btn.onclick = () => {
      userRulesState.showModal = true;
      userRulesState.viewMode = 'list';
      renderModal();
      fetchUserRules();
    };
    return btn;
  }

  function injectRulesPageButton() {
    if (!location.hash.startsWith('#/rules')) {
      const b = document.getElementById('user-rules-top-action-btn');
      if (b) b.remove();
      return;
    }

    if (document.getElementById('user-rules-top-action-btn')) return;

    // 优先锚点：搜索输入框
    const searchInput = Array.from(document.querySelectorAll('input')).find((i) => {
      const ph = i.getAttribute('placeholder') || '';
      return ph.includes('Regex') || ph.includes('搜索') || ph.includes('Search');
    });

    if (!searchInput) return;

    // 找齿轮按钮行
    let row = searchInput.parentElement;
    let gearBtn = null;
    while (row && row !== document.body) {
      const btns = Array.from(row.querySelectorAll('button.btn-circle.btn-sm'));
      if (btns.length > 0) {
        gearBtn = btns[btns.length - 1];
        break;
      }
      row = row.parentElement;
    }

    const btn = createRulesButton();
    if (gearBtn) {
      gearBtn.insertAdjacentElement('beforebegin', btn);
    } else if (searchInput.parentElement) {
      searchInput.parentElement.insertAdjacentElement('afterbegin', btn);
    }
  }

  // ==========================================
  // 9. 节点切换检测与自愈
  // ==========================================
  function checkBackendChange() {
    try {
      const active = getActiveBackend();
      if (!active) return;
      if (userRulesState.lastActiveUuid && userRulesState.lastActiveUuid !== active.uuid) {
        // 节点发生切换，重刷状态
        egressBadgeState.data = null;
        egressBadgeState.lastChecked = 0;
        fetchEgressIp(true);
        if (isToolkitRoute()) {
          fetchSubscriptions();
        }
      }
      userRulesState.lastActiveUuid = active.uuid;
    } catch (_) {}
  }

  // ==========================================
  // 10. 全局调度主循环 (纯驱动，彻底移除死循环 MutationObserver)
  // ==========================================
  let isLoopRunning = false;
  function mainLoop() {
    if (isLoopRunning) return;
    isLoopRunning = true;
    try {
      checkBackendChange();
      injectSidebarItem();
      injectFloatingEgressPill();
      syncRouteView();
      injectRulesPageButton();
    } finally {
      isLoopRunning = false;
    }
  }

  window.addEventListener('hashchange', mainLoop);
  setInterval(mainLoop, 500);

  // 页面就绪后立即触发
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainLoop);
  } else {
    mainLoop();
  }
})();
