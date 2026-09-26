const { getProductMetadata } = require('./metadata');
const { scrapeLiveOffer } = require('./liveOffer');
const { validateScrapeResult, normalizePriceValue, normalizeStockValue } = require('./validation');
const { buildRetryDelay, DEFAULT_SCRAPE_CONFIG } = require('./config');

module.exports = {
  getProductMetadata,
  scrapeLiveOffer,
  validateScrapeResult,
  normalizePriceValue,
  normalizeStockValue,
  buildRetryDelay,
  DEFAULT_SCRAPE_CONFIG,
};
