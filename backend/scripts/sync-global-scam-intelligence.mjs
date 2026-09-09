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
  },
  {
    name: 'Wallet Attribution Multi-Chain Risk Feed',
    url: 'https://raw.githubusercontent.com/prettydeath/wallet-attribution/main/data/_all.json',
    format: 'json',
    addressField: 'address',
    networkField: 'network',
    categoryField: 'category',
    labelField: 'label',
    descriptionField: 'entity',
    dateField: 'last_updated',
    confidenceField: 'confidence',
    allowedCategories: ['scam', 'sanctioned'],
    confidence: 70,
    severity: 80,
    severityByCategory: {
      scam: 85,
      sanctioned: 90
    }
  }
];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

const normalizeConfidence = (value, fallback = 60) => {
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value || '').trim())) {
    return clamp(value);
  }
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    verified: 95,
    high: 90,
    medium: 70,
    moderate: 65,
    low: 50,
    unknown: 50
  };
  return clamp(map[normalized] ?? fallback);
};

const normalizeCategory = (value) => {
  const category = String(value || 'SCAM').trim().toLowerCase();
  const aliases = {
    phishing: 'PHISHING',
    drainer: 'DRAINER',
    scam: 'SCAM',
    sanctioned: 'SANCTIONED',
    sanction: 'SANCTIONED',
    malicious: 'MALICIOUS',
    darklist_warning: 'DARKLIST_WARNING'
  };
  return aliases[category] || category.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 120);
};

const normalizeNetwork = (value) => {
  const network = String(value || '').trim().toLowerCase();
  const aliases = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    bnb: 'bsc',
    binance: 'bsc',
    'binance-smart-chain': 'bsc',
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

const categoryAllowed = (record, source) => {
  if (!Array.isArray(source.allowedCategories) || !source.allowedCategories.length) return true;
  const field = source.categoryField || 'category';
  const category = String(record?.[field] || '').trim().toLowerCase();
  return source.allowedCategories.map((v) => String(v).toLowerCase()).includes(category);
};

const toNormalizedRecord = (record, source) => {
  if (!categoryAllowed(record, source)) return null;

  const address = record?.[source.addressField || 'address'] ?? record?.address ?? record?.wallet ?? record?.id;
  if (!address) return null;

  const network = normalizeNetwork(record?.[source.networkField || 'network'] || source.network || detectNetwork(address));
  if (network === 'unknown') return null;

  const normalizedAddress = normalizeAddress(address, network);
  if (!normalizedAddress) return null;

  const rawCategory = record?.[source.categoryField || 'category'] || source.category || 'SCAM';
  const category = normalizeCategory(rawCategory);
  const rawDate = record?.[source.dateField || 'date'] || record?.lastSeenAt || record?.firstSeenAt;
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const rawConfidence = record?.[source.confidenceField || 'confidence'];
  const confidence = normalizeConfidence(rawConfidence, source.confidence ?? 60);
  const rawCategoryKey = String(rawCategory || '').trim().toLowerCase();
  const severity = clamp(source.severityByCategory?.[rawCategoryKey] ?? record?.[source.severityField || 'severity'] ?? source.severity ?? 60);
  const upstreamSource = String(record?.source || '').trim();
  const sourceName = upstreamSource ? `${source.name} / ${upstreamSource}` : source.name;
  const sourceUrl = String(record?.source_url || record?.sourceUrl || '').trim();
  const baseDescription = String(record?.[source.descriptionField || 'description'] || record?.comment || source.description || '').trim();
  const description = [baseDescription, sourceUrl ? `Source URL: ${sourceUrl}` : ''].filter(Boolean).join(' | ').slice(0, 1500) || null;

  return {
    network,
    address: normalizedAddress,
    category,
    label: String(record?.[source.labelField || 'label'] || record?.entity || source.label || source.name).slice(0, 250),
    description,
    source: String(sourceName).slice(0, 250),
    confidence,
    severity,
    observedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date()
  };
};

const categoryPriority = (category) => {
  const priority = {
    SANCTIONED: 100,
    SCAM: 90,
    PHISHING: 85,
    DRAINER: 85,
    MALICIOUS: 80,
    DARKLIST_WARNING: 60
  };
  return priority[String(category || '').toUpperCase()] || 50;
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
    if (categoryPriority(item.category) > categoryPriority(existing.category)) existing.category = item.category;
    if ((!existing.label || existing.label.includes('Risk Feed')) && item.label) existing.label = item.label;
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
      let filtered = 0;
      for (const raw of rawRecords) {
        if (!categoryAllowed(raw, source)) {
          filtered += 1;
          continue;
        }
        const record = toNormalizedRecord(raw, source);
        if (record) { normalized.push(record); accepted += 1; }
      }
      stats.push({ source: source.name, fetched: rawRecords.length, accepted, filtered, status: 'ok' });
    } catch (error) {
      stats.push({ source: source.name, fetched: 0, accepted: 0, filtered: 0, status: 'error', error: error.message });
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

  const byCategory = merged.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ success: true, sources: stats, uniqueAddresses: merged.length, imported, byNetwork, byCategory }, null, 2));
};

main()
  .catch((error) => { console.error('[SCAM INTELLIGENCE SYNC]', error?.stack || error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
