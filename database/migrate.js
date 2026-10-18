// Creates every collection and index in MongoDB (idempotent, never deletes data).
// MongoDB needs no schema file: the models in database/store.js are the schema,
// and this script makes the unique/compound indexes they declare exist.
// Usage: npm run db:create
const { connectDb, MONGO_URI } = require('./db');
const { mongoose, M } = require('./store');

async function init() {
  await connectDb();
  console.log(`Connected to ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  for (const [name, model] of Object.entries(M)) {
    await model.createCollection().catch(() => {});
    await model.syncIndexes();
    console.log(`  ${name}`);
  }
  console.log('Collections and indexes are ready.');
  await mongoose.disconnect();
}

init().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
