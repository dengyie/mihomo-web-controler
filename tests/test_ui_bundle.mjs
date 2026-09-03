// Unit test suite for user-rules-ui frontend bundle
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(REPO_ROOT, 'zashboard', 'src', 'user-rules-ui.js');

console.log('--- Testing subpage-architecture user-rules-ui.js in simulated browser environment ---');

const windowEvents = new Map();
const createdElements = [];

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...cls) {
    cls.forEach((c) => this.classes.add(c));
  }
  remove(...cls) {
    cls.forEach((c) => this.classes.delete(c));
  }
  contains(cls) {
    return this.classes.has(cls);
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this._innerHTML = '';
    this.innerText = '';
    this.style = {};
    this.open = false;
    this.classList = new MockClassList();
    this.dataset = {};
    createdElements.push(this);
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newNode, refNode) {
    const idx = this.children.indexOf(refNode);
    if (idx !== -1) {
      newNode.parentElement = this;
      this.children.splice(idx, 0, newNode);
    } else {
      this.appendChild(newNode);
    }
    return newNode;
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

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
  }

  getAttribute(k) {
    return this.attributes.get(k) || null;
  }

  getBoundingClientRect() {
    return { top: 100, bottom: 136, left: 8, right: 64, width: 56, height: 36 };
  }

  set innerHTML(val) {
    this._innerHTML = val;
    const matches = [...String(val).matchAll(/id=["']([^"']+)["']/g)];
    for (const m of matches) {
      const child = new MockElement('div');
      child.id = m[1];
      this.appendChild(child);
    }
  }

  get innerHTML() {
    if (this._innerHTML) {
      let html = this._innerHTML;
      for (const child of this.children) {
        if (child.id && child._innerHTML) {
          html = html.replace(`id="${child.id}"></div>`, `id="${child.id}">${child.innerHTML}</div>`);
        }
      }
      return html;
    }
    return '';
  }

  addEventListener(event, fn) {
    if (!windowEvents.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  click() {
    if (this.listeners.has('click')) {
      for (const fn of this.listeners.get('click')) {
        fn({
          preventDefault: () => {},
          stopPropagation: () => {},
          target: this,
        });
      }
    }
  }

  querySelector(selector) {
    const matches = this.querySelectorAll(selector);
    return matches.length > 0 ? matches[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (selector.startsWith('#') && child.id === selector.slice(1)) {
          results.push(child);
        } else if (selector.startsWith('.') && (child.className || '').includes(selector.slice(1))) {
          results.push(child);
        } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

const mockDoc = {
  head: new MockElement('head'),
  body: new MockElement('body'),
  readyState: 'complete',
  createElement: (tagName) => new MockElement(tagName),
  getElementById: (id) => {
    return createdElements.find((el) => el.id === id) || null;
  },
  querySelector: (sel) => {
    if (sel === '.home-page') return homePage;
    if (sel === 'ul.sidebar-route-menu') return sidebarMenu;
    if (sel === '.sidebar-tab-indicator') return indicator;
    if (sel === '.flex.gap-2.p-2') return topBar;
    return mockDoc.body.querySelector(sel);
  },
  querySelectorAll: (sel) => mockDoc.body.querySelectorAll(sel),
  addEventListener: (event, fn) => {
    if (!windowEvents.has(event)) windowEvents.set(event, []);
    windowEvents.get(event).push(fn);
  },
};

// Setup DOM hierarchy mimicking zashboard home-page
const homePage = new MockElement('div');
homePage.className = 'bg-base-200 home-page flex size-full sidebar-collapsed';
mockDoc.body.appendChild(homePage);

// Child 0: sidebar
const sidebarContainer = new MockElement('div');
sidebarContainer.className = 'relative z-40 flex-none overflow-visible w-18';
homePage.appendChild(sidebarContainer);

const indicator = new MockElement('div');
indicator.className = 'sidebar-tab-indicator';
sidebarContainer.appendChild(indicator);

const sidebarMenu = new MockElement('ul');
sidebarMenu.className = 'sidebar-route-menu menu h-full w-full';
sidebarContainer.appendChild(sidebarMenu);

// Existing items
['proxies', 'connections', 'logs', 'rules', 'settings'].forEach(route => {
  const li = new MockElement('li');
  li.setAttribute('data-sidebar-route', route);
  const a = new MockElement('a');
  a.className = 'hover:bg-base-300! justify-center relative z-10 py-2';
  li.appendChild(a);
  sidebarMenu.appendChild(li);
});

// Child 1: main container
const mainContainer = new MockElement('div');
mainContainer.className = 'relative flex-1 overflow-hidden';
homePage.appendChild(mainContainer);

const nativePage = new MockElement('div');
nativePage.className = 'absolute flex h-full w-full flex-col overflow-y-auto';
mainContainer.appendChild(nativePage);

const topBar = new MockElement('div');
topBar.className = 'flex gap-2 p-2';
nativePage.appendChild(topBar);

// Setup globals
global.document = mockDoc;
global.window = {
  addEventListener: (event, fn) => {
    if (!windowEvents.has(event)) windowEvents.set(event, []);
    windowEvents.get(event).push(fn);
  },
};
global.location = {
  hash: '#/proxies',
  search: '',
  href: 'https://3x-ui.mangoqwq.com/#/proxies',
};
global.localStorage = {
  _store: new Map([
    ['setup/active-uuid', 'backend-tebi-default'],
    ['setup/api-list', JSON.stringify([{ uuid: 'backend-tebi-default', password: 'test-secret-pwd' }])],
  ]),
  getItem(k) {
    return this._store.get(k) || null;
  },
  setItem(k, v) {
    this._store.set(k, String(v));
  },
};
global.fetch = async (url) => {
  if (url.includes('/diagnostics/egress-ip')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: {
          fastest: {
            source: 'ip-api.com',
            latency_ms: 220,
            data: { ip: '1.2.3.4', country_code: 'US', country: 'United States', city: 'San Jose' },
          },
          probes: [],
        },
      }),
    };
  }
  if (url.includes('/subscriptions')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: { subscriptions: [] },
      }),
    };
  }
  if (url.includes('/user-rules')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: { rules: [] },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', data: {} }),
  };
};

// Execute bundle code
const bundleCode = fs.readFileSync(BUNDLE_PATH, 'utf-8');
eval(bundleCode);

// 1. Assert Sidebar MenuItem Injected
const toolkitLi = mockDoc.getElementById('sidebar-item-toolkit');
assert.ok(toolkitLi, 'Sidebar MenuItem #sidebar-item-toolkit injected');

// 2. Navigate to Toolkit Subpage
global.location.hash = '#/proxies?tab=toolkit';
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}

const subpage = mockDoc.getElementById('zashboard-toolkit-page');
assert.ok(subpage, 'Subpage container #zashboard-toolkit-page rendered');
assert.strictEqual(subpage.style.display, 'flex', 'Toolkit subpage is displayed');
assert.strictEqual(nativePage.style.display, 'none', 'Native page is hidden while on toolkit');
assert.ok(subpage.innerHTML.includes('工具'), 'Subpage header rendered');
assert.ok(subpage.innerHTML.includes('settings-grid'), 'Subpage uses native settings-grid layout');
assert.ok(subpage.innerHTML.includes('need-blur'), 'Subpage uses native sticky topbar');
assert.ok(subpage.innerHTML.includes('data-slot="icon"'), 'Subpage uses native Heroicons');

assert.ok(subpage.querySelector('#toolkit-egress-slot'), 'Slot #toolkit-egress-slot exists');
assert.ok(subpage.querySelector('#toolkit-subs-slot'), 'Slot #toolkit-subs-slot exists');
assert.ok(subpage.querySelector('#toolkit-sim-slot'), 'Slot #toolkit-sim-slot exists');
assert.strictEqual(bundleCode.includes('uiIcon('), false, 'uiIcon is completely removed');
assert.strictEqual(bundleCode.includes('const ICONS ='), false, 'ICONS dictionary is completely removed');

console.log('✅ Toolkit Subpage Navigation, View Switching, and Slot Components passed');

// 3. Switch back to #/proxies
global.location.hash = '#/proxies';
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}
assert.strictEqual(subpage.style.display, 'none', 'Toolkit subpage is hidden on #/proxies');
assert.strictEqual(nativePage.style.display, '', 'Native page is restored on #/proxies');

console.log('✅ Return to Native Page #/proxies restores layout passed');

// 4. Test #/rules custom rules button and modal interaction
global.location.hash = '#/rules';
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}
const rulesTopBtn = mockDoc.getElementById('user-rules-top-action-btn');
assert.ok(rulesTopBtn, '#/rules top action button injected');

// Trigger open modal
rulesTopBtn.listeners.get('click')?.[0]?.();
const rulesModal = mockDoc.getElementById('user-rules-manager-modal');
assert.ok(rulesModal, 'User rules dialog #user-rules-manager-modal created');
assert.strictEqual(rulesModal.open, true, 'User rules dialog is opened');

const modalContent = mockDoc.getElementById('user-rules-modal-content');
assert.ok(modalContent, '#user-rules-modal-content exists');
assert.ok(modalContent.querySelector('#btn-go-add'), '+ 新增规则 button exists in list view');

// Switch to add mode
modalContent.querySelector('#btn-go-add').listeners.get('click')?.[0]?.();
assert.ok(modalContent.querySelector('#modal-rule-payload'), 'Payload input exists in add mode');
assert.ok(modalContent.querySelector('#modal-rule-type'), 'Type select exists in add mode');
assert.ok(modalContent.querySelector('#modal-rule-target'), 'Target select exists in add mode');
assert.ok(modalContent.querySelector('#btn-submit-add'), 'Submit button exists in add mode');

// Cancel and back to list
modalContent.querySelector('#btn-cancel-add').listeners.get('click')?.[0]?.();
assert.ok(modalContent.querySelector('#btn-go-add'), 'Returned to list view after cancel');

console.log('✅ #/rules Modal CRUD Controls (Add/List/Submit) verification passed');
console.log('🎉 All Subpage Architecture tests passed successfully!');
process.exit(0);
