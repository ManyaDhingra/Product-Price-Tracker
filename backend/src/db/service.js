const { pool, assertDatabaseConfigured } = require('./client');

const VALID_OUTCOMES = new Set(['success', 'retried', 'failed']);
const VALID_STOCK_STATUS = new Set(['unknown', 'missing', 'in_stock', 'sold_out']);

function requireValidOutcome(outcome) {
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}. Allowed values: success, retried, failed.`);
  }
  return outcome;
}

function normalizeStatus({ stock, stockStatus }) {
  if (stock === 0) {
    return 'sold_out';
  }

  if (stock === null || stock === undefined) {
    return stockStatus && VALID_STOCK_STATUS.has(stockStatus) ? stockStatus : 'unknown';
  }

  return 'in_stock';
}

async function upsertProduct({ storeProductId, name, sku, productUrl }) {
  assertDatabaseConfigured();

  const query = `
    INSERT INTO products (store_product_id, name, sku, product_url)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (store_product_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      product_url = EXCLUDED.product_url,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [String(storeProductId), String(name), sku || null, productUrl || null];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function upsertProductOption({ productId, optionName, optionValue, storeOptionId }) {
  assertDatabaseConfigured();

  const query = `
    INSERT INTO product_options (product_id, option_name, option_value, store_option_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (product_id, option_name, option_value)
    DO UPDATE SET
      store_option_id = EXCLUDED.store_option_id,
      option_value = EXCLUDED.option_value
    RETURNING *;
  `;

  const values = [productId, String(optionName), String(optionValue), storeOptionId || null];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function upsertTrackedProduct({ productId, optionId, active = true }) {
  assertDatabaseConfigured();

  const query = `
    INSERT INTO tracked_products (product_id, option_id, active)
    VALUES ($1, $2, $3)
    ON CONFLICT (product_id, option_id)
    DO UPDATE SET
      active = EXCLUDED.active,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [productId, optionId, Boolean(active)];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function listTrackedProducts() {
  assertDatabaseConfigured();

  const query = `
    SELECT
      tp.id,
      tp.product_id,
      tp.option_id,
      tp.active,
      tp.created_at,
      tp.updated_at,
      p.store_product_id,
      p.name AS product_name,
      p.sku,
      p.product_url,
      po.option_name,
      po.option_value
    FROM tracked_products tp
    JOIN products p ON p.id = tp.product_id
    JOIN product_options po ON po.id = tp.option_id
    ORDER BY tp.created_at DESC;
  `;

  const result = await pool.query(query);
  return result.rows;
}

async function getTrackedProductById(trackedProductId) {
  assertDatabaseConfigured();

  const query = `
    SELECT
      tp.id,
      tp.product_id,
      tp.option_id,
      tp.active,
      tp.created_at,
      tp.updated_at,
      p.store_product_id,
      p.name AS product_name,
      p.sku,
      p.product_url,
      po.option_name,
      po.option_value
    FROM tracked_products tp
    JOIN products p ON p.id = tp.product_id
    JOIN product_options po ON po.id = tp.option_id
    WHERE tp.id = $1;
  `;

  const result = await pool.query(query, [trackedProductId]);
  return result.rows[0] || null;
}

async function deleteTrackedProduct(trackedProductId) {
  assertDatabaseConfigured();

  const query = `
    DELETE FROM tracked_products
    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [trackedProductId]);
  return result.rows[0] || null;
}

async function recordScrapeAttempt({
  trackedProductId,
  attemptNumber,
  outcome,
  price = null,
  stock = null,
  stockStatus,
  errorMessage = null,
  durationMs = null,
  timestamp = new Date(),
}) {
  assertDatabaseConfigured();

  const normalizedTrackedProductId = Number(trackedProductId);
  if (!Number.isInteger(normalizedTrackedProductId) || normalizedTrackedProductId <= 0) {
    return null;
  }

  const trackedProductExists = await pool.query(
    'SELECT 1 FROM tracked_products WHERE id = $1 LIMIT 1;',
    [normalizedTrackedProductId],
  );

  if (trackedProductExists.rowCount === 0) {
    return null;
  }

  const normalizedOutcome = requireValidOutcome(outcome);

  let normalizedPrice = price;
  let normalizedStock = stock;
  let normalizedStatus = stockStatus && VALID_STOCK_STATUS.has(stockStatus) ? stockStatus : normalizeStatus({ stock, stockStatus });

  if (normalizedOutcome === 'failed') {
    normalizedPrice = null;
    normalizedStock = null;
    normalizedStatus = 'unknown';
  }

  if (normalizedOutcome !== 'failed' && (normalizedPrice === null || normalizedStock === null)) {
    normalizedStatus = normalizeStatus({ stock: normalizedStock, stockStatus: normalizedStatus });
  }

  const query = `
    INSERT INTO scrape_logs (
      tracked_product_id,
      timestamp,
      attempt_number,
      outcome,
      price,
      stock,
      stock_status,
      error_message,
      duration_ms
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const values = [
    normalizedTrackedProductId,
    new Date(timestamp),
    Number(attemptNumber),
    normalizedOutcome,
    normalizedPrice,
    normalizedStock,
    normalizedStatus,
    errorMessage || null,
    durationMs !== null && durationMs !== undefined ? Number(durationMs) : null,
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    if (error && error.code === '23503') {
      return null;
    }
    throw error;
  }
}

async function getTrackedProductHistory({ trackedProductId }) {
  assertDatabaseConfigured();

  const query = `
    SELECT s.*
    FROM scrape_logs s
    WHERE s.tracked_product_id = $1
    ORDER BY s.timestamp ASC, s.attempt_number ASC;
  `;

  const result = await pool.query(query, [trackedProductId]);
  return result.rows;
}

module.exports = {
  VALID_OUTCOMES,
  VALID_STOCK_STATUS,
  upsertProduct,
  upsertProductOption,
  upsertTrackedProduct,
  listTrackedProducts,
  getTrackedProductById,
  deleteTrackedProduct,
  recordScrapeAttempt,
  getTrackedProductHistory,
};
