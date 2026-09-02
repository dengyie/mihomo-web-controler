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
    this.value = '';
    this.listeners = new Map();
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const h of list) h(event);
    if (event.type === 'click' && this.onclick) this.onclick(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', currentTarget: this, target: this, preventDefault: () => {}, stopPropagation: () => {} });
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

    // Simple parser to extract IDs and classes for querySelector
    const idRegex = /id=["']([^"']+)["']/g;
    let m;
    while ((m = idRegex.exec(html)) !== null) {
      const child = new MockElement('div');
      child.id = m[1];
      child.parentElement = this;
      this.children.push(child);
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    newChild.parentElement = this;
    const idx = this.children.indexOf(refChild);
    if (idx === -1) {
      this.children.push(newChild);
    } else {
      this.children.splice(idx, 0, newChild);
    }
    return newChild;
  }

  insertAdjacentElement(position, element) {
    element.parentElement = this.parentElement;
    if (!this.parentElement) return;
    const parentChildren = this.parentElement.children;
    const idx = parentChildren.indexOf(this);
    if (position === 'beforebegin') {
      if (idx !== -1) parentChildren.splice(idx, 0, element);
      else parentChildren.push(element);
    } else if (position === 'afterend') {
      if (idx !== -1) parentChildren.splice(idx + 1, 0, element);
      else parentChildren.push(element);
    } else if (position === 'afterbegin') {
      this.children.unshift(element);
      element.parentElement = this;
    } else if (position === 'beforeend') {
      this.children.push(element);
      element.parentElement = this;
    }
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector.startsWith('#') && child.id === selector.slice(1)) match = true;
        else if (selector.startsWith('.') && child.className.includes(selector.slice(1))) match = true;
        else if (child.tagName.toLowerCase() === selector.toLowerCase()) match = true;
        else if (selector.includes('.') && child.tagName.toLowerCase() === selector.split('.')[0].toLowerCase() && child.className.includes(selector.split('.')[1])) match = true;
        else if (selector.includes(child.id) && child.id) match = true;

        if (match) results.push(child);
        search(child);
      }
    };
    search(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.head = new MockElement('head');
    this.body = new MockElement('body');
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.body.querySelector('#' + id) || (this.head.querySelector('#' + id)) || null;
  }

  querySelector(selector) {
    return this.body.querySelector(selector) || this.head.querySelector(selector) || null;
  }

  querySelectorAll(selector) {
    return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)];
  }
}

const mockDoc = new MockDocument();
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
            source: 'ip-api.com',
            latency_ms: 45.2,
            data: {
              ip: '104.28.19.45',
              country: 'Hong Kong',
              country_code: 'HK',
              city: 'Hong Kong',
              isp: 'Cloudflare, Inc.',
              asn: '13335',
            }
          },
          all_results: [
            { source: 'ip-api.com', success: true, latency_ms: 45.2 },
            { source: 'cloudflare', success: true, latency_ms: 55.1 }
          ]
        }
      })
    };
  }
  if (url.includes('/subscriptions')) {
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
              updated_at: '2026-09-02T12:00:00',
            }
          ]
        }
      })
    };
  }
  if (url.includes('/simulate')) {
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
    json: async () => ({ status: 'ok', rules: [], targets: ['DIRECT', 'PROXY', 'REJECT'] }),
  };
};

// Seed zashboard DOM Structure: .home-page with sidebar menu and main content area
const homePage = new MockElement('div');
homePage.className = 'home-page';

const sidebarCol = new MockElement('div');
const sidebarMenu = new MockElement('ul');
sidebarMenu.className = 'sidebar-route-menu menu';
sidebarCol.appendChild(sidebarMenu);
homePage.appendChild(sidebarCol);

const mainContent = new MockElement('div');
mainContent.className = 'relative flex-1';
homePage.appendChild(mainContent);

mockDoc.body.appendChild(homePage);

// Also seed rules toolbar
const rulesContainer = new MockElement('div');
rulesContainer.className = 'rules-container';
const toolbar = new MockElement('div');
toolbar.className = 'toolbar';
const searchInput = new MockElement('input');
searchInput.setAttribute('placeholder', '搜索规则 / Search');
const gearBtn = new MockElement('button');
gearBtn.className = 'btn-circle btn-sm';
toolbar.appendChild(searchInput);
toolbar.appendChild(gearBtn);
rulesContainer.appendChild(toolbar);
mockDoc.body.appendChild(rulesContainer);

// Execute bundle
eval(uiSrc);

// Assertions
assert.ok(mockDoc.getElementById('user-rules-custom-styles'), 'Custom styles injected');
assert.ok(mockDoc.getElementById('zashboard-floating-egress-pill'), 'Global Floating Egress Pill injected');
assert.ok(mockDoc.getElementById('sidebar-item-toolkit'), 'Sidebar toolkit navigation item injected');
assert.ok(mockDoc.getElementById('user-rules-top-action-btn'), 'UserRules button injected on #/rules');

console.log('✅ Base UI Injection asserts passed');

// Test Navigation to #/toolkit
global.location.hash = '#/toolkit';
// trigger listeners or loop
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}

assert.ok(mockDoc.getElementById('zashboard-toolkit-view'), 'Toolkit view container injected on #/toolkit');
const toolkitView = mockDoc.getElementById('zashboard-toolkit-view');
assert.ok(toolkitView.children.length > 0, 'Toolkit view has child sections rendered');

console.log('✅ #/toolkit View Activation & Rendering asserts passed');

// Test UserRules Modal on #/rules
global.location.hash = '#/rules';
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}
const rulesBtn = mockDoc.getElementById('user-rules-top-action-btn');
assert.ok(rulesBtn, 'UserRules button present on #/rules');
rulesBtn.click();
assert.ok(mockDoc.getElementById('user-rules-manager-modal'), 'UserRules modal opened on click');

console.log('✅ UserRules Modal asserts passed');

console.log('🎉 All frontend UI unit tests passed successfully!');
process.exit(0);
