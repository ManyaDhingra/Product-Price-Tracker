const STORE_URL = 'https://demo.inelabteamdev.com';

const DEFAULT_SCRAPE_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 4000,
  pageTimeoutMs: 20000,
  navigationTimeoutMs: 20000,
  priceTimeoutMs: 20000,
  stockTimeoutMs: 15000,
  headed: false,
};

function buildRetryDelay(attemptNumber, config = DEFAULT_SCRAPE_CONFIG) {
  const baseDelay = Number(config.baseDelayMs || DEFAULT_SCRAPE_CONFIG.baseDelayMs);
  const maxDelay = Number(config.maxDelayMs || DEFAULT_SCRAPE_CONFIG.maxDelayMs);
  const rawDelay = baseDelay * (2 ** (attemptNumber - 1));
  return Math.min(rawDelay, maxDelay);
}

module.exports = {
  STORE_URL,
  DEFAULT_SCRAPE_CONFIG,
  buildRetryDelay,
};
