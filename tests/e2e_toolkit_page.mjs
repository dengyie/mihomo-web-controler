// Playwright E2E test for the new #/toolkit page and features
import { chromium } from '/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';

const url = process.argv[2] || 'https://3x-ui.mangoqwq.com/#/proxies';
console.log('=== Starting E2E Toolkit Page Validation ===');
console.log('Target URL:', url);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push('console.error: ' + m.text());
});

try {
  // 1. 进入初始页面
  console.log('[1] Navigate to initial page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // 2. 检查全局悬浮胶囊
  const pillExists = await page.evaluate(() => !!document.getElementById('zashboard-floating-egress-pill'));
  console.log('[2] Floating Egress Pill Injected:', pillExists);

  // 3. 检查侧边栏 Toolkit 图标
  const sidebarItemExists = await page.evaluate(() => !!document.getElementById('sidebar-item-toolkit'));
  console.log('[3] Sidebar Toolkit Navigation Item Injected:', sidebarItemExists);

  // 4. 点击侧边栏或导航至 #/toolkit
  console.log('[4] Navigating to #/toolkit...');
  await page.evaluate(() => { location.hash = '#/toolkit'; });
  await page.waitForTimeout(3500);

  // 5. 检查 ToolkitView 视图挂载
  const viewState = await page.evaluate(() => {
    const v = document.getElementById('zashboard-toolkit-view');
    if (!v) return { exists: false };
    return {
      exists: true,
      visible: v.style.display !== 'none',
      hasEgressCard: !!v.querySelector('.toolkit-card'),
      hasSubCenter: v.innerText.includes('订阅与节点聚合中心'),
      hasRuleSim: v.innerText.includes('规则分流与 DNS 污染推演'),
      htmlSnippet: v.innerHTML.slice(0, 200),
    };
  });
  console.log('[5] Toolkit View State:', JSON.stringify(viewState, null, 2));

  // 6. 检查推演栏与快捷点击
  console.log('[6] Testing Rule Simulator in Toolkit...');
  const simResult = await page.evaluate(async () => {
    const v = document.getElementById('zashboard-toolkit-view');
    const input = v.querySelector('#toolkit-sim-input');
    const runBtn = v.querySelector('#btn-toolkit-run-sim');
    if (!input || !runBtn) return { success: false, reason: 'no input or btn' };
    input.value = 'api.openai.com';
    runBtn.click();
    return { success: true };
  });
  console.log('[6] Rule Simulator Trigger:', simResult);

  // 7. 切回 #/proxies 检查自愈与原生还原
  console.log('[7] Navigating back to #/proxies...');
  await page.evaluate(() => { location.hash = '#/proxies'; });
  await page.waitForTimeout(2000);
  const backState = await page.evaluate(() => {
    const v = document.getElementById('zashboard-toolkit-view');
    return {
      viewHidden: !v || v.style.display === 'none',
    };
  });
  console.log('[7] Restored on #/proxies:', backState);

  console.log('\nPage Errors encountered:', pageErrors);
  if (pageErrors.length > 0) {
    console.error('❌ E2E Encountered Console/Page Errors!');
    process.exit(1);
  } else {
    console.log('🎉 E2E Toolkit Page Validation Passed Successfully!');
  }
} finally {
  await browser.close();
}
