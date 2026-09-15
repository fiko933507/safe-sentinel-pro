from pathlib import Path
import re


def must_replace(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} match(es), found {count}")
    return text.replace(old, new, expected)


# -----------------------------------------------------------------------------
# frontend/App.js
# -----------------------------------------------------------------------------
app_path = Path('frontend/App.js')
app = app_path.read_text(encoding='utf-8')

# Backend is authoritative for VIP payment verification. Keep UI fallback prices
# aligned with backend/.env.production.example so users are never shown a lower
# amount than the verifier accepts.
app = must_replace(app, "Number(process.env.EXPO_PUBLIC_VIP_MONTHLY_USDT || 15);", "Number(process.env.EXPO_PUBLIC_VIP_MONTHLY_USDT || 100);", 'VIP monthly alignment')
app = must_replace(app, "Number(process.env.EXPO_PUBLIC_VIP_YEARLY_USDT || 150);", "Number(process.env.EXPO_PUBLIC_VIP_YEARLY_USDT || 1000);", 'VIP yearly alignment')

helper_anchor = """const ensureBackendConfigured = () => {
  if (!BACKEND_URL) {
    throw new Error('Backend URL yapılandırılmamış. EXPO_PUBLIC_BACKEND_URL tanımlayın.');
  }
};
"""
helper_replacement = helper_anchor + """

const normalizeBackendNetwork = (value) => {
  const network = String(value || '').trim().toLowerCase();
  if (network === 'eth') return 'ethereum';
  if (network === 'arb') return 'arbitrum';
  if (network === 'avax') return 'avalanche';
  return network;
};
"""
if 'const normalizeBackendNetwork = (value) =>' not in app:
    app = must_replace(app, helper_anchor, helper_replacement, 'backend network normalizer')

# Normalize simple eth-only aliases that still leak frontend keys to backend.
pattern = re.compile(r"selectedNetwork\s*===\s*(['\"])eth\1\s*\?\s*(['\"])ethereum\2\s*:\s*selectedNetwork(?!\s*===)")
app, alias_count = pattern.subn("normalizeBackendNetwork(selectedNetwork)", app)
if alias_count < 4:
    raise SystemExit(f'network alias normalization: expected at least 4 simple aliases, found {alias_count}')

app = must_replace(
    app,
    "const normalizedNetwork = String(targetNetwork === 'eth' ? 'ethereum' : targetNetwork || '').trim().toLowerCase();",
    "const normalizedNetwork = normalizeBackendNetwork(targetNetwork || selectedNetwork);",
    'security list network normalization'
)

# Simplify explicit nested aliases already added for Guardian/Miras.
app = app.replace(
    "selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork === 'arb' ? 'arbitrum' : selectedNetwork === 'avax' ? 'avalanche' : selectedNetwork",
    "normalizeBackendNetwork(selectedNetwork)"
)

# Faster login: preserve one retry for a real Render restart but cap each auth
# attempt at 12 seconds rather than 30 seconds.
login_start = app.index('  const handleLogin = async () => {')
login_end = app.index('  const handleCompleteRegistration = async () => {', login_start)
login_segment = app[login_start:login_end]
if login_segment.count('timeout: 30000') != 1:
    raise SystemExit(f'login timeout marker count: {login_segment.count("timeout: 30000")}')
login_segment = login_segment.replace('timeout: 30000', 'timeout: 12000', 1)
app = app[:login_start] + login_segment + app[login_end:]

# Mobile clients must not each hit CoinGecko independently. Use the backend's
# shared cache/backoff layer instead.
price_start = app.index('  const fetchLiveCoinGeckoPrices = useCallback(async () => {')
price_end_marker = '  }, [handleIsolatedError]);'
price_end = app.index(price_end_marker, price_start) + len(price_end_marker)
new_price_block = """  const fetchLiveCoinGeckoPrices = useCallback(async () => {
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
  }, [handleIsolatedError]);"""
app = app[:price_start] + new_price_block + app[price_end:]

# Mirror backend's [network,address] uniqueness in local whitelist/blacklist.
old_duplicate = """      const alreadyExists =
      previous.some((existing) =>
      String(existing?.address || existing).
      trim().
      toLowerCase() === item.address.toLowerCase()
      );"""
new_duplicate = """      const alreadyExists = previous.some((existing) => {
        const existingAddress = String(existing?.address || existing).trim().toLowerCase();
        const existingNetwork = normalizeBackendNetwork(existing?.network || item.network);
        return existingAddress === item.address.toLowerCase() && existingNetwork === normalizeBackendNetwork(item.network);
      });"""
if app.count(old_duplicate) != 2:
    raise SystemExit(f'whitelist/blacklist duplicate check count: {app.count(old_duplicate)}')
app = app.replace(old_duplicate, new_duplicate)

app_path.write_text(app, encoding='utf-8')


# -----------------------------------------------------------------------------
# backend/src/server.js
# -----------------------------------------------------------------------------
server_path = Path('backend/src/server.js')
server = server_path.read_text(encoding='utf-8')

# URLhaus is a malicious-URL feed. A missing local export must be reported as an
# unavailable provider, never as a successful no-match.
urlhaus_start = server.index('const urlhausThreatIndex = new Map();')
urlhaus_end = server.index('/*\n * ============================================================\n * PHISHING CHECK', urlhaus_start)
new_urlhaus = r'''const urlhausThreatIndex = new Map();
const urlhausPhishingHostIndex = new Map();
let urlhausProviderAvailable = false;
let urlhausProviderStatus = 'URLHAUS_NOT_CONFIGURED';
const urlhausFile = String(
  process.env.URLHAUS_JSON_PATH || './urlhaus-recent-unpacked/urlhaus_full.json'
).trim();

try{
  if(fs.existsSync(urlhausFile)){
    const raw=fs.readFileSync(urlhausFile,'utf8');
    const data=JSON.parse(raw);

    for(const entries of Object.values(data||{})){
      if(!Array.isArray(entries)) continue;

      for(const entry of entries){
        const rawUrl=String(entry?.url||'').trim();
        if(!rawUrl) continue;

        let parsed;
        try{ parsed=new URL(rawUrl); }catch{ continue; }

        const normalizedUrl=rawUrl.toLowerCase().replace(/\/$/,'');
        const tags=Array.isArray(entry?.tags)
          ? entry.tags.map(tag=>String(tag).toLowerCase())
          : [];
        const threat=String(entry?.threat||'');
        const status=String(entry?.url_status||entry?.status||'').toLowerCase();
        const record={
          url:rawUrl,
          hostname:parsed.hostname.toLowerCase(),
          tags,
          threat,
          status,
          dateadded:String(entry?.dateadded||'')
        };

        urlhausThreatIndex.set(normalizedUrl,record);

        if(tags.includes('phishing') || /phishing/i.test(threat)){
          const hostKey=parsed.hostname.toLowerCase();
          if(!urlhausPhishingHostIndex.has(hostKey)){
            urlhausPhishingHostIndex.set(hostKey,[]);
          }
          urlhausPhishingHostIndex.get(hostKey).push(record);
        }
      }
    }

    urlhausProviderAvailable = true;
    urlhausProviderStatus = 'READY';
    console.log(`[THREAT INTEL] URLhaus index loaded: ${urlhausThreatIndex.size} URL`);
  }else{
    console.log('[THREAT INTEL] URLhaus local dataset is not configured; external URLhaus verdicts disabled.');
  }
}catch(error){
  urlhausProviderAvailable = false;
  urlhausProviderStatus = 'URLHAUS_LOAD_FAILED';
  console.error('[THREAT INTEL] URLhaus index load failed:',error?.message||error);
}

'''
server = server[:urlhaus_start] + new_urlhaus + server[urlhaus_end:]

old_no_match = """  return res.json({
    success:true,
    url:inputUrl,
    hostname,
    matched:false,
    matchType:'NO_MATCH',
    riskLevel:'UNKNOWN',
    status:'BILINMEYEN',
    source:'URLHAUS',
    phishing:false,
    malicious:false,
    summary:'URLhaus verisinde eşleşme bulunamadı. Bu sonuç URLnin güvenli olduğunu garanti etmez.',
    matchedRecord:null
  });"""
new_no_match = """  return res.json({
    success:true,
    url:inputUrl,
    hostname,
    matched:false,
    matchType:urlhausProviderAvailable ? 'NO_MATCH' : 'PROVIDER_UNAVAILABLE',
    riskLevel:'UNKNOWN',
    status:'BILINMEYEN',
    source:urlhausProviderAvailable ? 'URLHAUS' : 'LOCAL_VALIDATION',
    providerAvailable:urlhausProviderAvailable,
    providerStatus:urlhausProviderStatus,
    phishing:false,
    malicious:false,
    summary:urlhausProviderAvailable
      ? 'URLhaus kötü amaçlı URL verisinde eşleşme bulunamadı. Bu sonuç URLnin güvenli olduğunu garanti etmez.'
      : 'URLhaus tehdit istihbaratı yapılandırılmamış; harici tehdit eşleşmesi doğrulanamadı. Bu URL güvenli kabul edilmemelidir.',
    matchedRecord:null
  });"""
server = must_replace(server, old_no_match, new_no_match, 'truthful URLhaus no-match')

# Shared CoinGecko helper: exponential 5m/10m/20m/30m cooldown prevents the
# previous 3-minute polling loop from hammering a provider that already said 429.
price_block_start = server.index('let priceAlertPolling = false;')
price_block_end = server.index('const runPriceAlertPolling = async () => {', price_block_start)
new_price_helper = """let priceAlertPolling = false;
let priceAlertBackoffUntil = 0;
let priceAlertRateLimitStrikes = 0;
let priceAlertCachedPrices = {};
let priceAlertCacheUpdatedAt = 0;
const PRICE_ALERT_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const fetchPriceAlertPrices = async (assets) => {
  const uniqueAssets = Array.from(new Set(assets));
  if (uniqueAssets.length === 0) return {};

  const now = Date.now();
  const hasCache = Object.keys(priceAlertCachedPrices).length > 0;
  const cacheAge = now - priceAlertCacheUpdatedAt;
  const cacheUsable = hasCache && cacheAge <= PRICE_ALERT_CACHE_MAX_AGE_MS;

  if (now < priceAlertBackoffUntil) {
    return cacheUsable ? priceAlertCachedPrices : null;
  }

  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=' +
    encodeURIComponent(uniqueAssets.join(',')) +
    '&vs_currencies=usd';

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Safe-Sentinel-Pro/1.0'
    }
  });

  if (response.status === 429) {
    priceAlertRateLimitStrikes = Math.min(priceAlertRateLimitStrikes + 1, 4);
    const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
    const exponentialBackoffMs = Math.min(
      5 * 60 * 1000 * (2 ** (priceAlertRateLimitStrikes - 1)),
      30 * 60 * 1000
    );
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
    const backoffMs = Math.max(exponentialBackoffMs, retryAfterMs);
    priceAlertBackoffUntil = now + backoffMs;

    console.warn(`[PRICE ALERT] CoinGecko rate limited; cooldown ${Math.round(backoffMs / 60000)}m (strike ${priceAlertRateLimitStrikes}).`);
    return cacheUsable ? priceAlertCachedPrices : null;
  }

  if (!response.ok) {
    if (cacheUsable) {
      console.warn(`[PRICE ALERT] CoinGecko HTTP ${response.status}; cached prices used.`);
      return priceAlertCachedPrices;
    }
    throw new Error(`CoinGecko price alert HTTP ${response.status}`);
  }

  const payload = await response.json();
  priceAlertCachedPrices = payload && typeof payload === 'object' ? payload : {};
  priceAlertCacheUpdatedAt = now;
  priceAlertBackoffUntil = 0;
  priceAlertRateLimitStrikes = 0;
  return priceAlertCachedPrices;
};

"""
server = server[:price_block_start] + new_price_helper + server[price_block_end:]

old_prices_call = """    const prices = await fetchPriceAlertPrices(
      alerts.map((alert) => alert.asset)
    );

    for (const alert of alerts) {"""
new_prices_call = """    const prices = await fetchPriceAlertPrices(
      alerts.map((alert) => alert.asset)
    );

    if (!prices) {
      return;
    }

    for (const alert of alerts) {"""
server = must_replace(server, old_prices_call, new_prices_call, 'price alert backoff skip')

# Proxy live-price clients through the shared backend cache/backoff helper.
live_start = server.index("app.get('/api/live-prices', async (req, res) => {")
live_end = server.index("app.post('/api/auth/register'", live_start)
new_live_route = """app.get('/api/live-prices', async (_req, res) => {
  const assets = [
    'tron','solana','bitcoin','avalanche-2','arbitrum',
    'polygon-ecosystem-token','ethereum','binancecoin','pi-network',
    'tether','usd-coin'
  ];

  try {
    const prices = await fetchPriceAlertPrices(assets);

    if (!prices) {
      return res.status(503).json({
        success:false,
        error:'Live prices are temporarily rate limited',
        retryAt:priceAlertBackoffUntil > Date.now()
          ? new Date(priceAlertBackoffUntil).toISOString()
          : null
      });
    }

    return res.json({
      success:true,
      prices,
      cached:priceAlertCacheUpdatedAt > 0,
      updatedAt:priceAlertCacheUpdatedAt > 0
        ? new Date(priceAlertCacheUpdatedAt).toISOString()
        : null
    });
  } catch (error) {
    console.error('Live price backend error:', error?.message || error);
    return res.status(502).json({success:false,error:'Live prices unavailable'});
  }
});
"""
server = server[:live_start] + new_live_route + server[live_end:]

# Repair a corrupted user-visible warning glyph found in Vault monitor output.
server = server.replace("'\x1fŸš¨ Scam Adrese Transfer'", "'⚠️ Scam Adrese Transfer'")
server = server.replace("'Ÿš¨ Scam Adrese Transfer'", "'⚠️ Scam Adrese Transfer'")
server_path.write_text(server, encoding='utf-8')


# -----------------------------------------------------------------------------
# backend/.env.production.example + official APK gate
# -----------------------------------------------------------------------------
env_path = Path('backend/.env.production.example')
env = env_path.read_text(encoding='utf-8')
if 'URLHAUS_JSON_PATH=' not in env:
    env += "\n# Optional local URLhaus JSON export. Without it the API reports provider unavailable instead of a false no-match.\nURLHAUS_JSON_PATH=./urlhaus-recent-unpacked/urlhaus_full.json\n"
env_path.write_text(env, encoding='utf-8')

gate_path = Path('.github/workflows/play-store-release-gate.yml')
gate = gate_path.read_text(encoding='utf-8-sig')
gate = must_replace(gate, "grep -Fq 'attempts = 3' App.js", "grep -Fq 'attempts = 2' App.js", 'APK gate retry marker')
gate = must_replace(gate, "grep -Fq 'timeout: 30000' App.js", "grep -Fq 'timeout: 12000' App.js", 'APK gate login timeout marker')
gate = must_replace(
    gate,
    "          grep -Fq 'priceAlertBackoffUntil' ../backend/src/server.js\n",
    "          grep -Fq 'priceAlertBackoffUntil' ../backend/src/server.js\n"
    "          grep -Fq 'priceAlertRateLimitStrikes' ../backend/src/server.js\n"
    "          grep -Fq 'URLHAUS_NOT_CONFIGURED' ../backend/src/server.js\n"
    "          grep -Fq 'normalizeBackendNetwork' App.js\n"
    "          grep -Fq 'EXPO_PUBLIC_VIP_MONTHLY_USDT || 100' App.js\n",
    'APK gate final hardening markers'
)
gate_path.write_text(gate, encoding='utf-8')

# Self-check the intended invariants before CI/build.
app_final = app_path.read_text(encoding='utf-8')
server_final = server_path.read_text(encoding='utf-8')
checks = {
    'backend live-price proxy': "api.get('/api/live-prices'" in app_final,
    'no direct mobile CoinGecko price call': "axios.get('https://api.coingecko.com/api/v3/simple/price'" not in app_final,
    'network normalizer': 'normalizeBackendNetwork' in app_final,
    'VIP monthly': 'EXPO_PUBLIC_VIP_MONTHLY_USDT || 100' in app_final,
    'VIP yearly': 'EXPO_PUBLIC_VIP_YEARLY_USDT || 1000' in app_final,
    'rate-limit strikes': 'priceAlertRateLimitStrikes' in server_final,
    'URLhaus truthful state': 'URLHAUS_NOT_CONFIGURED' in server_final,
    'live-price shared cache': 'fetchPriceAlertPrices(assets)' in server_final,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('Final hardening self-check failed: ' + ', '.join(failed))

print('Final Safe Sentinel production hardening patch: PASS')
