import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'App.js');
let app = fs.readFileSync(appPath, 'utf8');

const replaceRequired = (oldValue, newValue, label) => {
  if (!app.includes(oldValue)) {
    if (app.includes(newValue)) return;
    throw new Error(`${label} marker not found`);
  }
  app = app.replace(oldValue, newValue);
};

// Login resilience lives in application source. The APK preparation layer keeps
// the retry behavior but caps the actual auth call so an outage does not leave
// the user staring at a login spinner for tens of seconds per attempt.
const hasLoginEndpoint = app.includes('`${API_BASE_URL}/api/auth/login`');
const hasBackendRecovery =
  app.includes('requestWithBackendRecovery(() =>') &&
  app.includes('attempts = 2') &&
  app.includes('loginWarmupStartedRef');

if (!hasLoginEndpoint || !hasBackendRecovery) {
  throw new Error('Resilient login flow marker not found');
}

const loginStart = app.indexOf('  const handleLogin = async () => {');
const registrationStart = app.indexOf('  const handleCompleteRegistration = async () => {', loginStart);
if (loginStart < 0 || registrationStart < 0) {
  throw new Error('Login flow boundaries not found');
}
let loginSegment = app.slice(loginStart, registrationStart);
if (loginSegment.includes('timeout: 30000')) {
  loginSegment = loginSegment.replace('timeout: 30000', 'timeout: 12000');
} else if (!loginSegment.includes('timeout: 12000')) {
  throw new Error('Login timeout marker not found');
}
app = `${app.slice(0, loginStart)}${loginSegment}${app.slice(registrationStart)}`;

// The backend verifier is authoritative for VIP pricing. Keep fallback values
// identical so the APK never displays 15/150 while the verifier expects 100/1000.
replaceRequired(
  'Number(process.env.EXPO_PUBLIC_VIP_MONTHLY_USDT || 15);',
  'Number(process.env.EXPO_PUBLIC_VIP_MONTHLY_USDT || 100);',
  'VIP monthly fallback'
);
replaceRequired(
  'Number(process.env.EXPO_PUBLIC_VIP_YEARLY_USDT || 150);',
  'Number(process.env.EXPO_PUBLIC_VIP_YEARLY_USDT || 1000);',
  'VIP yearly fallback'
);

// Use one canonical mapping for frontend shorthand network keys before sending
// them to the backend. This closes remaining ARB/AVAX failures in Vault,
// whitelist/blacklist, portfolio and allowance scans.
const networkHelper = `const normalizeBackendNetwork = (value) => {
  const network = String(value || '').trim().toLowerCase();
  if (network === 'eth') return 'ethereum';
  if (network === 'arb') return 'arbitrum';
  if (network === 'avax') return 'avalanche';
  return network;
};`;

if (!app.includes('const normalizeBackendNetwork = (value) =>')) {
  const ensureAnchor = `const ensureBackendConfigured = () => {
  if (!BACKEND_URL) {
    throw new Error('Backend URL yapılandırılmamış. EXPO_PUBLIC_BACKEND_URL tanımlayın.');
  }
};`;
  if (!app.includes(ensureAnchor)) throw new Error('Backend configuration anchor not found');
  app = app.replace(ensureAnchor, `${ensureAnchor}\n\n${networkHelper}`);
}

const simpleNetworkAlias = /selectedNetwork\s*===\s*(['"])eth\1\s*\?\s*(['"])ethereum\2\s*:\s*selectedNetwork(?!\s*===)/g;
app = app.replace(simpleNetworkAlias, 'normalizeBackendNetwork(selectedNetwork)');
app = app.replace(
  "selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork === 'arb' ? 'arbitrum' : selectedNetwork === 'avax' ? 'avalanche' : selectedNetwork",
  'normalizeBackendNetwork(selectedNetwork)'
);

replaceRequired(
  "const normalizedNetwork = String(targetNetwork === 'eth' ? 'ethereum' : targetNetwork || '').trim().toLowerCase();",
  'const normalizedNetwork = normalizeBackendNetwork(targetNetwork || selectedNetwork);',
  'Security-list network mapping'
);

// A wallet address may legitimately exist on several EVM chains. Local list
// duplicate detection must include network, matching the database unique key.
const oldDuplicate = `      const alreadyExists =
      previous.some((existing) =>
      String(existing?.address || existing).
      trim().
      toLowerCase() === item.address.toLowerCase()
      );`;
const newDuplicate = `      const alreadyExists = previous.some((existing) => {
        const existingAddress = String(existing?.address || existing).trim().toLowerCase();
        const existingNetwork = normalizeBackendNetwork(existing?.network || item.network);
        return existingAddress === item.address.toLowerCase() && existingNetwork === normalizeBackendNetwork(item.network);
      });`;
if (app.includes(oldDuplicate)) {
  const matches = app.split(oldDuplicate).length - 1;
  if (matches !== 2) throw new Error(`Expected 2 local list duplicate markers, found ${matches}`);
  app = app.split(oldDuplicate).join(newDuplicate);
}

// All mobile price reads go through the backend. The backend bootstrap provides
// shared cache and 429 cooldown so every device no longer calls CoinGecko on its
// own public-IP quota.
if (app.includes("axios.get('https://api.coingecko.com/api/v3/simple/price'")) {
  const start = app.indexOf('  const fetchLiveCoinGeckoPrices = useCallback(async () => {');
  const endMarker = '  }, [handleIsolatedError]);';
  const end = app.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Live-price function boundaries not found');

  const replacement = `  const fetchLiveCoinGeckoPrices = useCallback(async () => {
    const startTime = Date.now();
    try {
      RateLimiterGuard.checkLimit('coingecko-prices');
      const response = await api.get('/api/live-prices', { timeout: 10000 });
      const prices = response?.data?.prices;

      if (response?.data?.success && prices) {
        setLiveCryptoPrices({
          TRX: prices.tron?.usd ? String(prices.tron.usd) : null,
          SOL: prices.solana?.usd ? String(prices.solana.usd) : null,
          BTC: prices.bitcoin?.usd ? String(prices.bitcoin.usd) : null,
          AVAX: prices['avalanche-2']?.usd ? String(prices['avalanche-2'].usd) : null,
          ARB: prices.arbitrum?.usd ? String(prices.arbitrum.usd) : null,
          POL: prices['polygon-ecosystem-token']?.usd ? String(prices['polygon-ecosystem-token'].usd) : null,
          ETH: prices.ethereum?.usd ? String(prices.ethereum.usd) : null,
          USDT: prices.tether?.usd ? String(prices.tether.usd) : null,
          USDC: prices['usd-coin']?.usd ? String(prices['usd-coin'].usd) : null,
          BNB: prices.binancecoin?.usd ? String(prices.binancecoin.usd) : null,
          PI: prices['pi-network']?.usd ? String(prices['pi-network'].usd) : null,
          NFT: null
        });
      }
      PerformanceMonitor.logLoadTest('Backend Live Prices', Date.now() - startTime);
    } catch (e) {
      handleIsolatedError('Canlı Fiyatlar', e);
    }
  }, [handleIsolatedError]);`;

  app = `${app.slice(0, start)}${replacement}${app.slice(end + endMarker.length)}`;
}

// Registration: replace the temporary private-test lock with the real flow.
const registrationClosedMarker = 'Private Test — Registration Closed';
if (app.includes(registrationClosedMarker)) {
  const markerIndex = app.indexOf(registrationClosedMarker);
  const controlStart = app.lastIndexOf('<TouchableOpacity', markerIndex);
  const closingTag = '</TouchableOpacity>';
  const controlEndStart = app.indexOf(closingTag, markerIndex);

  if (controlStart < 0 || controlEndStart < 0) {
    throw new Error('Closed registration control boundaries not found');
  }

  const controlEnd = controlEndStart + closingTag.length;
  const control = app.slice(controlStart, controlEnd);
  let updatedControl = control.replace(
    /onPress=\{\(\) => Alert\.alert\([\s\S]*?\)\}>/,
    `onPress={() => setCurrentScreen('register')}>`
  );
  updatedControl = updatedControl.replace(
    /\{selectedLanguage === 'tr' \? 'Özel Test — Yeni Kayıt Kapalı' : 'Private Test — Registration Closed'\}/,
    `{t('createAccount')}`
  );

  if (updatedControl === control || updatedControl.includes(registrationClosedMarker)) {
    throw new Error('Closed registration control could not be converted');
  }

  app = `${app.slice(0, controlStart)}${updatedControl}${app.slice(controlEnd)}`;
} else if (!app.includes("setCurrentScreen('register')")) {
  throw new Error('Registration flow marker not found');
}

// Final build invariants.
const requiredMarkers = [
  'attempts = 2',
  'timeout: 12000',
  'normalizeBackendNetwork',
  'EXPO_PUBLIC_VIP_MONTHLY_USDT || 100',
  'EXPO_PUBLIC_VIP_YEARLY_USDT || 1000',
  "api.get('/api/live-prices'"
];
for (const marker of requiredMarkers) {
  if (!app.includes(marker)) throw new Error(`Final Android hardening marker missing: ${marker}`);
}
if (app.includes("axios.get('https://api.coingecko.com/api/v3/simple/price'")) {
  throw new Error('Direct mobile CoinGecko request is still present');
}

fs.writeFileSync(appPath, app);

// Android launcher: use the actual Safe Sentinel artwork for both legacy and
// adaptive launchers.
const logo = path.join(root, 'assets', 'yenilogo.png');
if (!fs.existsSync(logo)) throw new Error('assets/yenilogo.png not found');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const drawable = path.join(res, 'drawable-nodpi');
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(logo, path.join(drawable, 'safe_sentinel_logo.png'));

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const dir = path.join(res, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    for (const ext of ['webp', 'png']) {
      const old = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(old)) fs.rmSync(old);
    }
    fs.copyFileSync(logo, path.join(dir, `${name}.png`));
  }
}

const adaptiveDir = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(adaptiveDir, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/splashscreen_background" />\n  <foreground android:drawable="@drawable/safe_sentinel_logo" />\n</adaptive-icon>\n`;
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptive);

console.log('Safe Sentinel Android APK preparation: FINAL HARDENING PASS');
