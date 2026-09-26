const express = require('express');
const healthRoutes = require('./routes/health.routes');
const productsRoutes = require('./routes/products.routes');
const trackedProductsRoutes = require('./routes/trackedProducts.routes');
const schedulerRoutes = require('./routes/scheduler.routes');

const app = express();
const configuredFrontendUrl = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN;
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  configuredFrontendUrl,
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());
app.use('/api', healthRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/tracked-products', trackedProductsRoutes);
app.use('/api/scheduler', schedulerRoutes);

module.exports = app;
