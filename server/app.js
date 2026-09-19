require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ---- API routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/specializations', require('./routes/specializations'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/medical-records', require('./routes/medicalRecords'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/care', require('./routes/care'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Static frontend ----
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.use('/api', notFoundHandler);

// Any non-API, non-file GET falls back to the SPA-ish shell is NOT used here -
// MediBridge is a traditional multi-page app, so unmatched routes get a real 404 page.
app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MediBridge server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
