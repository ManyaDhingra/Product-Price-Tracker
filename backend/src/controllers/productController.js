const metadataModule = require('../scraper/metadata');
const { fetchCatalogProducts } = require('../services/productCatalogService');

function sanitizeProductRecord(product) {
  return {
    id: String(product.productId),
    productName: product.productName,
    sku: product.sku || null,
    productUrl: product.productUrl || `${product.productId ? `https://demo.inelabteamdev.com/item/${product.productId}` : ''}`,
    optionAxis: product.optionAxis || null,
    options: Array.isArray(product.options)
      ? product.options.map((option) => ({
          id: option && option.id !== undefined ? String(option.id) : null,
          label: option && option.label ? String(option.label) : String(option?.name || ''),
        }))
      : [],
  };
}

async function searchProducts(req, res) {
  const query = String(req.query.q ?? req.query.query ?? '').trim();

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "q" is required.',
    });
  }

  try {
    const results = await fetchCatalogProducts({
      query,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });

    return res.json({
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: 'Unable to search the mock store catalog.',
      details: error.message,
    });
  }
}

async function getProductDetails(req, res) {
  const productId = String(req.params.id || '').trim();

  if (!/^\d+$/.test(productId)) {
    return res.status(400).json({
      success: false,
      error: 'Product ID must be a numeric mock-store ID.',
    });
  }

  try {
    const product = await metadataModule.getProductMetadata(productId);
    return res.json({
      success: true,
      product: sanitizeProductRecord(product),
    });
  } catch (error) {
    const status = /not found|failed/i.test(error.message) ? 404 : 502;
    return res.status(status).json({
      success: false,
      error: 'Unable to load product details.',
      details: error.message,
    });
  }
}

module.exports = {
  searchProducts,
  getProductDetails,
};
