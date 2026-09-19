// Vercel serverless entry point. Vercel treats every file under /api as its
// own function; this one re-exports the whole Express app so vercel.json can
// route all traffic (API + static pages) through the app exactly as it
// behaves locally with `npm start`.
module.exports = require('../server/app');
