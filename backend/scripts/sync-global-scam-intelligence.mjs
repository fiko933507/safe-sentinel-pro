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
    description: 'ScamSniffer public phishing/malicious address blacklist (open-source feed, delayed versus commercial real-time feed).'
  },
  {
    name: 'US Treasury OFAC SDN Digital Currency Addresses',
    url: 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML',
    format: 'ofac_xml', category: 'SANCTIONED', confidence: 100, severity: 100,
    required: false,
    description: 'Official U.S. Treasury OFAC Specially Designated Nationals digital currency address.'
  }
];

const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const normalizeConfidence=(v,f=60)=>{if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v||'').trim()))return clamp(v);const m={verified:95,high:90,medium:70,moderate:65,low:50,unknown:50};return clamp(m[String(v||'').trim().toLowerCase()]??f)};
const normalizeCategory=(v)=>{const c=String(v||'SCAM').trim().toLowerCase();const a={phishing:'PHISHING',drainer:'DRAINER',scam:'SCAM',sanctioned:'SANCTIONED',sanction:'SANCTIONED',malicious:'MALICIOUS',darklist_warning:'DARKLIST_WARNING'};return a[c]||c.toUpperCase().replace(/[^A-Z0-9_]+/g,'_').slice(0,120)};
const normalizeNetwork=(v)=>{const n=String(v||'').trim().toLowerCase();const a={eth:'ethereum',ethereum:'ethereum',bnb:'bsc',binance:'bsc','binance-smart-chain':'bsc',bsc:'bsc',matic:'polygon',polygon:'polygon',arb:'arbitrum',arbitrum:'arbitrum',avax:'avalanche',avalanche:'avalanche',op:'optimism',optimism:'optimism',trx:'tron',tron:'tron',xbt:'bitcoin',btc:'bitcoin',bitcoin:'bitcoin',bch:'bitcoin-cash',ltc:'litecoin',dash:'dash',zec:'zcash',xmr:'monero',xrp:'xrp',sol:'solana',solana:'solana',base:'base'};return a[n]||n||'unknown'};
const detectNetwork=(a)=>{const v=String(a||'').trim();if(/^0x[a-fA-F0-9]{40}$/.test(v))return'ethereum';if(/^T[1-9A-HJ-NP-Za-km-z]{30,44}$/.test(v))return'tron';if(/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,61}$/i.test(v))return'bitcoin';if(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v))return'solana';return'unknown'};
const normalizeAddress=(a,n)=>{const r=String(a||'').trim();if(!r)return'';return['ethereum','bsc','polygon','arbitrum','avalanche','optimism','base'].includes(normalizeNetwork(n))?r.toLowerCase():r};
const decodeXml=(s)=>String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
const parseOfacXml=(text)=>{const out=[];const ids=String(text||'').match(/<id>[^]*?<\/id>/gi)||[];for(const block of ids){const t=decodeXml(block.match(/<idType>([^]*?)<\/idType>/i)?.[1]);const num=decodeXml(block.match(/<idNumber>([^]*?)<\/idNumber>/i)?.[1]);const m=t.match(/Digital Currency Address\s*-\s*([^<]+)/i);if(m&&num)out.push({address:num,network:m[1].trim(),category:'SANCTIONED',label:`OFAC ${m[1].trim()} sanctioned address`})}return out};
const extractRecords=(p,s)=>Array.isArray(p)?p:Array.isArray(p?.items)?p.items:Array.isArray(p?.addresses)?p.addresses:Array.isArray(p?.data)?p.data:s.rootField&&Array.isArray(p?.[s.rootField])?p[s.rootField]:[];
const loadSourceConfig=()=>{const c=String(process.env.SCAM_FEED_URLS||'').trim();if(!c)return DEFAULT_SOURCES;const p=JSON.parse(c);return[...DEFAULT_SOURCES,...(Array.isArray(p)?p:[]).filter(s=>s?.url&&s?.name)]};
const fetchSource=async(s)=>{const r=await fetch(s.url,{headers:{'user-agent':'Mozilla/5.0 Safe-Sentinel-Pro-Scam-Intelligence/2.0','accept':s.format==='ofac_xml'?'application/xml,text/xml,*/*':'application/json,text/plain,*/*'},signal:AbortSignal.timeout(Number(s.timeoutMs||60000))});if(!r.ok)throw new Error(`${s.name}: HTTP ${r.status}`);const t=await r.text();if(s.format==='ofac_xml')return parseOfacXml(t);if(s.format==='txt')return t.split(/\r?\n/).map(address=>({address})).filter(x=>x.address.trim());return extractRecords(JSON.parse(t),s)};
const categoryAllowed=(r,s)=>!Array.isArray(s.allowedCategories)||!s.allowedCategories.length||s.allowedCategories.map(v=>String(v).toLowerCase()).includes(String(r?.[s.categoryField||'category']||'').trim().toLowerCase());
const toNormalizedRecord=(input,s)=>{if(!categoryAllowed(input,s))return null;const r=typeof input==='string'?{address:input}:input;const address=r?.[s.addressField||'address']??r?.address??r?.wallet??r?.id;if(!address)return null;const network=normalizeNetwork(r?.[s.networkField||'network']||s.network||detectNetwork(address));if(network==='unknown')return null;const normalizedAddress=normalizeAddress(address,network);if(!normalizedAddress)return null;const rawCategory=r?.[s.categoryField||'category']||s.category||'SCAM';const category=normalizeCategory(rawCategory);const rawDate=r?.[s.dateField||'date']||r?.lastSeenAt||r?.firstSeenAt;const parsedDate=rawDate?new Date(rawDate):null;const confidence=normalizeConfidence(r?.[s.confidenceField||'confidence'],s.confidence??60);const key=String(rawCategory||'').trim().toLowerCase();const severity=clamp(s.severityByCategory?.[key]??r?.[s.severityField||'severity']??s.severity??60);const upstream=String(r?.source||'').trim();const sourceName=upstream?`${s.name} / ${upstream}`:s.name;const sourceUrl=String(r?.source_url||r?.sourceUrl||'').trim();const base=String(r?.[s.descriptionField||'description']||r?.comment||s.description||'').trim();return{network,address:normalizedAddress,category,label:String(r?.[s.labelField||'label']||r?.entity||s.label||s.name).slice(0,250),description:[base,sourceUrl?`Source URL: ${sourceUrl}`:''].filter(Boolean).join(' | ').slice(0,1500)||null,source:String(sourceName).slice(0,250),confidence,severity,observedAt:parsedDate&&!Number.isNaN(parsedDate.getTime())?parsedDate:new Date()}};
const categoryPriority=(c)=>({SANCTIONED:100,SCAM:90,PHISHING:85,DRAINER:85,MALICIOUS:80,DARKLIST_WARNING:60}[String(c||'').toUpperCase()]||50);
const mergeRecords=(rs)=>{const m=new Map();for(const i of rs){if(!i)continue;const k=`${i.network}:${i.address}`;const e=m.get(k);if(!e){m.set(k,{...i,sources:[i.source]});continue}e.confidence=Math.max(e.confidence,i.confidence);e.severity=Math.max(e.severity,i.severity);e.observedAt=e.observedAt>i.observedAt?e.observedAt:i.observedAt;e.sources=[...new Set([...e.sources,i.source])];if(!e.description&&i.description)e.description=i.description;if(categoryPriority(i.category)>categoryPriority(e.category))e.category=i.category}return[...m.values()]};
const upsertRecord=async(i)=>{const rec=await db.scamAddress.upsert({where:{network_address:{network:i.network,address:i.address}},create:{network:i.network,address:i.address,category:i.category,label:i.label,description:i.description,source:i.sources.join(', '),confidence:i.confidence,severity:i.severity,active:true,firstSeenAt:i.observedAt,lastSeenAt:i.observedAt},update:{category:i.category,label:i.label,description:i.description,source:i.sources.join(', '),confidence:i.confidence,severity:i.severity,active:true,lastSeenAt:i.observedAt}});for(const source of i.sources){const description=`Source feed: ${source}`;const e=await db.scamEvidence.findFirst({where:{scamAddressId:rec.id,observedAddress:i.address,network:i.network,relation:'SOURCE_FEED',description},select:{id:true}});if(!e)await db.scamEvidence.create({data:{scamAddressId:rec.id,network:i.network,observedAddress:i.address,relation:'SOURCE_FEED',category:i.category,description,confidence:i.confidence}})}};
const main=async()=>{if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');const sources=loadSourceConfig(),normalized=[],stats=[];for(const s of sources){try{const raw=await fetchSource(s);let accepted=0,filtered=0;for(const x of raw){if(!categoryAllowed(x,s)){filtered++;continue}const n=toNormalizedRecord(x,s);if(n){normalized.push(n);accepted++}}stats.push({source:s.name,fetched:raw.length,accepted,filtered,status:'ok'})}catch(e){stats.push({source:s.name,fetched:0,accepted:0,filtered:0,status:'error',error:e.message});if(s.required)throw e}}const merged=mergeRecords(normalized);const bs=Math.max(1,Math.min(100,Number(process.env.SCAM_IMPORT_BATCH_SIZE||25)));let imported=0;for(let i=0;i<merged.length;i+=bs){const b=merged.slice(i,i+bs);await Promise.all(b.map(upsertRecord));imported+=b.length}const byNetwork=merged.reduce((a,i)=>(a[i.network]=(a[i.network]||0)+1,a),{});const byCategory=merged.reduce((a,i)=>(a[i.category]=(a[i.category]||0)+1,a),{});console.log(JSON.stringify({success:true,sources:stats,uniqueAddresses:merged.length,imported,byNetwork,byCategory},null,2))};
main().catch(e=>{console.error('[SCAM INTELLIGENCE SYNC]',e?.stack||e);process.exitCode=1}).finally(async()=>db.$disconnect());
