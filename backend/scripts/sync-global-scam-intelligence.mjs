import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DEFAULT_SOURCES = [
  {
    name: 'MyEtherWallet Ethereum Address Darklist',
    url: 'https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json',
    network: 'ethereum',
    format: 'json',
    category: 'DARKLIST_WARNING',
    confidence: 70,
    severity: 65,
    addressField: 'address',
    descriptionField: 'comment',
    dateField: 'date'
  }
];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

const normalizeNetwork = (value) => {
  const network = String(value || '').trim().toLowerCase();
  const aliases = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    bnb: 'bsc',
    binance: 'bsc',
    bsc: 'bsc',
    matic: 'polygon',
    polygon: 'polygon',
    arb: 'arbitrum',
    arbitrum: 'arbitrum',
    avax: 'avalanche',
    avalanche: 'avalanche',
    op: 'optimism',
    optimism: 'optimism',
    trx: 'tron',
    tron: 'tron',
    btc: 'bitcoin',
    bitcoin: 'bitcoin',
    sol: 'solana',
    solana: 'solana',
    base: 'base'
  };
  return aliases[network] || network || 'unknown';
};

const detectNetwork = (address) => {
  const value = String(address || '').trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return 'ethereum';
  if (/^T[1-9A-HJ-NP-Za-km-z]{30,44}$/.test(value)) return 'tron';
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,61}$/i.test(value)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return 'solana';
  return 'unknown';
};

const normalizeAddress = (address, network) => {
  const raw = String(address || '').trim();
  if (!raw) return '';
  const n = normalizeNetwork(network);
  if (['ethereum','bsc','polygon','arbitrum','avalanche','optimism','base'].includes(n)) {
    return raw.toLowerCase();
  }
  return raw;
};

const parseCsv = (text) => {
  const rows = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const header = rows[0].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
  return rows.slice(1).map((row) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < row.length; i += 1) {
      const ch = row[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { values.push(current); current = ''; }
      else current += ch;
    }
    values.push(current);
    return Object.fromEntries(header.map((key, i) => [key, String(values[i] ?? '').trim().replace(/^"|"$/g, '')]));
  });
};

const extractRecords = (payload, source) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.addresses)) return payload.addresses;
  if (Array.isArray(payload?.data)) return payload.data;
  if (source.rootField && Array.isArray(payload?.[source.rootField])) return payload[source.rootField];
  return [];
};

const loadSourceConfig = () => {
  const custom = String(process.env.SCAM_FEED_URLS || '').trim();
  if (!custom) return DEFAULT_SOURCES;
  try {
    const parsed = JSON.parse(custom);
    const sources = Array.isArray(parsed) ? parsed : [];
    return [...DEFAULT_SOURCES, ...sources.filter((s) => s?.url && s?.name)];
  } catch (error) {
    throw new Error(`SCAM_FEED_URLS must be valid JSON: ${error.message}`);
  }
};

const fetchSource = async (source) => {
  const response = await fetch(source.url, {
    headers: {
      'user-agent': 'Safe-Sentinel-Pro-Scam-Intelligence/1.0',
      'accept': source.format === 'csv' ? 'text/csv,*/*' : 'application/json,text/plain,*/*'
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs || 30000))
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const text = await response.text();
  if (source.format === 'csv') return parseCsv(text);
  if (source.format === 'txt') return text.split(/\r?\n/).map((address) => ({ address })).filter((x) => x.address.trim());
  return extractRecords(JSON.parse(text), source);
};

const toNormalizedRecord = (record, source) => {
  const address = record?.[source.addressField || 'address'] ?? record?.address ?? record?.wallet ?? record?.id;
  if (!address) return null;
  const network = normalizeNetwork(record?.[source.networkField || 'network'] || source.network || detectNetwork(address));
  if (network === 'unknown') return null;
  const normalizedAddress = normalizeAddress(address, network);
  if (!normalizedAddress) return null;
  const rawDate = record?.[source.dateField || 'date'] || record?.lastSeenAt || record?.firstSeenAt;
  const parsedDate = rawDate ? new Date(rawDate) : null;
  return {
    network,
    address: normalizedAddress,
    category: String(record?.[source.categoryField || 'category'] || source.category || 'SCAM').slice(0, 120),
    label: String(record?.[source.labelField || 'label'] || source.label || source.name).slice(0, 250),
    description: String(record?.[source.descriptionField || 'description'] || record?.comment || source.description || '').slice(0, 1500) || null,
    source: String(source.name).slice(0, 250),
    confidence: clamp(record?.[source.confidenceField || 'confidence'] ?? source.confidence ?? 60),
    severity: clamp(record?.[source.severityField || 'severity'] ?? source.severity ?? 60),
    observedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date()
  };
};

const mergeRecords = (records) => {
  const map = new Map();
  for (const item of records) {
    if (!item) continue;
    const key = `${item.network}:${item.address}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, sources: [item.source] });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.severity = Math.max(existing.severity, item.severity);
    existing.observedAt = existing.observedAt > item.observedAt ? existing.observedAt : item.observedAt;
    existing.sources = [...new Set([...existing.sources, item.source])];
    if (!existing.description && item.description) existing.description = item.description;
    if (existing.category === 'DARKLIST_WARNING' && item.category !== 'DARKLIST_WARNING') existing.category = item.category;
  }
  return [...map.values()];
};

const upsertRecord = async (item) => {
  const now = new Date();
  const record = await db.scamAddress.upsert({
    where: { network_address: { network: item.network, address: item.address } },
    create: {
      network: item.network,
      address: item.address,
      category: item.category,
      label: item.label,
      description: item.description,
      source: item.sources.join(', '),
      confidence: item.confidence,
      severity: item.severity,
      active: true,
      firstSeenAt: item.observedAt,
      lastSeenAt: item.observedAt
    },
    update: {
      category: item.category,
      label: item.label,
      description: item.description,
      source: item.sources.join(', '),
      confidence: item.confidence,
      severity: item.severity,
      active: true,
      lastSeenAt: item.observedAt || now
    }
  });

  for (const source of item.sources) {
    const description = `Source feed: ${source}`;
    const existingEvidence = await db.scamEvidence.findFirst({
      where: {
        scamAddressId: record.id,
        observedAddress: item.address,
        network: item.network,
        relation: 'SOURCE_FEED',
        description
      },
      select: { id: true }
    });
    if (!existingEvidence) {
      await db.scamEvidence.create({
        data: {
          scamAddressId: record.id,
          network: item.network,
          observedAddress: item.address,
          relation: 'SOURCE_FEED',
          category: item.category,
          description,
          confidence: item.confidence
        }
      });
    }
  }
};

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sources = loadSourceConfig();
  const normalized = [];
  const stats = [];

  for (const source of sources) {
    try {
      const rawRecords = await fetchSource(source);
      let accepted = 0;
      for (const raw of rawRecords) {
        const record = toNormalizedRecord(raw, source);
        if (record) { normalized.push(record); accepted += 1; }
      }
      stats.push({ source: source.name, fetched: rawRecords.length, accepted, status: 'ok' });
    } catch (error) {
      stats.push({ source: source.name, fetched: 0, accepted: 0, status: 'error', error: error.message });
      if (source.required === true) throw error;
    }
  }

  const merged = mergeRecords(normalized);
  const batchSize = Math.max(1, Math.min(100, Number(process.env.SCAM_IMPORT_BATCH_SIZE || 25)));
  let imported = 0;
  for (let i = 0; i < merged.length; i += batchSize) {
    const batch = merged.slice(i, i + batchSize);
    await Promise.all(batch.map(upsertRecord));
    imported += batch.length;
  }

  const byNetwork = merged.reduce((acc, item) => {
    acc[item.network] = (acc[item.network] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ success: true, sources: stats, uniqueAddresses: merged.length, imported, byNetwork }, null, 2));
};

main()
  .catch((error) => { console.error('[SCAM INTELLIGENCE SYNC]', error?.stack || error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
