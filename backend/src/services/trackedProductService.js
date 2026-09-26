const { pool } = require('../db/client');

async function listTrackedProducts() {
  const query = `
    SELECT
      tp.id AS tracked_product_id,
      tp.active,
      p.id AS product_id,
      p.store_product_id,
      p.name AS product_name,
      p.product_url,
      po.option_name,
      po.option_value AS selected_option,
      latest.timestamp AS latest_timestamp,
      latest.outcome AS latest_outcome,
      latest.price AS latest_price,
      latest.stock AS latest_stock,
      latest.stock_status AS latest_stock_status
    FROM tracked_products tp
    JOIN products p ON p.id = tp.product_id
    JOIN product_options po ON po.id = tp.option_id
    LEFT JOIN LATERAL (
      SELECT s.timestamp, s.outcome, s.price, s.stock, s.stock_status
      FROM scrape_logs s
      WHERE s.tracked_product_id = tp.id
      ORDER BY s.timestamp DESC, s.attempt_number DESC
      LIMIT 1
    ) latest ON true
    WHERE tp.active = true
    ORDER BY tp.created_at DESC;
  `;

  const result = await pool.query(query);
  return result.rows;
}

async function getTrackedProductLogs(trackedProductId, { newestFirst = false } = {}) {
  const query = `
    SELECT
      s.timestamp,
      s.attempt_number,
      s.outcome,
      s.price,
      s.stock,
      s.stock_status,
      s.error_message,
      s.duration_ms
    FROM scrape_logs s
    WHERE s.tracked_product_id = $1
    ORDER BY s.timestamp ${newestFirst ? 'DESC' : 'ASC'}, s.attempt_number ${newestFirst ? 'DESC' : 'ASC'};
  `;

  const result = await pool.query(query, [trackedProductId]);
  return result.rows;
}

async function createTrackedProductCsvRows(trackedProductId) {
  const query = `
    SELECT
      p.store_product_id AS product_id,
      p.name AS product_name,
      po.option_value AS selected_option,
      s.timestamp,
      s.price,
      s.stock,
      s.outcome
    FROM tracked_products tp
    JOIN products p ON p.id = tp.product_id
    JOIN product_options po ON po.id = tp.option_id
    LEFT JOIN scrape_logs s ON s.tracked_product_id = tp.id
    WHERE tp.id = $1
    ORDER BY s.timestamp ASC, s.attempt_number ASC;
  `;

  const result = await pool.query(query, [trackedProductId]);
  return result.rows;
}

module.exports = {
  listTrackedProducts,
  getTrackedProductLogs,
  createTrackedProductCsvRows,
};
