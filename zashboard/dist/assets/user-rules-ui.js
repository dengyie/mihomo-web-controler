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

  // ==========================================
  // 原生同构图标 (Heroicons Outline)
  // 与 zashboard 内置图标完全一致：viewBox 24 / stroke-width 1.5 /
  // data-slot="icon" / class 控制尺寸 (h-3.5/h-4/h-5 w-*)，无内联宽高
  // ==========================================
  const HERO_ICONS = {
    'arrow-path': '<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>',
    'arrow-left': '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>',
    globe: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/>',
    link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>',
    plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>',
    trash: '<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>',
    pause: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/>',
    play: '<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>',
    'chevron-down': '<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/>',
    x: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>',
    check: '<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/>',
    'exclamation-triangle': '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>',
    wrench: '<path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.32l-3.232 3.232a1.875 1.875 0 0 1-2.652-2.652L21 3.232A4.5 4.5 0 0 0 14.68 7.72c.047.58.024 1.192-.14 1.742m0 0a4.872 4.872 0 0 1-1.42 2.496l-3.03 2.496"/>',
  };

  function nativeIcon(name, cls = 'h-4 w-4', label = '') {
    const aria = label ? `aria-label="${escapeAttribute(label)}"` : 'aria-hidden="true"';
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" class="${escapeAttribute(cls)}" ${aria}>${HERO_ICONS[name] || ''}</svg>`;
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
        toolkitPage.className = 'absolute flex h-full w-full flex-col overflow-y-auto';
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

    syncSidebarActive();
  }

  // ==========================================
  // 侧边栏菜单项注入与指示器高亮同步
  // 严格复刻原生 SideBar 组件的全部行为：
  //   1. active class 绑定: q([active?'sidebar-tab-active':'hover:bg-base-300!', cr&&'justify-center', 'relative z-10 py-2'])
  //   2. 指示器 f(): 基准 = indicator.parentElement(navRef)，目标 = menu 里 [data-sidebar-route=d.name] > a
  //   3. 收起态 hover tooltip（tippy-box, placement right）
  //   4. 展开态文字 label（a 内 svg 后的纯文本节点）
  // ==========================================
  const TOOLKIT_LABEL = (() => {
    try {
      const lang = (localStorage.getItem('config/language') || 'zh-CN').toLowerCase();
      if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant')) return '網路工具箱';
      if (lang.startsWith('en')) return 'Toolkit';
      if (lang.startsWith('ru')) return 'Инструменты';
    } catch (e) { /* noop */ }
    return '网络工具箱';
  })();

  function isSidebarCollapsed() {
    const home = document.querySelector('.home-page');
    return home ? home.classList.contains('sidebar-collapsed') : true;
  }

  function currentNativeRoute() {
    const m = (location.hash || '').match(/^#\/([a-z-]+)/i);
    return m ? m[1].toLowerCase() : 'proxies';
  }

  function setClassIfChanged(el, cls) {
    if (el && el.className !== cls) el.className = cls;
  }

  // 指示器：完全复刻原生 f() 的坐标算法（含字符串格式），幂等写入
  function syncIndicator() {
    const indicator = document.querySelector('.sidebar-tab-indicator');
    const nav = indicator?.parentElement;
    const menu = document.querySelector('ul.sidebar-route-menu');
    if (!indicator || !nav || !menu) return;

    const route = isToolkitRoute() ? 'toolkit' : currentNativeRoute();
    const targetA = route === 'toolkit'
      ? menu.querySelector('#sidebar-item-toolkit > a')
      : menu.querySelector(`li[data-sidebar-route="${route}"] > a`);
    if (!targetA) return;

    const r = nav.getBoundingClientRect();
    const o = targetA.getBoundingClientRect();
    if (!o.width || !o.height) return;

    const transform = `translate3d(${o.left - r.left}px, ${o.top - r.top}px, 0)`;
    const width = `${o.width}px`;
    const height = `${o.height}px`;
    if (indicator.style.transform !== transform) indicator.style.transform = transform;
    if (indicator.style.width !== width) indicator.style.width = width;
    if (indicator.style.height !== height) indicator.style.height = height;
    if (indicator.style.opacity !== '1') indicator.style.opacity = '1';
  }

  // 同步整个侧边栏（含原生项恢复，根治「toolkit 返回同名路由后 sidebar-tab-active 永久丢失」）
  function syncSidebarActive() {
    const menuUl = document.querySelector('ul.sidebar-route-menu');
    if (!menuUl) return;
    const collapsed = isSidebarCollapsed();
    const toolkitActive = isToolkitRoute();
    const nativeRoute = currentNativeRoute();

    menuUl.querySelectorAll('li[data-sidebar-route]').forEach((li) => {
      const a = li.querySelector('a');
      if (!a) return;
      if (li.id === 'sidebar-item-toolkit') {
        setClassIfChanged(a, buildSidebarAClass(toolkitActive, collapsed));
        syncToolkitItemContent(a, collapsed);
      } else {
        // toolkit 激活时原生项全部取消高亮；离开 toolkit 后按当前路由恢复
        // （同名路由返回时 Vue vdom diff 认为类未变化不会重写 DOM，必须由我们恢复）
        const active = !toolkitActive && li.getAttribute('data-sidebar-route') === nativeRoute;
        setClassIfChanged(a, buildSidebarAClass(active, collapsed));
      }
    });

    syncIndicator();
  }

  function buildSidebarAClass(active, collapsed) {
    return `${active ? 'sidebar-tab-active' : 'hover:bg-base-300!'}${collapsed ? ' justify-center' : ''} relative z-10 py-2`;
  }

  // toolkit 项内容：收起=仅图标；展开=图标+文字节点（复刻原生 gt(U($t(t)),1)）
  function syncToolkitItemContent(a, collapsed) {
    if (!a) return;
    if (collapsed) {
      Array.from(a.childNodes).forEach((n) => {
        if (n.nodeType === 3 && n.textContent.trim()) a.removeChild(n);
      });
    } else {
      const hasLabel = Array.from(a.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasLabel && document.createTextNode) {
        a.appendChild(document.createTextNode(TOOLKIT_LABEL));
      }
    }
  }

  // 复刻原生收起态 hover tooltip（复用原生 tippy-box 样式，右侧弹出）
  function showToolkitTooltip(li) {
    if (!isSidebarCollapsed()) return;
    hideToolkitTooltip();
    const tip = document.createElement('div');
    tip.id = 'toolkit-sidebar-tooltip';
    tip.className = 'tippy-box';
    tip.setAttribute('data-animation', 'scale');
    tip.setAttribute('data-placement', 'right');
    tip.setAttribute('data-state', 'visible');
    tip.textContent = TOOLKIT_LABEL;
    tip.style.position = 'fixed';
    tip.style.zIndex = '9999';
    tip.style.pointerEvents = 'none';
    const host = document.getElementById('app-content') || document.body;
    host.appendChild(tip);
    const r = li.getBoundingClientRect();
    tip.style.left = `${Math.round(r.right + 10)}px`;
    tip.style.top = `${Math.round(r.top + r.height / 2)}px`;
    tip.style.transform = 'translateY(-50%)';
  }

  function hideToolkitTooltip() {
    document.getElementById('toolkit-sidebar-tooltip')?.remove();
  }

  function injectSidebarItem() {
    const menuUl = document.querySelector('ul.sidebar-route-menu');
    if (!menuUl) return;

    let item = document.getElementById('sidebar-item-toolkit');
    if (!item) {
      item = document.createElement('li');
      item.id = 'sidebar-item-toolkit';
      item.setAttribute('data-sidebar-route', 'toolkit');
      item.innerHTML = `
        <a class="hover:bg-base-300! justify-center relative z-10 py-2" href="#/proxies?tab=toolkit">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.32l-3.232 3.232a1.875 1.875 0 0 1-2.652-2.652L21 3.232A4.5 4.5 0 0 0 14.68 7.72c.047.58.024 1.192-.14 1.742m0 0a4.872 4.872 0 0 1-1.42 2.496l-3.03 2.496"></path>
          </svg>
        </a>
      `;

      // 捕获阶段拦截点击，阻止原生 Vue Router 对未注册路由的 catchAll 重定向
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        location.hash = '#/proxies?tab=toolkit';
        hideToolkitTooltip();
        syncToolkitView();
      }, true);

      // 复刻原生收起态 hover tooltip
      item.addEventListener('mouseenter', () => showToolkitTooltip(item));
      item.addEventListener('mouseleave', hideToolkitTooltip);

      // 插入在设置（最后一个）之前
      const lastLi = menuUl.lastElementChild;
      if (lastLi && menuUl.children.length >= 4) {
        menuUl.insertBefore(item, lastLi);
      } else {
        menuUl.appendChild(item);
      }
    }

    // 监听 Vue 对侧边栏 class/style 的改写，同帧内幂等纠偏
    // （写入前先比较，值一致时不写 → 观察者收敛，无死循环）
    if (!menuUl.dataset.toolkitObserverAttached && typeof MutationObserver !== 'undefined') {
      menuUl.dataset.toolkitObserverAttached = 'true';
      let rafPending = false;
      const observer = new MutationObserver(() => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          syncSidebarActive();
        });
      });
      observer.observe(menuUl, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });

      // 侧边栏展开/收起（.home-page class 切换）时同步 label/justify-center
      const home = document.querySelector('.home-page');
      if (home) {
        const homeObserver = new MutationObserver(() => syncSidebarActive());
        homeObserver.observe(home, { attributes: true, attributeFilter: ['class'] });
      }
    }

    syncSidebarActive();
  }

  // ==========================================
  // 渲染原生风格的独立子页面 (Subpage Rendering)
  // ==========================================
  function renderToolkitSubpage() {
    const pageContainer = document.getElementById('zashboard-toolkit-page');
    if (!pageContainer || pageContainer.style.display === 'none') return;

    // 原生延迟色阶 (text-low/medium/high-latency 为 zashboard 内置语义色)
    function latencyClass(ms) {
      if (ms == null) return 'text-base-content/40';
      if (ms < 200) return 'text-low-latency';
      if (ms < 500) return 'text-medium-latency';
      return 'text-high-latency';
    }

    // 1. 出口 IP 视图构建 (settings-grid 行式布局)
    const fastest = egressBadgeState.data?.fastest;
    const ipData = fastest?.data;
    const latency = fastest?.latency_ms ? Math.round(fastest.latency_ms) : null;
    const isEgressLoading = egressBadgeState.loading;

    const probesHtml = (egressBadgeState.data?.probes || []).map(p => `
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-base-content/60">${escapeHtml(p.source)}</span>
        <span class="flex min-w-0 items-center gap-3">
          <span class="truncate font-mono">${escapeHtml(p.ip || p.error || 'N/A')}</span>
          <span class="w-12 shrink-0 text-right font-mono ${p.success ? latencyClass(Math.round(p.latency_ms)) : 'text-error'}">${p.success ? `${Math.round(p.latency_ms)}ms` : '失败'}</span>
        </span>
      </div>
    `).join('');

    const egressSectionHtml = `
      <div class="settings-section-label">出口 IP 竞速诊断</div>
      <div class="settings-grid">
        <div class="setting-item p-4">
          <div class="setting-item-label flex min-w-0 items-center gap-2">
            ${nativeIcon('globe', 'h-4 w-4 shrink-0')}
            <span class="truncate">出口 IP${isEgressLoading ? ' <span class="loading loading-spinner loading-xs"></span>' : ''}</span>
          </div>
          <div class="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div class="min-w-0 text-right">
              <div class="truncate font-mono text-sm">${escapeHtml(ipData?.ip || (isEgressLoading ? '正在多源竞速测速...' : '未获取到有效出口'))}</div>
              <div class="truncate text-xs text-base-content/60">${escapeHtml([ipData?.country, ipData?.city].filter(Boolean).join(' '))}${ipData?.org ? ` · ${escapeHtml(ipData.org)}` : ''}</div>
            </div>
            <span class="w-14 shrink-0 text-right font-mono text-sm ${latencyClass(latency)}">${latency != null ? `${latency}ms` : '--'}</span>
            <button class="btn btn-circle btn-sm" id="btn-reprobe-egress" aria-label="重新测速" ${isEgressLoading ? 'disabled' : ''}>
              ${isEgressLoading ? '<span class="loading loading-spinner loading-xs"></span>' : nativeIcon('arrow-path', 'h-4 w-4')}
            </button>
            <button class="btn btn-circle btn-ghost btn-sm" id="btn-toggle-egress-details" aria-label="竞速明细">${nativeIcon('chevron-down', 'h-4 w-4')}</button>
          </div>
        </div>
        <div id="egress-details-container" class="hidden flex-col gap-2 p-4">
          ${probesHtml || '<div class="text-xs text-base-content/40">暂无竞速明细</div>'}
        </div>
      </div>
    `;

    // 2. 订阅与节点聚合构建 (settings-grid 行式布局)
    const subs = subscriptionState.list || [];
    const isSubLoading = subscriptionState.loading;

    const subRowsHtml = subs.map((s) => {
      const isAction = subscriptionState.actionInProgress;
      const isUpdating = isAction === `update-${s.id}`;
      const isDeleting = isAction === `delete-${s.id}`;
      const sourceDesc = s.url || (s.type === 'raw' ? '单节点批量导入' : '本地源');
      return `
        <div class="setting-item p-4">
          <div class="setting-item-label flex min-w-0 flex-col gap-0.5">
            <span class="truncate">${escapeHtml(s.name)}</span>
            <span class="truncate font-mono text-xs text-base-content/40">${escapeHtml(sourceDesc)}</span>
          </div>
          <span class="shrink-0 text-xs text-base-content/40">${s.node_count || 0} 节点</span>
          <input type="checkbox" class="sub-toggle toggle" data-id="${escapeHtml(s.id)}" aria-label="${s.enabled ? '停用' : '启用'}${escapeHtml(s.name)}" ${s.enabled ? 'checked' : ''} />
          ${s.type !== 'raw' ? `
            <button class="sub-btn-update btn btn-circle btn-ghost btn-xs h-5 min-h-5 w-5 shrink-0 p-0" data-id="${escapeHtml(s.id)}" aria-label="更新${escapeHtml(s.name)}" ${isUpdating ? 'disabled' : ''}>
              ${isUpdating ? '<span class="loading loading-spinner loading-xs"></span>' : nativeIcon('arrow-path', 'h-3.5 w-3.5')}
            </button>
          ` : ''}
          <button class="sub-btn-delete btn btn-circle btn-ghost btn-xs h-5 min-h-5 w-5 shrink-0 p-0 text-base-content/40 hover:text-error" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" aria-label="删除${escapeHtml(s.name)}" ${isDeleting ? 'disabled' : ''}>
            ${nativeIcon('trash', 'h-3.5 w-3.5')}
          </button>
        </div>
      `;
    }).join('');

    const isSubTab = subscriptionState.activeTab === 'sub';
    const addFormHtml = subscriptionState.addFormVisible ? `
      <div class="flex flex-col gap-3 p-4">
        <div class="join w-full">
          <button class="btn join-item btn-sm flex-1 ${isSubTab ? 'btn-primary' : 'font-normal'}" id="tab-switch-sub">Clash 订阅链接</button>
          <button class="btn join-item btn-sm flex-1 ${!isSubTab ? 'btn-primary' : 'font-normal'}" id="tab-switch-nodes">节点分享链接</button>
        </div>
        ${isSubTab ? `
          <div class="flex flex-col gap-2">
            <input id="input-sub-name" class="input input-sm w-full" placeholder="订阅名称 (如: 某某机场)" value="${escapeHtml(subscriptionState.subInputName)}" />
            <input id="input-sub-url" class="input input-sm w-full" placeholder="https://airport.com/api/v1/client/subscribe?token=..." value="${escapeHtml(subscriptionState.subInputUrl)}" />
            <input id="input-sub-filter" class="input input-sm w-full" placeholder="排除正则 (默认已过滤公告/重置/到期)" value="${escapeHtml(subscriptionState.subInputFilter)}" />
            <div class="flex justify-end">
              <button class="btn btn-primary btn-sm" id="btn-submit-add-sub" ${subscriptionState.actionInProgress === 'add-sub' ? 'disabled' : ''}>
                ${subscriptionState.actionInProgress === 'add-sub' ? '<span class="loading loading-spinner loading-xs"></span>' : nativeIcon('check', 'h-4 w-4')} 拉取并挂载
              </button>
            </div>
          </div>
        ` : `
          <div class="flex flex-col gap-2">
            <input id="input-nodes-name" class="input input-sm w-full" placeholder="前缀别名 (如: 自建香港)" value="${escapeHtml(subscriptionState.nodesInputName)}" />
            <textarea id="input-nodes-content" class="textarea textarea-sm w-full font-mono text-xs" rows="3" placeholder="支持批量粘贴: ss://, vmess://, vless://, trojan://, hy2://">${escapeHtml(subscriptionState.nodesInputContent)}</textarea>
            <div class="flex justify-end">
              <button class="btn btn-primary btn-sm" id="btn-submit-import-nodes" ${subscriptionState.actionInProgress === 'import-nodes' ? 'disabled' : ''}>
                ${subscriptionState.actionInProgress === 'import-nodes' ? '<span class="loading loading-spinner loading-xs"></span>' : nativeIcon('check', 'h-4 w-4')} 解析并导入
              </button>
            </div>
          </div>
        `}
      </div>
    ` : '';

    const subsSectionHtml = `
      <div class="settings-section-label">订阅与节点聚合</div>
      <div class="settings-grid">
        <div class="setting-item p-4">
          <div class="setting-item-label flex items-center gap-2">
            ${nativeIcon('link', 'h-4 w-4 shrink-0')}
            <span>订阅源管理${isSubLoading ? ' <span class="loading loading-spinner loading-xs"></span>' : ''}</span>
          </div>
          <button class="btn btn-sm" id="btn-show-add-sub">${nativeIcon('plus', 'h-4 w-4')} 添加</button>
        </div>
        ${addFormHtml}
        ${subRowsHtml || `<div class="p-4 text-xs text-base-content/40">暂无已导入订阅源，点击上方 "添加" 快速导入</div>`}
      </div>
    `;

    // 3. 规则推演与 DNS 污染视图构建 (base-container + 原生 topbar 行式输入)
    const simResult = ruleSimulatorState.result;
    const simLoading = ruleSimulatorState.loading;
    const simError = ruleSimulatorState.error;

    let simResultHtml = '';
    if (simLoading) {
      simResultHtml = `
        <div class="flex items-center gap-2 p-4 text-sm text-base-content/60">
          <span class="loading loading-spinner loading-sm"></span>
          正在逐层模拟分流匹配与回溯 nameserver policy...
        </div>
      `;
    } else if (simError) {
      simResultHtml = `
        <div class="flex items-center gap-2 p-4 text-sm text-error">
          ${nativeIcon('exclamation-triangle', 'h-4 w-4 shrink-0')}
          推演失败: ${escapeHtml(simError)}
        </div>
      `;
    } else if (simResult) {
      const match = simResult.matched_rule;
      const dns = simResult.dns;
      const warnings = dns?.warnings || [];
      simResultHtml = `
        <div class="flex flex-col gap-3 p-4 text-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs tracking-wide text-base-content/55">命中策略 :</span>
            <span class="font-mono text-sm font-medium">${escapeHtml(match?.target || 'DIRECT')}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-xs tracking-wide text-base-content/55">规则 :</span>
            <span class="truncate font-mono text-xs">${escapeHtml(match?.raw || 'MATCH (Fallback)')}</span>
          </div>
          ${warnings.length > 0 ? `
            <div class="flex items-start gap-2 text-xs text-warning">
              ${nativeIcon('exclamation-triangle', 'h-3.5 w-3.5 shrink-0')}
              <span>${escapeHtml(warnings.join('；'))}</span>
            </div>
          ` : `
            <div class="flex items-center gap-2 text-xs text-success">
              ${nativeIcon('check', 'h-3.5 w-3.5 shrink-0')}
              <span>DNS 策略安全，未检测到境内明文解析污染</span>
            </div>
          `}
        </div>
      `;
    }

    const quickDomains = ['api.openai.com', 'claude.ai', 'github.com', 'google.com', 'bilibili.com'];
    const simSectionHtml = `
      <div class="settings-section-label">规则分流与 DNS 推演</div>
      <div class="base-container">
        <div class="flex flex-wrap items-center gap-2 p-3">
          <label class="input input-sm min-w-48 flex-1">
            <input id="toolkit-sim-input" type="text" placeholder="测试域名或 IP (如: api.openai.com)" value="${escapeHtml(ruleSimulatorState.input)}" />
          </label>
          <button class="btn btn-sm" id="btn-toolkit-run-sim" ${simLoading ? 'disabled' : ''}>
            ${simLoading ? '<span class="loading loading-spinner loading-xs"></span>' : ''} 推演
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 px-3 pb-3">
          <span class="text-xs text-base-content/40">快捷:</span>
          ${quickDomains.map(d => `<button class="btn btn-ghost btn-xs font-mono quick-sim-tag" data-domain="${d}">${d}</button>`).join('')}
        </div>
        ${simResultHtml}
      </div>
    `;

    // 4. 装配子页面主结构 (与原生页面同构: 吸顶 need-blur 顶栏 + p-3 正文)
    pageContainer.innerHTML = `
      <div class="bg-base-100 need-blur fixed top-0 right-0 left-0 z-30 shadow-xs backdrop-blur-xl sticky md:bg-base-100/50">
        <div class="flex flex-wrap items-center gap-2 p-2">
          ${nativeIcon('wrench', 'h-5 w-5 shrink-0')}
          <span class="text-sm font-semibold">网络工具箱</span>
          <span class="text-xs text-base-content/40">${escapeHtml(activeBackendUuid.replace('backend-', '').replace('-default', ''))}</span>
          <div class="flex-1"></div>
          <button class="btn btn-circle btn-sm" id="btn-refresh-all-toolkit" aria-label="刷新数据">${nativeIcon('arrow-path', 'h-4 w-4')}</button>
        </div>
      </div>
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 md:px-8">
        ${egressSectionHtml}
        ${subsSectionHtml}
        ${simSectionHtml}
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
      if (container) {
        container.classList.toggle('hidden');
        container.classList.toggle('flex');
      }
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

    // 输入框内容实时回写状态，避免操作触发的重渲染丢字
    const bindInput = (sel, key) => {
      const el = pageContainer.querySelector(sel);
      el?.addEventListener('input', () => { subscriptionState[key] = el.value; });
    };
    bindInput('#input-sub-name', 'subInputName');
    bindInput('#input-sub-url', 'subInputUrl');
    bindInput('#input-sub-filter', 'subInputFilter');
    bindInput('#input-nodes-name', 'nodesInputName');
    const nodesContentEl = pageContainer.querySelector('#input-nodes-content');
    nodesContentEl?.addEventListener('input', () => { subscriptionState.nodesInputContent = nodesContentEl.value; });

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
    pageContainer.querySelectorAll('.sub-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => toggleSubscription(toggle.dataset.id, toggle.checked));
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
    simInput?.addEventListener('input', () => { ruleSimulatorState.input = simInput.value; });

    pageContainer.querySelectorAll('.quick-sim-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        if (simInput) simInput.value = tag.dataset.domain;
        ruleSimulatorState.input = tag.dataset.domain;
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
