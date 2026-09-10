import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const TREE_URL = 'https://api.github.com/repos/graphsense/graphsense-tagpacks/git/trees/master?recursive=1';
const RAW_BASE = 'https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/';
const THREAT_FILE_RE = /(phish|scam|hack|ransom|fraud|theft|stolen|malware|exploit|sanction|terror|drain)/i;
const EVM = new Set(['ethereum','bsc','polygon','arbitrum','avalanche','optimism','base']);

const normalizeNetwork = (v='') => {
  const n = String(v).trim().toLowerCase();
  return ({btc:'bitcoin',bitcoin:'bitcoin',eth:'ethereum',ethereum:'ethereum',ltc:'litecoin',zec:'zcash',bch:'bitcoin-cash',trx:'tron',tron:'tron',xrp:'xrp',sol:'solana',solana:'solana',doge:'dogecoin'})[n] || n || 'unknown';
};
const normalizeAddress = (address, network) => EVM.has(network) ? String(address).trim().toLowerCase() : String(address).trim();
const clean = (v='') => String(v).trim().replace(/^['"]|['"]$/g,'');
const classify = (text='') => {
  const s = String(text).toLowerCase();
  if (/sanction|terror/.test(s)) return { category:'SANCTIONED_OR_TERROR_FINANCE', confidence:82, severity:90 };
  if (/ransom/.test(s)) return { category:'RANSOMWARE', confidence:80, severity:90 };
  if (/phish|drain/.test(s)) return { category:'PHISHING', confidence:78, severity:88 };
  if (/hack|exploit|theft|stolen/.test(s)) return { category:'THEFT_OR_EXPLOIT', confidence:76, severity:86 };
  if (/fraud|scam/.test(s)) return { category:'SCAM_REPORTED', confidence:74, severity:82 };
  if (/malware/.test(s)) return { category:'MALWARE', confidence:78, severity:88 };
  return { category:'CRIMINAL_REPORTED', confidence:65, severity:75 };
};

function parseYamlThreats(text, path) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let header = {};
  let current = null;
  const flush = () => {
    if (!current?.address) return;
    const currency = current.currency || header.currency || '';
    const network = normalizeNetwork(currency);
    if (network === 'unknown') return;
    const signal = [path, current.abuse, header.abuse, current.category, header.category, current.label, header.label].filter(Boolean).join(' ');
    if (!THREAT_FILE_RE.test(signal)) return;
    const risk = classify(signal);
    out.push({ address: normalizeAddress(current.address, network), network, label: current.label || header.label || path, sourceUrl: current.source || header.source || null, ...risk });
  };
  for (const raw of lines) {
    const line = raw.replace(/\t/g,'  ');
    const m = line.match(/^\s*(-\s*)?(address|currency|abuse|category|label|source):\s*(.+?)\s*$/i);
    if (!m) continue;
    const isItem = Boolean(m[1]); const key = m[2].toLowerCase(); const value = clean(m[3]);
    if (key === 'address' || isItem) {
      if (key === 'address') { flush(); current = { address:value }; continue; }
      if (!current) current = {};
    }
    if (current) current[key] = value; else header[key] = value;
  }
  flush();
  return out;
}

async function fetchText(url) {
  const r = await fetch(url, { headers:{'user-agent':'Safe-Sentinel-Pro-GraphSense-Sync/1.0','accept':'application/vnd.github+json,text/plain,*/*'}, signal:AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

async function upsert(item, path) {
  const source = `GraphSense Public TagPacks / ${path}`.slice(0,250);
  const description = [item.sourceUrl ? `Upstream source: ${item.sourceUrl}` : null, 'GraphSense public attribution; category preserved as threat intelligence, not asserted as independently verified by Safe Sentinel.'].filter(Boolean).join(' | ').slice(0,1500);
  const rec = await db.scamAddress.upsert({
    where:{ network_address:{ network:item.network, address:item.address } },
    create:{ network:item.network, address:item.address, category:item.category, label:String(item.label).slice(0,250), description, source, confidence:item.confidence, severity:item.severity, active:true, firstSeenAt:new Date(), lastSeenAt:new Date() },
    update:{ lastSeenAt:new Date(), active:true, confidence:{ set:item.confidence }, severity:{ set:item.severity } }
  });
  const evDesc = `GraphSense threat tagpack: ${path}`;
  const exists = await db.scamEvidence.findFirst({ where:{ scamAddressId:rec.id, observedAddress:item.address, network:item.network, relation:'SOURCE_FEED', description:evDesc }, select:{id:true} });
  if (!exists) await db.scamEvidence.create({ data:{ scamAddressId:rec.id, network:item.network, observedAddress:item.address, relation:'SOURCE_FEED', category:item.category, description:evDesc, confidence:item.confidence } });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const tree = JSON.parse(await fetchText(TREE_URL));
  const files = (tree.tree || []).filter(x => x.type === 'blob' && x.path?.startsWith('packs/') && /\.ya?ml$/i.test(x.path) && THREAT_FILE_RE.test(x.path));
  const all = [];
  const stats = [];
  for (const file of files) {
    try {
      const text = await fetchText(RAW_BASE + file.path);
      const rows = parseYamlThreats(text, file.path);
      all.push(...rows.map(r => ({...r, path:file.path})));
      stats.push({path:file.path, accepted:rows.length, status:'ok'});
    } catch (e) { stats.push({path:file.path, accepted:0, status:'error', error:e.message}); }
  }
  const dedup = new Map();
  for (const r of all) {
    if (!r.address) continue;
    const k = `${r.network}:${r.address}`;
    if (!dedup.has(k) || r.severity > dedup.get(k).severity) dedup.set(k,r);
  }
  let imported = 0;
  const rows = [...dedup.values()];
  for (let i=0;i<rows.length;i+=25) {
    await Promise.all(rows.slice(i,i+25).map(r => upsert(r,r.path)));
    imported += Math.min(25, rows.length-i);
  }
  const byNetwork = rows.reduce((a,r)=>(a[r.network]=(a[r.network]||0)+1,a),{});
  const byCategory = rows.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{});
  console.log(JSON.stringify({success:true,matchedFiles:files.length,uniqueAddresses:rows.length,imported,byNetwork,byCategory,sourceStats:stats},null,2));
}

main().catch(e=>{ console.error('[GRAPHSENSE THREAT SYNC]', e?.stack || e); process.exitCode=1; }).finally(async()=>db.$disconnect());
