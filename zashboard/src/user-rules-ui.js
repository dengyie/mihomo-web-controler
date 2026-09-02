// zashboard 自定义规则管理、独立工具箱子页面与网络聚合套件
// 源码: zashboard/src/user-rules-ui.js
// 构建脚本: scripts/build-ui.mjs -> zashboard/dist/assets/user-rules-ui.js
(function () {
  'use strict';

  // ==========================================
  // Awesome UI Kit: 标准原子图标库 (UiIcon)
  // 严禁使用 Emoji / 临时 Unicode 字符
  // ==========================================
  const ICONS = {
    'arrow-down': '<path d="m6 9 6 6 6-6"/>',
    'arrow-left': '<path d="m15 6-6 6 6 6"/>',
    'arrow-right': '<path d="m9 6 6 6-6 6"/>',
    'arrow-up': '<path d="m6 15 6-6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-left': '<path d="m14 6-6 6 6 6"/>',
    'chevron-right': '<path d="m10 6 6 6-6 6"/>',
    'circle-x': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    code: '<path d="m8 9-3 3 3 3m8-6 3 3-3 3M14 5l-4 14"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    'external-link': '<path d="M14 5h5v5M19 5l-8 8M19 14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    loader: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4L3 10m0-5v5h5M4 13a8 8 0 0 0 14.5 4L21 14m0 5v-5h-5"/>',
    shield: '<path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21 12 12 0 0 1 3.5 6 12 12 0 0 0 12 3Z"/>',
    sparkles: '<path d="m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-2.7-.7-.7-2.7 2.2-2.2Z"/>',
    trash: '<path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"/>',
    'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };

  function escapeAttribute(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function uiIcon(name, { size = 16, strokeWidth = 1.8, label = '', className = '' } = {}) {
    const aria = label ? `aria-label="${escapeAttribute(label)}"` : 'aria-hidden="true"';
    return `<svg width="${escapeAttribute(size)}" height="${escapeAttribute(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${escapeAttribute(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" class="${escapeAttribute(className)}" ${aria}>${ICONS[name] || ''}</svg>`;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    rules: [],
    loading: false,
  };

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
  // API 请求函数
  // ==========================================
  async function fetchEgressIp(force = false) {
    const now = Date.now();
    if (!force && egressBadgeState.data && now - egressBadgeState.lastFetched < 180000) {
      return;
    }
    egressBadgeState.loading = true;
    renderToolkitSubpage();

    try {
      const resp = await fetch(`${getApiBase()}/diagnostics/egress-ip`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
      renderToolkitSubpage();
    }
  }

  async function fetchSubscriptions() {
    subscriptionState.loading = true;
    renderToolkitSubpage();

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
      renderToolkitSubpage();
    }
  }

  async function addSubscriptionUrl(name, url, excludeFilter) {
    subscriptionState.actionInProgress = 'add-sub';
    renderToolkitSubpage();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, url, exclude_filter: excludeFilter }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      subscriptionState.addFormVisible = false;
      subscriptionState.subInputName = '';
      subscriptionState.subInputUrl = '';
      subscriptionState.subInputFilter = '';
      await fetchSubscriptions();
    } catch (err) {
      alert('添加订阅失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitSubpage();
    }
  }

  async function importRawNodes(name, content) {
    subscriptionState.actionInProgress = 'import-nodes';
    renderToolkitSubpage();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/import-nodes`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, content }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      subscriptionState.addFormVisible = false;
      subscriptionState.nodesInputName = '';
      subscriptionState.nodesInputContent = '';
      await fetchSubscriptions();
    } catch (err) {
      alert('导入节点失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitSubpage();
    }
  }

  async function updateSubscription(subId) {
    subscriptionState.actionInProgress = `update-${subId}`;
    renderToolkitSubpage();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      await fetchSubscriptions();
    } catch (err) {
      alert('更新订阅失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitSubpage();
    }
  }

  async function toggleSubscription(subId, enabled) {
    subscriptionState.actionInProgress = `toggle-${subId}`;
    renderToolkitSubpage();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      await fetchSubscriptions();
    } catch (err) {
      alert('切换状态失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitSubpage();
    }
  }

  async function deleteSubscription(subId, name) {
    if (!confirm(`确定要删除订阅源 "${name}" 吗？其聚合节点将被同步移除。`)) return;
    subscriptionState.actionInProgress = `delete-${subId}`;
    renderToolkitSubpage();
    try {
      const resp = await fetch(`${getApiBase()}/subscriptions/${encodeURIComponent(subId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await resp.json();
      if (!resp.ok || json.status !== 'ok') throw new Error(json.error || `HTTP ${resp.status}`);
      await fetchSubscriptions();
    } catch (err) {
      alert('删除失败: ' + err.message);
    } finally {
      subscriptionState.actionInProgress = null;
      renderToolkitSubpage();
    }
  }

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
    renderToolkitSubpage();

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
      renderToolkitSubpage();
    }
  }

  // ==========================================
  // 子页面视图管理与原生切换 (View Switcher)
  // ==========================================
  function isToolkitRoute() {
    const h = location.hash || '';
    return h.includes('tab=toolkit') || h.startsWith('#/toolkit') || h.startsWith('#/subscriptions');
  }

  function syncToolkitView() {
    const isToolkit = isToolkitRoute();
    const homePage = document.querySelector('.home-page');
    if (!homePage || homePage.children.length < 2) return;

    // 主内容区为 homePage 的第二个直接子元素 (relative flex-1 overflow-hidden)
    const mainContainer = homePage.children[1];
    let toolkitPage = document.getElementById('zashboard-toolkit-page');

    if (isToolkit) {
      // 隐藏原生页面（Overview / Proxies / Rules 等）的所有子 DOM
      Array.from(mainContainer.children).forEach((child) => {
        if (child.id !== 'zashboard-toolkit-page') {
          child.style.display = 'none';
        }
      });

      if (!toolkitPage) {
        toolkitPage = document.createElement('div');
        toolkitPage.id = 'zashboard-toolkit-page';
        toolkitPage.className = 'absolute flex h-full w-full flex-col overflow-y-auto bg-base-100/50 p-4 md:p-6 custom-scrollbar';
        mainContainer.appendChild(toolkitPage);
        fetchEgressIp(false);
        fetchSubscriptions();
      }
      toolkitPage.style.display = 'flex';
      renderToolkitSubpage();
    } else {
      // 切回原生页面时，隐藏工具箱子页面，还原原生页面
      if (toolkitPage) {
        toolkitPage.style.display = 'none';
      }
      Array.from(mainContainer.children).forEach((child) => {
        if (child.id !== 'zashboard-toolkit-page') {
          if (child.style.display === 'none') {
            child.style.display = '';
          }
        }
      });
    }

    syncSidebarActive(isToolkit);
  }

  // ==========================================
  // 侧边栏菜单项注入与指示器高亮同步
  // ==========================================
  function injectSidebarItem() {
    const menuUl = document.querySelector('ul.sidebar-route-menu');
    if (!menuUl) return;

    let item = document.getElementById('sidebar-item-toolkit');
    if (!item) {
      item = document.createElement('li');
      item.id = 'sidebar-item-toolkit';
      item.setAttribute('data-sidebar-route', 'toolkit');
      item.innerHTML = `
        <a class="hover:bg-base-300! justify-center relative z-10 py-2" title="网络工具箱 (订阅聚合/出口诊断/分流推演)" href="#/proxies?tab=toolkit">
          ${uiIcon('tool', { size: 20 })}
        </a>
      `;

      // 捕获阶段拦截点击，阻止原生 Vue Router 冒泡覆盖 hash
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        location.hash = '#/proxies?tab=toolkit';
        syncToolkitView();
      }, true);

      // 插入在设置（最后一个）之前
      const lastLi = menuUl.lastElementChild;
      if (lastLi && menuUl.children.length >= 4) {
        menuUl.insertBefore(item, lastLi);
      } else {
        menuUl.appendChild(item);
      }
    }

    syncSidebarActive(isToolkitRoute());
  }

  function syncSidebarActive(isToolkit) {
    const item = document.getElementById('sidebar-item-toolkit');
    if (!item) return;
    const a = item.querySelector('a');
    const indicator = document.querySelector('.sidebar-tab-indicator');

    if (isToolkit) {
      if (a) a.className = 'sidebar-tab-active justify-center relative z-10 py-2';
      // 移除原生菜单项的 active 类
      document.querySelectorAll('ul.sidebar-route-menu > li:not(#sidebar-item-toolkit) a.sidebar-tab-active').forEach((el) => {
        el.className = 'hover:bg-base-300! justify-center relative z-10 py-2';
      });

      // 动态同步滑块指示器位置 (每个 li 占 36px 高度)
      if (indicator) {
        const itemRect = item.getBoundingClientRect();
        const menuRect = item.parentElement.getBoundingClientRect();
        const topOffset = Math.round(itemRect.top - menuRect.top + 8);
        indicator.style.transform = `translate3d(8px, ${topOffset}px, 0px)`;
        indicator.style.height = '36px';
        indicator.style.opacity = '1';
        indicator.style.width = '56px';
      }
    } else {
      if (a) a.className = 'hover:bg-base-300! justify-center relative z-10 py-2';
    }
  }

  // ==========================================
  // 渲染原生风格的独立子页面 (Subpage Rendering)
  // ==========================================
  function renderToolkitSubpage() {
    const pageContainer = document.getElementById('zashboard-toolkit-page');
    if (!pageContainer || pageContainer.style.display === 'none') return;

    // 1. 出口 IP 视图构建
    const fastest = egressBadgeState.data?.fastest;
    const ipData = fastest?.data;
    const latency = fastest?.latency_ms ? Math.round(fastest.latency_ms) : null;
    const isEgressLoading = egressBadgeState.loading;

    let egressCardHtml = `
      <div class="card bg-base-200/60 border border-base-300 shadow-sm p-5 mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
              ${uiIcon('globe', { size: 28 })}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xl font-bold font-mono tracking-tight">${escapeHtml(ipData?.ip || (isEgressLoading ? '正在多源竞速测速...' : '未获取到有效出口'))}</span>
                ${latency != null ? `<span class="badge badge-sm badge-success font-mono font-bold">${latency}ms</span>` : ''}
              </div>
              <p class="text-xs text-base-content/60 mt-0.5">
                ${escapeHtml(ipData?.country || '')} ${escapeHtml(ipData?.city || '')}
                ${ipData?.org ? `· <span class="font-mono text-base-content/80">${escapeHtml(ipData.org)}</span>` : ''}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end sm:self-auto">
            <button class="btn btn-sm btn-outline gap-1.5 font-normal" id="btn-reprobe-egress" ${isEgressLoading ? 'disabled' : ''}>
              ${isEgressLoading ? '<span class="loading loading-spinner loading-xs"></span>' : uiIcon('refresh', { size: 14 })} 重新测速
            </button>
            <button class="btn btn-sm btn-ghost text-base-content/60 gap-1 font-normal" id="btn-toggle-egress-details">
              竞速明细 ${uiIcon('chevron-down', { size: 14 })}
            </button>
          </div>
        </div>

        <div id="egress-details-container" class="hidden mt-4 pt-4 border-t border-base-300/60">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            ${(egressBadgeState.data?.probes || []).map(p => `
              <div class="p-3 rounded-lg bg-base-100 border border-base-300/60 shadow-xs">
                <div class="flex justify-between font-bold mb-1">
                  <span class="text-base-content/80">${escapeHtml(p.source)}</span>
                  <span class="${p.success ? 'text-success' : 'text-error'}">${p.success ? `${Math.round(p.latency_ms)}ms` : '失败'}</span>
                </div>
                <div class="text-[11px] text-base-content/60 truncate">${escapeHtml(p.ip || p.error || 'N/A')}</div>
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
          <td colspan="4" class="text-center py-8 text-base-content/40 text-xs">
            暂无已导入订阅源，点击上方 "+ 添加订阅源" 快速添加
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
          <tr class="hover:bg-base-200/40 transition-colors">
            <td>
              <div class="font-bold text-xs">${escapeHtml(s.name)}</div>
              <div class="text-[10px] text-base-content/40 truncate max-w-xs font-mono mt-0.5">${escapeHtml(s.url || (s.type === 'raw' ? '单节点批量导入' : '本地源'))}</div>
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
                <button class="btn btn-xs btn-ghost sub-btn-update" data-id="${escapeHtml(s.id)}" title="更新拉取" ${isUpdating ? 'disabled' : ''}>
                  ${isUpdating ? '<span class="loading loading-spinner loading-xs"></span>' : uiIcon('refresh', { size: 13 })}
                </button>
              ` : ''}
              <button class="btn btn-xs btn-ghost sub-btn-toggle" data-id="${escapeHtml(s.id)}" data-enabled="${s.enabled}" title="${s.enabled ? '暂停' : '启用'}" ${isToggling ? 'disabled' : ''}>
                ${uiIcon(s.enabled ? 'pause' : 'play', { size: 13 })}
              </button>
              <button class="btn btn-xs btn-ghost text-error sub-btn-delete" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" title="删除" ${isDeleting ? 'disabled' : ''}>
                ${uiIcon('trash', { size: 13 })}
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
        <div class="bg-base-200/80 p-4 rounded-xl border border-base-300 mb-4 space-y-3 shadow-xs">
          <div class="flex items-center justify-between">
            <div class="tabs tabs-boxed bg-base-100 p-0.5">
              <a class="tab tab-xs gap-1.5 ${isSubTab ? 'tab-active' : ''}" id="tab-switch-sub">
                ${uiIcon('link', { size: 13 })} Clash 订阅链接
              </a>
              <a class="tab tab-xs gap-1.5 ${!isSubTab ? 'tab-active' : ''}" id="tab-switch-nodes">
                ${uiIcon('layers', { size: 13 })} 节点分享链接导入
              </a>
            </div>
            <button class="btn btn-xs btn-ghost gap-1" id="btn-cancel-add-sub">${uiIcon('x', { size: 13 })} 取消</button>
          </div>

          ${isSubTab ? `
            <div class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input id="input-sub-name" class="input input-sm input-bordered" placeholder="订阅名称 (如: 某某机场)" value="${escapeHtml(subscriptionState.subInputName)}" />
                <input id="input-sub-filter" class="input input-sm input-bordered sm:col-span-2" placeholder="排除正则 (默认已过滤公告/重置/到期)" value="${escapeHtml(subscriptionState.subInputFilter)}" />
                <input id="input-sub-url" class="input input-sm input-bordered sm:col-span-3" placeholder="https://airport.com/api/v1/client/subscribe?token=..." value="${escapeHtml(subscriptionState.subInputUrl)}" />
              </div>
              <div class="flex justify-end">
                <button class="btn btn-sm btn-primary gap-1 font-normal" id="btn-submit-add-sub" ${subscriptionState.actionInProgress === 'add-sub' ? 'disabled' : ''}>
                  ${subscriptionState.actionInProgress === 'add-sub' ? '<span class="loading loading-spinner loading-xs"></span>' : uiIcon('check', { size: 14 })} 拉取并挂载
                </button>
              </div>
            </div>
          ` : `
            <div class="space-y-3">
              <input id="input-nodes-name" class="input input-sm input-bordered w-full" placeholder="前缀别名 (如: 自建香港)" value="${escapeHtml(subscriptionState.nodesInputName)}" />
              <textarea id="input-nodes-content" class="textarea textarea-sm textarea-bordered w-full font-mono text-xs" rows="3" placeholder="支持批量粘贴: ss://, vmess://, vless://, trojan://, hy2://">${escapeHtml(subscriptionState.nodesInputContent)}</textarea>
              <div class="flex justify-end">
                <button class="btn btn-sm btn-primary gap-1 font-normal" id="btn-submit-import-nodes" ${subscriptionState.actionInProgress === 'import-nodes' ? 'disabled' : ''}>
                  ${subscriptionState.actionInProgress === 'import-nodes' ? '<span class="loading loading-spinner loading-xs"></span>' : uiIcon('check', { size: 14 })} 解析并导入
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
        <div class="p-6 text-center text-xs text-base-content/60">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          <div class="mt-2">正在逐层模拟分流匹配与回溯 nameserver policy...</div>
        </div>
      `;
    } else if (simError) {
      simOutputHtml = `
        <div class="alert alert-error text-xs py-2.5 gap-2">
          ${uiIcon('circle-x', { size: 16, className: 'shrink-0' })}
          <span>推演失败: ${escapeHtml(simError)}</span>
        </div>
      `;
    } else if (simResult) {
      const match = simResult.matched_rule;
      const dns = simResult.dns;
      const warnings = dns?.warnings || [];

      simOutputHtml = `
        <div class="p-4 bg-base-100 rounded-xl border border-base-300 space-y-3 text-xs shadow-xs">
          <div class="flex items-center justify-between border-b border-base-300/60 pb-2.5">
            <span class="text-base-content/60">分流策略匹配:</span>
            <span class="badge badge-success font-bold font-mono">${escapeHtml(match?.target || 'DIRECT')}</span>
          </div>
          <div>
            <span class="text-base-content/50 block mb-1">命中规则链条:</span>
            <div class="font-mono text-[11px] bg-base-200 p-2 rounded-lg truncate">
              ${escapeHtml(match?.raw || 'MATCH (Fallback)')}
            </div>
          </div>
          ${warnings.length > 0 ? `
            <div class="alert alert-warning py-2 px-3 text-[11px] rounded-lg gap-2">
              ${uiIcon('alert-triangle', { size: 15, className: 'shrink-0' })}
              <span>${escapeHtml(warnings[0])}</span>
            </div>
          ` : `
            <div class="flex items-center gap-1.5 text-[11px] text-success">
              ${uiIcon('check-circle', { size: 14, className: 'shrink-0' })}
              <span>DNS 策略安全，未检测到境内明文解析污染</span>
            </div>
          `}
        </div>
      `;
    }

    // 4. 装配子页面主结构
    pageContainer.innerHTML = `
      <div class="max-w-6xl w-full mx-auto space-y-6 pb-12">
        <!-- 页面顶部 Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-300 pb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-primary/10 text-primary">
              ${uiIcon('tool', { size: 22 })}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-lg font-bold tracking-tight">网络工具箱与聚合中心</h1>
                <span class="badge badge-sm badge-outline font-mono">${escapeHtml(activeBackendUuid.replace('backend-', '').replace('-default', ''))}</span>
              </div>
              <p class="text-xs text-base-content/60 mt-0.5">多源出口竞速诊断 · 订阅与单节点多协议聚合 · 规则分流与 DNS 污染推演</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-sm btn-ghost gap-1.5 font-normal" id="btn-refresh-all-toolkit">
              ${uiIcon('refresh', { size: 14 })} 刷新数据
            </button>
            <a href="#/proxies" class="btn btn-sm btn-outline gap-1.5 font-normal">
              ${uiIcon('arrow-left', { size: 14 })} 节点代理页
            </a>
          </div>
        </div>

        <!-- 顶部全宽出口 IP 看板 -->
        ${egressCardHtml}

        <!-- 左右并列卡片 Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- 左栏：订阅与节点中心 -->
          <div class="card bg-base-200/60 border border-base-300 shadow-sm p-5 flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                ${uiIcon('link', { size: 18, className: 'text-primary' })}
                <span class="font-bold text-sm">订阅与节点聚合中心</span>
                ${isSubLoading ? '<span class="loading loading-spinner loading-xs text-primary"></span>' : ''}
              </div>
              <button class="btn btn-xs btn-primary font-normal gap-1" id="btn-show-add-sub">
                ${uiIcon('plus', { size: 13 })} 添加订阅源
              </button>
            </div>

            ${subAddFormHtml}

            <div class="overflow-x-auto flex-1 custom-scrollbar">
              <table class="table table-xs w-full">
                <thead>
                  <tr class="text-base-content/60 border-b border-base-300">
                    <th>订阅别名 / 来源</th>
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

          <!-- 右栏：规则推演与 DNS 污染模拟器 -->
          <div class="card bg-base-200/60 border border-base-300 shadow-sm p-5 flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              ${uiIcon('target', { size: 18, className: 'text-primary' })}
              <span class="font-bold text-sm">规则分流与 DNS 污染推演模拟器</span>
            </div>

            <div class="space-y-3 mb-4">
              <div class="join w-full">
                <input
                  id="toolkit-sim-input"
                  class="input input-sm input-bordered join-item w-full font-mono text-xs"
                  placeholder="测试域名或 IP (如: api.openai.com)"
                  value="${escapeHtml(ruleSimulatorState.input)}"
                />
                <button class="btn btn-sm btn-primary join-item font-normal gap-1" id="btn-toolkit-run-sim" ${simLoading ? 'disabled' : ''}>
                  ${simLoading ? '<span class="loading loading-spinner loading-xs"></span>' : ''} 推演
                </button>
              </div>

              <!-- 快捷测试标签 -->
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[10px] text-base-content/40">快捷:</span>
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

    // 绑定交互事件
    pageContainer.querySelector('#btn-refresh-all-toolkit')?.addEventListener('click', () => {
      fetchEgressIp(true);
      fetchSubscriptions();
    });

    pageContainer.querySelector('#btn-reprobe-egress')?.addEventListener('click', () => fetchEgressIp(true));
    pageContainer.querySelector('#btn-toggle-egress-details')?.addEventListener('click', () => {
      const container = pageContainer.querySelector('#egress-details-container');
      if (container) container.classList.toggle('hidden');
    });

    pageContainer.querySelector('#btn-show-add-sub')?.addEventListener('click', () => {
      subscriptionState.addFormVisible = !subscriptionState.addFormVisible;
      renderToolkitSubpage();
    });
    pageContainer.querySelector('#btn-cancel-add-sub')?.addEventListener('click', () => {
      subscriptionState.addFormVisible = false;
      renderToolkitSubpage();
    });

    pageContainer.querySelector('#tab-switch-sub')?.addEventListener('click', () => {
      subscriptionState.activeTab = 'sub';
      renderToolkitSubpage();
    });
    pageContainer.querySelector('#tab-switch-nodes')?.addEventListener('click', () => {
      subscriptionState.activeTab = 'nodes';
      renderToolkitSubpage();
    });

    pageContainer.querySelector('#btn-submit-add-sub')?.addEventListener('click', () => {
      const name = pageContainer.querySelector('#input-sub-name')?.value.trim();
      const url = pageContainer.querySelector('#input-sub-url')?.value.trim();
      const filter = pageContainer.querySelector('#input-sub-filter')?.value.trim();
      if (!name || !url) {
        alert('请完整填写订阅名称与 URL');
        return;
      }
      addSubscriptionUrl(name, url, filter);
    });

    pageContainer.querySelector('#btn-submit-import-nodes')?.addEventListener('click', () => {
      const name = pageContainer.querySelector('#input-nodes-name')?.value.trim();
      const content = pageContainer.querySelector('#input-nodes-content')?.value.trim();
      if (!name || !content) {
        alert('请填写别名前缀并粘贴节点分享链接');
        return;
      }
      importRawNodes(name, content);
    });

    pageContainer.querySelectorAll('.sub-btn-update').forEach(btn => {
      btn.addEventListener('click', () => updateSubscription(btn.dataset.id));
    });
    pageContainer.querySelectorAll('.sub-btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => toggleSubscription(btn.dataset.id, btn.dataset.enabled !== 'true'));
    });
    pageContainer.querySelectorAll('.sub-btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteSubscription(btn.dataset.id, btn.dataset.name));
    });

    const simInput = pageContainer.querySelector('#toolkit-sim-input');
    const simBtn = pageContainer.querySelector('#btn-toolkit-run-sim');
    simBtn?.addEventListener('click', () => runRuleSimulation(simInput?.value));
    simInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runRuleSimulation(simInput.value);
    });

    pageContainer.querySelectorAll('.quick-sim-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        if (simInput) simInput.value = tag.dataset.domain;
        runRuleSimulation(tag.dataset.domain);
      });
    });
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
    btn.innerHTML = `${uiIcon('shield', { size: 14 })} 自定义规则`;
    btn.addEventListener('click', openUserRulesModal);
    topBar.appendChild(btn);
  }

  function openUserRulesModal() {
    let modal = document.getElementById('user-rules-manager-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'user-rules-manager-modal';
      modal.className = 'modal modal-bottom sm:modal-middle';
      modal.innerHTML = `
        <div class="modal-box max-w-4xl w-11/12 p-4 md:p-6 bg-base-100 text-base-content border border-base-300 shadow-2xl">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" id="btn-close-rules-modal" aria-label="关闭">
            ${uiIcon('x', { size: 16 })}
          </button>
          <div class="flex items-center justify-between border-b border-base-300 pb-3 mb-4">
            <div class="flex items-center gap-1.5 font-bold text-base">
              ${uiIcon('shield', { size: 18, className: 'text-primary' })}
              <span>用户自定义规则权威源管理</span>
            </div>
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
      container.innerHTML = `<div class="alert alert-error text-xs gap-1.5">${uiIcon('circle-x', { size: 14 })} 加载失败: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderUserRulesModal() {
    const container = document.getElementById('user-rules-modal-content');
    if (!container) return;
    const rules = userRulesState.rules || [];
    container.innerHTML = `
      <div class="flex justify-between items-center text-xs">
        <span class="text-base-content/60">当前已生效自定义规则数: <b class="font-mono text-base-content">${rules.length}</b></span>
        <button class="btn btn-xs btn-outline gap-1" id="btn-refresh-user-rules">
          ${uiIcon('refresh', { size: 12 })} 刷新
        </button>
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
  // 全局轻量调度 (无死循环、零卡顿)
  // ==========================================
  let isLoopRunning = false;
  function mainLoop() {
    if (isLoopRunning) return;
    isLoopRunning = true;
    try {
      checkBackendChange();
      injectSidebarItem();
      syncToolkitView();
      injectRulesPageButton();
    } finally {
      isLoopRunning = false;
    }
  }

  setInterval(mainLoop, 500);
  window.addEventListener('hashchange', mainLoop);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainLoop);
  } else {
    mainLoop();
  }
})();
