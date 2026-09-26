const { pool } = require('./client');
const dbService = require('./service');

module.exports = {
  pool,
  ...dbService,
};
