require('dotenv').config();

const app = require('./app');
const { pool } = require('./db/client');

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed.');

    if (pool) {
      pool.end(() => {
        console.log('PostgreSQL pool closed.');
        process.exit(0);
      });
      return;
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
