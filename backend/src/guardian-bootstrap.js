import 'dotenv/config';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { createAdapters } from './adapters/index.js';

const db = new PrismaClient();
const adapters = createAdapters();
const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');
const SCAN_INTERVAL_MS = Math.max(60000, Number(process.env.GUARDIAN_SCAN_INTERVAL_MS || 60000));
const VIP_PATHS = new Set(['/api/guardian/profile', '/api/guardian/evaluate']);
let scanRunning = false;
let workerStarted = false;
let routesRegistered = false;

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

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = express.application[method];
  express.application[method] = function patchedRoute(path, ...handlers) {
    if (typeof path === 'string' && isVipProtectedPath(path)) {
      return original.call(this, path, requireVip, ...handlers);
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
