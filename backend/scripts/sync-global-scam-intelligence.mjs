import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DEFAULT_SOURCES = [
  {
    name: 'MyEtherWallet Ethereum Address Darklist',
    url: 'https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json',
    network: 'ethereum', format: 'json', category: 'DARKLIST_WARNING', confidence: 70, severity: 65,
    addressField: 'address', descriptionField: 'comment', dateField: 'date'
  },
  {
    name: 'Wallet Attribution Multi-Chain Risk Feed',
    url: 'https://raw.githubusercontent.com/prettydeath/wallet-attribution/main/data/_all.json',
    format: 'json', addressField: 'address', networkField: 'network', categoryField: 'category', labelField: 'label',
    descriptionField: 'entity', dateField: 'last_updated', confidenceField: 'confidence',
    allowedCategories: ['scam', 'sanctioned'], confidence: 70, severity: 80,
    severityByCategory: { scam: 85, sanctioned: 90 }
  },
  {
    name: 'ScamSniffer Open Source Phishing Address Blacklist',
    url: 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json',
    format: 'json', category: 'PHISHING', confidence: 88, severity: 90,
    description: 'ScamSniffer public phishing/malicious address blacklist.'
  },
  {
    name: 'US Treasury OFAC SDN Digital Currency Addresses',
    url: 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML',
    format: 'ofac_xml', category: 'SANCTIONED', confidence: 100, severity: 100,
    required: false,
    description: 'Official U.S. Treasury OFAC Specially Designated Nationals digital currency address.'
  },
  {
    name: 'Forta Ethereum Malicious Smart Contracts',
    url: 'https://raw.githubusercontent.com/forta-network/labelled-datasets/main/labels/1/malicious_smart_contracts.csv',
    format: 'csv', network: 'ethereum', category: 'MALICIOUS', confidence: 90, severity: 92,
    addressField: 'contract_address', labelField: 'contract_tag', descriptionField: 'contract_creator_tag',
    description: 'Forta labelled malicious/exploit/heist/phish-hack smart contract dataset.'
  },
  {
    name: 'Forta Optimism Malicious Smart Contracts',
    url: 'https://raw.githubusercontent.com/forta-network/labelled-datasets/main/labels/10/malicious_smart_contracts.csv',
    format: 'csv', network: 'optimism', category: 'MALICIOUS', confidence: 90, severity: 92,
    addressField: 'contract_address', labelField: 'contract_tag', descriptionField: 'contract_creator_tag',
    description: 'Forta labelled malicious/exploit smart contract dataset.'
  },
  {
    name: 'Forta Ethereum Phishing Scams',
    url: 'https://raw.githubusercontent.com/forta-network/labelled-datasets/main/labels/1/phishing_scams.csv',
    format: 'csv', network: 'ethereum', category: 'PHISHING', confidence: 92, severity: 94,
    addressField: 'address', labelField: 'etherscan_tag', descriptionField: 'etherscan_labels',
    description: 'Forta phishing addresses sourced from Etherscan phish-hack labels.'
  },
  {
    name: 'Forta Ethereum Etherscan Malicious Labels',
    url: 'https://raw.githubusercontent.com/forta-network/labelled-datasets/main/labels/1/etherscan_malicious_labels.csv',
    format: 'csv', network: 'ethereum', category: 'MALICIOUS', confidence: 92, severity: 94,
    addressField: 'banned_address', labelField: 'wallet_tag', descriptionField: 'data_source',
    description: 'Forta aggregated Etherscan exploit, heist and phish-hack labelled addresses.'
  }
];

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Number(v) || 0));
const normalizeConfidence = (v, fallback = 60) => {
  if (typeof v === 'number' || /^\d+(?:\.\d+)?$/.test(String(v || '').trim())) return clamp(v);
  return clamp(({ verified: 95, high: 90, medium: 70, moderate: 65, low: 50, unknown: 50 })[String(v || '').trim().toLowerCase()] ?? fallback);
};
const normalizeCategory = (v) => {
  const c = String(v || 'SCAM').trim().toLowerCase();
  return ({ phishing: 'PHISHING', drainer: 'DRAINER', scam: 'SCAM', sanctioned: 'SANCTIONED', sanction: 'SANCTIONED', malicious: 'MALICIOUS', darklist_warning: 'DARKLIST_WARNING' })[c] || c.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 120);
};
const normalizeNetwork = (v) => {
  const n = String(v || '').trim().toLowerCase();
  return ({ eth: 'ethereum', ethereum: 'ethereum', bnb: 'bsc', binance: 'bsc', 'binance-smart-chain': 'bsc', bsc: 'bsc', matic: 'polygon', polygon: 'polygon', arb: 'arbitrum', arbitrum: 'arbitrum', avax: 'avalanche', avalanche: 'avalanche', op: 'optimism', optimism: 'optimism', trx: 'tron', tron: 'tron', xbt: 'bitcoin', btc: 'bitcoin', bitcoin: 'bitcoin', bch: 'bitcoin-cash', ltc: 'litecoin', dash: 'dash', zec: 'zcash', xmr: 'monero', xrp: 'xrp', sol: 'solana', solana: 'solana', base: 'base', doge: 'dogecoin' })[n] || n || 'unknown';
};
const detectNetwork = (address) => {
  const v = String(address || '').trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return 'ethereum';
  if (/^T[1-9A-HJ-NP-Za-km-z]{30,44}$/.test(v)) return 'tron';
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,61}$/i.test(v)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return 'solana';
  return 'unknown';
};
const normalizeAddress = (address, network) => {
  const raw = String(address || '').trim();
  if (!raw) return '';
  return ['ethereum', 'bsc', 'polygon', 'arbitrum', 'avalanche', 'optimism', 'base'].includes(normalizeNetwork(network)) ? raw.toLowerCase() : raw;
};
const decodeXml = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const parseOfacXml = (text) => {
  const out = [];
  for (const block of String(text || '').match(/<id>[^]*?<\/id>/gi) || []) {
    const type = decodeXml(block.match(/<idType>([^]*?)<\/idType>/i)?.[1]);
    const number = decodeXml(block.match(/<idNumber>([^]*?)<\/idNumber>/i)?.[1]);
    const m = type.match(/Digital Currency Address\s*-\s*([^<]+)/i);
    if (m && number) out.push({ address: number, network: m[1].trim(), category: 'SANCTIONED', label: `OFAC ${m[1].trim()} sanctioned address` });
  }
  return out;
};
const parseCsv = (text) => {
  const rows = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const parseLine = (line) => {
    const values = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { cur += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { values.push(cur); cur = ''; }
      else cur += ch;
    }
    values.push(cur); return values;
  };
  const header = parseLine(rows[0]).map((v) => v.trim());
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, i) => [key, String(parseLine(row)[i] ?? '').trim()])));
};
const extractRecords = (payload, source) => Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.addresses) ? payload.addresses : Array.isArray(payload?.data) ? payload.data : source.rootField && Array.isArray(payload?.[source.rootField]) ? payload[source.rootField] : [];
const loadSourceConfig = () => {
  const custom = String(process.env.SCAM_FEED_URLS || '').trim();
  if (!custom) return DEFAULT_SOURCES;
  const parsed = JSON.parse(custom);
  return [...DEFAULT_SOURCES, ...(Array.isArray(parsed) ? parsed : []).filter((s) => s?.url && s?.name)];
};
const fetchSource = async (source) => {
  const response = await fetch(source.url, {
    headers: { 'user-agent': 'Safe-Sentinel-Pro-Scam-Intelligence/4.0', accept: source.format === 'ofac_xml' ? 'application/xml,text/xml,*/*' : source.format === 'csv' ? 'text/csv,text/plain,*/*' : 'application/json,text/plain,*/*' },
    signal: AbortSignal.timeout(Number(source.timeoutMs || 60000))
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const text = await response.text();
  if (source.format === 'ofac_xml') return parseOfacXml(text);
  if (source.format === 'csv') return parseCsv(text);
  if (source.format === 'txt') return text.split(/\r?\n/).map((address) => ({ address })).filter((x) => x.address.trim());
  return extractRecords(JSON.parse(text), source);
};
const categoryAllowed = (record, source) => !Array.isArray(source.allowedCategories) || !source.allowedCategories.length || source.allowedCategories.map((v) => String(v).toLowerCase()).includes(String(record?.[source.categoryField || 'category'] || '').trim().toLowerCase());
const toNormalizedRecord = (input, source) => {
  if (!categoryAllowed(input, source)) return null;
  const record = typeof input === 'string' ? { address: input } : input;
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
  const confidence = normalizeConfidence(record?.[source.confidenceField || 'confidence'], source.confidence ?? 60);
  const categoryKey = String(rawCategory || '').trim().toLowerCase();
  const severity = clamp(source.severityByCategory?.[categoryKey] ?? record?.[source.severityField || 'severity'] ?? source.severity ?? 60);
  const upstream = String(record?.source || '').trim();
  const sourceName = upstream ? `${source.name} / ${upstream}` : source.name;
  const label = String(record?.[source.labelField || 'label'] || record?.entity || source.label || source.name).slice(0, 250);
  const specificDescription = String(record?.[source.descriptionField || 'description'] || record?.comment || '').trim();
  const description = [specificDescription, source.description || ''].filter(Boolean).join(' | ').slice(0, 1500) || null;
  return { network, address: normalizedAddress, category, label, description, source: sourceName.slice(0, 250), confidence, severity, observedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date() };
};
const categoryPriority = (category) => ({ SANCTIONED: 100, SCAM: 90, PHISHING: 85, DRAINER: 85, MALICIOUS: 80, DARKLIST_WARNING: 60 })[String(category || '').toUpperCase()] || 50;
const mergeRecords = (records) => {
  const map = new Map();
  for (const item of records) {
    if (!item) continue;
    const key = `${item.network}:${item.address}`;
    const existing = map.get(key);
    if (!existing) { map.set(key, { ...item, sources: [item.source] }); continue; }
    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.severity = Math.max(existing.severity, item.severity);
    existing.observedAt = existing.observedAt > item.observedAt ? existing.observedAt : item.observedAt;
    existing.sources = [...new Set([...existing.sources, item.source])];
    if (!existing.description && item.description) existing.description = item.description;
    if (categoryPriority(item.category) > categoryPriority(existing.category)) existing.category = item.category;
  }
  return [...map.values()];
};
const upsertRecord = async (item) => {
  const rec = await db.scamAddress.upsert({
    where: { network_address: { network: item.network, address: item.address } },
    create: { network: item.network, address: item.address, category: item.category, label: item.label, description: item.description, source: item.sources.join(', '), confidence: item.confidence, severity: item.severity, active: true, firstSeenAt: item.observedAt, lastSeenAt: item.observedAt },
    update: { category: item.category, label: item.label, description: item.description, source: item.sources.join(', '), confidence: item.confidence, severity: item.severity, active: true, lastSeenAt: item.observedAt }
  });
  for (const source of item.sources) {
    const description = `Source feed: ${source}`;
    const existing = await db.scamEvidence.findFirst({ where: { scamAddressId: rec.id, observedAddress: item.address, network: item.network, relation: 'SOURCE_FEED', description }, select: { id: true } });
    if (!existing) await db.scamEvidence.create({ data: { scamAddressId: rec.id, network: item.network, observedAddress: item.address, relation: 'SOURCE_FEED', category: item.category, description, confidence: item.confidence } });
  }
};
const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const normalized = []; const stats = [];
  for (const source of loadSourceConfig()) {
    try {
      const raw = await fetchSource(source); let accepted = 0; let filtered = 0;
      for (const item of raw) {
        if (!categoryAllowed(item, source)) { filtered += 1; continue; }
        const record = toNormalizedRecord(item, source);
        if (record) { normalized.push(record); accepted += 1; }
      }
      stats.push({ source: source.name, fetched: raw.length, accepted, filtered, status: 'ok' });
    } catch (error) {
      stats.push({ source: source.name, fetched: 0, accepted: 0, filtered: 0, status: 'error', error: error.message });
      if (source.required) throw error;
    }
  }
  const merged = mergeRecords(normalized);
  const batchSize = Math.max(1, Math.min(100, Number(process.env.SCAM_IMPORT_BATCH_SIZE || 25)));
  let imported = 0;
  for (let i = 0; i < merged.length; i += batchSize) {
    const batch = merged.slice(i, i + batchSize);
    await Promise.all(batch.map(upsertRecord)); imported += batch.length;
  }
  const byNetwork = merged.reduce((acc, item) => (acc[item.network] = (acc[item.network] || 0) + 1, acc), {});
  const byCategory = merged.reduce((acc, item) => (acc[item.category] = (acc[item.category] || 0) + 1, acc), {});
  console.log(JSON.stringify({ success: true, sources: stats, uniqueAddresses: merged.length, imported, byNetwork, byCategory }, null, 2));
};
main().catch((error) => { console.error('[SCAM INTELLIGENCE SYNC]', error?.stack || error); process.exitCode = 1; }).finally(async () => db.$disconnect());
