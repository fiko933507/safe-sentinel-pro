import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const SOURCES = [
  { id: 'eu', name: 'EU Consolidated Sanctions EVM Addresses', url: 'https://github.com/safe-research/sanctions-address-lists/releases/download/latest/eu.json', confidence: 100, severity: 100 },
  { id: 'uk', name: 'UK Sanctions List EVM Addresses', url: 'https://github.com/safe-research/sanctions-address-lists/releases/download/latest/uk.json', confidence: 100, severity: 100 },
  { id: 'un', name: 'UN Security Council Sanctions EVM Addresses', url: 'https://github.com/safe-research/sanctions-address-lists/releases/download/latest/un.json', confidence: 100, severity: 100 },
  { id: 'ch-seco', name: 'Swiss SECO Sanctions EVM Addresses', url: 'https://github.com/safe-research/sanctions-address-lists/releases/download/latest/ch-seco.json', confidence: 100, severity: 100 }
];

const normalize = (address) => String(address || '').trim().toLowerCase();
const isEvm = (address) => /^0x[a-f0-9]{40}$/.test(address);

async function fetchAddresses(source) {
  const response = await fetch(source.url, {
    headers: { 'user-agent': 'Safe-Sentinel-Pro-Sanctions/1.0', accept: 'application/json,text/plain,*/*' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${source.name}: expected JSON array`);
  return [...new Set(payload.map(normalize).filter(isEvm))];
}

async function upsertAddress(address, source) {
  const now = new Date();
  const record = await db.scamAddress.upsert({
    where: { network_address: { network: 'ethereum', address } },
    create: {
      network: 'ethereum', address, category: 'SANCTIONED',
      label: `${source.id.toUpperCase()} sanctioned EVM address`,
      description: `${source.name}; extracted from official sanctions data by safe-research/sanctions-address-lists.`,
      source: source.name, confidence: source.confidence, severity: source.severity,
      active: true, firstSeenAt: now, lastSeenAt: now
    },
    update: {
      category: 'SANCTIONED',
      confidence: source.confidence,
      severity: source.severity,
      active: true,
      lastSeenAt: now
    }
  });

  const description = `Source feed: ${source.name}`;
  const existing = await db.scamEvidence.findFirst({
    where: { scamAddressId: record.id, observedAddress: address, network: 'ethereum', relation: 'SOURCE_FEED', description },
    select: { id: true }
  });
  if (!existing) {
    await db.scamEvidence.create({
      data: {
        scamAddressId: record.id,
        network: 'ethereum',
        observedAddress: address,
        relation: 'SOURCE_FEED',
        category: 'SANCTIONED',
        description,
        confidence: source.confidence
      }
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const stats = [];
  const globalSet = new Set();

  for (const source of SOURCES) {
    try {
      const addresses = await fetchAddresses(source);
      for (const address of addresses) {
        globalSet.add(address);
        await upsertAddress(address, source);
      }
      stats.push({ source: source.name, accepted: addresses.length, status: 'ok' });
    } catch (error) {
      stats.push({ source: source.name, accepted: 0, status: 'error', error: error.message });
    }
  }

  console.log(JSON.stringify({ success: true, uniqueExtraSanctionsAddresses: globalSet.size, sources: stats }, null, 2));
}

main()
  .catch((error) => { console.error('[GLOBAL SANCTIONS EXTRA]', error?.stack || error); process.exitCode = 1; })
  .finally(async () => db.$disconnect());
