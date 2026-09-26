const { chromium } = require('playwright');
const { STORE_URL, DEFAULT_SCRAPE_CONFIG, buildRetryDelay } = require('./config');
const { logScrapeAttempt } = require('./logger');
const { validateScrapeResult, normalizePriceValue, normalizeStockValue } = require('./validation');
const { getProductMetadata } = require('./metadata');

function getConsentOverlaySelectors() {
  return [
    '.consent-scrim',
    '.consent-overlay',
    'button[aria-label="Allow cookies"]',
    'button:has-text("Allow cookies")',
    'button:has-text("Allow")',
  ];
}

function resolveRequestedOption(product, requestedOption) {
  const candidate = (requestedOption || '').toString().trim();

  if (!candidate) {
    return product.options[0] ? product.options[0].label : null;
  }

  const match = product.options.find((option) =>
    option.label && option.label.toLowerCase() === candidate.toLowerCase(),
  );

  if (match) {
    return match.label;
  }

  const partialMatch = product.options.find((option) =>
    option.label && option.label.toLowerCase().includes(candidate.toLowerCase()),
  );

  if (partialMatch) {
    return partialMatch.label;
  }

  return null;
}

async function dismissConsentOverlay(page) {
  const selectors = getConsentOverlaySelectors();

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    if ((await candidate.count()) === 0) {
      continue;
    }

    const visible = await candidate.isVisible().catch(() => false);
    if (visible) {
      await candidate.click({ force: true, timeout: 2000 }).catch(() => {});
    }
  }

  await page.evaluate(() => {
    ['.consent-scrim', '.consent-overlay'].forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    });

    if (document.body) {
      document.body.style.overflow = 'visible';
      document.body.style.pointerEvents = 'auto';
    }
  });
}

function extractPriceText(rawText) {
  if (!rawText) {
    return null;
  }

  const text = String(rawText).trim();
  const cleaned = text.replace(/₹/g, '').replace(/Rs\.?/gi, '').replace(/,/g, '');
  const match = cleaned.match(/\d[\d\s.]+/);

  if (!match) {
    return null;
  }

  const numericText = match[0].replace(/\s+/g, '').replace(/\./g, '');
  return numericText || null;
}

function extractStockText(rawText) {
  if (!rawText) {
    return null;
  }

  const text = String(rawText).trim();
  if (/sold out/i.test(text)) {
    return 'Sold out';
  }

  const match = text.match(/(\d[\d,\s]*)/);
  return match ? match[1].trim() : null;
}

async function attemptLivePriceScrape({ productId, productName, selectedOption, config, attempt }) {
  let browser;
  let context;
  let page;

  try {
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 1400 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    page = await context.newPage();
    page.setDefaultTimeout(config.pageTimeoutMs);

    const startedAt = Date.now();

    await page.goto(`${STORE_URL}/item/${productId}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs,
    });

    await dismissConsentOverlay(page);

    await page.locator('h1').first().waitFor({ timeout: config.pageTimeoutMs }).catch(() => {
      throw new Error('Product page did not load successfully');
    });

    const optionButton = page
      .locator('button')
      .filter({ hasText: selectedOption })
      .first();

    if ((await optionButton.count()) === 0) {
      throw new Error(`Option control not found for ${selectedOption}`);
    }

    await optionButton.click({ force: true });

    const priceButton = page.locator('button[aria-label="Check today’s price"], button:has-text("Check today’s price")').first();
    await priceButton.waitFor({ state: 'visible', timeout: config.priceTimeoutMs }).catch(() => {
      throw new Error('Price check button was not found');
    });

    const offerPanel = page.locator('.offer-panel').first();
    const panelBox = await offerPanel.boundingBox().catch(() => null);

    if (panelBox) {
      const centerX = panelBox.x + panelBox.width / 2;
      const centerY = panelBox.y + panelBox.height / 2;
      const moveTargets = [
        [centerX - 120, centerY - 12],
        [centerX + 120, centerY + 8],
        [centerX - 80, centerY + 25],
        [centerX + 80, centerY - 20],
        [centerX, centerY],
        [centerX - 50, centerY + 40],
        [centerX + 50, centerY - 40],
        [centerX + 10, centerY + 25],
        [centerX - 10, centerY - 25],
      ];

      for (const [x, y] of moveTargets) {
        await page.mouse.move(x, y, { steps: 8 });
        await page.waitForTimeout(100);
      }

      await page.waitForTimeout(700);
    }

    await priceButton.waitFor({ state: 'visible', timeout: config.priceTimeoutMs }).catch(() => {
      throw new Error('Price check button was not found');
    });

    if (await priceButton.isDisabled().catch(() => true)) {
      await page.mouse.move((panelBox?.x ?? 0) + (panelBox?.width ?? 200) / 2, (panelBox?.y ?? 0) + (panelBox?.height ?? 80) / 2, { steps: 16 });
      await page.waitForTimeout(600);
    }

    await priceButton.click({ force: true });

    await page.locator('.offer-panel.offer-ready').waitFor({
      state: 'visible',
      timeout: config.priceTimeoutMs,
    }).catch(() => {
      throw new Error('Live price element was not found');
    });

    const livePanel = page.locator('.offer-panel.offer-ready').first();
    const priceText = await livePanel.locator('.price-value').first().textContent().catch(() => null);
    const stockText = await livePanel.locator('.avail-pill').first().textContent().catch(() => null);

    const parsedPrice = normalizePriceValue(extractPriceText(priceText || livePanel.innerText()));
    const parsedStock = normalizeStockValue(extractStockText(stockText || livePanel.innerText()));

    if (parsedPrice === null) {
      throw new Error('Price is missing or invalid');
    }

    if (parsedStock === null) {
      throw new Error('Stock is missing or invalid');
    }

    return {
      success: true,
      productId: String(productId),
      productName: productName,
      selectedOption,
      price: parsedPrice,
      stock: parsedStock,
      attempts: attempt,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }

    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function scrapeLiveOffer({ productId, option, config = {} }) {
  const product = await getProductMetadata(productId);
  const resolvedOption = resolveRequestedOption(product, option);

  if (!resolvedOption) {
    return {
      success: false,
      productId: String(productId),
      selectedOption: option || null,
      error: 'Requested option was not found on the product',
      attempts: 0,
    };
  }

  const mergedConfig = { ...DEFAULT_SCRAPE_CONFIG, ...config };
  let lastError = null;

  for (let attempt = 1; attempt <= mergedConfig.maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const result = await attemptLivePriceScrape({
        productId,
        productName: product.productName,
        selectedOption: resolvedOption,
        config: mergedConfig,
        attempt,
      });

      const validation = validateScrapeResult(result);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      logScrapeAttempt({
        productId,
        selectedOption: resolvedOption,
        attempt,
        stage: 'live-price',
        success: true,
        durationMs: Date.now() - startedAt,
      });

      return {
        success: true,
        productId: String(productId),
        productName: product.productName,
        selectedOption: resolvedOption,
        price: validation.price,
        stock: validation.stock,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error.message || 'Unknown scrape error';
      logScrapeAttempt({
        productId,
        selectedOption: resolvedOption,
        attempt,
        stage: 'live-price',
        success: false,
        error: lastError,
        durationMs: Date.now() - startedAt,
      });

      if (attempt < mergedConfig.maxAttempts) {
        const delayMs = buildRetryDelay(attempt, mergedConfig);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    success: false,
    productId: String(productId),
    productName: product.productName,
    selectedOption: resolvedOption,
    error: lastError || 'Live price scrape failed',
    attempts: mergedConfig.maxAttempts,
  };
}

module.exports = {
  getConsentOverlaySelectors,
  dismissConsentOverlay,
  resolveRequestedOption,
  extractPriceText,
  extractStockText,
  attemptLivePriceScrape,
  scrapeLiveOffer,
};
