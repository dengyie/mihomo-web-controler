(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (s) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[s]));
  }

  // Country code to Flag emoji mapping
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const code = countryCode.toUpperCase();
    const first = code.codePointAt(0) - 0x41 + 0x1F1E6;
    const second = code.codePointAt(1) - 0x41 + 0x1F1E6;
    if (first >= 0x1F1E6 && first <= 0x1F1FF && second >= 0x1F1E6 && second <= 0x1F1FF) {
      return String.fromCodePoint(first, second);
    }
    return '🌐';
  }

  // Inject Styles for Custom Panels & Badges
  const style = document.createElement('style');
  style.id = 'user-rules-custom-styles';
  style.textContent = `
    .user-rules-modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      animation: urModalFadeIn 0.15s ease-out;
    }
    @keyframes urModalFadeIn {
      from { opacity: 0; transform: scale(0.97); }
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
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
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
    #user-rules-top-action-btn, #sub-manager-top-action-btn {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin-right: 6px;
      flex-shrink: 0;
    }
    #egress-ip-badge-container {
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      margin-right: 8px;
      vertical-align: middle;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
      transition: opacity 0.2s ease, transform 0.15s ease;
    }
    #egress-ip-badge-container:hover {
      transform: translateY(-1px);
    }
    .egress-popover-card {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      width: 290px;
      background: var(--fallback-b1, #ffffff);
      color: var(--fallback-bc, #1f2937);
      border-radius: 0.75rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(128, 128, 128, 0.2);
      padding: 0.875rem;
      z-index: 10000;
      animation: urModalFadeIn 0.12s ease-out;
    }
    .dark .egress-popover-card, [data-theme='dark'] .egress-popover-card {
      background: #1f242d;
      color: #cbd5e1;
      border-color: #334155;
    }
    #rule-simulator-bar-container {
      margin: 8px 12px 12px 12px;
      padding: 10px 14px;
      background: var(--fallback-b2, rgba(128, 128, 128, 0.08));
      border: 1px dashed rgba(128, 128, 128, 0.25);
      border-radius: 0.75rem;
      transition: all 0.2s ease;
    }
    .dark #rule-simulator-bar-container, [data-theme='dark'] #rule-simulator-bar-container {
      background: rgba(30, 41, 59, 0.6);
      border-color: rgba(100, 116, 139, 0.35);
    }
    .rule-sim-highlight {
      background-color: rgba(234, 179, 8, 0.25) !important;
      outline: 2px solid #eab308 !important;
      transition: background-color 0.5s ease;
    }
  `;
  if (!document.getElementById('user-rules-custom-styles')) {
    document.head.appendChild(style);
  }

  // Global State
  let userRulesState = {
    rules: [],
    targets: ['DIRECT', 'REJECT', 'GLOBAL'],
    loading: false,
    showModal: false,
    viewMode: 'list', // 'list' | 'add'
    lastActiveUuid: '',
  };

  let subManagerState = {
    showModal: false,
    subscriptions: [],
    loading: false,
    activeTab: 'url', // 'url' | 'raw'
  };

  let egressBadgeState = {
    loading: false,
    data: null,
    showPopover: false,
    error: null,
    lastChecked: 0,
  };

  let ruleSimulatorState = {
    input: '',
    loading: false,
    result: null,
    error: null,
  };

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
    item.style.animation = 'urModalFadeIn 0.2s ease-out';
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
    return active?.label || 'node';
  }

  function getAuthHeaders(includeJson = false) {
    const token = getPanelAuthToken();
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  // ==========================================
  // 1. 出口 IP 诊断 Badge (EgressBadge)
  // ==========================================
  async function fetchEgressIp(force = false) {
    if (egressBadgeState.loading) return;
    const now = Date.now();
    if (!force && egressBadgeState.data && (now - egressBadgeState.lastChecked < 60000)) {
      renderEgressBadge();
      return;
    }

    egressBadgeState.loading = true;
    egressBadgeState.error = null;
    renderEgressBadge();

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
      renderEgressBadge();
    }
  }

  function renderEgressBadge() {
    const container = document.getElementById('egress-ip-badge-container');
    if (!container) return;

    if (egressBadgeState.loading) {
      container.innerHTML = `
        <span class="badge badge-sm badge-ghost gap-1 font-mono text-[11px] opacity-75 animate-pulse">
          <span class="loading loading-spinner loading-xs"></span>
          <span>探测出口中...</span>
        </span>
      `;
      return;
    }

    if (egressBadgeState.error) {
      container.innerHTML = `
        <span class="badge badge-sm badge-error badge-outline gap-1 font-mono text-[11px]" title="${escapeHtml(egressBadgeState.error)}">
          <span>⚠️ 出口异常</span>
        </span>
      `;
      renderEgressPopover();
      return;
    }

    const fastest = egressBadgeState.data?.fastest;
    if (!fastest || !fastest.data) {
      container.innerHTML = `
        <span class="badge badge-sm badge-ghost gap-1 font-mono text-[11px] opacity-70">
          <span>🌐 探测出口 IP</span>
        </span>
      `;
      renderEgressPopover();
      return;
    }

    const ipData = fastest.data;
    const ip = ipData.ip || 'Unknown';
    const country = ipData.country || '';
    const flag = getFlagEmoji(country);
    const latency = fastest.latency_ms ? `${Math.round(fastest.latency_ms)}ms` : '';

    container.innerHTML = `
      <div class="badge badge-sm badge-primary badge-outline gap-1.5 font-mono text-[11px] py-2 px-2.5 shadow-sm hover:bg-primary/10 transition-colors">
        <span>${flag}</span>
        <span class="font-semibold">${escapeHtml(ip)}</span>
        ${latency ? `<span class="badge badge-xs badge-ghost text-[10px] opacity-80 px-1 font-sans">${escapeHtml(latency)}</span>` : ''}
        <svg class="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    `;

    renderEgressPopover();
  }

  function renderEgressPopover() {
    let popover = document.getElementById('egress-popover-card');
    if (!egressBadgeState.showPopover) {
      if (popover) popover.remove();
      return;
    }

    const badgeContainer = document.getElementById('egress-ip-badge-container');
    if (!badgeContainer) return;

    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'egress-popover-card';
      popover.className = 'egress-popover-card';
      badgeContainer.style.position = 'relative';
      badgeContainer.appendChild(popover);
    }

    const fastest = egressBadgeState.data?.fastest;
    const allResults = egressBadgeState.data?.all_results || [];

    let detailsHtml = '';
    if (egressBadgeState.error) {
      detailsHtml = `<div class="text-xs text-error py-2 font-mono">${escapeHtml(egressBadgeState.error)}</div>`;
    } else if (fastest && fastest.data) {
      const d = fastest.data;
      const flag = getFlagEmoji(d.country);
      detailsHtml = `
        <div class="space-y-2 text-xs">
          <div class="flex items-center justify-between pb-1.5 border-b border-base-content/10">
            <span class="opacity-60">出口 IP</span>
            <span class="font-mono font-bold text-primary">${escapeHtml(d.ip || '-')}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-60">国家 / 地区</span>
            <span class="font-medium">${flag} ${escapeHtml(d.country || '-')} ${escapeHtml(d.city ? `(${d.city})` : '')}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-60">运营商 / ASN</span>
            <span class="font-mono truncate max-w-[160px] text-right" title="${escapeHtml(d.org || d.asn || '-')}">${escapeHtml(d.org || d.asn || '-')}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="opacity-60">探测优胜源</span>
            <span class="badge badge-xs badge-neutral font-mono">${escapeHtml(fastest.source || '-')} (${Math.round(fastest.latency_ms)}ms)</span>
          </div>
          ${allResults.length > 1 ? `
            <div class="pt-1 mt-1 border-t border-base-content/10">
              <div class="text-[10px] opacity-60 mb-1">多源竞速结果:</div>
              <div class="space-y-1">
                ${allResults.map(r => `
                  <div class="flex items-center justify-between text-[11px] font-mono">
                    <span class="opacity-70">${escapeHtml(r.source)}</span>
                    <span class="text-success font-semibold">${Math.round(r.latency_ms)}ms</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      detailsHtml = `<div class="text-xs opacity-60 py-2">未获取到探测数据</div>`;
    }

    popover.innerHTML = `
      <div class="flex items-center justify-between mb-2 pb-1 border-b border-base-content/10">
        <span class="font-bold text-xs flex items-center gap-1">
          <span>🚀 出口 IP 诊断</span>
        </span>
        <button class="btn btn-ghost btn-xs btn-circle" id="btn-close-egress-popover">✕</button>
      </div>
      ${detailsHtml}
      <div class="mt-3 pt-2 border-t border-base-content/10 flex justify-end">
        <button class="btn btn-xs btn-primary gap-1" id="btn-refresh-egress">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          重新探测
        </button>
      </div>
    `;

    const closeBtn = popover.querySelector('#btn-close-egress-popover');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        egressBadgeState.showPopover = false;
        renderEgressPopover();
      };
    }

    const refreshBtn = popover.querySelector('#btn-refresh-egress');
    if (refreshBtn) {
      refreshBtn.onclick = (e) => {
        e.stopPropagation();
        fetchEgressIp(true);
      };
    }
  }

  function injectEgressBadge() {
    let container = document.getElementById('egress-ip-badge-container');
    if (container && document.body.contains(container)) return;

    // Search for header or navbar in zashboard UI
    const header = document.querySelector('header, .navbar, nav, .header, #app > div > header');
    if (!header) return;

    if (!container) {
      container = document.createElement('div');
      container.id = 'egress-ip-badge-container';
      container.onclick = (e) => {
        e.stopPropagation();
        egressBadgeState.showPopover = !egressBadgeState.showPopover;
        if (egressBadgeState.showPopover && !egressBadgeState.data && !egressBadgeState.loading) {
          fetchEgressIp(true);
        } else {
          renderEgressPopover();
        }
      };
    }

    // Insert before right-side controls or append to header
    const rightSide = header.querySelector('.navbar-end, .flex-none, [class*="end"], [class*="right"]');
    if (rightSide) {
      rightSide.insertAdjacentElement('afterbegin', container);
    } else {
      header.appendChild(container);
    }

    renderEgressBadge();
    if (!egressBadgeState.data && !egressBadgeState.loading) {
      fetchEgressIp(false);
    }
  }

  // ==========================================
  // 2. 订阅管理中心 (SubManagerModal)
  // ==========================================
  async function fetchSubscriptions() {
    subManagerState.loading = true;
    renderSubModal();
    try {
      const apiEndpoint = getPanelApiBase('subscriptions');
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        subManagerState.subscriptions = json.data.subscriptions || [];
      }
    } catch (e) {
      showToast('获取订阅失败: ' + e.message, 'error');
    } finally {
      subManagerState.loading = false;
      renderSubModal();
    }
  }

  async function addSubscriptionUrl(name, url, excludeFilter) {
    try {
      const apiEndpoint = getPanelApiBase('subscriptions');
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          type: 'remote',
          exclude_filter: excludeFilter ? excludeFilter.trim() : '',
          enabled: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '添加订阅失败');
      }
      showToast('🎉 订阅添加并解析成功！', 'success');
      await fetchSubscriptions();
      return true;
    } catch (e) {
      showToast('添加失败: ' + e.message, 'error');
      return false;
    }
  }

  async function importRawNodes(name, content, excludeFilter) {
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/import-nodes';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          name: name.trim(),
          raw_content: content.trim(),
          exclude_filter: excludeFilter ? excludeFilter.trim() : '',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '导入节点失败');
      }
      showToast('🎉 分享链接导入成功！', 'success');
      await fetchSubscriptions();
      return true;
    } catch (e) {
      showToast('导入失败: ' + e.message, 'error');
      return false;
    }
  }

  async function toggleSubscription(subId, enabled) {
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId) + '/toggle';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ enabled: !enabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '状态切换失败');
      }
      showToast('订阅状态已更新', 'success');
      await fetchSubscriptions();
    } catch (e) {
      showToast('操作失败: ' + e.message, 'error');
    }
  }

  async function updateSubscription(subId, btn) {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> 更新中';
    }
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId) + '/update';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ refresh: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '更新失败');
      }
      showToast('🔄 订阅节点已刷新！', 'success');
      await fetchSubscriptions();
    } catch (e) {
      showToast('更新失败: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 更新';
      }
    }
  }

  async function deleteSubscription(subId) {
    if (!confirm('确定要删除此订阅源吗？关联节点将会被移除。')) return;
    try {
      const apiEndpoint = getPanelApiBase('subscriptions') + '/' + encodeURIComponent(subId);
      const res = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '删除失败');
      }
      showToast('🗑️ 订阅已删除', 'success');
      await fetchSubscriptions();
    } catch (e) {
      showToast('删除失败: ' + e.message, 'error');
    }
  }

  function renderSubModal() {
    let modalEl = document.getElementById('sub-manager-modal');
    if (!subManagerState.showModal) {
      if (modalEl) modalEl.remove();
      return;
    }

    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'sub-manager-modal';
      modalEl.className = 'user-rules-modal-backdrop';
      document.body.appendChild(modalEl);
    }

    const currentLabel = getActiveBackendLabel();
    const subs = subManagerState.subscriptions || [];

    const rows = subs.length ? subs.map((s) => {
      const isEnabled = s.enabled !== false;
      const count = s.node_count || (Array.isArray(s.proxies) ? s.proxies.length : 0);
      const updated = s.updated_at ? s.updated_at.split('T')[0] : '从未';
      return `
        <tr class="hover:bg-base-200/50 transition-colors">
          <td class="font-medium text-xs">
            <div class="flex flex-col">
              <span class="font-semibold">${escapeHtml(s.name)}</span>
              <span class="text-[10px] font-mono opacity-50 truncate max-w-[140px]" title="${escapeHtml(s.url || s.type)}">${escapeHtml(s.url || s.type)}</span>
            </div>
          </td>
          <td><span class="badge badge-sm badge-neutral font-mono text-[11px]">${count} 节点</span></td>
          <td class="text-[11px] opacity-60 font-mono">${escapeHtml(updated)}</td>
          <td>
            <input type="checkbox" class="toggle toggle-sm toggle-success sub-toggle-btn" data-sub-id="${escapeHtml(s.id)}" ${isEnabled ? 'checked' : ''} />
          </td>
          <td class="text-right flex items-center justify-end gap-1.5">
            ${s.type === 'remote' || s.url ? `
              <button class="btn btn-xs btn-ghost sub-update-btn font-normal" data-sub-id="${escapeHtml(s.id)}">🔄 更新</button>
            ` : ''}
            <button class="btn btn-xs btn-error btn-outline sub-delete-btn" data-sub-id="${escapeHtml(s.id)}">删除</button>
          </td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="5" class="text-center py-6 opacity-50 text-xs">暂无订阅源，请在上方添加</td></tr>`;

    modalEl.innerHTML = `
      <div class="user-rules-modal-content">
        <div class="user-rules-modal-header">
          <div class="flex items-center gap-2">
            <span class="text-lg">🔗</span>
            <h3 class="font-bold text-sm">节点与订阅管理 <span class="badge badge-sm badge-outline text-[10px] ml-1 font-mono">${escapeHtml(currentLabel)}</span></h3>
            <span class="badge badge-sm badge-neutral text-[11px]">${subs.length}</span>
          </div>
          <button class="btn btn-ghost btn-sm btn-circle" id="btn-close-sub-modal">✕</button>
        </div>
        <div class="user-rules-modal-body flex flex-col gap-4">
          <!-- Add Form Tabs -->
          <div class="bg-base-200/50 p-3 rounded-xl border border-base-content/10">
            <div class="tabs tabs-boxed bg-base-300/40 p-1 mb-3">
              <a class="tab tab-sm ${subManagerState.activeTab === 'url' ? 'tab-active font-bold' : ''}" id="tab-sub-url">🔗 添加订阅 URL</a>
              <a class="tab tab-sm ${subManagerState.activeTab === 'raw' ? 'tab-active font-bold' : ''}" id="tab-sub-raw">📋 导入节点/分享链接</a>
            </div>

            ${subManagerState.activeTab === 'url' ? `
              <div class="flex flex-col gap-2 text-xs">
                <div class="flex gap-2">
                  <input id="sub-add-name" class="input input-bordered input-sm w-1/3" placeholder="订阅名称 (如: 专线)" />
                  <input id="sub-add-url" class="input input-bordered input-sm flex-1 font-mono" placeholder="https://..." />
                </div>
                <div class="flex gap-2 items-center">
                  <input id="sub-add-filter" class="input input-bordered input-sm flex-1" placeholder="过滤正则 (可选, 排除匹配节点)" />
                  <button class="btn btn-sm btn-primary shrink-0" id="btn-submit-sub-url">保存并拉取</button>
                </div>
              </div>
            ` : `
              <div class="flex flex-col gap-2 text-xs">
                <div class="flex gap-2">
                  <input id="sub-raw-name" class="input input-bordered input-sm flex-1" placeholder="节点包名称 (如: 自建节点)" />
                  <input id="sub-raw-filter" class="input input-bordered input-sm w-1/2" placeholder="过滤正则 (可选)" />
                </div>
                <textarea id="sub-raw-content" class="textarea textarea-bordered text-xs font-mono w-full h-20" placeholder="支持 Clash YAML proxies 格式、多行 vmess://, vless://, ss://, trojan://, hysteria2:// 分享链接或 Base64 文本"></textarea>
                <div class="flex justify-end">
                  <button class="btn btn-sm btn-primary" id="btn-submit-sub-raw">导入节点</button>
                </div>
              </div>
            `}
          </div>

          <!-- Subscription List -->
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead>
                <tr class="opacity-70 text-[11px]">
                  <th>订阅源</th>
                  <th>节点数</th>
                  <th>更新时间</th>
                  <th>状态</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    modalEl.querySelector('#btn-close-sub-modal').onclick = () => {
      subManagerState.showModal = false;
      renderSubModal();
    };

    const tabUrl = modalEl.querySelector('#tab-sub-url');
    if (tabUrl) {
      tabUrl.onclick = () => {
        subManagerState.activeTab = 'url';
        renderSubModal();
      };
    }

    const tabRaw = modalEl.querySelector('#tab-sub-raw');
    if (tabRaw) {
      tabRaw.onclick = () => {
        subManagerState.activeTab = 'raw';
        renderSubModal();
      };
    }

    const btnSubmitUrl = modalEl.querySelector('#btn-submit-sub-url');
    if (btnSubmitUrl) {
      btnSubmitUrl.onclick = async () => {
        const name = modalEl.querySelector('#sub-add-name')?.value || '';
        const url = modalEl.querySelector('#sub-add-url')?.value || '';
        const filter = modalEl.querySelector('#sub-add-filter')?.value || '';
        if (!name.trim()) { alert('请输入订阅名称'); return; }
        if (!url.trim()) { alert('请输入订阅 URL'); return; }
        btnSubmitUrl.disabled = true;
        btnSubmitUrl.innerHTML = '<span class="loading loading-spinner loading-xs"></span> 拉取中...';
        await addSubscriptionUrl(name, url, filter);
      };
    }

    const btnSubmitRaw = modalEl.querySelector('#btn-submit-sub-raw');
    if (btnSubmitRaw) {
      btnSubmitRaw.onclick = async () => {
        const name = modalEl.querySelector('#sub-raw-name')?.value || '';
        const content = modalEl.querySelector('#sub-raw-content')?.value || '';
        const filter = modalEl.querySelector('#sub-raw-filter')?.value || '';
        if (!name.trim()) { alert('请输入节点包名称'); return; }
        if (!content.trim()) { alert('请输入分享链接或文本'); return; }
        btnSubmitRaw.disabled = true;
        btnSubmitRaw.innerHTML = '<span class="loading loading-spinner loading-xs"></span> 导入中...';
        await importRawNodes(name, content, filter);
      };
    }

    modalEl.querySelectorAll('.sub-toggle-btn').forEach((toggle) => {
      toggle.onchange = (e) => {
        const id = toggle.getAttribute('data-sub-id');
        const wasEnabled = !e.target.checked;
        toggleSubscription(id, wasEnabled);
      };
    });

    modalEl.querySelectorAll('.sub-update-btn').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-sub-id');
        if (id) updateSubscription(id, btn);
      };
    });

    modalEl.querySelectorAll('.sub-delete-btn').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-sub-id');
        if (id) deleteSubscription(id);
      };
    });
  }

  function createSubButton() {
    const btn = document.createElement('button');
    btn.id = 'sub-manager-top-action-btn';
    btn.className = 'btn btn-circle btn-sm';
    btn.type = 'button';
    btn.title = '订阅与节点管理';
    btn.innerHTML = `
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      subManagerState.showModal = true;
      fetchSubscriptions();
      renderSubModal();
    };
    return btn;
  }

  // ==========================================
  // 3. 规则推演模拟器 (RuleSimulatorBar)
  // ==========================================
  async function simulateRule(domain) {
    if (!domain || !domain.trim()) return;
    ruleSimulatorState.loading = true;
    ruleSimulatorState.error = null;
    ruleSimulatorState.result = null;
    renderRuleSimulator();

    try {
      const apiEndpoint = getPanelApiBase('rules') + '/simulate';
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'ok') {
        throw new Error(json.error || '推演失败');
      }
      ruleSimulatorState.result = json.data;
      highlightMatchedRuleInPage(json.data);
    } catch (e) {
      ruleSimulatorState.error = e.message || '推演异常';
    } finally {
      ruleSimulatorState.loading = false;
      renderRuleSimulator();
    }
  }

  function highlightMatchedRuleInPage(simData) {
    if (!simData || !simData.matched_rule) return;
    const mr = simData.matched_rule;
    const payload = mr.payload || '';
    const raw = mr.raw || '';

    // Search existing rule cards or table rows in the DOM
    document.querySelectorAll('.rule-sim-highlight').forEach(el => el.classList.remove('rule-sim-highlight'));

    if (!payload && !raw) return;

    const elements = Array.from(document.querySelectorAll('tr, .card, [class*="rule-item"], [class*="rule_item"]'));
    const matchedEl = elements.find(el => {
      const text = el.textContent || '';
      return (payload && text.includes(payload)) || (raw && text.includes(raw));
    });

    if (matchedEl) {
      matchedEl.classList.add('rule-sim-highlight');
      matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`🎯 已在规则列表中定位命中规则: ${mr.type} ${payload} -> ${mr.target}`, 'info');
    }
  }

  function renderRuleSimulator() {
    const container = document.getElementById('rule-simulator-bar-container');
    if (!container) return;

    const res = ruleSimulatorState.result;
    const err = ruleSimulatorState.error;
    const loading = ruleSimulatorState.loading;

    let resultHtml = '';
    if (loading) {
      resultHtml = `
        <div class="mt-2.5 flex items-center gap-2 text-xs opacity-75 font-mono">
          <span class="loading loading-spinner loading-xs"></span>
          <span>正在推演 Mihomo 路由规则与 DNS 策略...</span>
        </div>
      `;
    } else if (err) {
      resultHtml = `
        <div class="mt-2.5 alert alert-error alert-sm text-xs py-1.5 px-2.5 rounded-lg flex items-center justify-between">
          <span>❌ 推演失败: ${escapeHtml(err)}</span>
          <button class="btn btn-ghost btn-xs" id="btn-clear-sim-res">清除</button>
        </div>
      `;
    } else if (res && res.matched_rule) {
      const mr = res.matched_rule;
      const dns = res.dns || {};
      const warnings = dns.warnings || [];
      const nameservers = dns.nameservers || [];

      resultHtml = `
        <div class="mt-3 pt-2.5 border-t border-base-content/10 flex flex-col gap-2 text-xs animate-fadeIn">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-success">🎯 命中规则:</span>
              <span class="badge badge-sm badge-outline badge-primary font-mono">${escapeHtml(mr.type || 'DEFAULT')}</span>
              <span class="font-mono font-medium">${escapeHtml(mr.payload || '*')}</span>
              <span class="opacity-60">➔</span>
              <span class="badge badge-sm badge-success font-bold font-mono">${escapeHtml(mr.target || 'DIRECT')}</span>
            </div>
            <div class="flex items-center gap-2 font-mono text-[11px] opacity-75">
              <span>DNS 服务器:</span>
              <span class="badge badge-xs badge-neutral">${escapeHtml(nameservers.join(', ') || '默认')}</span>
              <button class="btn btn-ghost btn-xs btn-circle ml-1" id="btn-clear-sim-res" title="清除结果">✕</button>
            </div>
          </div>

          ${warnings.length > 0 ? `
            <div class="alert alert-warning alert-sm py-1.5 px-2.5 text-[11px] rounded-lg flex flex-col gap-1">
              ${warnings.map(w => `<div class="flex items-center gap-1"><span>⚠️</span><span>${escapeHtml(w)}</span></div>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-1">
          <span class="text-sm font-semibold flex items-center gap-1">
            <span>🧭</span>
            <span class="hidden sm:inline">规则推演</span>
          </span>
          <div class="relative flex-1 max-w-md">
            <input
              id="rule-sim-input"
              class="input input-bordered input-sm w-full font-mono text-xs pr-16"
              placeholder="输入待推演域名或 IP (如: api.openai.com)"
              value="${escapeHtml(ruleSimulatorState.input)}"
            />
            <button class="btn btn-primary btn-xs absolute right-1 top-1/2 -translate-y-1/2 font-normal" id="btn-run-rule-sim">
              推演
            </button>
          </div>
        </div>
        <div class="text-[11px] opacity-50 font-mono hidden md:block">
          实时校验分流目标与 DNS 污染
        </div>
      </div>
      ${resultHtml}
    `;

    const inputEl = container.querySelector('#rule-sim-input');
    const runBtn = container.querySelector('#btn-run-rule-sim');
    const clearBtn = container.querySelector('#btn-clear-sim-res');

    if (inputEl) {
      inputEl.oninput = (e) => { ruleSimulatorState.input = e.target.value; };
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          ruleSimulatorState.input = inputEl.value;
          simulateRule(inputEl.value);
        }
      };
    }

    if (runBtn) {
      runBtn.onclick = () => {
        const val = inputEl ? inputEl.value : ruleSimulatorState.input;
        simulateRule(val);
      };
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        ruleSimulatorState.result = null;
        ruleSimulatorState.error = null;
        renderRuleSimulator();
      };
    }
  }

  function injectRuleSimulatorBar() {
    const isRulesPage = location.hash.startsWith('#/rules');
    const existing = document.getElementById('rule-simulator-bar-container');

    if (!isRulesPage) {
      if (existing) existing.remove();
      return;
    }

    if (existing && document.body.contains(existing)) return;

    // Search anchor inside rules page
    const searchInput = findSearchInput();
    if (!searchInput) return;

    const row = (searchInput.closest('.toolbar, nav, .navbar, .container, .card, [data-testid]') || searchInput.parentElement);
    if (!row) return;

    const container = document.createElement('div');
    container.id = 'rule-simulator-bar-container';

    // Insert right below the search / toolbar row
    row.insertAdjacentElement('afterend', container);
    renderRuleSimulator();
  }

  // ==========================================
  // 4. 自定义规则管理 (UserRulesModal)
  // ==========================================
  async function fetchUserRules() {
    try {
      userRulesState.loading = true;
      const apiEndpoint = getPanelApiBase('user-rules');
      const res = await fetch(apiEndpoint, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      userRulesState.rules = data.rules || [];
      if (Array.isArray(data.available_targets)) {
        userRulesState.targets = data.available_targets;
      }
    } catch (e) {
      console.warn('Failed to fetch user-rules:', e);
    } finally {
      userRulesState.loading = false;
      if (userRulesState.showModal && userRulesState.viewMode !== 'add') {
        renderModal();
      }
    }
  }

  async function deleteUserRule(ruleId) {
    if (!confirm('确定要删除此自定义规则吗？删除后将自动热重载生效。')) return;
    try {
      const apiEndpoint = getPanelApiBase('user-rules') + '/' + encodeURIComponent(ruleId);
      const res = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errMsg = data.error || (data.reconcile && data.reconcile.error) || res.statusText || '删除失败';
        alert('删除失败: ' + errMsg);
        return;
      }
      showToast('🗑️ 规则已删除并热重载生效！', 'success');
      await fetchUserRules();
    } catch (e) {
      alert('请求错误: ' + e.message);
    }
  }

  async function saveUserRule(ruleData, submitBtn) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '保存并生效中...';
    }
    try {
      const apiEndpoint = getPanelApiBase('user-rules');
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(ruleData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errMsg = data.error || (data.reconcile && data.reconcile.error) || res.statusText || '保存失败';
        alert('保存失败: ' + errMsg);
        return false;
      }
      showToast('✅ 规则保存成功并已热重载生效！', 'success');
      if (data.rule && data.rule.id) {
        const exists = userRulesState.rules.some((r) => r.id === data.rule.id);
        if (!exists) userRulesState.rules = [data.rule, ...userRulesState.rules];
      }
      userRulesState.viewMode = 'list';
      renderModal();
      await fetchUserRules();
      return true;
    } catch (e) {
      alert('请求错误: ' + e.message);
      return false;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '保存并生效';
      }
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
      document.body.appendChild(modalEl);
    }

    const currentLabel = getActiveBackendLabel();

    if (userRulesState.viewMode === 'add') {
      const ruleTypes = [
        'DOMAIN-SUFFIX',
        'DOMAIN',
        'DOMAIN-KEYWORD',
        'IP-CIDR',
        'IP-CIDR6',
        'GEOSITE',
        'GEOIP',
      ];
      const targetOptions = userRulesState.targets
        .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
        .join('');

      modalEl.innerHTML = `
        <div class="user-rules-modal-content">
          <div class="user-rules-modal-header">
            <div class="flex items-center gap-2">
              <button class="btn btn-ghost btn-sm btn-circle" id="btn-back-to-list">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h3 class="font-bold text-sm">新增自定义规则 <span class="badge badge-sm badge-outline text-[10px] ml-1 font-mono">${escapeHtml(currentLabel)}</span></h3>
            </div>
            <button class="btn btn-ghost btn-sm btn-circle" id="btn-close-modal">✕</button>
          </div>
          <div class="user-rules-modal-body flex flex-col gap-3.5">
            <div>
              <label class="block text-xs font-medium mb-1.5 opacity-70">规则类型</label>
              <select id="modal-rule-type" class="select select-bordered select-sm w-full font-mono">
                ${ruleTypes.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1.5 opacity-70">匹配目标 (Payload)</label>
              <input id="modal-rule-payload" class="input input-bordered input-sm w-full font-mono" placeholder="如: example.com 或 1.1.1.1/32" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1.5 opacity-70">分流策略 (Target)</label>
              <select id="modal-rule-target" class="select select-bordered select-sm w-full">
                ${targetOptions}
              </select>
            </div>
            <div class="p-2.5 bg-base-200/60 rounded-lg text-xs font-mono break-all opacity-80" id="modal-rule-preview">
              预览: DOMAIN-SUFFIX,,DIRECT
            </div>
            <div class="flex justify-end gap-2 mt-2">
              <button class="btn btn-sm" id="btn-cancel-add">取消</button>
              <button class="btn btn-sm btn-primary" id="btn-submit-add">保存并生效</button>
            </div>
          </div>
        </div>
      `;

      const typeEl = modalEl.querySelector('#modal-rule-type');
      const payloadEl = modalEl.querySelector('#modal-rule-payload');
      const targetEl = modalEl.querySelector('#modal-rule-target');
      const previewEl = modalEl.querySelector('#modal-rule-preview');

      function updatePreview() {
        const t = typeEl ? typeEl.value : '';
        const p = payloadEl && payloadEl.value ? payloadEl.value.trim() : '';
        const tg = targetEl ? targetEl.value : '';
        if (previewEl) previewEl.textContent = 'Mihomo: ' + `${t},${p || '...'},${tg}`;
      }

      typeEl.addEventListener('change', updatePreview);
      payloadEl.addEventListener('input', updatePreview);
      targetEl.addEventListener('change', updatePreview);
      updatePreview();

      modalEl.querySelector('#btn-back-to-list').onclick = () => {
        userRulesState.viewMode = 'list';
        renderModal();
      };
      modalEl.querySelector('#btn-cancel-add').onclick = () => {
        userRulesState.viewMode = 'list';
        renderModal();
      };
      modalEl.querySelector('#btn-close-modal').onclick = () => {
        userRulesState.showModal = false;
        renderModal();
      };
      modalEl.querySelector('#btn-submit-add').onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const liveType = document.getElementById('modal-rule-type');
        const livePayload = document.getElementById('modal-rule-payload');
        const liveTarget = document.getElementById('modal-rule-target');
        const payload = (livePayload ? livePayload.value : payloadEl.value).trim();
        if (!payload) {
          alert('请输入匹配目标 (Payload)');
          return;
        }
        const submitBtn = e.currentTarget || e.target;
        await saveUserRule({
          type: (liveType || typeEl).value,
          payload: payload,
          target: (liveTarget || targetEl).value,
          enabled: true,
        }, submitBtn);
      };
      return;
    }

    // List view
    const rows = userRulesState.rules.length
      ? userRulesState.rules
          .map(
            (r) => `
          <tr class="hover:bg-base-200/50 transition-colors">
            <td><span class="badge badge-sm badge-outline badge-primary font-mono text-[11px]">${escapeHtml(r.type)}</span></td>
            <td class="font-mono text-xs font-medium max-w-[180px] truncate" title="${escapeHtml(r.payload)}">${escapeHtml(r.payload)}</td>
            <td><span class="badge badge-sm badge-ghost text-success font-medium text-[11px]">${escapeHtml(r.target)}</span></td>
            <td class="text-[11px] opacity-60">${r.updatedAt ? escapeHtml(r.updatedAt.split('T')[0]) : 'UI'}</td>
            <td class="text-right">
              <button class="btn btn-xs btn-error btn-outline" data-delete-id="${escapeHtml(r.id)}">删除</button>
            </td>
          </tr>
        `
          )
          .join('')
      : `<tr><td colspan="5" class="text-center py-8 opacity-50 text-xs">暂无自定义规则，点击右上角“+ 新增规则”添加</td></tr>`;

    modalEl.innerHTML = `
      <div class="user-rules-modal-content">
        <div class="user-rules-modal-header">
          <div class="flex items-center gap-2">
            <svg class="h-4 w-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <h3 class="font-bold text-sm">自定义规则管理 <span class="badge badge-sm badge-outline text-[10px] ml-1 font-mono">${escapeHtml(currentLabel)}</span></h3>
            <span class="badge badge-sm badge-neutral text-[11px]">${userRulesState.rules.length}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button class="btn btn-xs btn-primary font-normal" id="btn-go-add">+ 新增规则</button>
            <button class="btn btn-ghost btn-xs btn-circle" id="btn-close-modal">✕</button>
          </div>
        </div>
        <div class="user-rules-modal-body p-0">
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead>
                <tr class="opacity-70 text-[11px]">
                  <th>类型</th>
                  <th>匹配目标</th>
                  <th>策略</th>
                  <th>更新时间</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    modalEl.querySelector('#btn-go-add').onclick = () => {
      userRulesState.viewMode = 'add';
      renderModal();
    };
    modalEl.querySelector('#btn-close-modal').onclick = () => {
      userRulesState.showModal = false;
      renderModal();
    };
    modalEl.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-delete-id');
        if (id) deleteUserRule(id);
      };
    });
  }

  function createRulesButton() {
    const btn = document.createElement('button');
    btn.id = 'user-rules-top-action-btn';
    btn.className = 'btn btn-circle btn-sm';
    btn.type = 'button';
    btn.title = '自定义规则管理';
    btn.innerHTML = `
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      userRulesState.showModal = true;
      userRulesState.viewMode = 'list';
      fetchUserRules();
      renderModal();
    };
    return btn;
  }

  function checkBackendChange() {
    const currentActiveUuid = localStorage.getItem('setup/active-uuid') || '';
    if (userRulesState.lastActiveUuid && userRulesState.lastActiveUuid !== currentActiveUuid) {
      userRulesState.lastActiveUuid = currentActiveUuid;
      fetchUserRules();
      fetchEgressIp(true);
      if (subManagerState.showModal) fetchSubscriptions();
    } else {
      userRulesState.lastActiveUuid = currentActiveUuid;
    }
  }

  // ---- 注入锚点定位 ----------------------------------------------------
  const MAX_PLACEMENT_TRIES = 30;
  let placementFailures = 0;

  function isSearchInput(input) {
    const ph = input.getAttribute && (input.getAttribute('placeholder') || '');
    return !!(ph && (ph.includes('Regex') || ph.includes('搜索') || ph.includes('Search')));
  }

  function findSearchInput() {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find(isSearchInput) || null;
  }

  function nearestGearBtn(anchor) {
    let row = anchor ? (anchor.parentElement || anchor) : null;
    while (row && row !== document.body && row !== document.documentElement) {
      const directBtns = Array.from(row.children).filter((ch) => {
        if (ch.tagName !== 'BUTTON') return false;
        const cls = ch.className || '';
        return cls.includes('btn-circle') && cls.includes('btn-sm') && !cls.includes('btn-xs');
      });
      if (directBtns.length > 0) return directBtns[directBtns.length - 1];
      row = row.parentElement;
    }
    return null;
  }

  function injectRulesAndSubButtons() {
    checkBackendChange();
    injectEgressBadge();

    const isRulesPage = location.hash.startsWith('#/rules');
    const existingRulesBtn = document.getElementById('user-rules-top-action-btn');
    const existingSubBtn = document.getElementById('sub-manager-top-action-btn');

    if (!isRulesPage) {
      placementFailures = 0;
      if (existingRulesBtn) existingRulesBtn.remove();
      if (existingSubBtn) existingSubBtn.remove();
      const simBar = document.getElementById('rule-simulator-bar-container');
      if (simBar) simBar.remove();
      return;
    }

    injectRuleSimulatorBar();

    if (existingRulesBtn && document.body.contains(existingRulesBtn) && existingSubBtn && document.body.contains(existingSubBtn)) {
      placementFailures = 0;
      return;
    }

    const searchInput = findSearchInput();
    if (!searchInput) {
      placementFailures += 1;
      if (placementFailures >= MAX_PLACEMENT_TRIES && placementFailures % 20 === 0) {
        console.error(
          '[user-rules-ui] 已在 #/rules 但持续找不到注入锚点（zashboard 布局可能变化）。'
        );
      }
      return;
    }

    placementFailures = 0;
    const gearBtn = nearestGearBtn(searchInput);
    const subBtn = existingSubBtn || createSubButton();
    const rulesBtn = existingRulesBtn || createRulesButton();

    if (gearBtn) {
      if (!existingSubBtn) gearBtn.insertAdjacentElement('beforebegin', subBtn);
      if (!existingRulesBtn) gearBtn.insertAdjacentElement('beforebegin', rulesBtn);
    } else {
      const row = (searchInput.closest('.toolbar, nav, .navbar, .container, .card, [data-testid]') || searchInput.parentElement);
      if (!existingSubBtn) row.insertAdjacentElement('afterbegin', subBtn);
      if (!existingRulesBtn) row.insertAdjacentElement('afterbegin', rulesBtn);
    }
  }

  const observer = new MutationObserver(() => {
    injectRulesAndSubButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', injectRulesAndSubButtons);
  setInterval(injectRulesAndSubButtons, 300);
  injectRulesAndSubButtons();
})();

