const { pool } = require('./client');
const {
  upsertProduct,
  upsertProductOption,
  upsertTrackedProduct,
  recordScrapeAttempt,
  getTrackedProductHistory,
} = require('./service');

async function runTest() {
  const testStoreProductId = 'TEST-99999';
  const testUrl = 'https://demo.inelabteamdev.com/item/99999';

  const product = await upsertProduct({
    storeProductId: testStoreProductId,
    name: 'Test Product - Price Monitor',
    sku: 'TEST-99999',
    productUrl: testUrl,
  });

  const option = await upsertProductOption({
    productId: product.id,
    optionName: 'Kit',
    optionValue: 'Test starter kit',
    storeOptionId: 'opt-test-1',
  });

  const tracked = await upsertTrackedProduct({
    productId: product.id,
    optionId: option.id,
    active: true,
  });

  const successLog = await recordScrapeAttempt({
    trackedProductId: tracked.id,
    attemptNumber: 2,
    outcome: 'success',
    price: 12345.67,
    stock: 12,
    stockStatus: 'in_stock',
    durationMs: 4200,
    timestamp: new Date('2026-01-01T10:00:00Z'),
  });

  const failedLog = await recordScrapeAttempt({
    trackedProductId: tracked.id,
    attemptNumber: 1,
    outcome: 'failed',
    price: null,
    stock: null,
    stockStatus: 'unknown',
    errorMessage: 'Price request timed out',
    durationMs: 3800,
    timestamp: new Date('2026-01-01T09:59:45Z'),
  });

  const history = await getTrackedProductHistory({ trackedProductId: tracked.id });

  console.log('Inserted product:', product);
  console.log('Inserted option:', option);
  console.log('Tracked product:', tracked);
  console.log('Successful scrape log:', successLog);
  console.log('Failed scrape log:', failedLog);
  console.log('History:', history);

  console.log('Failed outcome check:', failedLog.price === null && failedLog.stock === null);

  await pool.query('DELETE FROM scrape_logs WHERE tracked_product_id = $1', [tracked.id]);
  await pool.query('DELETE FROM tracked_products WHERE id = $1', [tracked.id]);
  await pool.query('DELETE FROM product_options WHERE id = $1', [option.id]);
  await pool.query('DELETE FROM products WHERE id = $1', [product.id]);

  console.log('Test data cleaned up.');
}

runTest().catch((error) => {
  console.error('Database test failed:', error);
  process.exit(1);
});
