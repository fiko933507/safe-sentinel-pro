import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const SOURCE = 'EtherScamDB Historical Ethereum Scam Addresses';
const URL = 'https://raw.githubusercontent.com/MrLuit/EtherScamDB/master/_data/scams.yaml';

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const response = await fetch(URL, {
    headers: { 'user-agent': 'Safe-Sentinel-Pro-Historical-Scam-Sync/1.0', accept: 'text/plain,*/*' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`EtherScamDB: HTTP ${response.status}`);
  const text = await response.text();

  const matches = [...text.matchAll(/^\s*-\s*['\"]?(0x[a-fA-F0-9]{40})['\"]?\s*$/gm)];
  const addresses = [...new Set(matches.map((m) => m[1].toLowerCase()))];

  let imported = 0;
  for (const address of addresses) {
    const record = await db.scamAddress.upsert({
      where: { network_address: { network: 'ethereum', address } },
      create: {
        network: 'ethereum',
        address,
        category: 'HISTORICAL_SCAM',
        label: 'Historical scam-associated Ethereum address',
        description: 'Historical address associated with a scam record in EtherScamDB. Treat as supporting evidence, not a sole real-time determination.',
        source: SOURCE,
        confidence: 65,
        severity: 72,
        active: true,
        firstSeenAt: new Date(),
        lastSeenAt: new Date()
      },
      update: {
        source: SOURCE,
        confidence: { set: 65 },
        severity: { set: 72 },
        active: true,
        lastSeenAt: new Date()
      }
    });

    const description = `Source feed: ${SOURCE}`;
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
          category: 'HISTORICAL_SCAM',
          description,
          confidence: 65
        }
      });
    }
    imported += 1;
  }

  console.log(JSON.stringify({ success: true, source: SOURCE, fetchedBytes: text.length, uniqueAddresses: addresses.length, imported }, null, 2));
};

main().catch((error) => {
  console.error('[ETHERSCAMDB HISTORICAL SYNC]', error?.stack || error);
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
