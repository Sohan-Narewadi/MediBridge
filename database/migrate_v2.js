// Applies migrate_v2.sql (the v2 module tables) to the configured database.
// Usage: npm run db:v2   (also seeds the v2 demo data afterwards)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getSslConfig } = require('./sslConfig');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v2.sql'), 'utf8')
    .replace(/^USE medibridge;$/m, `USE \`${process.env.DB_NAME || 'medibridge'}\`;`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    ssl: getSslConfig(),
  });

  console.log('Connected. Applying migrate_v2.sql ...');
  await connection.query(sql);
  console.log('v2 schema applied.');
  await connection.end();
}

migrate().catch((err) => {
  console.error('v2 migration failed:', err.message);
  process.exit(1);
});
