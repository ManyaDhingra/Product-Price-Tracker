const { STORE_URL } = require('./config');

async function getProductMetadata(productId) {
  const requestId = String(productId).trim();

  if (!requestId) {
    throw new Error('Product ID is required');
  }

  const response = await fetch(`${STORE_URL}/api/v2/items/${requestId}`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Product metadata request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (!payload || !payload.id || !payload.name || !payload.sku) {
    throw new Error('Product metadata payload is incomplete');
  }

  const options = Array.isArray(payload.options)
    ? payload.options
        .map((option) => ({
          id: String(option.id ?? ''),
          label: String(option.label ?? option.name ?? ''),
        }))
        .filter((option) => option.id || option.label)
    : [];

  return {
    productId: String(payload.id),
    productName: String(payload.name),
    sku: String(payload.sku),
    optionAxis: payload.optionAxis ? String(payload.optionAxis) : (options.length ? 'Option' : null),
    options,
  };
}

module.exports = {
  getProductMetadata,
};
