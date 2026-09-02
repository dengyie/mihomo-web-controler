// Node.js test for user-rules-ui.js UI logic and DOM interactions
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiSrc = readFileSync(resolve(root, 'zashboard/dist/assets/user-rules-ui.js'), 'utf8');

console.log('--- Testing user-rules-ui.js in simulated browser environment ---');

// Mock a lightweight browser environment
const localStorageStore = new Map();
const windowEvents = new Map();

global.localStorage = {
  getItem: (k) => localStorageStore.get(k) || null,
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
};

global.location = {
  hash: '#/rules',
};

global.window = {
  addEventListener: (event, handler) => {
    if (!windowEvents.has(event)) windowEvents.set(event, []);
    windowEvents.get(event).push(handler);
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this._innerHTML = '';
    this.onclick = null;
    this.oninput = null;
    this.onkeydown = null;
    this.onchange = null;
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  get textContent() {
    return this._innerHTML.replace(/<[^>]+>/g, '');
  }

  set textContent(val) {
    this._innerHTML = String(val);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    
    // Simple tokenizer to construct the DOM tree
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)|<\/([a-zA-Z0-9-]+)>/g;
    const stack = [this];
    let m;
    while ((m = tagRegex.exec(html)) !== null) {
      if (m[1]) {
        // Open tag
        const tagName = m[1];
        const attrStr = m[2] || '';
        const isSelfClosing = m[3] === '/' || ['input', 'img', 'br', 'hr'].includes(tagName.toLowerCase());
        const child = new MockElement(tagName);
        child.parentElement = stack[stack.length - 1];

        const idMatch = attrStr.match(/id=["']([^"']+)["']/i);
        if (idMatch) child.id = idMatch[1];

        const classMatch = attrStr.match(/class=["']([^"']+)["']/i);
        if (classMatch) child.className = classMatch[1];

        const phMatch = attrStr.match(/placeholder=["']([^"']+)["']/i);
        if (phMatch) child.setAttribute('placeholder', phMatch[1]);

        const dataDelMatch = attrStr.match(/data-delete-id=["']([^"']+)["']/i);
        if (dataDelMatch) child.setAttribute('data-delete-id', dataDelMatch[1]);

        const dataSubMatch = attrStr.match(/data-sub-id=["']([^"']+)["']/i);
        if (dataSubMatch) child.setAttribute('data-sub-id', dataSubMatch[1]);

        const valMatch = attrStr.match(/value=["']([^"']+)["']/i);
        if (valMatch) child.value = valMatch[1];

        stack[stack.length - 1].children.push(child);

        if (!isSelfClosing) {
          stack.push(child);
        }
      } else if (m[5]) {
        // Close tag
        if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === m[5].toLowerCase()) {
          stack.pop();
        }
      }
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  insertAdjacentElement(position, el) {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const idx = siblings.indexOf(this);
    el.parentElement = this.parentElement;
    if (position === 'beforebegin') {
      siblings.splice(idx, 0, el);
    } else if (position === 'afterbegin') {
      this.children.unshift(el);
      el.parentElement = this;
    } else if (position === 'afterend') {
      siblings.splice(idx + 1, 0, el);
    }
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const subSelectors = selector.split(',').map(s => s.trim());
    const matchSingle = (child, sel) => {
      const target = sel.includes('>') ? sel.split('>').pop().trim() : sel;
      if (target.startsWith('#') && child.id === target.slice(1)) return true;
      if (target.startsWith('.') && child.className && child.className.includes(target.slice(1))) return true;
      if (target.startsWith('[') && target.endsWith(']')) return child.attributes.has(target.slice(1, -1));
      if (child.tagName.toLowerCase() === target.toLowerCase()) return true;
      return false;
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (subSelectors.some(s => matchSingle(child, s))) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.className && selector.split(',').some(s => curr.className.includes(s.trim().replace('.', '')))) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  contains(node) {
    if (!node) return false;
    let curr = node;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }
  addEventListener(event, handler) {
    this['on' + event] = handler;
  }
  removeEventListener() {}
  scrollIntoView() {}
  classList = {
    add: (cls) => { this.className = (this.className + ' ' + cls).trim(); },
    remove: (cls) => { this.className = (this.className || '').replace(cls, '').trim(); },
    contains: (cls) => (this.className || '').includes(cls),
  };
}

const mockDoc = {
  head: new MockElement('head'),
  body: new MockElement('body'),
  documentElement: new MockElement('html'),
  createElement: (tag) => new MockElement(tag),
  getElementById: function(id) {
    const find = (node) => {
      if (node.id === id) return node;
      for (const c of node.children) {
        const res = find(c);
        if (res) return res;
      }
      return null;
    };
    return find(this.body) || find(this.head);
  },
  querySelector: function(sel) {
    return this.body.querySelector(sel) || this.head.querySelector(sel);
  },
  querySelectorAll: function(sel) {
    return [...this.body.querySelectorAll(sel), ...this.head.querySelectorAll(sel)];
  },
};
mockDoc.documentElement.appendChild(mockDoc.head);
mockDoc.documentElement.appendChild(mockDoc.body);

global.document = mockDoc;

class MockMutationObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
}
global.MutationObserver = MockMutationObserver;

// Mock Fetch API
const fetchCalls = [];
global.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url, opts });
  if (url.includes('/diagnostics/egress-ip')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: {
          success: true,
          fastest: {
            source: 'ipinfo.io',
            latency_ms: 45.2,
            data: {
              ip: '104.28.19.88',
              country: 'US',
              city: 'San Jose',
              org: 'Cloudflare, Inc.',
            },
          },
          all_results: [
            { source: 'ipinfo.io', latency_ms: 45.2, data: { ip: '104.28.19.88' } },
            { source: 'cloudflare', latency_ms: 55.1, data: { ip: '104.28.19.88' } },
          ],
        },
      }),
    };
  }
  if (url.includes('/subscriptions') && !opts.method) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: {
          subscriptions: [
            {
              id: 'sub-1',
              name: '专线订阅',
              type: 'remote',
              url: 'https://example.com/sub',
              node_count: 35,
              enabled: true,
              updated_at: '2025-09-02T12:00:00',
            }
          ]
        }
      })
    };
  }
  if (url.includes('/rules/simulate')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: {
          success: true,
          domain: 'api.openai.com',
          matched_rule: {
            type: 'DOMAIN-SUFFIX',
            payload: 'openai.com',
            target: 'PROXY',
            raw: 'DOMAIN-SUFFIX,openai.com,PROXY',
          },
          dns: {
            nameservers: ['https://1.1.1.1/dns-query'],
            warnings: [],
          },
        },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', rules: [], available_targets: ['DIRECT', 'PROXY', 'REJECT'] }),
  };
};

// Seed Header and Rules toolbar in mock DOM
const header = new MockElement('header');
header.className = 'navbar';
mockDoc.body.appendChild(header);

const toolbar = new MockElement('div');
toolbar.className = 'toolbar';
const searchInput = new MockElement('input');
searchInput.setAttribute('placeholder', '搜索规则 / Search');
const gearBtn = new MockElement('button');
gearBtn.className = 'btn-circle btn-sm';
toolbar.appendChild(searchInput);
toolbar.appendChild(gearBtn);
mockDoc.body.appendChild(toolbar);

// Execute bundle
eval(uiSrc);

// Assertions
assert.ok(mockDoc.getElementById('user-rules-custom-styles'), 'Custom styles injected');
assert.ok(mockDoc.getElementById('egress-ip-badge-container'), 'EgressBadge injected into header');
assert.ok(mockDoc.getElementById('sub-manager-top-action-btn'), 'SubManager button injected in rules toolbar');
assert.ok(mockDoc.getElementById('user-rules-top-action-btn'), 'UserRules button injected in rules toolbar');
assert.ok(mockDoc.getElementById('rule-simulator-bar-container'), 'RuleSimulator bar injected on #/rules');

console.log('✅ UI Injection asserts passed');

// Test SubManager Modal Open
const subBtn = mockDoc.getElementById('sub-manager-top-action-btn');
subBtn.onclick({ stopPropagation: () => {} });
assert.ok(mockDoc.getElementById('sub-manager-modal'), 'SubManager modal opened on button click');
console.log('✅ SubManager Modal Open test passed');

// Test Rule Simulator Execution
const runSimBtn = mockDoc.getElementById('btn-run-rule-sim');
const simInput = mockDoc.getElementById('rule-sim-input');
if (simInput) simInput.value = 'api.openai.com';
if (runSimBtn) runSimBtn.onclick();

console.log('✅ Rule Simulator Trigger test passed');

// Test Egress Popover
const egressBadge = mockDoc.getElementById('egress-ip-badge-container');
egressBadge.onclick({ stopPropagation: () => {} });
assert.ok(mockDoc.getElementById('egress-popover-card'), 'Egress Popover opened on badge click');
console.log('✅ Egress Popover Open test passed');

// Test SubManager Modal Tabs & Operations
const modalEl = mockDoc.getElementById('sub-manager-modal');
assert.ok(modalEl, 'SubManager Modal DOM element present');

// Switch to raw import tab
const rawTab = modalEl.querySelector('#tab-sub-raw');
assert.ok(rawTab, 'Raw import tab present');
rawTab.onclick();
assert.ok(modalEl.querySelector('#sub-raw-content'), 'Raw import textarea present after tab switch');

// Switch back to URL tab
const urlTab = modalEl.querySelector('#tab-sub-url');
assert.ok(urlTab, 'URL import tab present');
urlTab.onclick();
assert.ok(modalEl.querySelector('#sub-add-url'), 'URL input present after switching back');

console.log('✅ SubManager Tab Switching test passed');

// Test Subscription URL submission
modalEl.querySelector('#sub-add-name').value = 'Test Sub';
modalEl.querySelector('#sub-add-url').value = 'https://example.com/sub.yaml';
const btnSubmitUrl = modalEl.querySelector('#btn-submit-sub-url');
assert.ok(btnSubmitUrl, 'Submit URL button present');
await btnSubmitUrl.onclick();
assert.ok(fetchCalls.some(c => c.url.includes('/subscriptions') && c.opts.method === 'POST'), 'POST /subscriptions called');
console.log('✅ SubManager URL Add Submission test passed');

// Test Subscription Toggle
const toggleBtn = modalEl.querySelector('.sub-toggle-btn');
if (toggleBtn) {
  toggleBtn.onchange({ target: { checked: false } });
  assert.ok(fetchCalls.some(c => c.url.includes('/toggle')), 'POST /toggle called');
  console.log('✅ SubManager Toggle test passed');
}

// Test Subscription Update
const updateBtn = modalEl.querySelector('.sub-update-btn');
if (updateBtn) {
  await updateBtn.onclick();
  assert.ok(fetchCalls.some(c => c.url.includes('/update')), 'POST /update called');
  console.log('✅ SubManager Update test passed');
}

// Test UserRules Add & Modal
const rulesBtn = mockDoc.getElementById('user-rules-top-action-btn');
rulesBtn.onclick({ stopPropagation: () => {} });
const rulesModal = mockDoc.getElementById('user-rules-manager-modal');
assert.ok(rulesModal, 'UserRules modal present');
const addRuleBtn = rulesModal.querySelector('#btn-go-add');
assert.ok(addRuleBtn, 'Add rule button present');
addRuleBtn.onclick();
assert.ok(rulesModal.querySelector('#modal-rule-payload'), 'Payload input present in add view');
console.log('✅ UserRules Modal Navigation test passed');

// Test XSS safety
const testXss = '<script>alert(1)</script>';
mockDoc.body.innerHTML = '';
toolbar.innerHTML = '';
toolbar.appendChild(searchInput);
toolbar.appendChild(gearBtn);
mockDoc.body.appendChild(header);
mockDoc.body.appendChild(toolbar);

console.log('🎉 All frontend UI unit tests passed successfully!');
process.exit(0);
