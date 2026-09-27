const metadataModule = require('../scraper/metadata');
const scraperModule = require('../scraper/liveOffer');
const dbService = require('../db/service');

const schedulerState = {
  inProgress: false,
};

function requireSchedulerSecret(req, res, next) {
  const secret = process.env.SCHEDULER_SECRET;
  const provided = req.headers.authorization || '';

  if (!secret) {
    return res.status(401).json({
      success: false,
      error: 'Scheduler secret is not configured.',
    });
  }

  const match = provided.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      success: false,
      error: 'Missing bearer token.',
    });
  }

  if (match[1] !== secret) {
    return res.status(403).json({
      success: false,
      error: 'Invalid scheduler secret.',
    });
  }

  return next();
}

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function normalizeOutcomeFromResult(result) {
  return result && result.success ? 'success' : 'failed';
}

function buildSchedulerError(error) {
  const message = error && error.message ? error.message : 'Scrape failed.';
  return {
    success: false,
    error: message,
  };
}

async function processTrackedProduct(trackedProduct) {
  const productId = String(trackedProduct.store_product_id || trackedProduct.storeProductId || '');
  const selectedOption = trackedProduct.selected_option || trackedProduct.selectedOption || '';
  const product = await metadataModule.getProductMetadata(productId);

  let result;
  let saveError = null;

  try {
    result = await scraperModule.scrapeLiveOffer({
      productId,
      option: selectedOption,
      config: {},
    });
  } catch (error) {
    saveError = error;
    result = {
      success: false,
      productId,
      productName: product?.productName || trackedProduct.product_name || '',
      selectedOption,
      error: error && error.message ? error.message : 'Scrape failed.',
      attempts: 1,
      durationMs: null,
    };
  }

  const summary = {
    trackedProductId: Number(trackedProduct.id),
    productId,
    productName: product?.productName || trackedProduct.product_name || '',
    selectedOption,
    outcome: normalizeOutcomeFromResult(result),
    price: result && result.success ? result.price : null,
    stock: result && result.success ? result.stock : null,
    attempts: Number(result?.attempts) || 1,
    error: result && !result.success ? (result.error || 'Scrape failed.') : null,
  };

  const attemptError = saveError || (result && !result.success ? new Error(result.error || 'Scrape failed.') : null);

  if (attemptError) {
    await dbService.recordScrapeAttempt({
      trackedProductId: Number(trackedProduct.id),
      attemptNumber: Number(summary.attempts) || 1,
      outcome: 'failed',
      price: null,
      stock: null,
      stockStatus: 'unknown',
      errorMessage: attemptError.message || 'Scrape failed.',
      durationMs: result && result.durationMs !== undefined ? Number(result.durationMs) : null,
      timestamp: new Date(),
    });
  } else {
    await dbService.recordScrapeAttempt({
      trackedProductId: Number(trackedProduct.id),
      attemptNumber: Number(summary.attempts) || 1,
      outcome: 'success',
      price: result.price,
      stock: result.stock,
      stockStatus: result.stock === 0 ? 'sold_out' : 'in_stock',
      errorMessage: null,
      durationMs: result && result.durationMs !== undefined ? Number(result.durationMs) : null,
      timestamp: new Date(),
    });
  }

  return summary;
}

async function executeSchedulerRun() {
  try {
    const activeTrackedProducts = await dbService.listTrackedProducts();

    if (!activeTrackedProducts || !activeTrackedProducts.length) {
      return {
        success: true,
        total: 0,
        successful: 0,
        failed: 0,
        results: [],
      };
    }

    const results = [];
    let successful = 0;
    let failed = 0;

    for (const trackedProduct of activeTrackedProducts) {
      try {
        const summary = await processTrackedProduct(trackedProduct);
        results.push(summary);

        if (summary.outcome === 'success') {
          successful += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        const failureSummary = {
          trackedProductId: Number(trackedProduct.id),
          productId: String(trackedProduct.store_product_id || ''),
          productName: trackedProduct.product_name || '',
          selectedOption: trackedProduct.selected_option || '',
          outcome: 'failed',
          price: null,
          stock: null,
          attempts: 1,
          error: error && error.message ? error.message : 'Scrape failed.',
        };

        results.push(failureSummary);
        failed += 1;

        await dbService.recordScrapeAttempt({
          trackedProductId: Number(trackedProduct.id),
          attemptNumber: 1,
          outcome: 'failed',
          price: null,
          stock: null,
          stockStatus: 'unknown',
          errorMessage: failureSummary.error,
          durationMs: null,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      total: results.length,
      successful,
      failed,
      results,
    };
  } catch (error) {
    console.error('Background scheduler run failed:', error);
    return {
      success: false,
      error: error && error.message ? error.message : 'Scheduler failed.',
    };
  } finally {
    schedulerState.inProgress = false;
  }
}

async function runSchedulerScrape(req, res) {
  if (schedulerState.inProgress) {
    return res.status(409).json({
      success: false,
      error: 'Scheduler already running. Please wait for the current scrape cycle to finish.',
    });
  }

  schedulerState.inProgress = true;

  res.status(202)
    .type('text/plain')
    .send('OK');

  void executeSchedulerRun();
  return undefined;
}

module.exports = {
  requireSchedulerSecret,
  runSchedulerScrape,
  schedulerState,
  processTrackedProduct,
};
