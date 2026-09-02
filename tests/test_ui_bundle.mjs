// Unit test suite for user-rules-ui frontend bundle
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(REPO_ROOT, 'zashboard', 'src', 'user-rules-ui.js');

console.log('--- Testing refactored clean user-rules-ui.js in simulated browser environment ---');

// Mock browser DOM
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
  toggle(cls) {
    if (this.classes.has(cls)) {
      this.classes.delete(cls);
    } else {
      this.classes.add(cls);
    }
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

  set innerHTML(val) {
    this._innerHTML = val;
    // scan for id="..." in mock html
    const matches = [...String(val).matchAll(/id=["']([^"']+)["']/g)];
    for (const m of matches) {
      const child = new MockElement('div');
      child.id = m[1];
      this.appendChild(child);
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
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

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
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
    if (sel.includes('.flex.gap-2.p-2')) {
      return topBar;
    }
    if (sel.includes('.sidebar')) {
      return sidebarBottomContainer;
    }
    return mockDoc.body.querySelector(sel);
  },
  querySelectorAll: (sel) => mockDoc.body.querySelectorAll(sel),
  addEventListener: (event, fn) => {
    if (!windowEvents.has(event)) windowEvents.set(event, []);
    windowEvents.get(event).push(fn);
  },
};

// Setup DOM hierarchy mimicking zashboard
const homePage = new MockElement('div');
homePage.className = 'home-page';
mockDoc.body.appendChild(homePage);

const topBar = new MockElement('div');
topBar.className = 'flex gap-2 p-2';
homePage.appendChild(topBar);

const sidebar = new MockElement('div');
sidebar.className = 'sidebar';
homePage.appendChild(sidebar);

const sidebarBottomContainer = new MockElement('div');
sidebarBottomContainer.className = 'flex flex-col items-center justify-center gap-2';
sidebar.appendChild(sidebarBottomContainer);

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

// Assert topbar toolkit button injected
const topbarBtn = mockDoc.getElementById('btn-topbar-toolkit');
assert.ok(topbarBtn, 'Topbar toolkit button injected cleanly');

// Click topbar button to open modal
topbarBtn.click();
const modal = mockDoc.getElementById('zashboard-toolkit-modal');
assert.ok(modal, 'Toolkit modal element created on click');
assert.strictEqual(modal.open, true, 'Toolkit modal opened on click');

const modalBody = mockDoc.getElementById('zashboard-toolkit-modal-body');
assert.ok(modalBody, 'Toolkit modal body exists');
assert.ok(modalBody.innerHTML.includes('网络聚合与诊断工具箱'), 'Toolkit title rendered inside modal');

console.log('✅ Topbar Toolkit Modal opening asserts passed');

// Test Rules Page Custom Rules Button
global.location.hash = '#/rules';
if (windowEvents.has('hashchange')) {
  for (const fn of windowEvents.get('hashchange')) fn();
}
const rulesBtn = mockDoc.getElementById('user-rules-top-action-btn');
assert.ok(rulesBtn, 'UserRules button injected on #/rules');
rulesBtn.click();
const rulesModal = mockDoc.getElementById('user-rules-manager-modal');
assert.ok(rulesModal, 'UserRules modal opened');
assert.strictEqual(rulesModal.open, true, 'UserRules modal is open');

console.log('✅ UserRules Modal asserts passed');
console.log('🎉 All clean UI bundle tests passed successfully!');
process.exit(0);
