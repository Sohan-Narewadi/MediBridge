// Runs schema.sql against the configured MySQL server.
// Usage: npm run db:create
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log('Connected. Applying schema.sql ...');
  await connection.query(sql);
  console.log('Schema created successfully.');
  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
