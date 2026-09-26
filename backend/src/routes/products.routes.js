const express = require('express');
const { searchProducts, getProductDetails } = require('../controllers/productController');

const router = express.Router();

router.get('/search', searchProducts);
router.get('/catalog', searchProducts);
router.get('/:id', getProductDetails);

module.exports = router;
