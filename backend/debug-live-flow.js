const { chromium } = require('playwright');

async function dismissConsent(page) {
  const cssCandidates = [
    '.consent-scrim',
    '.consent-overlay',
    '[role="dialog"]',
    '[aria-label="Close"]',
  ];

  for (const selector of cssCandidates) {
    const target = page.locator(selector).first();
    if ((await target.count()) > 0) {
      try {
        if (await target.isVisible().catch(() => false)) {
          await target.click({ force: true, timeout: 2000 }).catch(() => {});
        }
      } catch {}
    }
  }

  await page.evaluate(() => {
    const overlay = document.querySelector('.consent-scrim');
    if (overlay) overlay.remove();
    const dialog = document.querySelector('.consent-overlay');
    if (dialog) dialog.remove();
    const root = document.body;
    if (root) root.style.overflow = 'visible';
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  await page.goto('https://demo.inelabteamdev.com/item/2568', { waitUntil: 'domcontentloaded', timeout: 20000 });

  const consent = page.locator('button[aria-label="Allow cookies"], button:has-text("Allow cookies"), button:has-text("Allow")').first();
  if (await consent.count()) {
    const v = await consent.isVisible().catch(() => false);
    if (v) await consent.click({ force: true });
  }

  await dismissConsent(page);
  await page.locator('button:has-text("Standard kit")').first().click({ force: true });

  const panel = page.locator('.offer-panel').first();
  const box = await panel.boundingBox();
  console.log('BOX', box);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await page.waitForTimeout(2000);

  console.log('AFTER MOUSE', JSON.stringify(await panel.evaluate(el => ({
    className: el.className,
    text: el.innerText.slice(0, 300),
    buttonDisabled: !!el.querySelector('button') && el.querySelector('button').disabled,
  }))));

  const btn = page.locator("button[aria-label=\"Check today’s price\"]").first();
  console.log('BTN count', await btn.count());
  console.log('BTN visible', await btn.isVisible().catch(() => false));
  console.log('BTN disabled', await btn.isDisabled().catch(() => true));

  await browser.close();
})();
