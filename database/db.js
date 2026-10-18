// MongoDB connection (Mongoose). Every model lives in database/store.js; this
// file only owns the connection so the app, the seeds and serverless
// functions all connect the same way.
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medibridge';

mongoose.set('strictQuery', true);

// Connection is cached on the module so repeated calls (and warm serverless
// invocations) reuse one pool instead of opening a new connection each time.
let connecting = null;
function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!connecting) {
    connecting = mongoose
      .connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
      .then(() => mongoose)
      .catch((err) => { connecting = null; throw err; });
  }
  return connecting;
}

module.exports = { mongoose, connectDb, MONGO_URI };
