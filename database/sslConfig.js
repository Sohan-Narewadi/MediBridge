// Shared SSL config for connecting to a managed MySQL host (e.g. Aiven,
// PlanetScale) that requires TLS. Local MySQL needs none of this, so it's
// only opted into via env vars - everything stays undefined (no ssl) by
// default for `localhost`.
//
// DB_SSL_CA: paste the host's CA certificate (PEM text) for a fully verified
//            TLS connection - the correct choice for production.
// DB_SSL=true: encrypts the connection without verifying the CA - good
//            enough to get connected quickly, but skips certificate checks.
function getSslConfig() {
  if (process.env.DB_SSL_CA) return { ca: process.env.DB_SSL_CA };
  if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
  return undefined;
}

module.exports = { getSslConfig };
