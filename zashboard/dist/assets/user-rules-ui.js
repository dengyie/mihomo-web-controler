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

  // 1. Inject Styles for User Rules Modal & Icon
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
      max-width: 640px;
      max-height: 85vh;
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
    #user-rules-top-action-btn {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin-right: 6px;
      flex-shrink: 0;
    }
  `;
  if (!document.getElementById('user-rules-custom-styles')) {
    document.head.appendChild(style);
  }

  let userRulesState = {
    rules: [],
    targets: ['DIRECT', 'REJECT', 'GLOBAL'],
    loading: false,
    showModal: false,
    viewMode: 'list', // 'list' | 'add'
    lastActiveUuid: '',
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

  function getPanelApiBase() {
    const active = getActiveBackend();
    if (active && active.secondaryPath) {
      let sp = active.secondaryPath.trim().replace(/\/+$/, '');
      if (sp && !sp.startsWith('/')) sp = '/' + sp;
      return sp + '/user-rules';
    }
    return '/panel/api/user-rules';
  }

  function getPanelAuthToken() {
    // Never fall back to a hardcoded default secret. The real password is
    // injected into the served page (index.html __PANEL_PASSWORD__) by the
    // gateway, and stored into the active backend's `password` field at seed
    // time. If it's somehow missing, fail cleanly (empty token) instead of
    // shipping a well-known credential.
    return getActiveBackend()?.password || '';
  }

  function getActiveBackendLabel() {
    const active = getActiveBackend();
    return active?.label || 'node';
  }

  async function fetchUserRules() {
    try {
      userRulesState.loading = true;
      const token = getPanelAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const apiEndpoint = getPanelApiBase();
      const res = await fetch(apiEndpoint, { headers });
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
      // Never rebuild the add form from a background GET. Opening the modal
      // kicks off fetchUserRules(); if that GET lands after the user has
      // switched to "add" (or is mid-submit), renderModal() would wipe the
      // typed payload, drop the submit handler, and swallow the success toast.
      if (userRulesState.showModal && userRulesState.viewMode !== 'add') {
        renderModal();
      }
    }
  }

  async function deleteUserRule(ruleId) {
    if (!confirm('确定要删除此自定义规则吗？删除后将自动热重载生效。')) return;
    try {
      const token = getPanelAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const apiEndpoint = getPanelApiBase() + '/' + encodeURIComponent(ruleId);
      const res = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers,
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
      const token = getPanelAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const apiEndpoint = getPanelApiBase();
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(ruleData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errMsg = data.error || (data.reconcile && data.reconcile.error) || res.statusText || '保存失败';
        alert('保存失败: ' + errMsg);
        return false;
      }
      showToast('✅ 规则保存成功并已热重载生效！', 'success');
      // Switch to list immediately so the user sees the result without waiting
      // for the follow-up GET (POST already took the reconcile round-trip).
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
        const t = typeEl.value;
        const p = payloadEl.value.trim();
        const tg = targetEl.value;
        previewEl.textContent = 'Mihomo: ' + `${t},${p || '...'},${tg}`;
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
    } else {
      userRulesState.lastActiveUuid = currentActiveUuid;
    }
  }

  // ---- 注入锚点定位 ----------------------------------------------------
  // 策略：用稳定的“搜索输入框”作为锚点；把它所在的工具栏/卡片作为容器，
  // 在最近一行齿轮按钮前插入自定义按钮。找不到锚点就显式 console.error，
  // 绝不静默消失（让“按钮消失”变成可见告警而不是回归）。
  const MAX_PLACEMENT_TRIES = 30; // 规则页异步渲染时的等待尝试次数（300ms interval）
  let placementFailures = 0;

  function isSearchInput(input) {
    const ph = input.getAttribute && (input.getAttribute('placeholder') || '');
    return !!(ph && (ph.includes('Regex') || ph.includes('搜索') || ph.includes('Search')));
  }

  // 找到规则页面的搜索输入框（最可靠的注入锚点），否则返回 null。
  function findSearchInput() {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find(isSearchInput) || null;
  }

  // 从搜索输入框所在行向上找最近的“齿轮”按钮（btn-circle + btn-sm 且非 btn-xs）。
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

  // 精确注入：定位“规则设置”齿轮按钮。找不到锚点或持续失败就 console.error，
  // 绝不静默 return（让“按钮消失”变为可见告警而不是回归）。
  function injectRulesButton() {
    checkBackendChange();
    const isRulesPage = location.hash.startsWith('#/rules');
    const existingBtn = document.getElementById('user-rules-top-action-btn');

    if (!isRulesPage) {
      placementFailures = 0;
      if (existingBtn) existingBtn.remove();
      return;
    }

    if (existingBtn && document.body.contains(existingBtn)) {
      placementFailures = 0;
      return;
    }

    const searchInput = findSearchInput();
    if (!searchInput) {
      // 规则页已就绪但暂时找不到锚点：可能是异步 SPA 渲染。给足尝试次数后再告警。
      placementFailures += 1;
      if (placementFailures >= MAX_PLACEMENT_TRIES && placementFailures % 20 === 0) {
        console.error(
          '[user-rules-ui] 已在 #/rules 但持续找不到注入锚点（zashboard 布局可能变化）。',
          '自定义规则按钮将不会显示，请检查搜索框 placeholder 或工具栏结构。',
        );
      }
      return;
    }

    placementFailures = 0;
    const gearBtn = nearestGearBtn(searchInput);
    if (gearBtn) {
      gearBtn.insertAdjacentElement('beforebegin', createRulesButton());
    } else {
      // 单独搜索框无齿轮按钮时，把按钮插入搜索框所在行开头，保证可点。
      const row = (searchInput.closest('.toolbar, nav, .navbar, .container, .card, [data-testid]') || searchInput.parentElement);
      row.insertAdjacentElement('afterbegin', createRulesButton());
    }
  }

  const observer = new MutationObserver(() => {
    injectRulesButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', injectRulesButton);
  setInterval(injectRulesButton, 300);
})();
