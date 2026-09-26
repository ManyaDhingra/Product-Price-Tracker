const { STORE_URL } = require('../scraper/config');

function normalizeCatalogItem(item) {
  if (!item || !item.id) {
    return null;
  }

  return {
    id: String(item.id),
    productName: String(item.name || item.productName || 'Unknown product'),
    sku: item.sku ? String(item.sku) : null,
    productUrl: item.productUrl || `${STORE_URL}/item/${item.id}`,
    options: Array.isArray(item.options)
      ? item.options.map((option) => ({
          id: option && option.id !== undefined ? String(option.id) : null,
          label: option && option.label ? String(option.label) : String(option?.name || ''),
        })).filter((option) => option.id || option.label)
      : [],
  };
}

async function fetchCatalogProducts({ query = '', page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  if (!query) {
    const response = await fetch(`${STORE_URL}/api/v2/listings?page=${safePage}&limit=${safeLimit}`);
    if (!response.ok) {
      throw new Error(`Catalog request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    return results.map(normalizeCatalogItem).filter(Boolean);
  }

  const needle = query.toLowerCase();
  const matches = [];
  const maxPagesToSearch = 12;

  for (let pageIndex = safePage; pageIndex < safePage + maxPagesToSearch; pageIndex += 1) {
    const response = await fetch(`${STORE_URL}/api/v2/listings?page=${pageIndex}&limit=${safeLimit}`);
    if (!response.ok) {
      break;
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    const normalized = results
      .map(normalizeCatalogItem)
      .filter(Boolean)
      .filter((item) => [item.id, item.productName, item.sku].some((value) =>
        value && String(value).toLowerCase().includes(needle),
      ));

    matches.push(...normalized);

    if (results.length < safeLimit) {
      break;
    }
  }

  return matches;
}

module.exports = {
  fetchCatalogProducts,
};
