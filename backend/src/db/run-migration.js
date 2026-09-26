const fs = require('fs');
const path = require('path');
const { pool } = require('./client');

async function runMigration() {
  const sqlFile = path.join(__dirname, 'migrations', '001_init_schema.sql');
  const migrationSql = fs.readFileSync(sqlFile, 'utf8');
  const client = await pool.connect();

  try {
    await client.query(migrationSql);
    console.log('Database migration applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
