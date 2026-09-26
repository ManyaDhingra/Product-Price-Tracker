const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || null;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

function assertDatabaseConfigured() {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Add it to the backend .env file before running database migrations or tests.');
  }
}

module.exports = {
  pool,
  assertDatabaseConfigured,
};
