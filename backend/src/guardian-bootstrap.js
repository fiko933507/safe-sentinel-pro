import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { createAdapters } from './adapters/index.js';

const db = new PrismaClient();
const adapters = createAdapters();
const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');
const SCAN_INTERVAL_MS = Math.max(60000, Number(process.env.GUARDIAN_SCAN_INTERVAL_MS || 60000));
const VIP_PATHS = new Set(['/api/guardian/profile', '/api/guardian/evaluate']);
const URLHAUS_JSON_PATH = String(
  process.env.URLHAUS_JSON_PATH || './urlhaus-recent-unpacked/urlhaus_full.json'
).trim();
const URLHAUS_LOCAL_READY = Boolean(URLHAUS_JSON_PATH && fs.existsSync(URLHAUS_JSON_PATH));
let scanRunning = false;
let workerStarted = false;
let routesRegistered = false;

/*
 * Provider protection is installed before server.js is evaluated because this
 * module is loaded with Node --import. It prevents every mobile/client request
 * and the background price-alert worker from independently hammering CoinGecko
 * after a 429 response. Successful simple-price responses are cached for up to
 * 30 minutes and can be served during a provider cooldown.
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
let coingeckoBackoffUntil = 0;
let coingeckoRateLimitStrikes = 0;
let coingeckoCachedPrices = {};
let coingeckoCacheUpdatedAt = 0;
const COINGECKO_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const makeJsonResponse = (payload, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      ...extraHeaders
    }
  });

const isCoinGeckoSimplePriceUrl = value => {
  try {
    const url = new URL(String(value || ''));
    return url.hostname === 'api.coingecko.com' && url.pathname === '/api/v3/simple/price';
  } catch {
    return false;
  }
};

globalThis.fetch = async (input, init) => {
  const rawUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');

  if (!isCoinGeckoSimplePriceUrl(rawUrl)) {
    return nativeFetch(input, init);
  }

  const now = Date.now();
  const hasCache = Object.keys(coingeckoCachedPrices).length > 0;
  const cacheUsable =
    hasCache && now - coingeckoCacheUpdatedAt <= COINGECKO_CACHE_MAX_AGE_MS;

  if (now < coingeckoBackoffUntil) {
    if (cacheUsable) {
      return makeJsonResponse(coingeckoCachedPrices, 200, {
        'x-safe-sentinel-cache': 'coingecko-backoff'
      });
    }

    const retrySeconds = Math.max(1, Math.ceil((coingeckoBackoffUntil - now) / 1000));
    return makeJsonResponse(
      { error: 'CoinGecko temporarily rate limited' },
      429,
      { 'retry-after': String(retrySeconds) }
    );
  }

  const response = await nativeFetch(input, init);

  if (response.status === 429) {
    coingeckoRateLimitStrikes = Math.min(coingeckoRateLimitStrikes + 1, 4);
    const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
    const exponentialBackoffMs = Math.min(
      5 * 60 * 1000 * (2 ** (coingeckoRateLimitStrikes - 1)),
      30 * 60 * 1000
    );
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
    const backoffMs = Math.max(exponentialBackoffMs, retryAfterMs);
    coingeckoBackoffUntil = now + backoffMs;

    console.warn(
      `[COINGECKO] Rate limited; external requests paused for ${Math.round(backoffMs / 60000)}m (strike ${coingeckoRateLimitStrikes}).`
    );

    if (cacheUsable) {
      return makeJsonResponse(coingeckoCachedPrices, 200, {
        'x-safe-sentinel-cache': 'coingecko-rate-limit'
      });
    }

    return response;
  }

  if (response.ok) {
    try {
      const payload = await response.clone().json();
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        coingeckoCachedPrices = {
          ...coingeckoCachedPrices,
          ...payload
        };
        coingeckoCacheUpdatedAt = now;
        coingeckoBackoffUntil = 0;
        coingeckoRateLimitStrikes = 0;
      }
    } catch {
      // The original response remains usable even if cache parsing fails.
    }
  }

  return response;
};

// Replace two legacy noisy messages with truthful provider-state messages. The
// underlying request still receives an UNKNOWN verdict when URLhaus is absent.
const nativeWarn = console.warn.bind(console);
const nativeError = console.error.bind(console);
console.warn = (...args) => {
  if (String(args[0] || '').includes('[PHISHING] URLhaus file not found')) {
    console.log('[THREAT INTEL] URLhaus local dataset is not configured; external URLhaus verdicts disabled.');
    return;
  }
  nativeWarn(...args);
};
console.error = (...args) => {
  const prefix = String(args[0] || '');
  const detail = String(args[1] || '');
  if (prefix.includes('[PRICE ALERT] Polling error:') && /CoinGecko rate limited/i.test(detail)) {
    return;
  }
  nativeError(...args);
};

const isVipProtectedPath = path =>
  VIP_PATHS.has(String(path || '')) || String(path || '').startsWith('/api/inheritance');

const authenticateRequest = async req => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { payload } = await jwtVerify(token, secret);
  if (!payload.sub || !payload.jti) return null;

  const session = await db.authSession.findUnique({
    where: { jti: String(payload.jti) }
  });

  if (
    !session ||
    session.userId !== String(payload.sub) ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    return null;
  }

  return {
    id: String(payload.sub),
    email: payload.email ? String(payload.email) : null,
    sessionId: session.id
  };
};

const requireVip = async (req, res, next) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const subscription = await db.subscription.findUnique({
      where: { userId: user.id }
    });

    const active = subscription?.status === 'ACTIVE' && subscription.expiresAt > new Date();
    if (!active) {
      return res.status(403).json({
        success: false,
        code: 'VIP_REQUIRED',
        error: 'Guardian and Crypto Asset Inheritance require an active VIP subscription.'
      });
    }

    req.guardianVipUser = user;
    next();
  } catch (error) {
    console.error('[GUARDIAN VIP] entitlement check failed:', error?.message || error);
    return res.status(401).json({ success: false, error: 'VIP entitlement could not be verified.' });
  }
};

const urlhausUnavailableHandler = async (req, res) => {
  const inputUrl = String(req.body?.url || '').trim();
  if (!inputUrl || inputUrl.length > 4096) {
    return res.status(400).json({ success: false, error: 'Invalid URL' });
  }

  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format' });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ success: false, error: 'Only HTTP/HTTPS URLs are supported' });
  }

  return res.json({
    success: true,
    url: inputUrl,
    hostname: parsed.hostname.toLowerCase(),
    matched: false,
    matchType: 'PROVIDER_UNAVAILABLE',
    riskLevel: 'UNKNOWN',
    status: 'BILINMEYEN',
    source: 'LOCAL_VALIDATION',
    providerAvailable: false,
    providerStatus: 'URLHAUS_NOT_CONFIGURED',
    phishing: false,
    malicious: false,
    summary: 'URLhaus tehdit istihbaratı yapılandırılmamış; harici tehdit eşleşmesi doğrulanamadı. Bu URL güvenli kabul edilmemelidir.',
    matchedRecord: null
  });
};

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = express.application[method];
  express.application[method] = function patchedRoute(path, ...handlers) {
    if (typeof path === 'string' && isVipProtectedPath(path)) {
      return original.call(this, path, requireVip, ...handlers);
    }

    if (
      method === 'post' &&
      path === '/api/check-phishing' &&
      !URLHAUS_LOCAL_READY &&
      handlers.length >= 2
    ) {
      // Preserve server.js authentication middleware, replace only the provider
      // handler so a missing dataset cannot masquerade as a successful no-match.
      return original.call(this, path, handlers[0], urlhausUnavailableHandler);
    }

    return original.call(this, path, ...handlers);
  };
}

const authOnly = async (req, res, next) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    req.guardianPushUser = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

const normalizeAddress = (network, value) => {
  const raw = String(value || '').trim();
  return String(network || '').toLowerCase() === 'tron' ? raw : raw.toLowerCase();
};

const txTimeMs = tx => {
  const raw = Number(tx?.timestamp ?? tx?.time ?? tx?.blockTimestamp ?? tx?.block_timestamp ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 100000000000 ? raw * 1000 : raw;
};

const sendExpoPush = async (tokens, message) => {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) return;

  const payload = uniqueTokens.map(to => ({
    to,
    sound: 'default',
    priority: 'high',
    title: message.title,
    body: message.body,
    data: message.data || {}
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[GUARDIAN PUSH] Expo error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('[GUARDIAN PUSH] send failed:', error?.message || error);
  }
};

const scamMatch = async (network, address) => {
  const clean = String(address || '').trim();
  if (!clean) return null;

  return db.scamAddress.findFirst({
    where: {
      active: true,
      network: { equals: String(network || '').trim(), mode: 'insensitive' },
      address: { equals: clean, mode: 'insensitive' }
    },
    orderBy: [{ severity: 'desc' }, { confidence: 'desc' }]
  });
};

const registerPushRoutes = app => {
  if (routesRegistered) return;
  routesRegistered = true;

  app.post('/api/push-devices', authOnly, async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || '').trim().slice(0, 32) || null;

    if (!/^ExponentPushToken\[[^\]]+\]$/.test(token) && !/^ExpoPushToken\[[^\]]+\]$/.test(token)) {
      return res.status(400).json({ success: false, error: 'Invalid Expo push token.' });
    }

    try {
      const device = await db.pushDevice.upsert({
        where: { token },
        update: {
          userId: req.guardianPushUser.id,
          platform,
          active: true
        },
        create: {
          userId: req.guardianPushUser.id,
          token,
          platform,
          active: true
        }
      });

      return res.json({
        success: true,
        device: { id: device.id, platform: device.platform, active: device.active }
      });
    } catch (error) {
      console.error('[PUSH DEVICE] registration failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Push device could not be registered.' });
    }
  });

  app.delete('/api/push-devices', authOnly, async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'Push token required.' });

    await db.pushDevice.updateMany({
      where: { userId: req.guardianPushUser.id, token },
      data: { active: false }
    });

    return res.json({ success: true });
  });
};

const scanWallet = async ({ user, profile, wallet, pushTokens }) => {
  const network = String(wallet.network || '').trim().toLowerCase();
  const adapter = adapters.get(network);
  if (!adapter || typeof adapter.checkWallet !== 'function') return;

  let result;
  try {
    result = await adapter.checkWallet({ network, address: wallet.address });
  } catch (error) {
    console.warn('[GUARDIAN] scan failed:', network, wallet.address, error?.message || error);
    return;
  }

  const txs = Array.isArray(result?.transactions) ? result.transactions.slice(0, 50) : [];
  if (!txs.length) return;

  const walletKey = normalizeAddress(network, wallet.address);
  const now = Date.now();
  const enabledAt = profile?.updatedAt ? new Date(profile.updatedAt).getTime() : now;
  const notBefore = Math.max(enabledAt, now - 10 * 60 * 1000);

  for (const tx of txs) {
    const from = String(tx?.from || '').trim();
    const to = String(tx?.to || '').trim();
    const fromKey = normalizeAddress(network, from);
    const toKey = normalizeAddress(network, to);

    const incoming = toKey === walletKey && fromKey && fromKey !== walletKey;
    const outgoing = fromKey === walletKey && toKey && toKey !== walletKey;
    if (!incoming && !outgoing) continue;

    const timestamp = txTimeMs(tx);
    if (timestamp && timestamp < notBefore) continue;

    const counterparty = incoming ? from : to;
    const scam = await scamMatch(network, counterparty);
    if (!scam) continue;

    const txid = String(tx?.txid || tx?.hash || tx?.id || '').trim();
    if (!txid) continue;

    const eventKey = `guardian:${user.id}:${network}:${txid}:${normalizeAddress(network, counterparty)}`;
    const alreadyNotified = await db.notification.findUnique({ where: { eventKey } });
    if (alreadyNotified) continue;

    const severity = scam.severity >= 80 ? 'CRITICAL' : scam.severity >= 60 ? 'HIGH' : 'WARNING';
    const direction = incoming ? 'IN' : 'OUT';
    const title = 'Guardian Güvenlik Uyarısı';
    const body = incoming
      ? 'Cüzdanınız bilinen şüpheli/spam bir adresten etkileşim aldı.'
      : 'Cüzdanınız bilinen şüpheli/spam bir adresle etkileşime girdi.';

    await db.$transaction([
      db.securityAlert.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          type: 'GUARDIAN_SCAM_INTERACTION',
          severity,
          title,
          body,
          network,
          walletAddress: wallet.address,
          transactionId: txid,
          direction,
          amount: Number.isFinite(Number(tx?.amount)) ? Number(tx.amount) : null,
          token: String(tx?.tokenSymbol || tx?.token || '').trim() || null,
          counterparty,
          scamAddressId: scam.id
        }
      }),
      db.notification.create({
        data: {
          userId: user.id,
          type: 'GUARDIAN_SCAM_INTERACTION',
          severity,
          title,
          body,
          eventKey,
          network,
          resourceId: txid
        }
      })
    ]);

    await sendExpoPush(pushTokens, {
      title: `🚨 ${title}`,
      body,
      data: {
        type: 'GUARDIAN_SCAM_INTERACTION',
        network,
        walletAddress: wallet.address,
        transactionId: txid,
        counterparty,
        severity,
        direction
      }
    });
  }
};

const runScan = async () => {
  if (scanRunning) return;
  scanRunning = true;

  try {
    const users = await db.user.findMany({
      where: {
        guardianProfile: { is: { enabled: true } },
        subscription: {
          is: {
            status: 'ACTIVE',
            expiresAt: { gt: new Date() }
          }
        }
      },
      include: {
        guardianProfile: true,
        wallets: true,
        pushDevices: {
          where: { active: true },
          select: { token: true }
        }
      }
    });

    for (const user of users) {
      const pushTokens = (user.pushDevices || []).map(item => item.token);
      for (const wallet of user.wallets || []) {
        await scanWallet({ user, profile: user.guardianProfile, wallet, pushTokens });
      }
    }
  } catch (error) {
    console.error('[GUARDIAN] scan cycle failed:', error?.message || error);
  } finally {
    scanRunning = false;
  }
};

const startWorker = () => {
  if (workerStarted || process.env.GUARDIAN_WORKER_ENABLED === 'false') return;
  workerStarted = true;
  console.log(`[GUARDIAN] VIP wallet watcher active; interval=${SCAN_INTERVAL_MS}ms`);
  console.log(
    URLHAUS_LOCAL_READY
      ? `[THREAT INTEL] URLhaus local provider ready: ${URLHAUS_JSON_PATH}`
      : '[THREAT INTEL] URLhaus provider unavailable; API will return UNKNOWN instead of a false safe verdict.'
  );
  setTimeout(() => runScan().catch(() => {}), 5000);
  const timer = setInterval(() => runScan().catch(() => {}), SCAN_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
};

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  registerPushRoutes(this);
  startWorker();
  return originalListen.apply(this, args);
};
