import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const BASE = 'https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs';

const PACKS = [
  { file: 'ransomware.yaml', category: 'RANSOMWARE', confidence: 92, severity: 96 },
  { file: 'ransomwhere.yaml', category: 'RANSOMWARE', confidence: 92, severity: 96 },
  { file: 'sextortion_excello.yaml', category: 'EXTORTION', confidence: 88, severity: 92 },
  { file: 'sextortion_talos.yaml', category: 'EXTORTION', confidence: 90, severity: 93 },
  { file: 'hacks.yaml', category: 'HACK_THEFT', confidence: 92, severity: 96 },
  { file: 'electrum_phishing.yaml', category: 'PHISHING', confidence: 95, severity: 96 },
  { file: 'etherscamdb_tagpack.yaml', category: 'SCAM', confidence: 88, severity: 90 },
  { file: 'defi-fraud-masterthesis.yaml', category: 'FRAUD', confidence: 82, severity: 86 },
  { file: 'ponzi_scheme.yaml', category: 'PONZI', confidence: 88, severity: 90 },
  { file: 'twitter_hack_scam.yaml', category: 'SCAM', confidence: 95, severity: 96 },
  { file: 'africrypt-hack.yaml', category: 'HACK_THEFT', confidence: 95, severity: 97 },
  { file: 'binance_hack.yaml', category: 'HACK_THEFT', confidence: 95, severity: 97 },
  { file: 'plustoken.yaml', category: 'SCAM', confidence: 95, severity: 96 }
];

const networkAliases = {
  BTC: 'bitcoin', BCH: 'bitcoin-cash', LTC: 'litecoin', ETH: 'ethereum',
  ETC: 'ethereum-classic', TRX: 'tron', TRON: 'tron', XRP: 'xrp',
  XMR: 'monero', DASH: 'dash', ZEC: 'zcash', SOL: 'solana', DOGE: 'dogecoin',
  BSC: 'bsc', MATIC: 'polygon', POLYGON: 'polygon', AVAX: 'avalanche',
  ARB: 'arbitrum', OP: 'optimism', BASE: 'base'
};

const normalizeNetwork = (currency, address) => {
  const c = String(currency || '').trim().toUpperCase();
  if (networkAliases[c]) return networkAliases[c];
  const a = String(address || '').trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return 'ethereum';
  if (/^T[1-9A-HJ-NP-Za-km-z]{30,44}$/.test(a)) return 'tron';
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,61}$/i.test(a)) return 'bitcoin';
  if (/^[LM3][a-km-zA-HJ-NP-Z1-9]{25,40}$/.test(a)) return 'litecoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'solana';
  return null;
};

const normalizeAddress = (address, network) => {
  const a = String(address || '').trim();
  return ['ethereum','bsc','polygon','arbitrum','optimism','avalanche','base','ethereum-classic'].includes(network)
    ? a.toLowerCase()
    : a;
};

const parseScalar = (line, key) => {
  const m = line.match(new RegExp(`^${key}:\\s*(.*)$`, 'i'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
};

const parseTagpack = (text, pack) => {
  const lines = String(text || '').split(/\r?\n/);
  let title = pack.file;
  let packLabel = pack.file.replace(/\.yaml$/i, '');
  let abuse = '';
  let description = '';
  const records = [];

  for (const line of lines) {
    if (!line.startsWith(' ') && !line.startsWith('-')) {
      title = parseScalar(line, 'title') || title;
      packLabel = parseScalar(line, 'label') || packLabel;
      abuse = parseScalar(line, 'abuse') || abuse;
      description = parseScalar(line, 'description') || description;
    }
  }

  let current = null;
  const flush = () => {
    if (!current?.address) return;
    const network = normalizeNetwork(current.currency, current.address);
    if (!network) { current = null; return; }
    const address = normalizeAddress(current.address, network);
    if (!address) { current = null; return; }
    records.push({
      network,
      address,
      category: pack.category,
      label: String(packLabel || title).slice(0, 250),
      description: [description, abuse ? `GraphSense abuse: ${abuse}` : '', `TagPack: ${pack.file}`, current.source ? `Source: ${current.source}` : ''].filter(Boolean).join(' | ').slice(0, 1500),
      source: `GraphSense Public TagPacks / ${pack.file}`.slice(0, 250),
      confidence: pack.confidence,
      severity: pack.severity
    });
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const addressMatch = line.match(/^-\s*address:\s*(.+)$/i);
    if (addressMatch) {
      flush();
      current = { address: addressMatch[1].trim().replace(/^['"]|['"]$/g, '') };
      continue;
    }
    if (!current) continue;
    const currency = line.match(/^currency:\s*(.+)$/i);
    const source = line.match(/^source:\s*(.+)$/i);
    if (currency) current.currency = currency[1].trim().replace(/^['"]|['"]$/g, '');
    if (source) current.source = source[1].trim().replace(/^['"]|['"]$/g, '');
  }
  flush();
  return records;
};

const fetchPack = async (pack) => {
  const url = `${BASE}/${pack.file}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'Safe-Sentinel-Pro-GraphSense-Importer/1.0', accept: 'text/yaml,text/plain,*/*' },
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`${pack.file}: HTTP ${response.status}`);
  return parseTagpack(await response.text(), pack);
};

const dedupe = (rows) => {
  const map = new Map();
  const priority = { SANCTIONED: 100, HACK_THEFT: 96, RANSOMWARE: 95, PHISHING: 92, EXTORTION: 90, FRAUD: 88, PONZI: 87, SCAM: 85 };
  for (const row of rows) {
    const key = `${row.network}:${row.address}`;
    const old = map.get(key);
    if (!old) { map.set(key, row); continue; }
    if ((priority[row.category] || 0) > (priority[old.category] || 0)) old.category = row.category;
    old.confidence = Math.max(old.confidence, row.confidence);
    old.severity = Math.max(old.severity, row.severity);
    if (!old.source.includes(row.source)) old.source = `${old.source}, ${row.source}`.slice(0, 250);
  }
  return [...map.values()];
};

const chunks = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const raw = [];
  const stats = [];

  for (const pack of PACKS) {
    try {
      const rows = await fetchPack(pack);
      raw.push(...rows);
      stats.push({ pack: pack.file, accepted: rows.length, status: 'ok' });
    } catch (error) {
      stats.push({ pack: pack.file, accepted: 0, status: 'error', error: error.message });
    }
  }

  const merged = dedupe(raw);
  let inserted = 0;
  let updated = 0;

  for (const batch of chunks(merged, 100)) {
    const result = await db.scamAddress.createMany({
      data: batch.map((x) => ({
        network: x.network,
        address: x.address,
        category: x.category,
        label: x.label,
        description: x.description,
        source: x.source,
        confidence: x.confidence,
        severity: x.severity,
        active: true,
        firstSeenAt: new Date(),
        lastSeenAt: new Date()
      })),
      skipDuplicates: true
    });
    inserted += result.count;
  }

  // Strengthen existing records without downgrading confidence/severity.
  for (const batch of chunks(merged, 50)) {
    await Promise.all(batch.map(async (x) => {
      const existing = await db.scamAddress.findUnique({ where: { network_address: { network: x.network, address: x.address } }, select: { id: true, confidence: true, severity: true, category: true, source: true } });
      if (!existing) return;
      const nextSource = existing.source?.includes('GraphSense') ? existing.source : [existing.source, x.source].filter(Boolean).join(', ').slice(0, 250);
      const nextConfidence = Math.max(existing.confidence || 0, x.confidence);
      const nextSeverity = Math.max(existing.severity || 0, x.severity);
      const shouldUpdate = nextConfidence !== existing.confidence || nextSeverity !== existing.severity || nextSource !== existing.source;
      if (shouldUpdate) {
        await db.scamAddress.update({ where: { id: existing.id }, data: { confidence: nextConfidence, severity: nextSeverity, source: nextSource, active: true, lastSeenAt: new Date() } });
        updated += 1;
      }
    }));
  }

  const total = await db.scamAddress.count();
  const active = await db.scamAddress.count({ where: { active: true } });
  const byCategoryRows = await db.scamAddress.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { _count: { category: 'desc' } } });
  const byNetworkRows = await db.scamAddress.groupBy({ by: ['network'], _count: { _all: true }, orderBy: { _count: { network: 'desc' } } });

  console.log(JSON.stringify({
    success: true,
    source: 'GraphSense Public TagPacks',
    packs: stats,
    parsed: raw.length,
    uniqueGraphSenseAddresses: merged.length,
    inserted,
    strengthenedExisting: updated,
    databaseTotal: total,
    databaseActive: active,
    byCategory: Object.fromEntries(byCategoryRows.map((x) => [x.category, x._count._all])),
    byNetwork: Object.fromEntries(byNetworkRows.map((x) => [x.network, x._count._all]))
  }, null, 2));
};

main()
  .catch((error) => { console.error('[GRAPHSENSE RISK SYNC]', error?.stack || error); process.exitCode = 1; })
  .finally(async () => db.$disconnect());
