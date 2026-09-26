const test = require('node:test');
const assert = require('node:assert/strict');

const { getProductMetadata } = require('../src/scraper/metadata');
const { validateScrapeResult, normalizePriceValue, normalizeStockValue } = require('../src/scraper/validation');
const { buildRetryDelay } = require('../src/scraper/config');
const { getConsentOverlaySelectors } = require('../src/scraper/liveOffer');

test('getProductMetadata fetches a real item from the mock store', async () => {
  const metadata = await getProductMetadata(2568);

  assert.equal(metadata.productId, '2568');
  assert.equal(metadata.productName, 'Junova Gimbal Nano');
  assert.ok(metadata.sku);
  assert.ok(Array.isArray(metadata.options));
  assert.ok(metadata.options.length >= 1);
});

test('validateScrapeResult accepts a valid live offer', () => {
  const result = {
    productId: '2568',
    productName: 'Junova Gimbal Nano',
    selectedOption: 'Standard kit',
    price: '₹3,88,438',
    stock: 'Stock: 168 remaining',
  };

  const validation = validateScrapeResult(result);

  assert.equal(validation.valid, true);
  assert.equal(validation.price, 388438);
  assert.equal(validation.stock, 168);
});

test('validateScrapeResult rejects missing price', () => {
  const result = {
    productId: '2568',
    productName: 'Junova Gimbal Nano',
    selectedOption: 'Standard kit',
    price: null,
    stock: 10,
  };

  const validation = validateScrapeResult(result);

  assert.equal(validation.valid, false);
  assert.match(validation.error, /Price/);
});

test('validateScrapeResult rejects invalid stock', () => {
  const result = {
    productId: '2568',
    productName: 'Junova Gimbal Nano',
    selectedOption: 'Standard kit',
    price: 4999,
    stock: -5,
  };

  const validation = validateScrapeResult(result);

  assert.equal(validation.valid, false);
  assert.match(validation.error, /Stock/);
});

test('normalizePriceValue parses Indian formatted currency', () => {
  assert.equal(normalizePriceValue('₹3,88,438'), 388438);
  assert.equal(normalizePriceValue('₹1,94,219'), 194219);
});

test('normalizeStockValue supports sold-out and stock text', () => {
  assert.equal(normalizeStockValue('Stock: 168 remaining'), 168);
  assert.equal(normalizeStockValue('Sold out'), 0);
});

test('retry delay follows the expected exponential backoff pattern', () => {
  assert.equal(buildRetryDelay(1, { baseDelayMs: 1000, maxDelayMs: 4000 }), 1000);
  assert.equal(buildRetryDelay(2, { baseDelayMs: 1000, maxDelayMs: 4000 }), 2000);
  assert.equal(buildRetryDelay(3, { baseDelayMs: 1000, maxDelayMs: 4000 }), 4000);
});

test('getConsentOverlaySelectors covers the real store consent blockers', () => {
  const selectors = getConsentOverlaySelectors();

  assert.ok(selectors.includes('.consent-scrim'));
  assert.ok(selectors.includes('.consent-overlay'));
  assert.ok(selectors.some((selector) => selector.includes('Allow cookies')));
});
