const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { pool } = require('../src/db/client');
const dbService = require('../src/db/service');
const schedulerController = require('../src/controllers/schedulerController');
const scraperModule = require('../src/scraper/liveOffer');

async function waitForSchedulerReset(timeoutMs = 2000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!schedulerController.schedulerState.inProgress) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return false;
}

async function startServer() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('REST API covers product search, details, tracking, history, logs, export, and failure handling', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalScrapeLiveOffer = scraperModule.scrapeLiveOffer;

  try {
    const searchResponse = await fetch(`${baseUrl}/api/products/search?q=junova`);
    const searchPayload = await searchResponse.json();

    assert.equal(searchResponse.status, 200);
    assert.equal(searchPayload.success, true);
    assert.ok(Array.isArray(searchPayload.results));
    assert.ok(searchPayload.results.some((product) => product.productName && product.productName.toLowerCase().includes('junova')));

    const detailsResponse = await fetch(`${baseUrl}/api/products/2568`);
    const detailsPayload = await detailsResponse.json();

    assert.equal(detailsResponse.status, 200);
    assert.equal(detailsPayload.success, true);
    assert.equal(detailsPayload.product.id, '2568');
    assert.equal(detailsPayload.product.productName, 'Junova Gimbal Nano');
    assert.ok(Array.isArray(detailsPayload.product.options));

    const trackResponse = await fetch(`${baseUrl}/api/tracked-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeProductId: '2568',
        selectedOption: 'Standard kit',
      }),
    });
    const trackPayload = await trackResponse.json();

    assert.equal(trackResponse.status, 201);
    assert.equal(trackPayload.success, true);
    assert.equal(trackPayload.trackedProduct.productId, '2568');
    assert.equal(trackPayload.trackedProduct.selectedOption, 'Standard kit');

    const trackedProductId = trackPayload.trackedProduct.id;

    const listResponse = await fetch(`${baseUrl}/api/tracked-products`);
    const listPayload = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.success, true);
    assert.ok(Array.isArray(listPayload.trackedProducts));
    assert.ok(listPayload.trackedProducts.some((item) => Number(item.id) === Number(trackedProductId)));

    scraperModule.scrapeLiveOffer = async () => ({
      success: true,
      productId: '2568',
      productName: 'Junova Gimbal Nano',
      selectedOption: 'Standard kit',
      price: 153933,
      stock: 9,
      attempts: 2,
      durationMs: 4200,
    });

    const scrapeResponse = await fetch(`${baseUrl}/api/tracked-products/${trackedProductId}/scrape`, {
      method: 'POST',
    });
    const scrapePayload = await scrapeResponse.json();

    assert.equal(scrapeResponse.status, 200);
    assert.equal(scrapePayload.success, true);
    assert.equal(scrapePayload.result.price, 153933);
    assert.equal(scrapePayload.result.stock, 9);

    const historyResponse = await fetch(`${baseUrl}/api/tracked-products/${trackedProductId}/history`);
    const historyPayload = await historyResponse.json();

    assert.equal(historyResponse.status, 200);
    assert.equal(historyPayload.success, true);
    assert.ok(Array.isArray(historyPayload.history));
    assert.ok(historyPayload.history.some((entry) => entry.outcome === 'success'));

    const logsResponse = await fetch(`${baseUrl}/api/tracked-products/${trackedProductId}/logs`);
    const logsPayload = await logsResponse.json();

    assert.equal(logsResponse.status, 200);
    assert.equal(logsPayload.success, true);
    assert.ok(Array.isArray(logsPayload.logs));
    assert.ok(logsPayload.logs[0].attemptNumber >= 1);

    const csvResponse = await fetch(`${baseUrl}/api/tracked-products/${trackedProductId}/export.csv`);
    const csvText = await csvResponse.text();

    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get('content-type'), /text\/csv/i);
    assert.match(csvText, /"product_id","product_name","selected_option","timestamp","price","stock","outcome"/i);

    const invalidResponse = await fetch(`${baseUrl}/api/tracked-products/999999999`);
    const invalidPayload = await invalidResponse.json();

    assert.equal(invalidResponse.status, 404);
    assert.equal(invalidPayload.success, false);

    scraperModule.scrapeLiveOffer = async () => ({
      success: false,
      productId: '2568',
      productName: 'Junova Gimbal Nano',
      selectedOption: 'Standard kit',
      error: 'Price request timed out',
      attempts: 2,
      durationMs: 3900,
    });

    const failedScrapeResponse = await fetch(`${baseUrl}/api/tracked-products/${trackedProductId}/scrape`, {
      method: 'POST',
    });
    const failedScrapePayload = await failedScrapeResponse.json();

    assert.equal(failedScrapeResponse.status, 502);
    assert.equal(failedScrapePayload.success, false);

    const latestLog = await pool.query(
      'SELECT price, stock, outcome, stock_status FROM scrape_logs WHERE tracked_product_id = $1 ORDER BY timestamp DESC, attempt_number DESC LIMIT 1',
      [trackedProductId],
    );

    assert.equal(latestLog.rows[0].outcome, 'failed');
    assert.equal(latestLog.rows[0].price, null);
    assert.equal(latestLog.rows[0].stock, null);
    assert.equal(latestLog.rows[0].stock_status, 'unknown');
  } finally {
    scraperModule.scrapeLiveOffer = originalScrapeLiveOffer;
    await pool.query('DELETE FROM scrape_logs WHERE tracked_product_id IN (SELECT id FROM tracked_products WHERE product_id IN (SELECT id FROM products WHERE store_product_id = $1))', ['2568']);
    await pool.query('DELETE FROM tracked_products WHERE product_id IN (SELECT id FROM products WHERE store_product_id = $1)', ['2568']);
    await pool.query('DELETE FROM product_options WHERE product_id IN (SELECT id FROM products WHERE store_product_id = $1)', ['2568']);
    await pool.query('DELETE FROM products WHERE store_product_id = $1', ['2568']);
    await closeServer(server);
  }
});

test('scheduler endpoint requires a valid bearer token', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalSecret = process.env.SCHEDULER_SECRET;

  try {
    delete process.env.SCHEDULER_SECRET;

    const missingSecretResponse = await fetch(`${baseUrl}/api/scheduler/scrape`, { method: 'POST' });
    assert.equal(missingSecretResponse.status, 401);

    process.env.SCHEDULER_SECRET = 'scheduler-secret';

    const wrongSecretResponse = await fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });

    assert.equal(wrongSecretResponse.status, 403);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.SCHEDULER_SECRET;
    } else {
      process.env.SCHEDULER_SECRET = originalSecret;
    }
    await closeServer(server);
  }
});

test('scheduler endpoint handles empty and multi-product runs', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalSecret = process.env.SCHEDULER_SECRET;
  const originalListTrackedProducts = dbService.listTrackedProducts;
  const originalScrapeLiveOffer = scraperModule.scrapeLiveOffer;

  try {
    process.env.SCHEDULER_SECRET = 'scheduler-secret';

    let emptyRunCount = 0;
    dbService.listTrackedProducts = async () => {
      emptyRunCount += 1;
      return [];
    };

    const emptyResponse = await fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer scheduler-secret' },
    });
    const emptyPayload = await emptyResponse.json();

    assert.equal(emptyResponse.status, 202);
    assert.equal(emptyPayload.success, true);
    assert.equal(emptyPayload.message, 'Scheduler started');

    await waitForSchedulerReset();
    assert.equal(schedulerController.schedulerState.inProgress, false);
    assert.equal(emptyRunCount, 1);

    let runCount = 0;
    dbService.listTrackedProducts = async () => {
      runCount += 1;
      return [
        {
          id: 101,
          store_product_id: '2568',
          product_name: 'Junova Gimbal Nano',
          selected_option: 'Standard kit',
          active: true,
        },
        {
          id: 102,
          store_product_id: '2008',
          product_name: 'Junova Gimbal One',
          selected_option: 'Standard kit',
          active: true,
        },
      ];
    };

    scraperModule.scrapeLiveOffer = async ({ productId }) => {
      if (productId === '2568') {
        return {
          success: true,
          productId: '2568',
          productName: 'Junova Gimbal Nano',
          selectedOption: 'Standard kit',
          price: 153933,
          stock: 9,
          attempts: 2,
          durationMs: 4200,
        };
      }

      return {
        success: false,
        productId: '2008',
        productName: 'Junova Gimbal One',
        selectedOption: 'Standard kit',
        error: 'Temporary network issue',
        attempts: 1,
        durationMs: 3100,
      };
    };

    const mixedResponse = await fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer scheduler-secret' },
    });
    const mixedPayload = await mixedResponse.json();

    assert.equal(mixedResponse.status, 202);
    assert.equal(mixedPayload.success, true);
    assert.equal(mixedPayload.message, 'Scheduler started');

    assert.equal(await waitForSchedulerReset(), true);
    assert.equal(schedulerController.schedulerState.inProgress, false);
    assert.equal(runCount, 1);
  } finally {
    dbService.listTrackedProducts = originalListTrackedProducts;
    scraperModule.scrapeLiveOffer = originalScrapeLiveOffer;
    if (originalSecret === undefined) {
      delete process.env.SCHEDULER_SECRET;
    } else {
      process.env.SCHEDULER_SECRET = originalSecret;
    }
    await closeServer(server);
  }
});

test('scheduler endpoint blocks overlapping runs', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalSecret = process.env.SCHEDULER_SECRET;
  const originalListTrackedProducts = dbService.listTrackedProducts;
  const originalScrapeLiveOffer = scraperModule.scrapeLiveOffer;

  try {
    process.env.SCHEDULER_SECRET = 'scheduler-secret';
    dbService.listTrackedProducts = async () => [
      {
        id: 201,
        store_product_id: '2568',
        product_name: 'Junova Gimbal Nano',
        selected_option: 'Standard kit',
        active: true,
      },
    ];

    scraperModule.scrapeLiveOffer = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        success: true,
        productId: '2568',
        productName: 'Junova Gimbal Nano',
        selectedOption: 'Standard kit',
        price: 153933,
        stock: 9,
        attempts: 2,
        durationMs: 4200,
      };
    };

    const firstRequest = fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer scheduler-secret' },
    });

    const secondRequest = fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer scheduler-secret' },
    });

    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

    assert.equal(firstResponse.status, 202);
    assert.equal(secondResponse.status, 409);
    assert.equal(await waitForSchedulerReset(), true);
    assert.equal(schedulerController.schedulerState.inProgress, false);
  } finally {
    dbService.listTrackedProducts = originalListTrackedProducts;
    scraperModule.scrapeLiveOffer = originalScrapeLiveOffer;
    if (originalSecret === undefined) {
      delete process.env.SCHEDULER_SECRET;
    } else {
      process.env.SCHEDULER_SECRET = originalSecret;
    }
    await closeServer(server);
  }
});

test('scheduler endpoint resets running flag when background work fails', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalSecret = process.env.SCHEDULER_SECRET;
  const originalListTrackedProducts = dbService.listTrackedProducts;

  try {
    process.env.SCHEDULER_SECRET = 'scheduler-secret';
    dbService.listTrackedProducts = async () => {
      throw new Error('DB unavailable in background job');
    };

    const response = await fetch(`${baseUrl}/api/scheduler/scrape`, {
      method: 'POST',
      headers: { Authorization: 'Bearer scheduler-secret' },
    });
    const payload = await response.json();

    assert.equal(response.status, 202);
    assert.equal(payload.success, true);
    assert.equal(payload.message, 'Scheduler started');
    assert.equal(await waitForSchedulerReset(), true);
    assert.equal(schedulerController.schedulerState.inProgress, false);
  } finally {
    dbService.listTrackedProducts = originalListTrackedProducts;
    if (originalSecret === undefined) {
      delete process.env.SCHEDULER_SECRET;
    } else {
      process.env.SCHEDULER_SECRET = originalSecret;
    }
    await closeServer(server);
  }
});
