export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (typeof payload === 'object' && payload && (payload.error || payload.message)) ||
      'Unable to load data. Please try again.';
    throw new Error(message);
  }

  return payload;
}

export const api = {
  async getHealth() {
    return requestJson(`${API_BASE_URL}/api/health`);
  },

  async searchProducts(query) {
    return requestJson(`${API_BASE_URL}/api/products/search?q=${encodeURIComponent(query)}`);
  },

  async getProductDetails(productId) {
    return requestJson(`${API_BASE_URL}/api/products/${encodeURIComponent(productId)}`);
  },

  async createTrackedProduct(payload) {
    return requestJson(`${API_BASE_URL}/api/tracked-products`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listTrackedProducts() {
    return requestJson(`${API_BASE_URL}/api/tracked-products`);
  },

  async scrapeTrackedProduct(trackedProductId) {
    return requestJson(`${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}/scrape`, {
      method: 'POST',
    });
  },

  async getTrackedProductHistory(trackedProductId) {
    return requestJson(`${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}/history`);
  },

  async getTrackedProductLogs(trackedProductId) {
    return requestJson(`${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}/logs`);
  },

  async deleteTrackedProduct(trackedProductId) {
    return requestJson(`${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}`, {
      method: 'DELETE',
    });
  },

  async downloadTrackedCsv(trackedProductId) {
    const response = await fetch(`${API_BASE_URL}/api/tracked-products/${encodeURIComponent(trackedProductId)}/export.csv`);

    if (!response.ok) {
      const fallback = await response.text();
      throw new Error(fallback || 'Unable to export CSV.');
    }

    return response.blob();
  },
};
