/*
 * Safe Sentinel Pro - Security Intelligence V2
 *
 * Non-custodial, read-only security analysis layer.
 * No private keys, seed phrases or transaction signing are handled here.
 *
 * Registered routes:
 *   POST /api/wallet-behavioral-fingerprint
 *   POST /api/scam-dna
 *   POST /api/wallet-security-graph
 *   POST /api/early-warning
 *   POST /api/analyze-contract-v2
 */

import { ethers } from 'ethers';
import { z } from 'zod';

const EVM_NETWORKS = [
  'ethereum',
  'bsc',
  'polygon',
  'arbitrum',
  'base',
  'optimism',
  'avalanche'
];

const RPC_ENV = {
  ethereum: 'ETHEREUM_RPC',
  bsc: 'BSC_RPC',
  polygon: 'POLYGON_RPC',
  arbitrum: 'ARBITRUM_RPC',
  base: 'BASE_RPC',
  optimism: 'OPTIMISM_RPC',
  avalanche: 'AVALANCHE_RPC'
};

const RPC_DEFAULTS = {
  ethereum: 'https://eth.drpc.org',
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
  optimism: 'https://mainnet.optimism.io',
  avalanche: 'https://api.avax.network/ext/bc/C/rpc'
};

const DEX_CONFIG = {
  ethereum: {
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    factories: [
      { name: 'Uniswap V2', address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' }
    ]
  },
  bsc: {
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    factories: [
      { name: 'PancakeSwap V2', address: '0xCA143Ce32Fe78f1f7019d7d551a6402fC5350c73' }
    ]
  },
  polygon: {
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    factories: [
      { name: 'QuickSwap V2', address: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32' }
    ]
  },
  arbitrum: {
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    factories: [
      { name: 'Uniswap V2', address: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9' }
    ]
  },
  base: {
    wrappedNative: '0x4200000000000000000000000000000000000006',
    factories: []
  },
  optimism: {
    wrappedNative: '0x4200000000000000000000000000000000000006',
    factories: []
  },
  avalanche: {
    wrappedNative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    factories: [
      { name: 'Trader Joe V1', address: '0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10' }
    ]
  }
};

const CONTRACT_SELECTORS = {
  owner: '8da5cb5b',
  paused: '5c975abb',
  mint: '40c10f19',
  burn: '42966c68',
  transfer: 'a9059cbb',
  transferFrom: '23b872dd',
  approve: '095ea7b3',
  blacklist: 'f9f92be4',
  whitelist: 'e49f7d6b',
  renounceOwnership: '715018a6',
  upgradeTo: '3659cfe6',
  upgradeToAndCall: '4f1ef286',
  implementation: '5c60da1b',
  admin: 'f851a440',
  tradingOpen: 'f8c7e3b7',
  maxTxAmount: '0x',
  maxWallet: '0x'
};

const normalizeNetwork = value => String(value || '').trim().toLowerCase();
const normalizeAddress = value => String(value || '').trim();
const isEvmAddress = value => ethers.isAddress(value);

const getRpc = network => {
  const envName = RPC_ENV[network];
  return envName && process.env[envName]
    ? process.env[envName]
    : RPC_DEFAULTS[network];
};

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const unique = values => [...new Set(values.filter(Boolean))];

const classifyLevel = score => {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
};

const calculateEntropy = values => {
  const list = values.filter(Boolean);
  if (!list.length) return 0;
  const counts = new Map();
  for (const value of list) counts.set(value, (counts.get(value) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / list.length;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(4));
};

const extractTxAddress = (tx, side) => {
  const value = tx?.[side];
  return typeof value === 'string' ? value.trim() : '';
};

const buildBehavioralMetrics = ({ address, network, transactions, balance, scamIntelligence, counterpartyScamIntelligence }) => {
  const wallet = normalizeAddress(address);
  const walletKey = network === 'tron' ? wallet : wallet.toLowerCase();
  const txs = Array.isArray(transactions) ? transactions : [];

  const incoming = [];
  const outgoing = [];
  const counterparties = [];
  const tokenAddresses = [];
  const amounts = [];

  for (const tx of txs) {
    const from = extractTxAddress(tx, 'from');
    const to = extractTxAddress(tx, 'to');
    const fromKey = network === 'tron' ? from : from.toLowerCase();
    const toKey = network === 'tron' ? to : to.toLowerCase();

    if (toKey === walletKey && fromKey !== walletKey) incoming.push(tx);
    if (fromKey === walletKey && toKey !== walletKey) outgoing.push(tx);
    if (fromKey && fromKey !== walletKey) counterparties.push(from);
    if (toKey && toKey !== walletKey) counterparties.push(to);

    const tokenAddress = String(tx?.tokenAddress || '').trim();
    if (tokenAddress) tokenAddresses.push(tokenAddress.toLowerCase());

    const amount = safeNumber(tx?.amount, NaN);
    if (Number.isFinite(amount) && amount >= 0) amounts.push(amount);
  }

  const failed = txs.filter(tx => tx?.confirmed === false || tx?.success === false).length;
  const uniqueCounterparties = unique(counterparties.map(v => network === 'tron' ? v : v.toLowerCase()));
  const uniqueTokens = unique(tokenAddresses);

  const outgoingRatios = outgoing.length && txs.length ? outgoing.length / txs.length : 0;
  const incomingRatios = incoming.length && txs.length ? incoming.length / txs.length : 0;
  const failureRatio = txs.length ? failed / txs.length : 0;

  const directionSequence = txs.map(tx => {
    const from = extractTxAddress(tx, 'from');
    const to = extractTxAddress(tx, 'to');
    const fk = network === 'tron' ? from : from.toLowerCase();
    const tk = network === 'tron' ? to : to.toLowerCase();
    if (fk === walletKey) return 'OUT';
    if (tk === walletKey) return 'IN';
    return 'OTHER';
  });

  let score = 0;
  const signals = [];
  const reasons = [];
  const add = (points, type, reason) => {
    score += points;
    signals.push(type);
    reasons.push(reason);
  };

  if (Boolean(scamIntelligence?.matched)) add(80, 'DIRECT_SCAM_MATCH', 'Cüzdan adresi Scam Intelligence veritabanında eşleşti.');
  if (Boolean(counterpartyScamIntelligence?.matched)) add(35, 'SCAM_COUNTERPARTY_MATCH', `${counterpartyScamIntelligence.matchedCount || 0} işlem scam karşı tarafıyla eşleşti.`);
  if (failureRatio >= 0.5) add(20, 'HIGH_FAILURE_RATIO', 'İşlemlerin en az yarısı başarısız.');
  else if (failureRatio >= 0.25) add(10, 'ELEVATED_FAILURE_RATIO', 'Başarısız işlem oranı yükselmiş.');
  if (uniqueCounterparties >= 20) add(12, 'COUNTERPARTY_EXPANSION', 'Çok sayıda benzersiz karşı tarafla etkileşim var.');
  else if (uniqueCounterparties >= 10) add(6, 'COUNTERPARTY_DIVERSITY', 'Belirgin karşı taraf çeşitliliği var.');
  if (outgoing.length >= 8 && incoming.length >= 2 && unique(outgoing.map(tx => extractTxAddress(tx, 'to'))).length >= 5) add(12, 'DISTRIBUTION_CLUSTER', 'Fon girişlerinden sonra çoklu çıkış dağıtımı görülüyor.');
  if (incoming.length >= 8 && outgoing.length <= 1) add(8, 'COLLECTION_PATTERN', 'Yoğun fon toplama ve düşük çıkış aktivitesi görülüyor.');
  if (uniqueTokens.length >= 15) add(8, 'TOKEN_DIVERSITY_SPIKE', 'Çok sayıda token kontratıyla etkileşim var.');
  if (outgoingRatios >= 0.8 && txs.length >= 10) add(7, 'OUTBOUND_HEAVY', 'İşlem akışının büyük bölümü çıkış yönünde.');
  if (incomingRatios >= 0.8 && txs.length >= 10) add(5, 'INBOUND_HEAVY', 'İşlem akışının büyük bölümü giriş yönünde.');
  if (txs.length >= 20) add(4, 'HIGH_ACTIVITY', 'Tarama penceresinde yüksek işlem aktivitesi var.');

  const chronological = txs
    .map(tx => safeNumber(tx?.timestamp || tx?.time || tx?.blockTimestamp, NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  let burstScore = 0;
  let burstWindowSeconds = null;
  if (chronological.length >= 3) {
    let best = 0;
    for (let i = 0; i < chronological.length; i++) {
      let j = i;
      while (j < chronological.length && chronological[j] - chronological[i] <= 600) j++;
      best = Math.max(best, j - i);
    }
    burstScore = best;
    if (best >= 10) {
      add(8, 'TEN_MINUTE_BURST', `${best} işlem 10 dakikalık yoğunluk penceresinde görüldü.`);
      burstWindowSeconds = 600;
    }
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    score,
    level: classifyLevel(score),
    signals,
    reasons: reasons.length ? reasons : ['Mevcut tarama penceresinde belirgin davranışsal risk sinyali bulunmadı.'],
    metrics: {
      totalTransactions: txs.length,
      successfulTransactions: txs.length - failed,
      failedTransactions: failed,
      failureRatio: Number(failureRatio.toFixed(4)),
      incomingTransactions: incoming.length,
      outgoingTransactions: outgoing.length,
      uniqueCounterparties: uniqueCounterparties.length,
      uniqueTokens: uniqueTokens.length,
      inboundRatio: Number(incomingRatios.toFixed(4)),
      outboundRatio: Number(outgoingRatios.toFixed(4)),
      directionEntropy: calculateEntropy(directionSequence),
      counterpartyEntropy: calculateEntropy(uniqueCounterparties),
      burstTransactions10m: burstScore,
      burstWindowSeconds,
      nativeBalance: balance ?? null
    }
  };
};

const registerWalletIntelligenceRoutes = ({ app, auth, adapters, lookupScamIntelligence, lookupTransactionScamIntelligence }) => {
  const walletSchema = z.object({
    network: z.string().min(2).max(30),
    address: z.string().min(10).max(128)
  });

  const getWalletData = async ({ network, address }) => {
    const adapter = adapters.get(network);
    if (!adapter || typeof adapter.checkWallet !== 'function') {
      const error = new Error(`Network adapter unavailable: ${network}`);
      error.status = 400;
      throw error;
    }
    const result = await adapter.checkWallet({ network, address });
    if (!result || result.found === false) {
      const error = new Error('Wallet data not found');
      error.status = 404;
      throw error;
    }
    return result;
  };

  app.post('/api/wallet-behavioral-fingerprint', auth, async (req, res) => {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid wallet request' });

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);

    try {
      const result = await getWalletData({ network, address });
      const scamIntelligence = await lookupScamIntelligence({ network, address });
      const counterpartyScamIntelligence = await lookupTransactionScamIntelligence({
        network,
        walletAddress: address,
        transactions: result.transactions || []
      });
      const behavioral = buildBehavioralMetrics({
        address,
        network,
        transactions: result.transactions || [],
        balance: result.balance,
        scamIntelligence,
        counterpartyScamIntelligence
      });

      return res.json({
        success: true,
        engine: 'WALLET_BEHAVIORAL_FINGERPRINT_V2',
        sourceType: 'LIVE_BLOCKCHAIN_ADAPTER',
        timestamp: new Date().toISOString(),
        network,
        address,
        fingerprint: {
          ...behavioral,
          scamMatched: Boolean(scamIntelligence?.matched),
          counterpartyScamMatched: Boolean(counterpartyScamIntelligence?.matched),
          account: result.account || null,
          latestBlock: result.latestBlock || null
        }
      });
    } catch (error) {
      return res.status(error?.status || 502).json({ success: false, error: error?.message || 'Behavioral fingerprint unavailable' });
    }
  });

  app.post('/api/scam-dna', auth, async (req, res) => {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid wallet request' });

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);

    try {
      const result = await getWalletData({ network, address });
      const direct = await lookupScamIntelligence({ network, address });
      const counterparties = await lookupTransactionScamIntelligence({ network, walletAddress: address, transactions: result.transactions || [] });

      const txs = Array.isArray(result.transactions) ? result.transactions : [];
      const patterns = [];
      const scamCounterparties = unique((counterparties.counterparties || []).map(item => item.address || item));
      const matchedTxs = Array.isArray(counterparties.transactionMatches) ? counterparties.transactionMatches : [];

      const outgoing = txs.filter(tx => String(tx?.direction || '').toLowerCase() === 'outgoing');
      const incoming = txs.filter(tx => String(tx?.direction || '').toLowerCase() === 'incoming');
      const destinations = unique(outgoing.map(tx => String(tx?.to || '').trim().toLowerCase()).filter(Boolean));
      const sources = unique(incoming.map(tx => String(tx?.from || '').trim().toLowerCase()).filter(Boolean));
      const failed = txs.filter(tx => tx?.confirmed === false || tx?.success === false).length;

      if (direct.matched) patterns.push({ type: 'DIRECT_SCAM_IDENTITY', severity: 'CRITICAL', evidence: direct.matches });
      if (matchedTxs.length) patterns.push({ type: 'SCAM_COUNTERPARTY_INTERACTION', severity: matchedTxs.length >= 3 ? 'CRITICAL' : 'HIGH', count: matchedTxs.length, evidence: matchedTxs });
      if (destinations.length >= 5 && incoming.length >= 2) patterns.push({ type: 'MULTI_DESTINATION_DISTRIBUTION', severity: 'HIGH', count: destinations.length });
      if (sources.length >= 5 && outgoing.length <= 1) patterns.push({ type: 'MULTI_SOURCE_COLLECTION', severity: 'MEDIUM', count: sources.length });
      if (failed >= 3) patterns.push({ type: 'FAILURE_CLUSTER', severity: failed >= 6 ? 'HIGH' : 'MEDIUM', count: failed });

      let score = 0;
      if (direct.matched) score += 80;
      if (matchedTxs.length) score += Math.min(20, matchedTxs.length * 7);
      if (destinations.length >= 5) score += 10;
      if (sources.length >= 5) score += 6;
      if (failed >= 3) score += 5;
      score = Math.min(100, score);

      return res.json({
        success: true,
        engine: 'SCAM_DNA_ENGINE_V1',
        sourceType: 'LIVE_BLOCKCHAIN_PLUS_SCAM_DATABASE',
        timestamp: new Date().toISOString(),
        network,
        address,
        dna: {
          score,
          level: classifyLevel(score),
          matched: direct.matched || matchedTxs.length > 0,
          directMatch: direct,
          matchedCounterpartyCount: scamCounterparties.length,
          matchedTransactionCount: matchedTxs.length,
          patterns,
          clusterSignals: {
            sourceCount: sources.length,
            destinationCount: destinations.length,
            failedTransactionCount: failed,
            transactionCount: txs.length
          }
        }
      });
    } catch (error) {
      return res.status(error?.status || 502).json({ success: false, error: error?.message || 'Scam DNA unavailable' });
    }
  });

  app.post('/api/wallet-security-graph', auth, async (req, res) => {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid wallet request' });

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);

    try {
      const result = await getWalletData({ network, address });
      const scam = await lookupTransactionScamIntelligence({ network, walletAddress: address, transactions: result.transactions || [] });
      const nodes = new Map();
      const edges = [];
      const walletId = `${network}:${address}`;

      nodes.set(walletId, { id: walletId, type: 'WALLET', address, network, risk: 'UNKNOWN' });

      for (const tx of (Array.isArray(result.transactions) ? result.transactions : []).slice(0, 300)) {
        const from = String(tx?.from || '').trim();
        const to = String(tx?.to || '').trim();
        if (!from || !to) continue;
        const fromId = `${network}:${from}`;
        const toId = `${network}:${to}`;
        if (!nodes.has(fromId)) nodes.set(fromId, { id: fromId, type: 'ADDRESS', address: from, network });
        if (!nodes.has(toId)) nodes.set(toId, { id: toId, type: 'ADDRESS', address: to, network });
        edges.push({
          id: String(tx?.txid || tx?.hash || `${from}-${to}-${edges.length}`),
          from: fromId,
          to: toId,
          direction: tx?.direction || null,
          amount: tx?.amount ?? null,
          token: tx?.token || tx?.tokenName || null,
          tokenAddress: tx?.tokenAddress || null,
          blockNumber: tx?.blockNumber ?? null
        });
      }

      for (const match of (scam.counterparties || [])) {
        const a = String(match.address || '').trim();
        if (!a) continue;
        const id = `${network}:${a}`;
        const node = nodes.get(id) || { id, type: 'ADDRESS', address: a, network };
        node.type = 'SCAM_ADDRESS';
        node.risk = 'HIGH';
        node.scam = {
          category: match.category || null,
          label: match.label || null,
          severity: match.severity ?? null,
          confidence: match.confidence ?? null,
          source: match.source || null
        };
        nodes.set(id, node);
      }

      return res.json({
        success: true,
        engine: 'WALLET_SECURITY_GRAPH_V1',
        sourceType: 'LIVE_BLOCKCHAIN_PLUS_SCAM_DATABASE',
        timestamp: new Date().toISOString(),
        network,
        address,
        graph: {
          root: walletId,
          nodeCount: nodes.size,
          edgeCount: edges.length,
          nodes: [...nodes.values()],
          edges,
          scamNodes: [...nodes.values()].filter(n => n.type === 'SCAM_ADDRESS').map(n => n.id)
        }
      });
    } catch (error) {
      return res.status(error?.status || 502).json({ success: false, error: error?.message || 'Security graph unavailable' });
    }
  });

  app.post('/api/early-warning', auth, async (req, res) => {
    const parsed = walletSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid wallet request' });

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);

    try {
      const result = await getWalletData({ network, address });
      const scam = await lookupTransactionScamIntelligence({ network, walletAddress: address, transactions: result.transactions || [] });
      const txs = Array.isArray(result.transactions) ? result.transactions : [];
      const warnings = [];

      for (const match of (scam.transactionMatches || []).slice(0, 20)) {
        warnings.push({
          type: 'SCAM_COUNTERPARTY',
          severity: 'CRITICAL',
          txid: match.txid,
          counterparty: match.counterparty,
          evidence: match.scamIntelligence
        });
      }

      const failed = txs.filter(tx => tx?.confirmed === false || tx?.success === false).length;
      const outgoing = txs.filter(tx => String(tx?.direction || '').toLowerCase() === 'outgoing');
      const destinations = unique(outgoing.map(tx => String(tx?.to || '').trim().toLowerCase()).filter(Boolean));
      if (failed >= 3) warnings.push({ type: 'FAILURE_SPIKE', severity: failed >= 6 ? 'HIGH' : 'MEDIUM', count: failed });
      if (outgoing.length >= 8 && destinations.length >= 5) warnings.push({ type: 'RAPID_DISTRIBUTION', severity: 'HIGH', outgoingCount: outgoing.length, destinationCount: destinations.length });
      if (txs.length === 0) warnings.push({ type: 'NO_RECENT_ACTIVITY', severity: 'INFO' });

      const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
      const highest = warnings.reduce((best, item) => severityRank[item.severity] > severityRank[best] ? item.severity : best, 'INFO');

      return res.json({
        success: true,
        engine: 'EARLY_WARNING_ENGINE_V1',
        sourceType: 'CURRENT_BLOCKCHAIN_SCAN',
        timestamp: new Date().toISOString(),
        realtime: false,
        network,
        address,
        warningLevel: highest,
        warningCount: warnings.length,
        warnings,
        note: 'Bu endpoint mevcut adapter tarama penceresini değerlendirir; sürekli gerçek zamanlı stream değildir.'
      });
    } catch (error) {
      return res.status(error?.status || 502).json({ success: false, error: error?.message || 'Early warning unavailable' });
    }
  });
};

const inspectContractV2 = async ({ network, address, provider }) => {
  const contract = new ethers.Contract(address, [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function owner() view returns (address)',
    'function paused() view returns (bool)',
    'function mintingFinished() view returns (bool)',
    'function cap() view returns (uint256)',
    'function minter() view returns (address)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
    'function MINTER_ROLE() view returns (bytes32)',
    'function hasRole(bytes32,address) view returns (bool)'
  ], provider);

  const read = async (method, fallback = null) => {
    try { return await contract[method](); } catch { return fallback; }
  };

  const metadata = {
    name: await read('name'),
    symbol: await read('symbol'),
    decimals: null,
    totalSupply: null
  };
  const decimals = await read('decimals');
  metadata.decimals = decimals !== null ? Number(decimals) : null;

  const totalSupply = await read('totalSupply');
  metadata.totalSupply = totalSupply !== null ? totalSupply.toString() : null;

  const controls = {
    owner: { supported: false, address: null },
    pause: { supported: false, paused: null },
    mint: { supported: false, mintingFinished: null, cap: null, minter: null },
    adminRole: { supported: false, role: null, ownerHasAdminRole: null },
    bytecodeSelectors: {},
    proxy: { detected: false, implementation: null, admin: null }
  };

  const owner = await read('owner');
  if (typeof owner === 'string' && ethers.isAddress(owner)) {
    controls.owner = { supported: true, address: owner };
  }

  const paused = await read('paused');
  if (typeof paused === 'boolean') controls.pause = { supported: true, paused };

  const mintingFinished = await read('mintingFinished');
  const cap = await read('cap');
  const minter = await read('minter');
  controls.mint = {
    supported: mintingFinished !== null || cap !== null || minter !== null,
    mintingFinished: typeof mintingFinished === 'boolean' ? mintingFinished : null,
    cap: cap !== null ? cap.toString() : null,
    minter: typeof minter === 'string' && ethers.isAddress(minter) ? minter : null
  };

  const adminRole = await read('DEFAULT_ADMIN_ROLE');
  if (typeof adminRole === 'string' && adminRole.startsWith('0x')) {
    controls.adminRole.supported = true;
    controls.adminRole.role = adminRole;
    if (controls.owner.supported) {
      try { controls.adminRole.ownerHasAdminRole = Boolean(await contract.hasRole(adminRole, controls.owner.address)); } catch {}
    }
  }

  const code = await provider.getCode(address);
  const cleanCode = code.replace(/^0x/, '').toLowerCase();
  for (const [name, selector] of Object.entries(CONTRACT_SELECTORS)) {
    if (selector && selector !== '0x') controls.bytecodeSelectors[name] = cleanCode.includes(selector);
  }

  const implementationAbi = new ethers.Contract(address, [
    'function implementation() view returns (address)',
    'function admin() view returns (address)'
  ], provider);
  try {
    const implementation = await implementationAbi.implementation();
    if (ethers.isAddress(implementation)) {
      controls.proxy.detected = true;
      controls.proxy.implementation = implementation;
    }
  } catch {}
  try {
    const admin = await implementationAbi.admin();
    if (ethers.isAddress(admin)) {
      controls.proxy.detected = true;
      controls.proxy.admin = admin;
    }
  } catch {}

  const dex = DEX_CONFIG[network] || { wrappedNative: null, factories: [] };
  const liquidity = { pairFound: false, pair: null, dex: null, reserve0: null, reserve1: null, totalSupply: null, lpLocked: 'NOT_VERIFIED' };
  if (dex.wrappedNative) {
    const factoryAbi = ['function getPair(address,address) view returns (address)'];
    const pairAbi = [
      'function token0() view returns (address)',
      'function token1() view returns (address)',
      'function getReserves() view returns (uint112,uint112,uint32)',
      'function totalSupply() view returns (uint256)'
    ];
    for (const factoryInfo of dex.factories) {
      try {
        const factory = new ethers.Contract(factoryInfo.address, factoryAbi, provider);
        const pair = await factory.getPair(address, dex.wrappedNative);
        if (pair && pair !== ethers.ZeroAddress) {
          const pairContract = new ethers.Contract(pair, pairAbi, provider);
          const reserves = await pairContract.getReserves();
          const lpSupply = await pairContract.totalSupply();
          liquidity.pairFound = true;
          liquidity.pair = pair;
          liquidity.dex = factoryInfo.name;
          liquidity.reserve0 = reserves?.[0]?.toString?.() || null;
          liquidity.reserve1 = reserves?.[1]?.toString?.() || null;
          liquidity.totalSupply = lpSupply?.toString?.() || null;
          break;
        }
      } catch {}
    }
  }

  const capabilityWarnings = [];
  if (controls.bytecodeSelectors.mint) capabilityWarnings.push('Bytecode mint() selector içeriyor; gerçek mint yetkisi role/state analiziyle doğrulanmalıdır.');
  if (controls.bytecodeSelectors.blacklist) capabilityWarnings.push('Bytecode blacklist benzeri selector içeriyor.');
  if (controls.bytecodeSelectors.whitelist) capabilityWarnings.push('Bytecode whitelist benzeri selector içeriyor.');
  if (controls.bytecodeSelectors.upgradeTo || controls.bytecodeSelectors.upgradeToAndCall) capabilityWarnings.push('Upgradeable proxy/upgrade fonksiyonu için selector tespit edildi.');

  const unverified = {
    buyTax: 'NOT_VERIFIED',
    sellTax: 'NOT_VERIFIED',
    honeypot: 'NOT_VERIFIED',
    transferRestriction: 'NOT_VERIFIED',
    lpLocked: liquidity.pairFound ? 'LOCK_PROVIDER_NOT_VERIFIED' : 'NO_PAIR_FOUND'
  };

  let riskScore = 0;
  const signals = [];
  const addRisk = (weight, type, description) => { riskScore = Math.min(100, riskScore + weight); signals.push({ type, weight, description }); };
  if (controls.proxy.detected) addRisk(10, 'UPGRADEABLE_CONTRACT', 'Upgradeable proxy göstergesi bulundu.');
  if (controls.mint.supported && controls.mint.mintingFinished !== true) addRisk(12, 'MINT_CAPABILITY', 'Mint kontrol yüzeyinin aktif olabileceğine dair RPC/bytecode kanıtı bulundu.');
  if (controls.pause.supported) addRisk(3, 'PAUSABLE', 'Kontrat paused() kontrolü destekliyor.');
  if (controls.bytecodeSelectors.blacklist) addRisk(10, 'BLACKLIST_CAPABILITY', 'Blacklist benzeri fonksiyon selectorü bulundu.');
  if (controls.bytecodeSelectors.whitelist) addRisk(5, 'WHITELIST_CAPABILITY', 'Whitelist benzeri fonksiyon selectorü bulundu.');
  if (liquidity.pairFound) signals.push({ type: 'DEX_PAIR_FOUND', weight: 0, description: `${liquidity.dex} üzerinde native pair bulundu.` });
  if (!liquidity.pairFound) addRisk(5, 'NO_KNOWN_NATIVE_PAIR', 'Kontrol edilen V2 tipi DEX fabrikalarında native pair bulunamadı.');

  return {
    metadata,
    controls,
    capabilityWarnings,
    liquidity,
    unverified,
    risk: {
      score: Math.min(100, riskScore),
      level: classifyLevel(riskScore),
      signals
    },
    methodology: {
      realRpc: true,
      honeypotSimulation: false,
      taxSimulation: false,
      lpLockProviderVerification: false,
      deployerGraph: false,
      note: 'NOT_VERIFIED alanları bilerek tahmin edilmez. Güvenilir buy/sell tax ve honeypot sonucu için gerçek DEX router/pair simülasyonu ve state-fork veya güvenilir simulation provider gerekir.'
    }
  };
};

const registerGuardianRoutes = ({ app, auth, db }) => {
  const guardianProfileSchema = z.object({
    enabled: z.boolean().optional(),
    alertThresholdUsd: z.number().finite().min(0).max(1000000000).optional(),
    minimumRiskScore: z.number().int().min(0).max(100).optional(),
    blockKnownScam: z.boolean().optional(),
    warnUnknownCounterparty: z.boolean().optional(),
    monitorBehavior: z.boolean().optional(),
    monitorScamDna: z.boolean().optional(),
    monitorSecurityGraph: z.boolean().optional(),
    monitorEarlyWarning: z.boolean().optional()
  });

  app.get('/api/guardian/profile', auth, async (req, res) => {
    try {
      const profile = await db.guardianProfile.upsert({
        where: {
          userId: req.user.id
        },
        update: {},
        create: {
          userId: req.user.id
        }
      });

      return res.json({
        success: true,
        profile
      });
    } catch (error) {
      console.error('[GUARDIAN PROFILE GET]', error?.message || error);

      return res.status(500).json({
        success: false,
        error: 'Guardian profile could not be loaded.'
      });
    }
  });

  app.put('/api/guardian/profile', auth, async (req, res) => {
    const parsed = guardianProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Guardian profile settings.'
      });
    }

    try {
      const profile = await db.guardianProfile.upsert({
        where: {
          userId: req.user.id
        },
        update: parsed.data,
        create: {
          userId: req.user.id,
          ...parsed.data
        }
      });

      await db.securityEvent.create({
        data: {
          userId: req.user.id,
          eventType: 'GUARDIAN_PROFILE_UPDATED',
          severity: 'INFO',
          success: true,
          endpoint: '/api/guardian/profile',
          method: 'PUT',
          details: JSON.stringify({
            changedFields: Object.keys(parsed.data)
          })
        }
      });

      return res.json({
        success: true,
        profile
      });
    } catch (error) {
      console.error('[GUARDIAN PROFILE PUT]', error?.message || error);

      return res.status(500).json({
        success: false,
        error: 'Guardian profile could not be updated.'
      });
    }
  });
};
const registerGuardianEvaluationRoute = ({
  app,
  auth,
  adapters,
  db,
  lookupScamIntelligence,
  lookupTransactionScamIntelligence
}) => {
  const requestSchema = z.object({
    network: z.string().min(2).max(30),
    address: z.string().min(10).max(128),
    counterpartyAddress: z.string().min(10).max(128).optional(),
    amountUsd: z.number().finite().min(0).max(1000000000000).optional()
  });

  app.post('/api/guardian/evaluate', auth, async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Guardian evaluation request'
      });
    }

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);
    const counterpartyAddress = parsed.data.counterpartyAddress
      ? normalizeAddress(parsed.data.counterpartyAddress)
      : null;

    try {
      const profile = await db.guardianProfile.upsert({
        where: { userId: req.user.id },
        update: {},
        create: { userId: req.user.id }
      });

      if (!profile.enabled) {
        return res.json({
          success: true,
          engine: 'GUARDIAN_ENGINE_V1',
          enabled: false,
          network,
          address,
          decision: {
            action: 'GUARDIAN_DISABLED',
            riskScore: 0,
            riskLevel: 'LOW',
            reasons: ['Guardian profile is disabled']
          }
        });
      }

      const adapter = adapters.get(network);

      if (!adapter || typeof adapter.checkWallet !== 'function') {
        return res.status(400).json({
          success: false,
          error: `Network adapter unavailable: ${network}`
        });
      }

      /*
       * Guardian tek bir blockchain taramasi yapar.
       * Ayni sonuc tum alt analizlerde yeniden kullanilir.
       */
      const walletResult = await adapter.checkWallet({
        network,
        address
      });

      if (!walletResult || walletResult.found === false) {
        return res.status(404).json({
          success: false,
          error: 'Wallet data not found'
        });
      }

      const transactions = Array.isArray(walletResult.transactions)
        ? walletResult.transactions
        : [];

      const [
        directScam,
        transactionScam,
        whitelistRows,
        blacklistRows
      ] = await Promise.all([
        lookupScamIntelligence({ network, address }),

        lookupTransactionScamIntelligence({
          network,
          walletAddress: address,
          transactions
        }),

        db.whitelistAddress.findMany({
          where: {
            userId: req.user.id,
            network
          },
          select: {
            address: true,
            label: true
          }
        }),

        db.blacklistAddress.findMany({
          where: {
            userId: req.user.id,
            network
          },
          select: {
            address: true,
            label: true
          }
        })
      ]);

      const behavioral = buildBehavioralMetrics({
        address,
        network,
        transactions,
        balance: walletResult.balance,
        scamIntelligence: directScam,
        counterpartyScamIntelligence: transactionScam
      });

      const normalizePolicyAddress = value => {
        const clean = normalizeAddress(value);

        return [
          'ethereum',
          'bsc',
          'polygon',
          'arbitrum',
          'base',
          'optimism',
          'avalanche'
        ].includes(network)
          ? clean.toLowerCase()
          : clean;
      };

      const walletKey = normalizePolicyAddress(address);

      const whitelist = new Set(
        whitelistRows.map(item =>
          normalizePolicyAddress(item.address)
        )
      );

      const blacklist = new Set(
        blacklistRows.map(item =>
          normalizePolicyAddress(item.address)
        )
      );

      const walletWhitelisted = whitelist.has(walletKey);
      const walletBlacklisted = blacklist.has(walletKey);

      const matchedTxs = Array.isArray(transactionScam?.transactionMatches)
        ? transactionScam.transactionMatches
        : [];

      let scamDnaScore = 0;

      if (directScam?.matched) scamDnaScore += 80;
      if (matchedTxs.length) {
        scamDnaScore += Math.min(20, matchedTxs.length * 7);
      }

      scamDnaScore = Math.min(100, scamDnaScore);

      /*
       * Guardian Security Graph
       * Mevcut tek adapter taramasindaki transaction verisini kullanir.
       */
      const graphNodes = new Map();
      const graphEdges = [];

      const walletGraphKey = normalizePolicyAddress(address);

      graphNodes.set(walletGraphKey, {
        address,
        type: 'WALLET',
        scamMatched: Boolean(directScam?.matched)
      });

      for (const tx of transactions) {
        const from = extractTxAddress(tx, 'from');
        const to = extractTxAddress(tx, 'to');

        if (!from && !to) continue;

        const fromKey = from
          ? normalizePolicyAddress(from)
          : null;

        const toKey = to
          ? normalizePolicyAddress(to)
          : null;

        if (fromKey && !graphNodes.has(fromKey)) {
          graphNodes.set(fromKey, {
            address: from,
            type: fromKey === walletGraphKey
              ? 'WALLET'
              : 'COUNTERPARTY',
            scamMatched: false
          });
        }

        if (toKey && !graphNodes.has(toKey)) {
          graphNodes.set(toKey, {
            address: to,
            type: toKey === walletGraphKey
              ? 'WALLET'
              : 'COUNTERPARTY',
            scamMatched: false
          });
        }

        if (fromKey && toKey) {
          graphEdges.push({
            from,
            to,
            amount: tx?.amount ?? null,
            tokenAddress: tx?.tokenAddress ?? null,
            confirmed:
              tx?.confirmed !== false &&
              tx?.success !== false
          });
        }
      }

      const transactionScamAddresses = new Set();

      for (const match of matchedTxs) {
        const candidates = [
          match?.address,
          match?.counterparty,
          match?.from,
          match?.to
        ];

        for (const candidateAddress of candidates) {
          if (!candidateAddress) continue;

          try {
            transactionScamAddresses.add(
              normalizePolicyAddress(candidateAddress)
            );
          } catch {}
        }
      }

      for (const [nodeKey, node] of graphNodes.entries()) {
        if (transactionScamAddresses.has(nodeKey)) {
          node.scamMatched = true;
        }
      }

      const scamGraphNodes = Array.from(
        graphNodes.values()
      ).filter(node => node.scamMatched).length;

      let securityGraphScore = 0;

      if (directScam?.matched) {
        securityGraphScore = 100;
      } else if (scamGraphNodes > 0) {
        securityGraphScore = Math.min(
          100,
          45 + scamGraphNodes * 10
        );
      } else if (graphEdges.length >= 20) {
        securityGraphScore = 15;
      } else if (graphEdges.length >= 10) {
        securityGraphScore = 8;
      }

      const securityGraph = {
        score: securityGraphScore,
        level: classifyLevel(securityGraphScore),
        nodeCount: graphNodes.size,
        edgeCount: graphEdges.length,
        scamNodeCount: scamGraphNodes,
        nodes: Array.from(graphNodes.values()).slice(0, 100),
        edges: graphEdges.slice(0, 200)
      };

      /*
       * Guardian Early Warning
       * Yine ayni transaction seti uzerinden hesaplanir.
       */
      const failedTransactions = transactions.filter(
        tx =>
          tx?.confirmed === false ||
          tx?.success === false
      ).length;

      const outgoingTransactions = transactions.filter(tx => {
        const from = extractTxAddress(tx, 'from');
        if (!from) return false;

        return normalizePolicyAddress(from) === walletGraphKey;
      });

      const uniqueOutgoingDestinations = new Set(
        outgoingTransactions
          .map(tx => extractTxAddress(tx, 'to'))
          .filter(Boolean)
          .map(value => normalizePolicyAddress(value))
      );

      const earlyWarnings = [];
      let earlyWarningScore = 0;

      const addEarlyWarning = (
        score,
        type,
        message
      ) => {
        earlyWarningScore = Math.max(
          earlyWarningScore,
          score
        );

        earlyWarnings.push({
          type,
          score,
          message
        });
      };

      if (directScam?.matched) {
        addEarlyWarning(
          100,
          'DIRECT_SCAM_MATCH',
          'Wallet matches known scam intelligence.'
        );
      }

      if (matchedTxs.length > 0) {
        addEarlyWarning(
          Math.min(95, 65 + matchedTxs.length * 5),
          'SCAM_COUNTERPARTY_ACTIVITY',
          'Known scam counterparty activity was detected.'
        );
      }

      if (
        transactions.length >= 4 &&
        failedTransactions / transactions.length >= 0.5
      ) {
        addEarlyWarning(
          65,
          'FAILURE_SPIKE',
          'A high failed-transaction ratio was detected.'
        );
      }

      if (
        outgoingTransactions.length >= 8 &&
        uniqueOutgoingDestinations.size >= 5
      ) {
        addEarlyWarning(
          55,
          'RAPID_DISTRIBUTION',
          'Outgoing activity is distributed across many destinations.'
        );
      }

      if (transactions.length === 0) {
        earlyWarnings.push({
          type: 'NO_ACTIVITY_IN_SCAN_WINDOW',
          score: 0,
          message:
            'No transaction activity was available in the current scan window.'
        });
      }

      const earlyWarning = {
        score: earlyWarningScore,
        level: classifyLevel(earlyWarningScore),
        warningCount: earlyWarnings.filter(
          warning => warning.score > 0
        ).length,
        warnings: earlyWarnings,
        metrics: {
          totalTransactions: transactions.length,
          failedTransactions,
          outgoingTransactions:
            outgoingTransactions.length,
          uniqueOutgoingDestinations:
            uniqueOutgoingDestinations.size
        },
        realtime: false
      };

      let riskScore = Math.max(
        profile.monitorBehavior
          ? Number(behavioral?.score || 0)
          : 0,

        profile.monitorScamDna
          ? scamDnaScore
          : 0,

        profile.monitorSecurityGraph
          ? securityGraphScore
          : 0,

        profile.monitorEarlyWarning
          ? earlyWarningScore
          : 0
      );

      const reasons = [];
      const signals = [];

      if (directScam?.matched) {
        riskScore = 100;
        reasons.push('Wallet matches Scam Intelligence');
        signals.push('DIRECT_SCAM_MATCH');
      }

      if (walletBlacklisted) {
        riskScore = 100;
        reasons.push('Wallet is present in the user blacklist');
        signals.push('USER_BLACKLIST_MATCH');
      }

      if (walletWhitelisted) {
        signals.push('USER_WHITELIST_MATCH');
      }

      const amountUsd = parsed.data.amountUsd ?? null;

      const amountThresholdExceeded =
        amountUsd !== null &&
        Number(amountUsd) >= Number(profile.alertThresholdUsd);

      if (amountThresholdExceeded) {
        reasons.push('Guardian alert value threshold exceeded');
        signals.push('VALUE_THRESHOLD_EXCEEDED');
      }

      let counterpartyWhitelisted = false;
      let counterpartyBlacklisted = false;
      let counterpartyScam = null;

      if (counterpartyAddress) {
        const counterpartyKey =
          normalizePolicyAddress(counterpartyAddress);

        counterpartyWhitelisted =
          whitelist.has(counterpartyKey);

        counterpartyBlacklisted =
          blacklist.has(counterpartyKey);

        counterpartyScam =
          await lookupScamIntelligence({
            network,
            address: counterpartyAddress
          });

        if (counterpartyBlacklisted) {
          riskScore = 100;
          reasons.push('Counterparty is present in the user blacklist');
          signals.push('COUNTERPARTY_BLACKLIST_MATCH');
        }

        if (counterpartyScam?.matched) {
          riskScore = 100;
          reasons.push('Counterparty matches Scam Intelligence');
          signals.push('COUNTERPARTY_SCAM_MATCH');
        }

        if (counterpartyWhitelisted) {
          signals.push('COUNTERPARTY_WHITELIST_MATCH');
        }
      }

      riskScore = Math.max(
        0,
        Math.min(100, Math.round(riskScore))
      );

      const knownDanger =
        Boolean(directScam?.matched) ||
        Boolean(counterpartyScam?.matched) ||
        walletBlacklisted ||
        counterpartyBlacklisted;

      let action = 'ALLOW';

      if (profile.blockKnownScam && knownDanger) {
        action = 'BLOCK_RECOMMENDED';
      } else if (
        riskScore >= profile.minimumRiskScore ||
        amountThresholdExceeded
      ) {
        action = 'WARN';
      }

      if (!reasons.length) {
        reasons.push('No Guardian policy threshold was triggered');
      }

      const riskLevel = classifyLevel(riskScore);

      const severity =
        action === 'BLOCK_RECOMMENDED'
          ? 'CRITICAL'
          : action === 'WARN'
            ? 'WARNING'
            : 'INFO';

      let auditPersisted = false;

      try {
        await db.securityEvent.create({
          data: {
            userId: req.user.id,
            eventType: 'GUARDIAN_EVALUATION',
            severity,
            endpoint: '/api/guardian/evaluate',
            method: 'POST',
            success: true,
            details: JSON.stringify({
              network,
              address,
              counterpartyAddress,
              amountUsd,
              action,
              riskScore,
              riskLevel,
              signals
            })
          }
        });

        auditPersisted = true;
      } catch (auditError) {
        console.error(
          '[GUARDIAN AUDIT]',
          auditError?.message || auditError
        );
      }

      /*
       * Guardian Notification
       * Sadece WARN / BLOCK_RECOMMENDED icin calisir.
       * eventKey sayesinde ayni gun ayni risk karari tekrar
       * yeni bildirim olusturmaz.
       */
      let notificationPersisted = false;
      let notificationEventKey = null;

      if (
        action === 'WARN' ||
        action === 'BLOCK_RECOMMENDED'
      ) {
        const eventDate = new Date()
          .toISOString()
          .slice(0, 10);

        const safeWalletKey = normalizePolicyAddress(
          address
        );

        const safeCounterpartyKey =
          counterpartyAddress
            ? normalizePolicyAddress(
                counterpartyAddress
              )
            : 'none';

        notificationEventKey = [
          'guardian',
          req.user.id,
          network,
          safeWalletKey,
          safeCounterpartyKey,
          action,
          eventDate
        ].join(':');

        const notificationTitle =
          action === 'BLOCK_RECOMMENDED'
            ? 'Guardian Critical Risk'
            : 'Guardian Risk Warning';

        const notificationBody = [
          `Network: ${network}`,
          `Wallet: ${address}`,
          `Risk: ${riskScore}/100`,
          `Level: ${riskLevel}`,
          `Decision: ${action}`,
          reasons[0] || 'Guardian policy triggered'
        ].join(' | ');

        try {
          await db.notification.upsert({
            where: {
              eventKey: notificationEventKey
            },

            update: {
              severity,
              title: notificationTitle,
              body: notificationBody,
              asset: address,
              network,
              read: false,
              readAt: null
            },

            create: {
              userId: req.user.id,
              type: 'GUARDIAN_RISK_ALERT',
              severity,
              title: notificationTitle,
              body: notificationBody,
              eventKey: notificationEventKey,
              asset: address,
              network,
              read: false
            }
          });

          notificationPersisted = true;
        } catch (notificationError) {
          console.error(
            '[GUARDIAN NOTIFICATION]',
            notificationError?.message ||
              notificationError
          );
        }
      }
      return res.json({
        success: true,
        engine: 'GUARDIAN_ENGINE_V1',
        sourceType:
          'LIVE_BLOCKCHAIN_PLUS_SCAM_DATABASE_PLUS_USER_POLICY',
        timestamp: new Date().toISOString(),
        realtime: false,
        network,
        address,
        counterpartyAddress,
        amountUsd,

        policy: {
          walletWhitelisted,
          walletBlacklisted,
          counterpartyWhitelisted,
          counterpartyBlacklisted,
          amountThresholdExceeded,
          signals
        },

        components: {
          behavioral,
          scamDna: {
            score: scamDnaScore,
            level: classifyLevel(scamDnaScore),
            directMatched: Boolean(directScam?.matched),
            matchedTransactionCount: matchedTxs.length
          },
          securityGraph,
          earlyWarning
        },

        decision: {
          action,
          riskScore,
          riskLevel,
          reasons
        },

        persistence: {
          auditPersisted,
          notificationPersisted,
          notificationEventKey
        },

        protectionMode: 'NON_CUSTODIAL_READ_ONLY',

        note:
          'BLOCK_RECOMMENDED is a policy recommendation only; Guardian does not sign, cancel or move blockchain funds.'
      });
    } catch (error) {
      console.error(
        '[GUARDIAN EVALUATE]',
        error?.message || error
      );

      return res
        .status(error?.status || 502)
        .json({
          success: false,
          error:
            error?.message ||
            'Guardian evaluation unavailable'
        });
    }
  });
};
const registerContractV2Route = ({ app, auth, lookupScamIntelligence }) => {
  app.post('/api/analyze-contract-v2', auth, async (req, res) => {
    const parsed = z.object({
      network: z.string().min(2).max(30),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
    }).safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid EVM contract request' });

    const network = normalizeNetwork(parsed.data.network);
    const address = normalizeAddress(parsed.data.address);
    if (!EVM_NETWORKS.includes(network)) return res.status(400).json({ success: false, error: 'EVM network not supported', network, supportedNetworks: EVM_NETWORKS });

    try {
      const provider = new ethers.JsonRpcProvider(getRpc(network));
      const code = await provider.getCode(address);
      if (!code || code === '0x') {
        return res.json({ success: true, network, address, isContract: false, analysisStatus: 'NO_CONTRACT' });
      }

      const analysis = await inspectContractV2({ network, address, provider });
      const scamIntelligence = await lookupScamIntelligence({ network, address });
      if (scamIntelligence?.matched) {
        analysis.risk.score = Math.min(100, analysis.risk.score + 70);
        analysis.risk.level = classifyLevel(analysis.risk.score);
        analysis.risk.signals.unshift({ type: 'SCAM_INTELLIGENCE_MATCH', weight: 70, description: 'Kontrat adresi Scam Intelligence veritabanında eşleşti.' });
      }

      return res.json({
        success: true,
        engine: 'SMART_CONTRACT_SECURITY_V2',
        sourceType: 'LIVE_EVM_RPC_PLUS_SCAM_DATABASE',
        timestamp: new Date().toISOString(),
        network,
        address,
        isContract: true,
        analysisStatus: 'CONTRACT_V2_ANALYZED',
        scamIntelligence,
        ...analysis
      });
    } catch (error) {
      return res.status(502).json({ success: false, error: error?.message || 'Smart Contract V2 analysis unavailable', network, address });
    }
  });
};

export const registerSecurityV2 = deps => {
  if (!deps?.app || !deps?.auth || !deps?.adapters || !deps?.db) {
    throw new Error('registerSecurityV2 requires app, auth, adapters and db');
  }
  if (typeof deps.lookupScamIntelligence !== 'function' || typeof deps.lookupTransactionScamIntelligence !== 'function') {
    throw new Error('registerSecurityV2 requires scam intelligence functions');
  }

  registerWalletIntelligenceRoutes(deps);
  registerGuardianRoutes(deps);
  registerGuardianEvaluationRoute(deps);
  registerContractV2Route(deps);
};
