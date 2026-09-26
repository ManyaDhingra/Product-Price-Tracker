const express = require('express');
const {
  createTrackedProduct,
  listTrackedProducts,
  scrapeTrackedProduct,
  getTrackedProductHistory,
  getTrackedProductLogs,
  exportTrackedProductCsv,
  getTrackedProductById,
  deleteTrackedProduct,
} = require('../controllers/trackedProductController');

const router = express.Router();

router.post('/', createTrackedProduct);
router.get('/', listTrackedProducts);
router.get('/:id/history', getTrackedProductHistory);
router.get('/:id/logs', getTrackedProductLogs);
router.get('/:id/export.csv', exportTrackedProductCsv);
router.get('/:id', getTrackedProductById);
router.delete('/:id', deleteTrackedProduct);
router.post('/:id/scrape', scrapeTrackedProduct);

module.exports = router;
