/** Playwright: launch, screenshot, win and retry each Game Controller mini-game. */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:4330/';
const OUT = '/workspace/pe-shots';
mkdirSync(OUT, { recursive: true });

const GAMES = ['slide', 'maze', 'lockpick', 'memory', 'chase'];
const browser = await chromium.launch();
const errors = [];
const results = [];
const ok = (name, cond, info = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
  console.log(results.at(-1));
};

const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const LANDSCAPE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function open(name, game, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${BASE}?debug=minigame=${game},nolight`);
  await page.waitForFunction(() => window.__PE_GAME__?.scene?.isActive('UIScene'), null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('pe-minigame');
    return !!el && !el.hidden && el.getAttribute('data-game') && el.getBoundingClientRect().width > 40;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

for (const game of GAMES) {
  for (const [label, opts] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
    const { ctx, page } = await open(`${game}-${label}`, game, opts);
    const box = await page.locator('#pe-minigame-close').boundingBox();
    ok(`${game} ${label} close >= 48px`, !!box && box.width >= 48 && box.height >= 48, box ? `${box.width}x${box.height}` : 'missing');
    const shown = await page.getAttribute('#pe-minigame', 'data-game');
    ok(`${game} ${label} opens`, shown === game && await page.isVisible('#pe-minigame'), `data-game=${shown}`);
    await page.screenshot({ path: `${OUT}/minigame-${game}-${label}.png` });
    await page.evaluate(() => window.__PE_MINIGAME__.playWin());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      status: window.__PE_MINIGAME__?.status,
      data: document.getElementById('pe-minigame')?.dataset.status,
      holding: window.__PE_ITEMS__?.holding(),
      code: window.__PE_CODE__ || window.__PE_ITEMS__?.knownCode(),
    }));
    ok(`${game} ${label} wins`, after.status === 'won' && after.data === 'won', JSON.stringify({ status: after.status, data: after.data }));
    ok(`${game} ${label} controller kept`, after.holding === true, `holding=${after.holding}`);
    ok(`${game} ${label} code revealed`, Array.isArray(after.code) && after.code.length === 4, `code=${after.code}`);
    await page.screenshot({ path: `${OUT}/minigame-${game}-${label}-win.png` });
    await ctx.close();
  }
}

// Retry after timeout (slide, landscape): expire, message, close, reopen, still holding.
{
  const { ctx, page } = await open('retry', 'slide', LANDSCAPE);
  await page.evaluate(() => window.__PE_MINIGAME__.expire());
  await page.waitForTimeout(200);
  const lost = await page.evaluate(() => ({
    status: window.__PE_MINIGAME__?.status,
    text: document.getElementById('pe-minigame-status')?.textContent,
    holding: window.__PE_ITEMS__?.holding(),
  }));
  ok('retry: timeout loses', lost.status === 'lost', lost.status);
  ok('retry: keep controller after timeout', lost.holding === true, `holding=${lost.holding}`);
  ok('retry: message mentions try again', /try again/i.test(lost.text || ''), lost.text);
  await page.screenshot({ path: `${OUT}/minigame-slide-retry.png` });
  await page.click('#pe-minigame-close');
  await page.waitForTimeout(200);
  ok('retry: close hides popup', await page.isHidden('#pe-minigame'));
  await page.evaluate(() => window.__PE_ITEMS__.open('slide'));
  await page.waitForSelector('#pe-minigame:not([hidden])');
  const again = await page.evaluate(() => ({
    open: window.__PE_MINIGAME__?.open,
    status: window.__PE_MINIGAME__?.status,
    holding: window.__PE_ITEMS__?.holding(),
    game: document.getElementById('pe-minigame')?.dataset.game,
  }));
  ok('retry: can play again still holding controller', again.open && again.status === 'playing' && again.holding && again.game === 'slide', JSON.stringify(again));
  await ctx.close();
}

// Keyboard: Escape closes; Enter confirms (lock pick via playWin already covered).
{
  const { ctx, page } = await open('esc', 'memory', PORTRAIT);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Escape closes the popup', await page.isHidden('#pe-minigame'));
  await ctx.close();
}

ok('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
const fails = results.filter((l) => l.startsWith('FAIL')).length;
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
console.log(results.join('\n'));
await browser.close();
process.exit(fails ? 1 : 0);
