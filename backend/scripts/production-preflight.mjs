const production = process.env.NODE_ENV === 'production';

if (!production) {
  console.log('Production preflight skipped outside NODE_ENV=production.');
  process.exit(0);
}

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'VIP_TRON_ADDRESS',
  'TRONGRID_API_KEY'
];

const missing = required.filter(name => !String(process.env[name] || '').trim());
if (missing.length > 0) {
  console.error(`Missing required production variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (String(process.env.JWT_SECRET).length < 32) {
  console.error('JWT_SECRET must contain at least 32 characters.');
  process.exit(1);
}

if (!/^postgres(?:ql)?:\/\//i.test(String(process.env.DATABASE_URL))) {
  console.error('DATABASE_URL must be a PostgreSQL connection URL.');
  process.exit(1);
}

const origins = String(process.env.CORS_ORIGIN)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (origins.some(origin => !/^https:\/\/[^\s]+$/i.test(origin))) {
  console.error('Every production CORS_ORIGIN entry must use HTTPS.');
  process.exit(1);
}

if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(process.env.VIP_TRON_ADDRESS))) {
  console.error('VIP_TRON_ADDRESS must be a valid-looking TRON Base58 address.');
  process.exit(1);
}

console.log('Production environment preflight passed.');
