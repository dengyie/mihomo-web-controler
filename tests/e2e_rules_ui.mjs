// Playwright regression test: rules page injects the user-rules button + add rule.
//
// Verifies the whole #/rules injection feature end-to-end; the "button gone /
// syntax error" regressions that keep coming back (literal `\n`, silent
// injection failure) are exactly the class this guards.
//
// Run:
//   node tests/e2e_rules_ui.mjs <url>          # defaults to prod URL
//
// Prereq: `playwright` and a Chromium build available to NODE_PATH (e.g. the
// global `@playwright/mcp` install). Not wired into `npm test` because that
// stays dependency-free Python; run it as an optional regression gate.
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://3x-ui.mangoqwq.com/#/rules';
const FAIL = [];
const log = (m) => console.log(m);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

log(`[1] goto ${url}`);
await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => errors.push(`goto: ${e.message}`));
// injection triggers on 300ms interval; allow SPA async render.
await page.waitForTimeout(6000);

const btnExists = await page.evaluate(() => !!document.getElementById('user-rules-top-action-btn'));
log(`[2] top button injected: ${btnExists}`);
if (!btnExists) FAIL.push('top user-rules button did not inject');

const stylesLoaded = await page.evaluate(() => !!document.getElementById('user-rules-custom-styles'));
log(`[3] custom styles loaded: ${stylesLoaded}`);

if (btnExists) {
  await page.click('#user-rules-top-action-btn');
  await page.waitForTimeout(1200);
}

const modal = await page.evaluate(() => {
  const m = document.getElementById('user-rules-manager-modal');
  if (!m) return { exists: false, hasAdd: false };
  return { exists: true, hasAdd: !!m.querySelector('#btn-go-add') };
});
log(`[4] modal exists: ${modal.exists}, "+ 新增规则" visible: ${modal.hasAdd}`);
if (!modal.exists || !modal.hasAdd) FAIL.push('add-rule modal/button not present');

const fatalJsError = errors.some((e) => /SyntaxError|Invalid or unexpected token/i.test(e));
log(`[5] JS syntax errors: ${fatalJsError}`);
if (fatalJsError) FAIL.push('user-rules-ui.js failed to parse (syntax error)');

await browser.close();

if (FAIL.length) {
  console.error('\nFAILED checks:'); FAIL.forEach((f) => console.error('  - ' + f));
  console.error('\npage errors:\n' + errors.slice(0, 20).join('\n'));
  process.exit(1);
}
log('\nPASS: #/rules user-rules UI regression OK');