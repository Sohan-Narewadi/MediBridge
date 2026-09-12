// Central MySQL connection pool. Every query in the app goes through this
// module so swapping drivers/config later only touches one file.
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medibridge',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE/DATETIME as plain strings, not JS Date
});

module.exports = pool;
