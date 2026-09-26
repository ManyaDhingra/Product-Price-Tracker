function normalizePriceValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();
  const cleaned = text
    .replace(/[₹Rs.,\s]/gi, '')
    .replace(/INR/gi, '')
    .replace(/[^0-9.]/g, '');

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeStockValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/sold out/i.test(text)) {
    return 0;
  }

  const match = text.match(/(\d[\d,\s]*)/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1].replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function validateScrapeResult(result) {
  if (!result || !String(result.productId || '').trim()) {
    return { valid: false, error: 'Product ID is missing' };
  }

  if (!String(result.productName || '').trim()) {
    return { valid: false, error: 'Product name is missing' };
  }

  if (!String(result.selectedOption || '').trim()) {
    return { valid: false, error: 'Selected option is missing' };
  }

  const price = normalizePriceValue(result.price);
  if (price === null) {
    return { valid: false, error: 'Price is missing or invalid' };
  }

  if (price <= 0) {
    return { valid: false, error: 'Price must be greater than zero' };
  }

  const stockValue = normalizeStockValue(result.stock);
  if (stockValue === null) {
    return { valid: false, error: 'Stock is missing or invalid' };
  }

  if (stockValue < 0) {
    return { valid: false, error: 'Stock cannot be negative' };
  }

  return { valid: true, price, stock: stockValue };
}

module.exports = {
  normalizePriceValue,
  normalizeStockValue,
  validateScrapeResult,
};
