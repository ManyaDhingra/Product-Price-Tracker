const express = require('express');
const { requireSchedulerSecret, runSchedulerScrape } = require('../controllers/schedulerController');

const router = express.Router();

router.post('/scrape', requireSchedulerSecret, runSchedulerScrape);

module.exports = router;
