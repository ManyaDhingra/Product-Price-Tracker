const { pool } = require('../db/client');
const dbService = require('../db/service');
const scraperModule = require('../scraper/liveOffer');
const metadataModule = require('../scraper/metadata');
const {
  listTrackedProducts: listTrackedProductsRows,
  getTrackedProductLogs: getTrackedProductLogsRows,
  createTrackedProductCsvRows,
} = require('../services/trackedProductService');

function isValidPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function normalizeNumericId(value) {
  const text = String(value ?? '').trim();
  return Number.isFinite(Number(text)) ? Number(text) : null;
}

function normalizeOutcomeFromResult(result) {
  if (!result || !result.success) {
    return 'failed';
  }
  return 'success';
}

async function createTrackedProduct(req, res) {
  const payload = req.body || {};
  const storeProductId = String(payload.storeProductId ?? payload.productId ?? payload.product_id ?? '').trim();
  const selectedOption = String(payload.selectedOption ?? payload.optionValue ?? payload.option ?? payload.selected_option ?? '').trim();

  if (!storeProductId || !/^\d+$/.test(storeProductId)) {
    return res.status(400).json({ success: false, error: 'storeProductId must be a numeric mock-store product ID.' });
  }

  if (!selectedOption) {
    return res.status(400).json({ success: false, error: 'selectedOption is required.' });
  }

  try {
    const productMetadata = await metadataModule.getProductMetadata(storeProductId);
    const optionName = String(payload.optionName ?? payload.option_name ?? productMetadata.optionAxis ?? 'Option').trim() || 'Option';
    const chosenOption = String(payload.optionValue ?? payload.option ?? selectedOption).trim() || selectedOption;

    const productRecord = await dbService.upsertProduct({
      storeProductId: productMetadata.productId,
      name: productMetadata.productName,
      sku: productMetadata.sku,
      productUrl: productMetadata.productUrl || `https://demo.inelabteamdev.com/item/${productMetadata.productId}`,
    });

    const optionRecord = await dbService.upsertProductOption({
      productId: productRecord.id,
      optionName,
      optionValue: chosenOption,
      storeOptionId: payload.optionId ?? payload.storeOptionId ?? null,
    });

    const trackedProduct = await dbService.upsertTrackedProduct({
      productId: productRecord.id,
      optionId: optionRecord.id,
      active: payload.active !== false,
    });

    return res.status(201).json({
      success: true,
      trackedProduct: {
        id: trackedProduct.id,
        productId: productMetadata.productId,
        productName: productMetadata.productName,
        selectedOption: chosenOption,
        active: trackedProduct.active,
      },
    });
  } catch (error) {
    const message = error && error.message ? error.message : 'Unable to create tracked product.';
    return res.status(502).json({ success: false, error: 'Unable to track the selected product.', details: message });
  }
}

async function getTrackedProductById(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const trackedProduct = await dbService.getTrackedProductById(trackedProductId);

    if (!trackedProduct) {
      return res.status(404).json({ success: false, error: 'Tracked product not found.' });
    }

    return res.json({
      success: true,
      trackedProduct: {
        id: trackedProduct.id,
        productId: trackedProduct.store_product_id,
        productName: trackedProduct.product_name,
        selectedOption: trackedProduct.option_value,
        active: trackedProduct.active,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to load tracked product.', details: error.message });
  }
}

async function listTrackedProducts(req, res) {
  try {
    const rows = await listTrackedProductsRows();

    return res.json({
      success: true,
      count: rows.length,
      trackedProducts: rows.map((row) => ({
        id: row.tracked_product_id,
        storeProductId: row.store_product_id,
        productName: row.product_name,
        selectedOption: row.selected_option,
        active: row.active,
        latestPrice: row.latest_price !== null && row.latest_price !== undefined ? Number(row.latest_price) : null,
        latestStock: row.latest_stock !== null && row.latest_stock !== undefined ? Number(row.latest_stock) : null,
        latestStockStatus: row.latest_stock_status || null,
        latestTimestamp: row.latest_timestamp ? new Date(row.latest_timestamp).toISOString() : null,
        latestOutcome: row.latest_outcome || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to load tracked products.', details: error.message });
  }
}

async function deleteTrackedProduct(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const deleted = await dbService.deleteTrackedProduct(trackedProductId);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Tracked product not found.' });
    }

    return res.json({ success: true, deleted: true, id: deleted.id });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to delete tracked product.', details: error.message });
  }
}

async function scrapeTrackedProduct(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const trackedProduct = await dbService.getTrackedProductById(trackedProductId);
    if (!trackedProduct) {
      return res.status(404).json({ success: false, error: 'Tracked product not found.' });
    }

    const scraperResult = await scraperModule.scrapeLiveOffer({
      productId: trackedProduct.store_product_id,
      option: trackedProduct.option_value,
      config: {},
    });

    const outcome = normalizeOutcomeFromResult(scraperResult);
    const attemptNumber = Number(scraperResult.attempts) || 1;
    const savedLog = await dbService.recordScrapeAttempt({
      trackedProductId: trackedProduct.id,
      attemptNumber,
      outcome,
      price: scraperResult.success ? scraperResult.price : null,
      stock: scraperResult.success ? scraperResult.stock : null,
      stockStatus: scraperResult.success ? (scraperResult.stock === 0 ? 'sold_out' : 'in_stock') : 'unknown',
      errorMessage: scraperResult.success ? null : (scraperResult.error || 'Scrape failed.'),
      durationMs: scraperResult.durationMs ?? null,
      timestamp: new Date(),
    });

    if (!scraperResult.success) {
      return res.status(502).json({
        success: false,
        error: scraperResult.error || 'Scrape failed.',
        result: scraperResult,
        savedLog,
      });
    }

    return res.json({
      success: true,
      result: scraperResult,
      savedLog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Live scrape failed.', details: error.message });
  }
}

async function getTrackedProductHistory(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const rows = await dbService.getTrackedProductHistory({ trackedProductId });
    return res.json({
      success: true,
      count: rows.length,
      history: rows.map((row) => ({
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
        attemptNumber: row.attempt_number,
        outcome: row.outcome,
        price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
        stock: row.stock !== null && row.stock !== undefined ? Number(row.stock) : null,
        stockStatus: row.stock_status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to load history.', details: error.message });
  }
}

async function getTrackedProductLogs(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const rows = await getTrackedProductLogsRows(trackedProductId, { newestFirst: true });
    return res.json({
      success: true,
      count: rows.length,
      logs: rows.map((row) => ({
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
        attemptNumber: row.attempt_number,
        outcome: row.outcome,
        price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
        stock: row.stock !== null && row.stock !== undefined ? Number(row.stock) : null,
        stockStatus: row.stock_status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to load logs.', details: error.message });
  }
}

async function exportTrackedProductCsv(req, res) {
  const trackedProductId = normalizeNumericId(req.params.id);

  if (!isValidPositiveInteger(trackedProductId)) {
    return res.status(400).json({ success: false, error: 'Tracked product ID must be a positive integer.' });
  }

  try {
    const tracked = await dbService.getTrackedProductById(trackedProductId);
    if (!tracked) {
      return res.status(404).json({ success: false, error: 'Tracked product not found.' });
    }

    const rows = await createTrackedProductCsvRows(trackedProductId);

    const csvLines = [
      ['product_id', 'product_name', 'selected_option', 'timestamp', 'price', 'stock', 'outcome'],
      ...rows.map((row) => [
        tracked.store_product_id,
        tracked.product_name,
        tracked.option_value,
        row.timestamp ? new Date(row.timestamp).toISOString() : '',
        row.price !== null && row.price !== undefined ? Number(row.price) : '',
        row.stock !== null && row.stock !== undefined ? Number(row.stock) : '',
        row.outcome || '',
      ]),
    ];

    const csvContent = csvLines
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tracked-product-${trackedProductId}-history.csv"`);
    return res.send(`${csvContent}\n`);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to export CSV.', details: error.message });
  }
}

module.exports = {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts,
  deleteTrackedProduct,
  scrapeTrackedProduct,
  getTrackedProductHistory,
  getTrackedProductLogs,
  exportTrackedProductCsv,
};
