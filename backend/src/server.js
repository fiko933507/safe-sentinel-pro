import 'dotenv/config';
import { registerSecurityV2 } from './security-v2.js';
import fs from 'fs';
import bs58 from 'bs58';
import {createHash, randomUUID} from 'crypto';
import express from 'express'; import helmet from 'helmet'; import cors from 'cors'; import rateLimit from 'express-rate-limit'; import bcrypt from 'bcryptjs'; import {PrismaClient} from '@prisma/client'; import {SignJWT,jwtVerify} from 'jose'; import {z} from 'zod';
import {createAdapters} from './adapters/index.js';
import { ethers } from 'ethers';
const app=express(), db=new PrismaClient(), secret=new TextEncoder().encode(process.env.JWT_SECRET);
const adapters=createAdapters();
const calculateWalletRisk = ({account,transactions,balanceTrx,address}) => {
  let score=0;
  const reasons=[];
  const signals=[];

  const normalizedAddress=String(address||'').trim().toLowerCase();
  const now=Date.now();

  const createdAt=Number(account?.create_time||account?.createdAt||0);
  const walletAgeDays=createdAt>0
    ? Math.max(0,(now-createdAt)/86400000)
    : null;

  const totalTransactions=transactions.length;

  const failedTransactions=transactions.filter(
    tx=>tx.confirmed===false
  ).length;

  const successfulTransactions=transactions.filter(
    tx=>tx.confirmed!==false
  ).length;

  const trc20Transactions=transactions.filter(
    tx=>tx.type==='TRC20 Transfer'
  ).length;

  const trxTransactions=transactions.filter(
    tx=>tx.type==='TRX Transfer'
  ).length;

  const incomingTransactions=transactions.filter(tx=>{
    return String(tx.to||'').trim().toLowerCase()===normalizedAddress;
  }).length;

  const outgoingTransactions=transactions.filter(tx=>{
    return String(tx.from||'').trim().toLowerCase()===normalizedAddress;
  }).length;

  const counterparties=new Set();

  for(const tx of transactions){
    const from=String(tx.from||'').trim().toLowerCase();
    const to=String(tx.to||'').trim().toLowerCase();

    if(from && from!==normalizedAddress){
      counterparties.add(from);
    }

    if(to && to!==normalizedAddress){
      counterparties.add(to);
    }
  }

  const uniqueCounterparties=counterparties.size;

  const incomingAddresses=new Set();
  const outgoingAddresses=new Set();

  for(const tx of transactions){
    const from=String(tx.from||'').trim().toLowerCase();
    const to=String(tx.to||'').trim().toLowerCase();

    if(to===normalizedAddress && from){
      incomingAddresses.add(from);
    }

    if(from===normalizedAddress && to){
      outgoingAddresses.add(to);
    }
  }

  const uniqueIncomingAddresses=incomingAddresses.size;
  const uniqueOutgoingAddresses=outgoingAddresses.size;

  const failedRatio=totalTransactions>0
    ? failedTransactions/totalTransactions
    : 0;

  const outgoingRatio=totalTransactions>0
    ? outgoingTransactions/totalTransactions
    : 0;

  const incomingRatio=totalTransactions>0
    ? incomingTransactions/totalTransactions
    : 0;

  const balance=Number(balanceTrx||0);

  const addRisk=(points,signal,reason)=>{
    score+=points;
    signals.push(signal);
    reasons.push(reason);
  };

  /*
   * 1. WALLET AGE
   */
  if(walletAgeDays!==null){
    if(walletAgeDays<1){
      addRisk(
        25,
        'VERY_NEW_WALLET',
        'Cüzdan 24 saatten daha yeni.'
      );
    }else if(walletAgeDays<3){
      addRisk(
        20,
        'NEW_WALLET',
        'Cüzdan çok yeni oluşturulmuş.'
      );
    }else if(walletAgeDays<7){
      addRisk(
        12,
        'RECENT_WALLET',
        'Cüzdan son 7 gün içinde oluşturulmuş.'
      );
    }else if(walletAgeDays<30){
      addRisk(
        5,
        'YOUNG_WALLET',
        'Cüzdan 30 günden daha yeni.'
      );
    }
  }

  /*
   * 2. TRANSACTION VOLUME
   */
  if(totalTransactions===0){
    addRisk(
      5,
      'NO_TRANSACTION_HISTORY',
      'İncelenen zaman penceresinde işlem geçmişi bulunamadı.'
    );
  }else if(totalTransactions>=20){
    addRisk(
      8,
      'HIGH_ACTIVITY',
      'İncelenen işlem penceresinde yüksek hareketlilik bulundu.'
    );
  }else if(totalTransactions>=10){
    addRisk(
      4,
      'ACTIVE_WALLET',
      'Cüzdanda belirgin işlem aktivitesi bulundu.'
    );
  }

  /*
   * 3. FAILED TRANSACTIONS
   */
  if(failedTransactions>0){
    if(failedRatio>=0.5){
      addRisk(
        25,
        'HIGH_FAILURE_RATE',
        `İşlemlerin %${Math.round(failedRatio*100)} kadarı başarısız.`
      );
    }else if(failedRatio>=0.25){
      addRisk(
        15,
        'ELEVATED_FAILURE_RATE',
        `İşlemlerin %${Math.round(failedRatio*100)} kadarı başarısız.`
      );
    }else{
      addRisk(
        6,
        'FAILED_TRANSACTIONS',
        'Cüzdanda başarısız işlemler bulundu.'
      );
    }
  }

  /*
   * 4. COUNTERPARTY DIVERSITY
   */
  if(uniqueCounterparties>=15){
    addRisk(
      10,
      'MANY_COUNTERPARTIES',
      `Cüzdan ${uniqueCounterparties} farklı karşı tarafla etkileşime girmiş.`
    );
  }else if(uniqueCounterparties>=8){
    addRisk(
      5,
      'MULTIPLE_COUNTERPARTIES',
      `Cüzdan ${uniqueCounterparties} farklı karşı tarafla etkileşime girmiş.`
    );
  }

  /*
   * 5. INCOMING BEHAVIOR
   */
  if(incomingTransactions>=5 && uniqueIncomingAddresses>=5){
    addRisk(
      10,
      'MANY_INCOMING_SOURCES',
      `${uniqueIncomingAddresses} farklı adresten fon girişi tespit edildi.`
    );
  }

  /*
   * 6. OUTGOING BEHAVIOR
   */
  if(outgoingTransactions>=5 && uniqueOutgoingAddresses>=5){
    addRisk(
      10,
      'MANY_OUTGOING_DESTINATIONS',
      `${uniqueOutgoingAddresses} farklı adrese fon çıkışı tespit edildi.`
    );
  }

  /*
   * 7. DISTRIBUTION PATTERN
   */
  if(
    outgoingTransactions>=5 &&
    uniqueOutgoingAddresses>=4 &&
    incomingTransactions>=2
  ){
    addRisk(
      8,
      'DISTRIBUTION_PATTERN',
      'Fon girişlerinden sonra birden fazla adrese dağıtım davranışı gözlendi.'
    );
  }

  /*
   * 8. COLLECTION PATTERN
   */
  if(
    incomingTransactions>=5 &&
    uniqueIncomingAddresses>=4 &&
    outgoingTransactions<=1
  ){
    addRisk(
      5,
      'COLLECTION_PATTERN',
      'Birden fazla adresten yoğun fon toplama davranışı gözlendi.'
    );
  }

  /*
   * 9. TRC20 ACTIVITY
   */
  if(trc20Transactions>=15){
    addRisk(
      10,
      'HIGH_TRC20_ACTIVITY',
      'Yoğun TRC20 token hareketliliği bulundu.'
    );
  }else if(trc20Transactions>=8){
    addRisk(
      6,
      'ELEVATED_TRC20_ACTIVITY',
      'Belirgin TRC20 token hareketliliği bulundu.'
    );
  }

  /*
   * 10. BALANCE / ACTIVITY RELATION
   */
  if(balance<=0 && totalTransactions>0){
    addRisk(
      5,
      'LOW_BALANCE_AFTER_ACTIVITY',
      'İşlem geçmişine rağmen TRX bakiyesi çok düşük veya sıfır.'
    );
  }

  /*
   * 11. INACTIVE / ONE-WAY PATTERN
   */
  if(
    totalTransactions>=5 &&
    outgoingTransactions===0 &&
    incomingTransactions>=5
  ){
    addRisk(
      4,
      'ONE_WAY_INBOUND',
      'İncelenen işlemlerde yalnızca fon girişi görüldü.'
    );
  }

  /*
   * 12. FAILED + NEW WALLET COMBINATION
   */
  if(
    walletAgeDays!==null &&
    walletAgeDays<7 &&
    failedTransactions>=2
  ){
    addRisk(
      10,
      'NEW_WALLET_FAILURE_CLUSTER',
      'Yeni cüzdanda birden fazla başarısız işlem bulundu.'
    );
  }

  /*
   * 13. HIGH ACTIVITY + MANY DESTINATIONS
   */
  if(
    totalTransactions>=10 &&
    uniqueOutgoingAddresses>=5
  ){
    addRisk(
      7,
      'HIGH_DISTRIBUTION_ACTIVITY',
      'Yüksek işlem aktivitesi ile çok sayıda çıkış adresi birlikte görüldü.'
    );
  }

  score=Math.min(
    100,
    Math.max(0,Math.round(score))
  );

  let level='low';

  if(score>=75){
    level='critical';
  }else if(score>=50){
    level='high';
  }else if(score>=25){
    level='medium';
  }

  if(reasons.length===0){
    reasons.push(
      'Mevcut zincir verilerinde belirgin risk sinyali bulunmadı.'
    );
  }

  return {
    score,
    level,
    reasons,
    signals,
    walletAgeDays:walletAgeDays!==null
      ? Number(walletAgeDays.toFixed(2))
      : null,
    totalTransactions,
    successfulTransactions,
    failedTransactions,
    failedRatio:Number(failedRatio.toFixed(4)),
    trc20Transactions,
    trxTransactions,
    incomingTransactions,
    outgoingTransactions,
    uniqueCounterparties,
    uniqueIncomingAddresses,
    uniqueOutgoingAddresses,
    balanceTrx:balance
  };
};
const calculateEvmWalletRisk = ({
  account,
  transactions,
  tokens,
  balance,
  balanceUnit,
  address,
  network,
  scamIntelligence
}) => {
  let score = 0;
  const reasons = [];
  const signals = [];

  const normalizedAddress =
    String(address || '').trim().toLowerCase();

  const txs = Array.isArray(transactions)
    ? transactions
    : [];

  const tokenList = Array.isArray(tokens)
    ? tokens
    : [];

  const totalTransactions = txs.length;

  const ZERO_ADDRESS =
    '0x0000000000000000000000000000000000000000';

  const incomingTransactions = txs.filter(tx =>
    String(tx?.to || '').trim().toLowerCase() ===
    normalizedAddress
  );

  const outgoingTransactions = txs.filter(tx =>
    String(tx?.from || '').trim().toLowerCase() ===
    normalizedAddress
  );

  const realIncomingTransactions =
    incomingTransactions.filter(tx =>
      String(tx?.from || '').trim().toLowerCase() !==
      ZERO_ADDRESS
    );

  const realOutgoingTransactions =
    outgoingTransactions.filter(tx =>
      String(tx?.to || '').trim().toLowerCase() !==
      ZERO_ADDRESS
    );

  const mintTransactions =
    incomingTransactions.filter(tx =>
      String(tx?.from || '').trim().toLowerCase() ===
      ZERO_ADDRESS
    );

  const burnTransactions =
    outgoingTransactions.filter(tx =>
      String(tx?.to || '').trim().toLowerCase() ===
      ZERO_ADDRESS
    );

  const incomingAddresses = new Set();
  const outgoingAddresses = new Set();
  const counterparties = new Set();

  for (const tx of txs) {
    const from =
      String(tx?.from || '').trim().toLowerCase();

    const to =
      String(tx?.to || '').trim().toLowerCase();

    if (
      from &&
      from !== normalizedAddress &&
      from !== ZERO_ADDRESS
    ) {
      counterparties.add(from);
    }

    if (
      to &&
      to !== normalizedAddress &&
      to !== ZERO_ADDRESS
    ) {
      counterparties.add(to);
    }

    if (
      to === normalizedAddress &&
      from &&
      from !== ZERO_ADDRESS
    ) {
      incomingAddresses.add(from);
    }

    if (
      from === normalizedAddress &&
      to &&
      to !== ZERO_ADDRESS
    ) {
      outgoingAddresses.add(to);
    }
  }

  const uniqueIncomingAddresses =
    incomingAddresses.size;

  const uniqueOutgoingAddresses =
    outgoingAddresses.size;

  const uniqueCounterparties =
    counterparties.size;

  const incomingCount =
    realIncomingTransactions.length;

  const outgoingCount =
    realOutgoingTransactions.length;

  const failedTransactions = txs.filter(
    tx => tx?.confirmed === false
  ).length;

  const successfulTransactions =
    txs.filter(
      tx => tx?.confirmed !== false
    ).length;

  const failedRatio =
    totalTransactions > 0
      ? failedTransactions / totalTransactions
      : 0;

  const tokenTransferTransactions =
    txs.filter(
      tx =>
        String(tx?.type || '').toUpperCase() ===
        'ERC20 TRANSFER'
    ).length;

  const distinctTokens = new Set(
    txs
      .map(tx =>
        String(
          tx?.tokenAddress || ''
        ).trim().toLowerCase()
      )
      .filter(Boolean)
  ).size;

  const numericBalance =
    Number(balance || 0);

  const scamMatched =
    Boolean(scamIntelligence?.matched);

  const addRisk = (
    points,
    signal,
    reason
  ) => {
    score += points;
    signals.push(signal);
    reasons.push(reason);
  };

  /*
   * 1. SCAM INTELLIGENCE
   *
   * Veritabanında doğrudan eşleşme,
   * davranışsal sinyallerden ayrı ve güçlü
   * bir güvenlik göstergesidir.
   */
  if (scamMatched) {
    const highestSeverity =
      Array.isArray(scamIntelligence?.matches)
        ? scamIntelligence.matches.reduce(
            (highest, item) =>
              Math.max(
                highest,
                Number(item?.severity || 0)
              ),
            0
          )
        : 0;

    const scamPoints =
      highestSeverity >= 90
        ? 95
        : highestSeverity >= 70
          ? 85
          : highestSeverity >= 40
            ? 70
            : 60;

    addRisk(
      scamPoints,
      'SCAM_INTELLIGENCE_MATCH',
      'Adres scam intelligence veritabanında eşleşti.'
    );
  }

  /*
   * 2. TRANSACTION ACTIVITY
   *
   * Bu sayı yalnızca adapter'ın taradığı
   * mevcut EVM blok penceresini temsil eder.
   */
  if (totalTransactions === 0) {
    addRisk(
      2,
      'NO_EVM_TOKEN_ACTIVITY',
      'İncelenen EVM token-transfer penceresinde hareket bulunmadı.'
    );
  } else if (totalTransactions >= 20) {
    addRisk(
      8,
      'HIGH_EVM_TOKEN_ACTIVITY',
      'İncelenen EVM token-transfer penceresinde yüksek aktivite bulundu.'
    );
  } else if (totalTransactions >= 10) {
    addRisk(
      4,
      'ACTIVE_EVM_TOKEN_WALLET',
      'İncelenen EVM token-transfer penceresinde belirgin aktivite bulundu.'
    );
  }

  /*
   * 3. COUNTERPARTY DIVERSITY
   */
  if (uniqueCounterparties >= 15) {
    addRisk(
      10,
      'MANY_EVM_COUNTERPARTIES',
      `${uniqueCounterparties} farklı gerçek adresle etkileşim tespit edildi.`
    );
  } else if (uniqueCounterparties >= 8) {
    addRisk(
      5,
      'MULTIPLE_EVM_COUNTERPARTIES',
      `${uniqueCounterparties} farklı gerçek adresle etkileşim tespit edildi.`
    );
  }

  /*
   * 4. INCOMING SOURCES
   */
  if (
    incomingCount >= 5 &&
    uniqueIncomingAddresses >= 5
  ) {
    addRisk(
      10,
      'MANY_EVM_INCOMING_SOURCES',
      `${uniqueIncomingAddresses} farklı gerçek adresten token girişi tespit edildi.`
    );
  }

  /*
   * 5. OUTGOING DESTINATIONS
   */
  if (
    outgoingCount >= 5 &&
    uniqueOutgoingAddresses >= 5
  ) {
    addRisk(
      10,
      'MANY_EVM_OUTGOING_DESTINATIONS',
      `${uniqueOutgoingAddresses} farklı gerçek adrese token çıkışı tespit edildi.`
    );
  }

  /*
   * 6. DISTRIBUTION PATTERN
   */
  if (
    outgoingCount >= 5 &&
    uniqueOutgoingAddresses >= 4 &&
    incomingCount >= 2
  ) {
    addRisk(
      8,
      'EVM_DISTRIBUTION_PATTERN',
      'Fon girişlerinden sonra birden fazla gerçek adrese dağıtım davranışı gözlendi.'
    );
  }

  /*
   * 7. COLLECTION PATTERN
   */
  if (
    incomingCount >= 5 &&
    uniqueIncomingAddresses >= 4 &&
    outgoingCount <= 1
  ) {
    addRisk(
      5,
      'EVM_COLLECTION_PATTERN',
      'Birden fazla gerçek adresten yoğun token toplama davranışı gözlendi.'
    );
  }

  /*
   * 8. FAILED TRANSACTIONS
   */
  if (failedTransactions > 0) {
    if (failedRatio >= 0.5) {
      addRisk(
        20,
        'HIGH_EVM_FAILURE_RATE',
        `İncelenen işlemlerin %${Math.round(failedRatio * 100)} kadarı başarısız.`
      );
    } else if (failedRatio >= 0.25) {
      addRisk(
        12,
        'ELEVATED_EVM_FAILURE_RATE',
        `İncelenen işlemlerin %${Math.round(failedRatio * 100)} kadarı başarısız.`
      );
    } else {
      addRisk(
        5,
        'EVM_FAILED_TRANSACTIONS',
        'İncelenen işlem geçmişinde başarısız işlemler bulundu.'
      );
    }
  }

  /*
   * 9. TOKEN DIVERSITY
   */
  if (distinctTokens >= 10) {
    addRisk(
      8,
      'HIGH_TOKEN_DIVERSITY',
      `${distinctTokens} farklı token kontratıyla hareket tespit edildi.`
    );
  } else if (distinctTokens >= 5) {
    addRisk(
      4,
      'MULTIPLE_TOKEN_ACTIVITY',
      `${distinctTokens} farklı token kontratıyla hareket tespit edildi.`
    );
  }

  /*
   * 10. HIGH TOKEN ACTIVITY
   */
  if (tokenTransferTransactions >= 20) {
    addRisk(
      8,
      'HIGH_ERC20_ACTIVITY',
      'Yoğun ERC-20 transfer aktivitesi bulundu.'
    );
  } else if (tokenTransferTransactions >= 10) {
    addRisk(
      4,
      'ELEVATED_ERC20_ACTIVITY',
      'Belirgin ERC-20 transfer aktivitesi bulundu.'
    );
  }

  /*
   * 11. MINT / AIRDROP ACTIVITY
   *
   * Zero-address transferleri gerçek karşı taraf
   * olarak sayılmaz. Ancak olağandışı miktarda
   * mint aktivitesini ayrı bir sinyal olarak tutarız.
   */
  if (mintTransactions >= 5) {
    addRisk(
      3,
      'MULTIPLE_TOKEN_MINTS',
      `${mintTransactions} adet zero-address kaynaklı token mint hareketi bulundu.`
    );
  }

  /*
   * 12. BURN ACTIVITY
   */
  if (burnTransactions >= 5) {
    addRisk(
      3,
      'MULTIPLE_TOKEN_BURNS',
      `${burnTransactions} adet zero-address hedefli token burn hareketi bulundu.`
    );
  }

  /*
   * 13. ONE-WAY INBOUND
   */
  if (
    incomingCount >= 5 &&
    outgoingCount === 0
  ) {
    addRisk(
      4,
      'EVM_ONE_WAY_INBOUND',
      'İncelenen gerçek token hareketlerinde yalnızca fon girişi görüldü.'
    );
  }

  /*
   * 14. HIGH DISTRIBUTION ACTIVITY
   */
  if (
    totalTransactions >= 10 &&
    uniqueOutgoingAddresses >= 5
  ) {
    addRisk(
      7,
      'EVM_HIGH_DISTRIBUTION_ACTIVITY',
      'Yüksek token aktivitesi ile çok sayıda gerçek çıkış adresi birlikte görüldü.'
    );
  }

  /*
   * 15. BALANCE CONTEXT
   *
   * Native balance'ın sıfır olması tek başına scam
   * göstergesi değildir. Bu nedenle düşük ağırlık.
   */
  if (
    numericBalance <= 0 &&
    totalTransactions > 0
  ) {
    addRisk(
      3,
      'ZERO_NATIVE_BALANCE',
      `Cüzdanın native ${String(balanceUnit || 'coin')} bakiyesi sıfır veya çok düşük.`
    );
  }

  score = Math.min(
    100,
    Math.max(0, Math.round(score))
  );

  let level = 'low';

  if (score >= 75) {
    level = 'critical';
  } else if (score >= 50) {
    level = 'high';
  } else if (score >= 25) {
    level = 'medium';
  }

  if (reasons.length === 0) {
    reasons.push(
      'Mevcut EVM zincir verilerinde belirgin davranışsal risk sinyali bulunmadı.'
    );
  }

  return {
    score,
    level,
    reasons,
    signals,

    network:
      String(network || '').trim().toLowerCase(),

    totalTransactions,
    successfulTransactions,
    failedTransactions,
    failedRatio:
      Number(failedRatio.toFixed(4)),

    incomingTransactions:
      incomingCount,

    outgoingTransactions:
      outgoingCount,

    uniqueCounterparties,

    uniqueIncomingAddresses,

    uniqueOutgoingAddresses,

    tokenTransferTransactions,

    distinctTokens,

    mintTransactions,

    burnTransactions,

    tokenCount:
      tokenList.length,

    balance:
      numericBalance,

    balanceUnit:
      balanceUnit || null,

    scamMatched
  };
};
const calculateSolanaWalletRisk = ({
  transactions,
  balance,
  address,
  scamIntelligence
}) => {
  let score = 0;
  const reasons = [];
  const signals = [];

  const normalizedAddress =
    String(address || '').trim();

  const txs =
    Array.isArray(transactions)
      ? transactions
      : [];

  const totalTransactions =
    txs.length;

  const failedTransactions =
    txs.filter(tx =>
      tx?.confirmed === false ||
      tx?.success === false
    ).length;

  const successfulTransactions =
    txs.filter(tx =>
      tx?.confirmed !== false &&
      tx?.success !== false
    ).length;

  const failedRatio =
    totalTransactions > 0
      ? failedTransactions / totalTransactions
      : 0;

  const incomingTransactions =
    txs.filter(tx =>
      String(tx?.to || '') === normalizedAddress
    );

  const outgoingTransactions =
    txs.filter(tx =>
      String(tx?.from || '') === normalizedAddress
    );

  const incomingAddresses = new Set();
  const outgoingAddresses = new Set();
  const counterparties = new Set();

  for (const tx of txs) {
    const from =
      String(tx?.from || '').trim();

    const to =
      String(tx?.to || '').trim();

    if (from && from !== normalizedAddress) {
      incomingAddresses.delete(from);
      counterparties.add(from);
    }

    if (to && to !== normalizedAddress) {
      outgoingAddresses.delete(to);
      counterparties.add(to);
    }

    if (
      to === normalizedAddress &&
      from &&
      from !== normalizedAddress
    ) {
      incomingAddresses.add(from);
    }

    if (
      from === normalizedAddress &&
      to &&
      to !== normalizedAddress
    ) {
      outgoingAddresses.add(to);
    }
  }

  const uniqueIncomingAddresses =
    incomingAddresses.size;

  const uniqueOutgoingAddresses =
    outgoingAddresses.size;

  const uniqueCounterparties =
    counterparties.size;

  const scamMatched =
    Boolean(scamIntelligence?.matched);

  const addRisk = (
    points,
    signal,
    reason
  ) => {
    score += points;
    signals.push(signal);
    reasons.push(reason);
  };

  if (scamMatched) {
    addRisk(
      80,
      'SCAM_INTELLIGENCE_MATCH',
      'Solana adresi scam intelligence veritabanında eşleşti.'
    );
  }

  if (totalTransactions === 0) {
    addRisk(
      1,
      'NO_SOLANA_ACTIVITY',
      'İncelenen Solana işlem penceresinde işlem bulunmadı.'
    );
  } else if (totalTransactions >= 20) {
    addRisk(
      8,
      'HIGH_SOLANA_ACTIVITY',
      'İncelenen Solana işlem penceresinde yüksek aktivite bulundu.'
    );
  } else if (totalTransactions >= 10) {
    addRisk(
      4,
      'ACTIVE_SOLANA_WALLET',
      'İncelenen Solana işlem penceresinde belirgin aktivite bulundu.'
    );
  }

  if (uniqueCounterparties >= 15) {
    addRisk(
      10,
      'MANY_SOLANA_COUNTERPARTIES',
      `${uniqueCounterparties} farklı adresle etkileşim tespit edildi.`
    );
  } else if (uniqueCounterparties >= 8) {
    addRisk(
      5,
      'MULTIPLE_SOLANA_COUNTERPARTIES',
      `${uniqueCounterparties} farklı adresle etkileşim tespit edildi.`
    );
  }

  if (
    incomingTransactions.length >= 5 &&
    uniqueIncomingAddresses >= 5
  ) {
    addRisk(
      8,
      'MANY_SOLANA_INCOMING_SOURCES',
      `${uniqueIncomingAddresses} farklı adresten Solana girişi tespit edildi.`
    );
  }

  if (
    outgoingTransactions.length >= 5 &&
    uniqueOutgoingAddresses >= 5
  ) {
    addRisk(
      8,
      'MANY_SOLANA_OUTGOING_DESTINATIONS',
      `${uniqueOutgoingAddresses} farklı adrese Solana çıkışı tespit edildi.`
    );
  }

  if (
    outgoingTransactions.length >= 5 &&
    uniqueOutgoingAddresses >= 4 &&
    incomingTransactions.length >= 2
  ) {
    addRisk(
      7,
      'SOLANA_DISTRIBUTION_PATTERN',
      'Fon girişlerinden sonra birden fazla adrese dağıtım davranışı gözlendi.'
    );
  }

  if (
    incomingTransactions.length >= 5 &&
    uniqueIncomingAddresses >= 4 &&
    outgoingTransactions.length <= 1
  ) {
    addRisk(
      5,
      'SOLANA_COLLECTION_PATTERN',
      'Birden fazla adresten yoğun Solana toplama davranışı gözlendi.'
    );
  }

  if (failedTransactions > 0) {
    if (failedRatio >= 0.5) {
      addRisk(
        18,
        'HIGH_SOLANA_FAILURE_RATE',
        `İncelenen işlemlerin %${Math.round(failedRatio * 100)} kadarı başarısız.`
      );
    } else if (failedRatio >= 0.25) {
      addRisk(
        10,
        'ELEVATED_SOLANA_FAILURE_RATE',
        `İncelenen işlemlerin %${Math.round(failedRatio * 100)} kadarı başarısız.`
      );
    } else {
      addRisk(
        4,
        'SOLANA_FAILED_TRANSACTIONS',
        'İncelenen Solana işlem geçmişinde başarısız işlemler bulundu.'
      );
    }
  }

  if (
    incomingTransactions.length >= 5 &&
    outgoingTransactions.length === 0
  ) {
    addRisk(
      4,
      'SOLANA_ONE_WAY_INBOUND',
      'İncelenen hareketlerde yalnızca Solana girişi görüldü.'
    );
  }

  if (
    totalTransactions >= 10 &&
    uniqueOutgoingAddresses >= 5
  ) {
    addRisk(
      6,
      'SOLANA_HIGH_DISTRIBUTION_ACTIVITY',
      'Yüksek işlem aktivitesi ile çok sayıda çıkış adresi birlikte görüldü.'
    );
  }

  if (
    Number(balance || 0) <= 0 &&
    totalTransactions > 0
  ) {
    addRisk(
      2,
      'ZERO_SOLANA_BALANCE',
      'Cüzdanın SOL bakiyesi sıfır veya çok düşük.'
    );
  }

  score = Math.min(
    100,
    Math.max(0, Math.round(score))
  );

  let level = 'low';

  if (score >= 75) {
    level = 'critical';
  } else if (score >= 50) {
    level = 'high';
  } else if (score >= 25) {
    level = 'medium';
  }

  if (reasons.length === 0) {
    reasons.push(
      'Mevcut Solana zincir verilerinde belirgin davranışsal risk sinyali bulunmadı.'
    );
  }

  return {
    score,
    level,
    reasons,
    signals,
    network: 'sol',
    totalTransactions,
    successfulTransactions,
    failedTransactions,
    failedRatio:
      Number(failedRatio.toFixed(4)),
    incomingTransactions:
      incomingTransactions.length,
    outgoingTransactions:
      outgoingTransactions.length,
    uniqueCounterparties,
    uniqueIncomingAddresses,
    uniqueOutgoingAddresses,
    balance:
      Number(balance || 0),
    balanceUnit: 'SOL',
    scamMatched
  };
};
const lookupScamIntelligence = async ({network,address}) => {
  const normalizedNetwork=String(network||'').trim().toLowerCase();

  /*
   * EVM adresleri lowercase olarak sorgulanabilir.
   * TRON adresleri Base58 olduğu için büyük/küçük harf
   * korunmalıdır; lowercase yapılması adresi bozar.
   */
  const rawAddress=String(address||'').trim();

  const normalizedAddress =
    normalizedNetwork==='tron'
      ? rawAddress
      : rawAddress.toLowerCase();

  if(!normalizedNetwork || !normalizedAddress){
    return {
      matched:false,
      matches:[],
      evidenceCount:0,
      queriedNetwork:normalizedNetwork
    };
  }

  try{
    /*
     * ScamSniffer açık kaynak adres havuzu EVM
     * ağlarını ortak "evm" altında tutuyor.
     *
     * Bu nedenle Ethereum / BSC / Polygon /
     * Arbitrum / Base / Optimism / Avalanche
     * sorgularını "evm" havuzuna bağlıyoruz.
     */
    const evmNetworks=[
      'ethereum',
      'bsc',
      'polygon',
      'arbitrum',
      'base',
      'optimism',
      'avalanche'
    ];

    const lookupNetworks=evmNetworks.includes(normalizedNetwork)
      ? [normalizedNetwork,'evm']
      : [normalizedNetwork];

    const matches=await db.scamAddress.findMany({
      where:{
        network:{
          in:lookupNetworks
        },
        address:normalizedAddress,
        active:true
      },
      select:{
        id:true,
        network:true,
        address:true,
        category:true,
        label:true,
        description:true,
        source:true,
        confidence:true,
        severity:true,
        firstSeenAt:true,
        lastSeenAt:true,
        evidences:{
          select:{
            id:true,
            relation:true,
            txid:true,
            category:true,
            description:true,
            confidence:true,
            createdAt:true
          },
          orderBy:{
            createdAt:'desc'
          },
          take:20
        }
      },
      orderBy:{
        severity:'desc'
      },
      take:10
    });

    const evidenceCount=matches.reduce(
      (total,item)=>total+(item.evidences?.length||0),
      0
    );

    return {
      matched:matches.length>0,
      queriedNetwork:normalizedNetwork,
      lookupNetworks,
      matches:matches.map(item=>({
        id:item.id,
        network:item.network,
        address:item.address,
        category:item.category,
        label:item.label||null,
        description:item.description||null,
        source:item.source||null,
        confidence:item.confidence,
        severity:item.severity,
        firstSeenAt:item.firstSeenAt,
        lastSeenAt:item.lastSeenAt,
        evidenceCount:item.evidences?.length||0,
        evidences:(item.evidences||[]).map(evidence=>({
          id:evidence.id,
          relation:evidence.relation,
          txid:evidence.txid||null,
          category:evidence.category,
          description:evidence.description||null,
          confidence:evidence.confidence,
          createdAt:evidence.createdAt
        }))
      })),
      evidenceCount
    };
  }catch(error){
    console.error('Scam intelligence lookup error:',error);

    return {
      matched:false,
      matches:[],
      evidenceCount:0,
      queriedNetwork:normalizedNetwork,
      error:'Scam intelligence lookup unavailable'
    };
  }
};
const lookupTransactionScamIntelligence = async ({
  network,
  walletAddress,
  transactions
}) => {

  const normalizedNetwork =
    String(network || '').trim().toLowerCase();

  const normalizedWallet =
    String(walletAddress || '').trim();

  if (
    !normalizedNetwork ||
    !normalizedWallet ||
    !Array.isArray(transactions) ||
    transactions.length === 0
  ) {
    return {
      matched:false,
      matchedCount:0,
      counterparties:[],
      transactionMatches:[]
    };
  }

  try {

    /*
     * Her transaction için karşı tarafı belirle:
     *
     * outgoing:
     *   karşı taraf = to
     *
     * incoming:
     *   karşı taraf = from
     *
     * Wallet adresi ile aynı adresi karşı taraf olarak
     * yanlışlıkla taramıyoruz.
     */

    const walletLower =
      normalizedNetwork === 'tron'
        ? normalizedWallet
        : normalizedWallet.toLowerCase();

    const counterpartyMap = new Map();

    for (const tx of transactions) {

      const from =
        String(tx?.from || '').trim();

      const to =
        String(tx?.to || '').trim();

      if (!from && !to) continue;

      let counterparty = '';

      if (
        from &&
        (
          normalizedNetwork === 'tron'
            ? from === normalizedWallet
            : from.toLowerCase() === walletLower
        )
      ) {
        counterparty = to;
      } else if (
        to &&
        (
          normalizedNetwork === 'tron'
            ? to === normalizedWallet
            : to.toLowerCase() === walletLower
        )
      ) {
        counterparty = from;
      } else {

        /*
         * Adapter bazı işlemlerde direction bilgisi veriyorsa
         * onu da fallback olarak kullan.
         */

        if (
          String(tx?.direction || '').toLowerCase() === 'outgoing'
        ) {
          counterparty = to;
        } else if (
          String(tx?.direction || '').toLowerCase() === 'incoming'
        ) {
          counterparty = from;
        }
      }

      if (!counterparty) continue;

      const normalizedCounterparty =
        normalizedNetwork === 'tron'
          ? counterparty
          : counterparty.toLowerCase();

      if (!normalizedCounterparty) continue;

      if (
        normalizedCounterparty ===
        (
          normalizedNetwork === 'tron'
            ? normalizedWallet
            : walletLower
        )
      ) {
        continue;
      }

      if (!counterpartyMap.has(normalizedCounterparty)) {
        counterpartyMap.set(
          normalizedCounterparty,
          counterparty
        );
      }
    }

    const counterpartyAddresses =
      Array.from(counterpartyMap.keys());

    if (counterpartyAddresses.length === 0) {
      return {
        matched:false,
        matchedCount:0,
        counterparties:[],
        transactionMatches:[]
      };
    }

    /*
     * EVM ağlarında hem gerçek network hem de ortak "evm"
     * havuzunu kontrol ediyoruz.
     */
    const evmNetworks = [
      'ethereum',
      'bsc',
      'polygon',
      'arbitrum',
      'base',
      'optimism',
      'avalanche'
    ];

    const lookupNetworks =
      evmNetworks.includes(normalizedNetwork)
        ? [normalizedNetwork, 'evm']
        : [normalizedNetwork];

    /*
     * ScamAddress kayıtlarını tek sorguda çekiyoruz.
     */

    const matches = await db.scamAddress.findMany({
      where:{
        network:{
          in:lookupNetworks
        },
        address:{
          in:counterpartyAddresses,
          mode:'insensitive'
        },
        active:true
      },
      select:{
        id:true,
        network:true,
        address:true,
        category:true,
        label:true,
        description:true,
        source:true,
        confidence:true,
        severity:true,
        firstSeenAt:true,
        lastSeenAt:true,
        evidences:{
          select:{
            id:true,
            relation:true,
            txid:true,
            category:true,
            description:true,
            confidence:true,
            createdAt:true
          },
          orderBy:{
            createdAt:'desc'
          },
          take:20
        }
      },
      orderBy:{
        severity:'desc'
      },
      take:100
    });

    /*
     * Hızlı adres -> scam kaydı eşleştirme haritası.
     */
    const matchMap = new Map();

    for (const item of matches) {

      const key =
        normalizedNetwork === 'tron'
          ? String(item.address || '').trim()
          : String(item.address || '').trim().toLowerCase();

      if (!key) continue;

      if (!matchMap.has(key)) {
        matchMap.set(key, item);
      }
    }

    /*
     * Scam bulunan transaction'ları tespit et.
     */
    const transactionMatches = [];

    for (const tx of transactions) {

      const from =
        String(tx?.from || '').trim();

      const to =
        String(tx?.to || '').trim();

      if (!from && !to) continue;

      let counterparty = '';

      if (
        from &&
        (
          normalizedNetwork === 'tron'
            ? from === normalizedWallet
            : from.toLowerCase() === walletLower
        )
      ) {
        counterparty = to;
      } else if (
        to &&
        (
          normalizedNetwork === 'tron'
            ? to === normalizedWallet
            : to.toLowerCase() === walletLower
        )
      ) {
        counterparty = from;
      } else {

        if (
          String(tx?.direction || '').toLowerCase() === 'outgoing'
        ) {
          counterparty = to;
        } else if (
          String(tx?.direction || '').toLowerCase() === 'incoming'
        ) {
          counterparty = from;
        }
      }

      if (!counterparty) continue;

      const key =
        normalizedNetwork === 'tron'
          ? counterparty
          : counterparty.toLowerCase();

      const scam = matchMap.get(key);

      if (!scam) continue;

      transactionMatches.push({
        txid:String(tx?.txid || tx?.hash || '').trim() || null,
        blockNumber:tx?.blockNumber ?? null,
        direction:tx?.direction || null,
        type:tx?.type || null,
        amount:tx?.amount ?? null,
        token:tx?.token || null,
        tokenName:tx?.tokenName || null,
        tokenAddress:tx?.tokenAddress || null,
        from:from || null,
        to:to || null,
        counterparty,
        scamIntelligence:{
          matched:true,
          network:scam.network,
          address:scam.address,
          category:scam.category,
          label:scam.label || null,
          description:scam.description || null,
          source:scam.source || null,
          confidence:scam.confidence,
          severity:scam.severity,
          firstSeenAt:scam.firstSeenAt,
          lastSeenAt:scam.lastSeenAt,
          evidenceCount:scam.evidences?.length || 0,
          evidences:(scam.evidences || []).map(evidence => ({
            id:evidence.id,
            relation:evidence.relation,
            txid:evidence.txid || null,
            category:evidence.category,
            description:evidence.description || null,
            confidence:evidence.confidence,
            createdAt:evidence.createdAt
          }))
        }
      });
    }

    const counterparties =
      matches.map(item => ({
        address:item.address,
        network:item.network,
        category:item.category,
        label:item.label || null,
        description:item.description || null,
        source:item.source || null,
        confidence:item.confidence,
        severity:item.severity,
        evidenceCount:item.evidences?.length || 0,
        evidences:(item.evidences || []).map(evidence => ({
          id:evidence.id,
          relation:evidence.relation,
          txid:evidence.txid || null,
          category:evidence.category,
          description:evidence.description || null,
          confidence:evidence.confidence,
          createdAt:evidence.createdAt
        }))
      }));

    return {
      matched:transactionMatches.length > 0,
      matchedCount:transactionMatches.length,
      counterparties,
      transactionMatches
    };

  } catch(error) {

    console.error(
      'Transaction scam intelligence lookup error:',
      error
    );

    return {
      matched:false,
      matchedCount:0,
      counterparties:[],
      transactionMatches:[],
      error:'Transaction scam intelligence unavailable'
    };
  }
};
const tronHexToBase58 = (hex) => {
  if (!hex) return null;

  const clean = String(hex).trim().replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]{42}$/.test(clean)) return null;
  if (!clean.toLowerCase().startsWith('41')) return null;

  const payload = Buffer.from(clean, 'hex');
  const firstHash = createHash('sha256').update(payload).digest();
  const secondHash = createHash('sha256').update(firstHash).digest();

  return bs58.encode(
    Buffer.concat([payload, secondHash.subarray(0, 4)])
  );
};

const formatTronTimestamp = (timestamp) => {
  if (!timestamp) {
    return {date: null, time: null};
  }

  const d = new Date(Number(timestamp));

  if (Number.isNaN(d.getTime())) {
    return {date: null, time: null};
  }

  return {
    date: d.toLocaleDateString('tr-TR'),
    time: d.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
};

if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32) throw new Error('JWT_SECRET must be at least 32 chars');
const allowedCorsOrigins=String(process.env.CORS_ORIGIN||'').split(',').map(value=>value.trim()).filter(Boolean);
if(process.env.NODE_ENV==='production'&&allowedCorsOrigins.length===0) throw new Error('CORS_ORIGIN is required in production');
app.set('trust proxy',1);
app.use(helmet());
app.use(cors({
  origin(origin,callback){
    if(!origin||allowedCorsOrigins.includes(origin)) return callback(null,true);
    return callback(new Error('CORS origin is not allowed'));
  },
  credentials:false
}));
app.use(express.json({limit:'200kb'}));
app.use(rateLimit({windowMs:60_000,max:120,standardHeaders:true,legacyHeaders:false}));
const loginLimiter=rateLimit({
  windowMs:15*60*1000,
  max:10,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many login attempts. Please try again later.'}
});

const walletScanLimiter=rateLimit({
  windowMs:5*60*1000,
  max:20,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many wallet scan requests. Please try again later.'}
});

const vaultMonitorLimiter=rateLimit({
  windowMs:5*60*1000,
  max:10,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many vault monitor requests. Please try again later.'}
});

const allowanceLimiter=rateLimit({
  windowMs:5*60*1000,
  max:15,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many allowance scan requests. Please try again later.'}
});

const revokeLimiter=rateLimit({
  windowMs:5*60*1000,
  max:10,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many revoke requests. Please try again later.'}
});

const vipVerifyLimiter=rateLimit({
  windowMs:15*60*1000,
  max:5,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many VIP verification requests. Please try again later.'}
});
const registerLimiter=rateLimit({
  windowMs:15*60*1000,
  max:5,
  standardHeaders:'draft-7',
  legacyHeaders:false,
  message:{success:false,error:'Too many registration attempts. Please try again later.'}
});
const securityEvent=async(req,data={})=>{
  try{
    await db.securityEvent.create({
      data:{
        userId:data.userId||null,
        eventType:data.eventType||"UNKNOWN",
        severity:data.severity||"INFO",
        ipAddress:req.ip||null,
        userAgent:req.get("user-agent")||null,
        endpoint:req.originalUrl||null,
        method:req.method||null,
        success:data.success!==false,
        details:data.details?JSON.stringify(data.details):null
      }
    });
  }catch(error){
    console.error("[SECURITY EVENT] write failed:",error.message);
  }
};

const auth=async(req,res,next)=>{
  try{
    const t=req.headers.authorization?.replace(/^Bearer /,"");
    if(!t){
      await securityEvent(req,{eventType:"AUTH_MISSING_TOKEN",severity:"WARNING",success:false});
      return res.status(401).json({error:"Unauthorized"});
    }

    const {payload}=await jwtVerify(t,secret);

    if(!payload.sub||!payload.jti){
      await securityEvent(req,{eventType:"AUTH_INVALID_CLAIMS",severity:"WARNING",success:false});
      return res.status(401).json({error:"Invalid token"});
    }

    const session=await db.authSession.findUnique({
      where:{jti:String(payload.jti)}
    });

    if(!session||session.userId!==String(payload.sub)||session.revokedAt||session.expiresAt<=new Date()){
      await securityEvent(req,{
        userId:String(payload.sub),
        eventType:"AUTH_SESSION_REJECTED",
        severity:"WARNING",
        success:false
      });
      return res.status(401).json({error:"Session expired or revoked"});
    }

    req.user={
      id:String(payload.sub),
      email:payload.email,
      jti:String(payload.jti),
      sessionId:session.id
    };

    next();
  }catch(error){
    await securityEvent(req,{eventType:"AUTH_INVALID_TOKEN",severity:"WARNING",success:false});
    return res.status(401).json({error:"Invalid token"});
  }
};

const token=async(u,req)=>{
  const jti=randomUUID();
  const expiresAt=new Date(Date.now()+7*24*60*60*1000);

  await db.authSession.create({
    data:{
      jti,
      userId:u.id,
      expiresAt,
      ipAddress:req.ip||null,
      userAgent:req.get("user-agent")||null
    }
  });

  return new SignJWT({email:u.email})
    .setProtectedHeader({alg:"HS256"})
    .setSubject(u.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
};

app.get('/health',async(_,res)=>{
  try{
    await db.$queryRaw`SELECT 1`;
    return res.json({ok:true,database:'connected'});
  }catch(error){
    console.error('Health database check failed:',error?.code||error?.name||'unknown');
    return res.status(503).json({ok:false,database:'unavailable'});
  }
});
/*
 * V22-C MARKET INTELLIGENCE
 * Gerçek CoinGecko global market verisi + deterministik analiz.
 * Sahte AI/LLM sonucu üretilmez.
 */
app.get('/api/market-intelligence', auth, async (req, res) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/global',
      {
        headers: {
          accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }

    const payload = await response.json();
    const data = payload?.data;

    if (!data) {
      throw new Error('CoinGecko global market verisi bulunamadı.');
    }

    const totalMarketCapUsd =
      Number(data.total_market_cap?.usd || 0);

    const totalVolumeUsd =
      Number(data.total_volume?.usd || 0);

    const marketCapChange24hPct =
      Number(data.market_cap_change_percentage_24h_usd || 0);

    const btcDominancePct =
      Number(data.market_cap_percentage?.btc || 0);

    const ethDominancePct =
      Number(data.market_cap_percentage?.eth || 0);

    const volumeToMarketCapRatio =
      totalMarketCapUsd > 0
        ? totalVolumeUsd / totalMarketCapUsd
        : 0;

    let score = 50;

    score += Math.max(
      -30,
      Math.min(30, marketCapChange24hPct * 8)
    );

    if (volumeToMarketCapRatio >= 0.15) {
      score += 5;
    } else if (volumeToMarketCapRatio < 0.05) {
      score -= 5;
    }

    score = Math.max(
      0,
      Math.min(100, Math.round(score))
    );

    let sentiment = 'NEUTRAL';
    let riskLevel = 'MEDIUM';

    if (score >= 60) {
      sentiment = 'BULLISH';
      riskLevel = 'LOW';
    } else if (score <= 40) {
      sentiment = 'BEARISH';
      riskLevel = 'HIGH';
    }

    const signals = [];

    if (marketCapChange24hPct > 0) {
      signals.push('Toplam piyasa değeri son 24 saatte yükseliyor.');
    } else if (marketCapChange24hPct < 0) {
      signals.push('Toplam piyasa değeri son 24 saatte geriliyor.');
    }

    if (volumeToMarketCapRatio >= 0.15) {
      signals.push('Piyasa işlem hacmi güçlü.');
    } else if (volumeToMarketCapRatio < 0.05) {
      signals.push('Piyasa işlem hacmi düşük.');
    }

    if (btcDominancePct > 55) {
      signals.push('BTC piyasa hakimiyeti yüksek.');
    }

    const recommendation =
      sentiment === 'BULLISH'
        ? 'Piyasa görünümü pozitif; yine de işlem öncesi varlık ve sözleşme bazlı risk kontrolü yapılmalıdır.'
        : sentiment === 'BEARISH'
          ? 'Piyasa görünümü negatif; yüksek riskli işlemlerde ekstra dikkat önerilir.'
          : 'Piyasa görünümü nötr; işlem öncesi varlık ve sözleşme bazlı risk kontrolü yapılmalıdır.';

    return res.json({
      success: true,
      source: 'COINGECKO',
      sourceType: 'LIVE_MARKET_DATA',
      analysisType: 'RULE_BASED_MARKET_INTELLIGENCE',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,

      score,
      sentiment,
      riskLevel,

      socialVolume: totalVolumeUsd,
      whaleAccumulation: 'NOT_AVAILABLE_FROM_GLOBAL_MARKET_DATA',
      recommendation,

      market: {
        totalMarketCapUsd,
        totalVolumeUsd,
        marketCapChange24hPct,
        btcDominancePct,
        ethDominancePct,
        volumeToMarketCapRatio
      },

      signals,

      disclaimer:
        'Bu sonuç gerçek piyasa verilerinden üretilen kural tabanlı analizdir; yatırım tavsiyesi değildir.'
    });
  } catch (error) {
    console.error(
      '[MARKET-INTELLIGENCE]',
      error?.message || error
    );

    return res.status(502).json({
      success: false,
      source: 'COINGECKO',
      error: 'Canlı piyasa verisi alınamadı.'
    });
  }
});

app.get('/api/live-prices', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tron,solana,bitcoin,avalanche-2,arbitrum,polygon-ecosystem-token,ethereum,binancecoin,pi-network&vs_currencies=usd'
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'CoinGecko request failed',
        status: response.status
      });
    }

    const data = await response.json();

    res.json({
      success: true,
      prices: data
    });
  } catch (error) {
    console.error('CoinGecko backend error:', error);

    res.status(502).json({
      error: 'CoinGecko unavailable'
    });
  }
});
app.post('/api/auth/register',registerLimiter,async(req,res)=>{const p=z.object({name:z.string().min(2).max(80),email:z.string().email(),password:z.string().min(10).max(128)}).safeParse(req.body); if(!p.success)return res.status(400).json({error:'Invalid input'}); const exists=await db.user.findUnique({where:{email:p.data.email.toLowerCase()}}); if(exists)return res.status(409).json({error:'Email already registered'}); const u=await db.user.create({data:{name:p.data.name,email:p.data.email.toLowerCase(),passwordHash:await bcrypt.hash(p.data.password,12)}}); res.status(201).json({token:await token(u,req),user:{id:u.id,name:u.name,email:u.email,status:'free'}})});
app.post('/api/auth/login',loginLimiter,async(req,res)=>{const p=z.object({email:z.string().email(),password:z.string().min(1)}).safeParse(req.body); if(!p.success)return res.status(400).json({error:'Invalid input'}); const u=await db.user.findUnique({where:{email:p.data.email.toLowerCase()}}); if(!u||!await bcrypt.compare(p.data.password,u.passwordHash)){
  await securityEvent(req,{
    userId:u?.id||null,
    eventType:"LOGIN_FAILURE",
    severity:"WARNING",
    success:false,
    details:{
      reason:u?"INVALID_PASSWORD":"USER_NOT_FOUND"
    }
  });
  return res.status(401).json({error:'Invalid credentials'});
} const sub=await db.subscription.findUnique({where:{userId:u.id}}); res.json({token:await token(u,req),user:{id:u.id,name:u.name,email:u.email,status:sub?.status==='ACTIVE'&&sub.expiresAt>new Date()?'vip':'free'}})});
app.post('/api/auth/logout',auth,async(req,res)=>{
  try{
    await db.authSession.update({
      where:{id:req.user.sessionId},
      data:{revokedAt:new Date()}
    });

    await securityEvent(req,{
      userId:req.user.id,
      eventType:"AUTH_LOGOUT",
      severity:"INFO",
      success:true
    });

    return res.json({success:true});
  }catch(error){
    console.error("[AUTH LOGOUT] error:",error);
    return res.status(500).json({error:"Logout failed"});
  }
});
app.get('/api/me',auth,async(req,res)=>{const u=await db.user.findUnique({where:{id:req.user.id},include:{subscription:true}}); res.json({user:{id:u.id,name:u.name,email:u.email,status:u.subscription?.status==='ACTIVE'&&u.subscription.expiresAt>new Date()?'vip':'free',expiresAt:u.subscription?.expiresAt||null}})});
app.delete('/api/me',auth,async(req,res)=>{
  const parsed=z.object({confirmation:z.literal('DELETE')}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Account deletion confirmation is required'});

  await db.$transaction(async(tx)=>{
    await tx.securityEvent.updateMany({where:{userId:req.user.id},data:{userId:null}});
    await tx.user.delete({where:{id:req.user.id}});
  });

  return res.status(204).end();
});
app.post('/api/vip/verify',vipVerifyLimiter,auth,async(req,res)=>{
  try{
    const p=z.object({
      txid:z.string().regex(/^[a-fA-F0-9]{64}$/,'Invalid TXID'),
      plan:z.enum(['monthly','yearly']).default('monthly')
    }).safeParse(req.body);

    if(!p.success){
      return res.status(400).json({error:'Invalid TXID or plan'});
    }

    const txid=p.data.txid;

    const old=await db.payment.findUnique({
      where:{txid}
    });

    if(old){
      if(old.userId!==req.user.id){
        return res.status(409).json({error:'TXID already used'});
      }

      if(old.status==='CONFIRMED'){
        return res.status(409).json({error:'TXID already confirmed'});
      }
    }

    const expectedRaw=p.data.plan==='yearly'
      ? String(process.env.VIP_YEARLY_USDT||'1000').trim()
      : String(process.env.VIP_MONTHLY_USDT||'100').trim();

    const expected=Number(expectedRaw);

    if(!Number.isFinite(expected)||expected<=0){
      console.error('Invalid VIP USDT price:',expectedRaw);
      return res.status(503).json({error:'VIP payment configuration is invalid'});
    }

    const expectedUnits=BigInt(
      Math.round(expected*1_000_000)
    );

    const vipAddress=String(
      process.env.VIP_TRON_ADDRESS||''
    ).trim();

    const usdtContract=String(
      process.env.VIP_USDT_CONTRACT||
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    ).trim();

    if(!vipAddress||!usdtContract){
      console.error('VIP USDT configuration is incomplete');
      return res.status(503).json({
        error:'VIP payment is temporarily unavailable'
      });
    }

    const hexToBase58=(hex)=>{
      const clean=String(hex||'')
        .replace(/^0x/i,'')
        .toUpperCase();

      if(!/^[0-9A-F]{42}$/.test(clean)){
        throw new Error('Invalid TRON hex address');
      }

      const bytes=Buffer.from(clean,'hex');
      const payload=bytes.subarray(0,21);

      const hash1=createHash('sha256')
        .update(payload)
        .digest();

      const hash2=createHash('sha256')
        .update(hash1)
        .digest();

      const full=Buffer.concat([
        payload,
        hash2.subarray(0,4)
      ]);

      return bs58.encode(full);
    };

    const rpc=String(
      process.env.TRON_RPC||'https://api.trongrid.io'
    ).replace(/\/$/,'');

    const tronGridApiKey=String(process.env.TRONGRID_API_KEY||'').trim();

    if(!tronGridApiKey){
      console.error('TRON provider configuration error: TRONGRID_API_KEY is missing');

      await securityEvent(req,{
        userId:req.user.id,
        eventType:'VIP_PROVIDER_CONFIG_MISSING',
        severity:'CRITICAL',
        success:false
      });

      return res.status(503).json({
        success:false,
        error:'TRON payment provider is not configured'
      });
    }
    const headers={
      'Content-Type':'application/json'
    };

    if(process.env.TRONGRID_API_KEY){
      headers['TRON-PRO-API-KEY']=
        process.env.TRONGRID_API_KEY;
    }

    const txResponse=await fetch(
      `${rpc}/v1/transactions/${encodeURIComponent(txid)}`,
      {headers}
    );

    if(!txResponse.ok){
      console.error(
        'TRON transaction lookup error:',
        txResponse.status
      );

      return res.status(502).json({
        error:'Unable to verify transaction'
      });
    }

    const txJson=await txResponse.json();
    const tx=txJson?.data?.[0];

    if(!tx){
      return res.status(400).json({
        error:'Transaction not found'
      });
    }

    if(tx.ret?.[0]?.contractRet!=='SUCCESS'){
      return res.status(400).json({
        error:'Transaction failed'
      });
    }

    const contracts=tx.raw_data?.contract||[];

    if(contracts.length!==1){
      return res.status(400).json({
        error:'Unsupported transaction'
      });
    }

    const contract=contracts[0];

    if(contract.type!=='TriggerSmartContract'){
      return res.status(400).json({
        error:'VIP payment must be a USDT TRC20 transfer'
      });
    }

    const value=contract.parameter?.value||{};

    const contractHex=String(
      value.contract_address||''
    ).trim();

    const ownerHex=String(
      value.owner_address||''
    ).trim();

    const data=String(
      value.data||''
    ).replace(/^0x/i,'').toLowerCase();

    if(!contractHex||!ownerHex||!data){
      return res.status(400).json({
        error:'Invalid TRC20 transaction'
      });
    }

    let contractAddress;

    try{
      contractAddress=hexToBase58(contractHex);
    }catch(error){
      console.error(
        'USDT contract decode error:',
        error.message
      );

      return res.status(400).json({
        error:'Invalid token contract'
      });
    }

    if(
      contractAddress.trim().toLowerCase() !==
      usdtContract.trim().toLowerCase()
    ){
      return res.status(400).json({
        error:'Transaction is not USDT TRC20'
      });
    }

    if(!/^[0-9a-f]+$/.test(data)){
      return res.status(400).json({
        error:'Invalid TRC20 transfer data'
      });
    }

    if(data.length!==136){
      return res.status(400).json({
        error:'Unsupported TRC20 method'
      });
    }

    const method=data.slice(0,8);

    if(method!=='a9059cbb'){
      return res.status(400).json({
        error:'VIP payment must use USDT transfer'
      });
    }

    const recipientWord=data.slice(8,72);
    const amountWord=data.slice(72,136);

    if(
      !/^[0-9a-f]{64}$/.test(recipientWord)||
      !/^[0-9a-f]{64}$/.test(amountWord)
    ){
      return res.status(400).json({
        error:'Invalid USDT transfer data'
      });
    }

    const recipientHex=
      '41'+recipientWord.slice(-40);

    let destination;

    try{
      destination=hexToBase58(recipientHex);
    }catch(error){
      console.error(
        'USDT destination decode error:',
        error.message
      );

      return res.status(400).json({
        error:'Invalid USDT destination'
      });
    }

    if(
      destination.trim().toLowerCase() !==
      vipAddress.trim().toLowerCase()
    ){
      return res.status(400).json({
        error:'Payment was not sent to the VIP address'
      });
    }

    let amountUnits;

    try{
      amountUnits=BigInt('0x'+amountWord);
    }catch(error){
      console.error(
        'USDT amount decode error:',
        error.message
      );

      return res.status(400).json({
        error:'Invalid USDT amount'
      });
    }

    if(amountUnits<=0n){
      return res.status(400).json({
        error:'Invalid USDT amount'
      });
    }

    if(amountUnits<expectedUnits){
      return res.status(400).json({
        error:'Insufficient payment'
      });
    }

    const txInfoResponse=await fetch(
      `${rpc}/walletsolidity/gettransactioninfobyid`,
      {
        method:'POST',
        headers,
        body:JSON.stringify({
          value:txid
        })
      }
    );

    if(!txInfoResponse.ok){
      console.error(
        'TRON transaction info error:',
        txInfoResponse.status
      );

      return res.status(502).json({
        error:'Unable to confirm transaction'
      });
    }

    const txInfo=await txInfoResponse.json();

    const receiptResult=txInfo?.receipt?.result;

    if(!receiptResult){
      return res.status(409).json({
        error:'Payment confirmation is pending'
      });
    }

    if(receiptResult!=='SUCCESS'){
      return res.status(400).json({
        error:'USDT transaction execution failed'
      });
    }

    const transferTopic=ethers.id('Transfer(address,address,uint256)').replace(/^0x/i,'').toLowerCase();

    const logs=Array.isArray(txInfo?.log)
      ? txInfo.log
      : [];

    const normalizedOwnerHexForEvent=String(
      ownerHex||''
    ).replace(/^0x/i,'').toLowerCase();

    if(
      !/^[0-9a-f]{42}$/.test(normalizedOwnerHexForEvent) &&
      !/^[0-9a-f]{40}$/.test(normalizedOwnerHexForEvent)
    ){
      return res.status(400).json({
        error:'Invalid transaction owner address'
      });
    }

    const ownerComparableForEvent=
      normalizedOwnerHexForEvent.length===42
        ? normalizedOwnerHexForEvent.slice(-40)
        : normalizedOwnerHexForEvent;

    const usdtTransferLog=logs.find(log=>{
      const address=String(
        log?.address||''
      ).trim().replace(/^0x/i,'').toLowerCase();

      const topics=Array.isArray(log?.topics)
        ? log.topics.map(v=>String(v||'').replace(/^0x/i,'').toLowerCase())
        : [];

      if(
        address!==contractHex.replace(/^0x/i,'').slice(-40).toLowerCase() ||
        topics.length<3 ||
        topics[0]!==transferTopic
      ){
        return false;
      }

      const candidateFromWord=String(
        topics[1]||''
      ).replace(/^0x/i,'').toLowerCase();

      const candidateToWord=String(
        topics[2]||''
      ).replace(/^0x/i,'').toLowerCase();

      const candidateData=String(
        log?.data||''
      ).replace(/^0x/i,'').toLowerCase();

      if(
        !/^[0-9a-f]{64}$/.test(candidateFromWord) ||
        !/^[0-9a-f]{64}$/.test(candidateToWord) ||
        !/^[0-9a-f]{64}$/.test(candidateData)
      ){
        return false;
      }

      if(candidateFromWord.slice(-40)!==ownerComparableForEvent){
        return false;
      }

      let candidateDestination;
      try{
        candidateDestination=hexToBase58('41'+candidateToWord.slice(-40));
      }catch(error){
        return false;
      }

      if(
        candidateDestination.trim().toLowerCase()!==
        vipAddress.trim().toLowerCase()
      ){
        return false;
      }

      let candidateAmount;
      try{
        candidateAmount=BigInt('0x'+candidateData);
      }catch(error){
        return false;
      }

      return candidateAmount>=expectedUnits;
    });

    if(!usdtTransferLog){
      return res.status(400).json({
        error:'Verified USDT Transfer event not found'
      });
    }

    const transferTopics=usdtTransferLog.topics;

    const fromWord=String(
      transferTopics[1]||''
    ).replace(/^0x/i,'').toLowerCase();

    const toWord=String(
      transferTopics[2]||''
    ).replace(/^0x/i,'').toLowerCase();

    const transferData=String(
      usdtTransferLog.data||''
    ).replace(/^0x/i,'').toLowerCase();

    if(
      !/^[0-9a-f]{64}$/.test(fromWord) ||
      !/^[0-9a-f]{64}$/.test(toWord) ||
      !/^[0-9a-f]{64}$/.test(transferData)
    ){
      return res.status(400).json({
        error:'Invalid USDT Transfer event'
      });
    }

    const eventRecipientHex='41'+toWord.slice(-40);

    let eventDestination;

    try{
      eventDestination=hexToBase58(eventRecipientHex);
    }catch(error){
      return res.status(400).json({
        error:'Invalid Transfer event recipient'
      });
    }

    if(
      eventDestination.trim().toLowerCase() !==
      vipAddress.trim().toLowerCase()
    ){
      return res.status(400).json({
        error:'Transfer event recipient mismatch'
      });
    }

    let eventAmount;

    try{
      eventAmount=BigInt('0x'+transferData);
    }catch(error){
      return res.status(400).json({
        error:'Invalid Transfer event amount'
      });
    }

    if(eventAmount<expectedUnits){
      return res.status(400).json({
        error:'Transfer event amount insufficient'
      });
    }
    const days=p.data.plan==='yearly'
      ? 365
      : 30;

    const now=new Date();

    const current=await db.subscription.findUnique({
      where:{userId:req.user.id}
    });

    const baseDate=
      current?.status==='ACTIVE' &&
      current.expiresAt>now
        ? current.expiresAt
        : now;

    const expiresAt=new Date(
      baseDate.getTime()+days*86400000
    );

    await db.$transaction([
      db.payment.upsert({
        where:{txid},
        update:{
          status:'CONFIRMED',
          plan:p.data.plan,
          expectedAmount:expected
        },
        create:{
          userId:req.user.id,
          plan:p.data.plan,
          expectedAmount:expected,
          txid,
          status:'CONFIRMED'
        }
      }),

      db.subscription.upsert({
        where:{userId:req.user.id},
        update:{
          plan:p.data.plan,
          status:'ACTIVE',
          txid,
          startsAt:current?.startsAt||now,
          expiresAt
        },
        create:{
          userId:req.user.id,
          plan:p.data.plan,
          status:'ACTIVE',
          txid,
          expiresAt
        }
      })
    ]);

    return res.json({
      ok:true,
      status:'vip',
      payment:'USDT_TRC20',
      amount:amountUnits.toString(),
      expiresAt
    });

  }catch(error){
    console.error(
      'VIP USDT verification error:',
      error
    );

    return res.status(500).json({
      error:'VIP verification failed'
    });
  }
});/*
 * TRANSFER SHIELD
 * Alıcı adresini Scam Intelligence havuzunda kontrol eder.
 */
/*
 * ============================================================
 * PHISHING SHIELD
 * URLhaus local threat-intelligence index.
 *
 * NOTE:
 * URLhaus malicious URL istihbaratı sağlar.
 * Bu endpoint sadece "phishing" etiketi taşıyan host eşleşmelerini
 * phishing olarak sınıflandırır.
 * Bilinmeyen URL güvenli kabul edilmez.
 * ============================================================
 */

const urlhausThreatIndex = new Map();
const urlhausPhishingHostIndex = new Map();

try{
  const urlhausFile='./urlhaus-recent-unpacked/urlhaus_full.json';

  if(fs.existsSync(urlhausFile)){
    const raw=fs.readFileSync(
      urlhausFile,
      'utf8'
    );

    const data=JSON.parse(raw);

    for(const entries of Object.values(data||{})){

      if(!Array.isArray(entries)){
        continue;
      }

      for(const entry of entries){

        const rawUrl=String(
          entry?.url||''
        ).trim();

        if(!rawUrl){
          continue;
        }

        let parsed;

        try{
          parsed=new URL(rawUrl);
        }catch{
          continue;
        }

        const normalizedUrl=
          rawUrl
            .toLowerCase()
            .replace(/\/$/,'');

        const tags=
          Array.isArray(entry?.tags)
            ? entry.tags.map(
                tag=>String(tag).toLowerCase()
              )
            : [];

        const threat=
          String(entry?.threat||'');

        const status=
          String(
            entry?.url_status ||
            entry?.status ||
            ''
          ).toLowerCase();

        const record={
          url:rawUrl,
          hostname:parsed.hostname.toLowerCase(),
          tags,
          threat,
          status,
          dateadded:String(
            entry?.dateadded||''
          )
        };

        urlhausThreatIndex.set(
          normalizedUrl,
          record
        );

        if(
          tags.includes('phishing') ||
          /phishing/i.test(threat)
        ){
          const hostKey=
            parsed.hostname.toLowerCase();

          if(!urlhausPhishingHostIndex.has(hostKey)){
            urlhausPhishingHostIndex.set(
              hostKey,
              []
            );
          }

          urlhausPhishingHostIndex
            .get(hostKey)
            .push(record);
        }
      }
    }

    console.log(
      `[PHISHING] URLhaus index loaded: ${urlhausThreatIndex.size} URL`
    );

    console.log(
      `[PHISHING] Phishing host index: ${urlhausPhishingHostIndex.size} host`
    );

  }else{
    console.warn(
      '[PHISHING] URLhaus file not found:',
      urlhausFile
    );
  }

}catch(error){

  console.error(
    '[PHISHING] URLhaus index load failed:',
    error?.message||error
  );
}

/*
 * ============================================================
 * PHISHING CHECK
 * ============================================================
 */

app.post('/api/check-phishing',auth,async(req,res)=>{

  const p=z.object({
    url:z.string().min(4).max(4096)
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid URL'
    });
  }

  const inputUrl=
    String(
      p.data.url
    ).trim();

  let parsed;

  try{
    parsed=new URL(inputUrl);
  }catch{
    return res.status(400).json({
      success:false,
      error:'Invalid URL format'
    });
  }

  if(
    parsed.protocol!=='http:' &&
    parsed.protocol!=='https:'
  ){
    return res.status(400).json({
      success:false,
      error:'Only HTTP/HTTPS URLs are supported'
    });
  }

  const normalizedUrl=
    inputUrl
      .toLowerCase()
      .replace(/\/$/,'');

  const hostname=
    parsed.hostname.toLowerCase();

  const exact=
    urlhausThreatIndex.get(
      normalizedUrl
    );

  if(exact){

    const isPhishing=
      exact.tags.includes('phishing') ||
      /phishing/i.test(exact.threat);

    return res.json({
      success:true,
      url:inputUrl,
      hostname,
      matched:true,
      matchType:isPhishing
        ? 'EXACT_PHISHING_URL'
        : 'EXACT_MALICIOUS_URL',
      riskLevel:'HIGH',
      status:'TEHLIKELI',
      source:'URLHAUS',
      phishing:isPhishing,
      malicious:true,
      summary:isPhishing
        ? 'URLhaus verisinde bu URL için phishing eşleşmesi bulundu.'
        : 'URLhaus verisinde bu URL için kötü amaçlı URL eşleşmesi bulundu.',
      matchedRecord:{
        url:exact.url,
        hostname:exact.hostname,
        tags:exact.tags,
        threat:exact.threat,
        status:exact.status,
        dateadded:exact.dateadded
      }
    });
  }

  const phishingHosts=
    urlhausPhishingHostIndex.get(hostname) || [];

  if(phishingHosts.length>0){

    const record=
      phishingHosts[0];

    return res.json({
      success:true,
      url:inputUrl,
      hostname,
      matched:true,
      matchType:'PHISHING_HOST',
      riskLevel:'HIGH',
      status:'TEHLIKELI',
      source:'URLHAUS',
      phishing:true,
      malicious:true,
      summary:'Alan adı URLhaus phishing istihbaratında eşleşti.',
      matchedRecord:{
        url:record.url,
        hostname:record.hostname,
        tags:record.tags,
        threat:record.threat,
        status:record.status,
        dateadded:record.dateadded
      }
    });
  }

  return res.json({
    success:true,
    url:inputUrl,
    hostname,
    matched:false,
    matchType:'NO_MATCH',
    riskLevel:'UNKNOWN',
    status:'BILINMEYEN',
    source:'URLHAUS',
    phishing:false,
    malicious:false,
    summary:'URLhaus verisinde eşleşme bulunamadı. Bu sonuç URLnin güvenli olduğunu garanti etmez.',
    matchedRecord:null
  });
});
app.post('/api/check-transfer-recipient',auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    recipient:z.string().min(10).max(128),
    amount:z.coerce.number().nonnegative().optional()
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid transfer recipient'
    });
  }

  const network=String(p.data.network||'').trim().toLowerCase();
  const recipient=String(p.data.recipient||'').trim();

  const supportedNetworks=[
    'tron',
    'ethereum',
    'bsc',
    'polygon',
    'arbitrum',
    'base',
    'optimism',
    'avalanche'
  ];

  if(!supportedNetworks.includes(network)){
    return res.status(400).json({
      success:false,
      error:'Network not supported',
      network,
      supportedNetworks
    });
  }

  try{
    const scamIntelligence=await lookupScamIntelligence({
      network,
      address:recipient
    });

    const matched=Boolean(scamIntelligence?.matched);

    return res.json({
      success:true,
      network,
      recipient,
      amount:p.data.amount ?? null,
      isBlocked:matched,
      riskLevel:matched ? 'HIGH' : 'UNKNOWN',
      scamMatched:matched,
      scamIntelligence
    });

  }catch(error){
    console.error('Transfer Shield lookup error:',error);

    return res.status(502).json({
      success:false,
      error:'Transfer Shield lookup unavailable'
    });
  }
});
/*
 * CONTRACT ANALYSIS
 * Gerçek RPC üzerinden temel kontrat / ERC20 analizi.
 */
const inspectContractSecurity = async ({contract,provider}) => {
  const result = {
    owner: {
      supported: false,
      value: null
    },
    mint: {
      supported: false,
      mintingFinishedSupported: false,
      mintingFinished: null,
      capSupported: false,
      cap: null,
      minterSupported: false,
      minter: null,
      minterRoleSupported: false,
      minterCountSupported: false,
      minterCount: null,
      minterAddresses: [],
      evidence: []
    },
    paused: {
      supported: false,
      value: null
    }
  };

  try{
    const mintAbi = new ethers.Contract(
      contract.target,
      [
        'function mintingFinished() view returns (bool)',
        'function cap() view returns (uint256)',
        'function minter() view returns (address)',
        'function MINTER_ROLE() view returns (bytes32)',
        'function hasRole(bytes32,address) view returns (bool)',
        'function getRoleMemberCount(bytes32) view returns (uint256)',
        'function getRoleMember(bytes32,uint256) view returns (address)'
      ],
      provider
    );

    try{
      const finished=await mintAbi.mintingFinished();
      result.mint.mintingFinishedSupported=true;
      result.mint.mintingFinished=Boolean(finished);
      result.mint.evidence.push('mintingFinished() RPC kontrolü başarılı');
    }catch(error){}

    try{
      const cap=await mintAbi.cap();
      result.mint.capSupported=true;
      result.mint.cap=cap.toString();
      result.mint.evidence.push('cap() RPC kontrolü başarılı');
    }catch(error){}

    try{
      const minter=await mintAbi.minter();
      if(typeof minter==='string' && /^0x[a-fA-F0-9]{40}$/.test(minter)){
        result.mint.minterSupported=true;
        result.mint.minter=minter;
        if(minter.toLowerCase()!==ethers.ZeroAddress.toLowerCase()){
          result.mint.evidence.push('minter() sıfır olmayan adres döndürdü');
        }
      }
    }catch(error){}

    try{
      const minterRole=await mintAbi.MINTER_ROLE();
      result.mint.minterRoleSupported=true;
      result.mint.evidence.push('MINTER_ROLE() RPC kontrolü başarılı');
      try{
        const count=await mintAbi.getRoleMemberCount(minterRole);
        result.mint.minterCountSupported=true;
        result.mint.minterCount=Number(count);
        result.mint.evidence.push('getRoleMemberCount() RPC kontrolü başarılı');
        try{
          const maxMembers=Math.min(Number(count),20);
          for(let i=0;i<maxMembers;i++){
            const member=await mintAbi.getRoleMember(minterRole,i);
            if(typeof member==='string' && /^0x[a-fA-F0-9]{40}$/.test(member)){
              result.mint.minterAddresses=result.mint.minterAddresses||[];
              result.mint.minterAddresses.push(member);
            }
          }
          result.mint.evidence.push('getRoleMember() RPC kontrolü başarılı');
        }catch(error){}
      }catch(error){}
    }catch(error){}

    result.mint.supported=Boolean(result.mint.mintingFinishedSupported || result.mint.capSupported || result.mint.minterSupported || result.mint.minterRoleSupported || result.mint.minterCountSupported);
  }catch(error){
    // Mint kontrol yüzeyi desteklenmiyorsa analiz devam eder.
  }

  try{
    const ownerAbi = new ethers.Contract(
      contract.target,
      [
        'function owner() view returns (address)'
      ],
      provider
    );

    const owner = await ownerAbi.owner();

    if(
      typeof owner === 'string' &&
      /^0x[a-fA-F0-9]{40}$/.test(owner)
    ){
      result.owner.supported = true;
      result.owner.value = owner;
    }
  }catch(error){
    // owner() bulunmaması normaldir.

  try{
    const adminAbi=new ethers.Contract(contract.target,['function DEFAULT_ADMIN_ROLE() view returns (bytes32)','function getRoleMemberCount(bytes32) view returns (uint256)','function getRoleMember(bytes32,uint256) view returns (address)'],provider);
    const adminRole=await adminAbi.DEFAULT_ADMIN_ROLE();
    result.admin={supported:true,role:adminRole,countSupported:false,count:null,adminAddresses:[],evidence:['DEFAULT_ADMIN_ROLE() RPC kontrolü başarılı']};
    try{
      const count=await adminAbi.getRoleMemberCount(adminRole);
      result.admin.countSupported=true;
      result.admin.count=Number(count);
      result.admin.evidence.push('DEFAULT_ADMIN_ROLE üye sayısı RPC kontrolü başarılı');
      const maxMembers=Math.min(Number(count),20);
      for(let i=0;i<maxMembers;i++){
        try{
          const member=await adminAbi.getRoleMember(adminRole,i);
          if(typeof member==='string' && /^0x[a-fA-F0-9]{40}$/.test(member)){result.admin.adminAddresses.push(member);}
        }catch(error){}
      }
    }catch(error){}
  }catch(error){
    // DEFAULT_ADMIN_ROLE desteklenmiyorsa analiz devam eder.
  }

  if(result.owner.supported && result.mint.minterRoleSupported){
    try{
      const roleAbi=new ethers.Contract(contract.target,['function MINTER_ROLE() view returns (bytes32)','function hasRole(bytes32,address) view returns (bool)'],provider);
      const minterRole=await roleAbi.MINTER_ROLE();
      const ownerIsMinter=await roleAbi.hasRole(minterRole,result.owner.value);
      result.mint.ownerHasMinterRole=Boolean(ownerIsMinter);
      result.mint.evidence.push(ownerIsMinter ? 'owner() adresi MINTER_ROLE sahibi' : 'owner() adresi MINTER_ROLE sahibi değil');
    }catch(error){}
  }
  }

  try{
    const pauseAbi = new ethers.Contract(
      contract.target,
      [
        'function paused() view returns (bool)'
      ],
      provider
    );

    const paused = await pauseAbi.paused();

    result.paused.supported = true;
    result.paused.value = Boolean(paused);
  }catch(error){
    // paused() bulunmaması normaldir.
  }

  return result;
};
const calculateContractRisk = ({
  scamIntelligence,
  securityInspection,
  checks,
  bytecodeLength
}) => {
  let score=0;
  const signals=[];

  if(scamIntelligence?.matched){
    score+=70;

    signals.push({
      type:'SCAM_INTELLIGENCE_MATCH',
      weight:70,
      description:'Kontrat adresi Scam Intelligence veritabanında eşleşti.'
    });
  }

  const evidenceCount=
    Number(scamIntelligence?.evidenceCount)||0;

  if(evidenceCount>0){
    const evidenceScore=Math.min(evidenceCount*5,10);

    score+=evidenceScore;

    signals.push({
      type:'SCAM_EVIDENCE',
      weight:evidenceScore,
      description:
        evidenceCount+
        ' adet scam kanıtı bulundu.'
    });
  }

  if(
    securityInspection?.paused?.supported &&
    securityInspection.paused.value===true
  ){
    score+=10;

    signals.push({
      type:'CONTRACT_PAUSED',
      weight:10,
      description:'Kontrat paused() durumunda aktif olarak duraklatılmış.'
    });
  }

  const metadataMissing=[
    checks?.name,
    checks?.symbol,
    checks?.decimals,
    checks?.totalSupply
  ].filter(value=>value===false).length;

  if(metadataMissing>0){
    const metadataScore=Math.min(metadataMissing*3,10);

    score+=metadataScore;

    signals.push({
      type:'METADATA_INCOMPLETE',
      weight:metadataScore,
      description:
        metadataMissing+
        ' metadata kontrolü başarısız.'
    });
  }

  if(Number(bytecodeLength)>30000){
    score+=5;

    signals.push({
      type:'LARGE_BYTECODE',
      weight:5,
      description:'Kontrat bytecode boyutu yüksek.'
    });
  }

  score=Math.min(Math.max(score,0),100);

  let level='LOW';

  if(score>=70){
    level='HIGH';
  }else if(score>=40){
    level='MEDIUM';
  }

  return {
    score,
    level,
    signals
  };
};
app.post('/api/analyze-contract',auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    address:z.string().regex(/^0x[a-fA-F0-9]{40}$/,'Invalid EVM contract address')
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid contract address or network'
    });
  }

  const network=String(p.data.network).trim().toLowerCase();
  const address=String(p.data.address).trim();

  const configs={
    ethereum:{
      rpc:process.env.ETHEREUM_RPC||'https://eth.drpc.org'
    },
    bsc:{
      rpc:process.env.BSC_RPC||'https://bsc-dataseed.binance.org'
    },
    polygon:{
      rpc:process.env.POLYGON_RPC||'https://polygon-bor-rpc.publicnode.com'
    },
    arbitrum:{
      rpc:process.env.ARBITRUM_RPC||'https://arb1.arbitrum.io/rpc'
    },
    base:{
      rpc:process.env.BASE_RPC||'https://mainnet.base.org'
    },
    optimism:{
      rpc:process.env.OPTIMISM_RPC||'https://mainnet.optimism.io'
    },
    avalanche:{
      rpc:process.env.AVALANCHE_RPC||'https://api.avax.network/ext/bc/C/rpc'
    }
  };

  const config=configs[network];

  if(!config){
    return res.status(400).json({
      success:false,
      error:'EVM network not supported',
      network,
      supportedNetworks:Object.keys(configs)
    });
  }

  try{
    const provider=new ethers.JsonRpcProvider(config.rpc);

    const code=await provider.getCode(address);

    const isContract=
      typeof code==='string' &&
      code!=='0x';

    if(!isContract){
      return res.json({
        success:true,
        network,
        address,
        isContract:false,
        isErc20:false,
        analysisStatus:'NO_CONTRACT',
        riskScore:null,
        riskLevel:'UNKNOWN',
        metadata:null,
        bytecodeLength:0,
        checks:{
          bytecodePresent:false,
          name:false,
          symbol:false,
          decimals:false,
          totalSupply:false
        }
      });
    }

    const contract=new ethers.Contract(
      address,
      [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)'
      ],
      provider
    );

    let name=null;
    let symbol=null;
    let decimals=null;
    let totalSupply=null;

    const checks={
      bytecodePresent:true,
      name:false,
      symbol:false,
      decimals:false,
      totalSupply:false
    };

    try{
      name=String(await contract.name());
      checks.name=name.length>0;
    }catch(error){
      console.warn(
        '[CONTRACT] name() failed:',
        error?.shortMessage||error?.message||error
      );
    }

    try{
      symbol=String(await contract.symbol());
      checks.symbol=symbol.length>0;
    }catch(error){
      console.warn(
        '[CONTRACT] symbol() failed:',
        error?.shortMessage||error?.message||error
      );
    }

    try{
      const value=Number(await contract.decimals());

      if(
        Number.isInteger(value) &&
        value>=0 &&
        value<=36
      ){
        decimals=value;
        checks.decimals=true;
      }
    }catch(error){
      console.warn(
        '[CONTRACT] decimals() failed:',
        error?.shortMessage||error?.message||error
      );
    }

    try{
      totalSupply=(await contract.totalSupply()).toString();
      checks.totalSupply=true;
    }catch(error){
      console.warn(
        '[CONTRACT] totalSupply() failed:',
        error?.shortMessage||error?.message||error
      );
    }

    const securityInspection = await inspectContractSecurity({contract,provider});

    const scamIntelligence = await lookupScamIntelligence({
      network,
      address
    });

    const contractRisk = calculateContractRisk({
      scamIntelligence,
      securityInspection,
      checks,
      bytecodeLength:Math.floor((code.length-2)/2)
    });

    const isErc20=
      checks.name &&
      checks.symbol &&
      checks.decimals;

    const metadataChecks=[
      checks.name,
      checks.symbol,
      checks.decimals,
      checks.totalSupply
    ].filter(Boolean).length;

    let analysisStatus='CONTRACT_ONLY';

    if(isErc20){
      analysisStatus='ERC20_ANALYZED';
    }else if(metadataChecks>0){
      analysisStatus='PARTIAL_ANALYSIS';
    }

    return res.json({
      success:true,
      network,
      address,
      isContract:true,
      isErc20,
      analysisStatus,
      riskScore:contractRisk.score,
      riskLevel:contractRisk.level,
      riskSignals:contractRisk.signals,
      metadata:{
        name,
        symbol,
        decimals,
        totalSupply
      },
      bytecodeLength:
        Math.floor((code.length-2)/2),
      checks,
      securityInspection
    });

  }catch(error){
    console.error(
      'Contract analysis error:',
      error?.shortMessage||error?.message||error
    );

    return res.status(502).json({
      success:false,
      error:'Contract RPC analysis unavailable',
      network
    });
  }
});/*
 * USER WALLET API
 * Kullanıcının hesabına bağlı izlenen cüzdanlar.
 */

app.get('/api/wallets',auth,async(req,res)=>{
  try{
    const wallets=await db.wallet.findMany({
      where:{
        userId:req.user.id
      },
      orderBy:{
        id:'desc'
      }
    });

    return res.json({
      success:true,
      wallets
    });
  }catch(error){
    console.error('Wallet list error:',error);
    return res.status(500).json({
      success:false,
      error:'Failed to load wallets'
    });
  }
});

app.post('/api/wallets',auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    address:z.string().min(10).max(128),
    label:z.string().max(100).optional()
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid wallet'
    });
  }

  const network=p.data.network.trim().toLowerCase();
  const address=p.data.address.trim();
  const label=p.data.label?.trim() || null;

  try{
    /*
     * VIP kontrolü backend tarafında yapılır.
     * Frontend'deki userStatus'a güvenilmez.
     */
    const subscription=await db.subscription.findUnique({
      where:{userId:req.user.id}
    });

    const isVip=
      subscription?.status==='ACTIVE' &&
      subscription?.expiresAt &&
      subscription.expiresAt>new Date();

    if(!isVip){
      return res.status(403).json({
        success:false,
        error:'VIP subscription required'
      });
    }

    /*
     * VIP kullanıcı başına maksimum 10 wallet.
     */
    const walletCount=await db.wallet.count({
      where:{userId:req.user.id}
    });

    if(walletCount>=10){
      return res.status(409).json({
        success:false,
        error:'Wallet limit reached',
        limit:10
      });
    }

    /*
     * Aynı network + address daha önce kayıtlıysa
     * Prisma unique constraint tarafından da korunur.
     */
    const wallet=await db.wallet.create({
      data:{
        userId:req.user.id,
        network,
        address,
        label
      }
    });

    return res.status(201).json({
      success:true,
      wallet
    });

  }catch(error){

    if(error?.code==='P2002'){
      return res.status(409).json({
        success:false,
        error:'Wallet already saved'
      });
    }

    console.error('Wallet create error:',error);

    return res.status(500).json({
      success:false,
      error:'Failed to save wallet'
    });
  }
});
app.delete('/api/wallets/:id',auth,async(req,res)=>{
  const id=String(req.params.id||'').trim();

  if(!id){
    return res.status(400).json({
      success:false,
      error:'Wallet id required'
    });
  }

  try{
    const wallet=await db.wallet.findFirst({
      where:{
        id,
        userId:req.user.id
      }
    });

    if(!wallet){
      return res.status(404).json({
        success:false,
        error:'Wallet not found'
      });
    }

    await db.wallet.delete({
      where:{
        id:wallet.id
      }
    });

    return res.json({
      success:true,
      deletedId:wallet.id
    });
  }catch(error){
    console.error('Wallet delete error:',error);

    return res.status(500).json({
      success:false,
      error:'Failed to delete wallet'
    });
  }
});
app.post('/api/check-wallet',walletScanLimiter,auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    address:z.string().min(10).max(128)
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      error:'Invalid wallet'
    });
  }

  const network=p.data.network
    .trim()
    .toLowerCase();

  const address=p.data.address.trim();

  /*
   * Adapter registry üzerinden ilgili blockchain
   * adapter'ını seçiyoruz.
   *
   * TRON:
   *   adapters.get('tron')
   *
   * EVM:
   *   adapters.get('ethereum')
   *   adapters.get('bsc')
   *   adapters.get('polygon')
   *   adapters.get('arbitrum')
   *   adapters.get('base')
   *   adapters.get('optimism')
   *   adapters.get('avalanche')
   */

  const adapter=adapters.get(network);

  if(!adapter){
    return res.status(400).json({
      error:'Network not supported',
      network,
      supportedNetworks:[
        'tron',
        'ethereum',
        'bsc',
        'polygon',
        'arbitrum',
        'base',
        'optimism',
        'avalanche'
      ]
    });
  }

  try{
    const result=await adapter.checkWallet({
      network,
      address
    });

    if(result?.found===false){
      return res.status(404).json({
        success:false,
        ...result
      });
    }

    /*
     * Scam intelligence:
     * Blockchain adapter sonucunu ScamAddress /
     * ScamEvidence veritabanı ile karşılaştırıyoruz.
     */
    const scamIntelligence =
      await lookupScamIntelligence({
        network,
        address:result.address||address
      });

    /*
     * Transaction karşı taraflarını da scam havuzunda ara.
     * Mevcut transaction listesini değiştirmiyoruz.
     */
    const counterpartyScamIntelligence =
      await lookupTransactionScamIntelligence({
        network,
        walletAddress:result.address||address,
        transactions:result.transactions||[]
      });

    /*
     * TRON tarafındaki mevcut risk motorunu
     * aynen koruyoruz.
     */
    if(network==='tron'){
      const risk=calculateWalletRisk({
        account:result.account||result.rawAccount||{},
        transactions:result.transactions||[],
        balanceTrx:Number(result.balance||0),
        address:result.address||address
      });

      return res.json({
        success:true,
        ...result,
        isScam:scamIntelligence.matched,
        scamIntelligence,
        counterpartyScamIntelligence,
        risk
      });
    }

    if(network==='sol'){
      const risk=calculateSolanaWalletRisk({
        transactions:result.transactions||[],
        balance:result.balance,
        address:result.address||address,
        scamIntelligence
      });

      return res.json({
        success:true,
        ...result,
        isScam:
          scamIntelligence.matched ||
          counterpartyScamIntelligence.matched,

        scamIntelligence,
        counterpartyScamIntelligence,
        risk
      });
    }
    /*
     * EVM risk motoru:
     * Yalnızca gerçek EVM ağlarında çalıştırılır.
     */
    if(!['ethereum','bsc','polygon','arbitrum','base','optimism','avalanche'].includes(network)){
      return res.json({
        success:true,
        ...result,
        isScam:
          scamIntelligence.matched ||
          counterpartyScamIntelligence.matched,
        scamIntelligence,
        counterpartyScamIntelligence,
        risk:{
          score:0,
          level:'unknown',
          reasons:['Bu ağ için özel davranışsal risk motoru henüz uygulanmadı.'],
          signals:['NETWORK_ADAPTER_ACTIVE'],
          network,
          totalTransactions:(result.transactions||[]).length
        }
      });
    }
    const risk = calculateEvmWalletRisk({
      account:result.account || {},
      transactions:result.transactions || [],
      tokens:result.tokens || [],
      balance:result.balance,
      balanceUnit:result.balanceUnit,
      address:result.address || address,
      network,
      scamIntelligence
    });

    return res.json({
      success:true,
      ...result,
      isScam:
        scamIntelligence.matched ||
        counterpartyScamIntelligence.matched,

      scamIntelligence,

      counterpartyScamIntelligence,

      risk
    });

  }catch(error){
    console.error(
      `Wallet check error [${network}]:`,
      error
    );

    const status=
      Number.isInteger(error?.status) &&
      error.status>=400 &&
      error.status<600
        ? error.status
        : 502;

    return res.status(status).json({
      success:false,
      error:`${network.toUpperCase()} network unavailable`,
      network
    });
  }
});
/*
 * ============================================================
 * WHALE WATCH API
 * ============================================================
 *
 * Durum:
 * - POST   /api/whale-watch              -> ğŸŸ¢ Gerçek DB kaydı
 * - GET    /api/whale-watch              -> ğŸŸ¢ Gerçek DB listesi
 * - DELETE /api/whale-watch/:id          -> ğŸŸ¢ Gerçek DB silme
 * - GET    /api/whale-watch/:id/activity -> ğŸŸ¢ Gerçek adapter taraması
 *
 * Not:
 * Gerçek zamanlı/polling alarm sistemi bu katmanın sonraki
 * aşamasıdır. Bu endpoint mevcut blockchain tarama penceresini
 * sorgular.
 * ============================================================
 */

app.post('/api/whale-watch', auth, async (req, res, next) => {
  try {
    const p = z.object({
      network: z.string().trim().min(2).max(30),
      address: z.string().trim().min(10).max(128),
      label: z.string().trim().max(100).optional()
    }).safeParse(req.body);

    if (!p.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid whale watch data'
      });
    }

    const network =
      p.data.network.toLowerCase();

    const address =
      p.data.address.trim();

    const adapter =
      adapters.get(network);

    if (!adapter) {
      return res.status(400).json({
        success: false,
        error: 'Network not supported',
        network
      });
    }

    if (
      typeof adapter.discoverTransfers !==
      'function'
    ) {
      return res.status(501).json({
        success: false,
        error:
          'Whale Watch transfer adapter is not configured for this network',
        network
      });
    }

    let normalizedAddress = address;

    if (
      [
        'ethereum',
        'bsc',
        'polygon',
        'arbitrum',
        'base',
        'optimism',
        'avalanche'
      ].includes(network)
    ) {
      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid EVM wallet address'
        });
      }

      normalizedAddress =
        ethers.getAddress(address);
    }

    const existing =
      await db.whaleWatch.findUnique({
        where: {
          userId_network_address: {
            userId: req.user.id,
            network,
            address: normalizedAddress
          }
        }
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'This address is already being watched',
        watch: existing
      });
    }

    const watch =
      await db.whaleWatch.create({
        data: {
          userId: req.user.id,
          network,
          address: normalizedAddress,
          label:
            p.data.label ||
            null
        }
      });

    return res.status(201).json({
      success: true,
      watch
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'This address is already being watched'
      });
    }

    next(error);
  }
});


app.get('/api/whale-watch', auth, async (req, res, next) => {
  try {
    const watches =
      await db.whaleWatch.findMany({
        where: {
          userId: req.user.id
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

    return res.json({
      success: true,
      watches
    });
  } catch (error) {
    next(error);
  }
});


app.delete('/api/whale-watch/:id', auth, async (req, res, next) => {
  try {
    const id =
      String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid watch id'
      });
    }

    const result =
      await db.whaleWatch.deleteMany({
        where: {
          id,
          userId: req.user.id
        }
      });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Whale watch not found'
      });
    }

    return res.json({
      success: true,
      deleted: true,
      id
    });
  } catch (error) {
    next(error);
  }
});


app.get('/api/whale-watch/:id/activity', auth, async (req, res, next) => {
  try {
    const id =
      String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid watch id'
      });
    }

    const watch =
      await db.whaleWatch.findFirst({
        where: {
          id,
          userId: req.user.id
        }
      });

    if (!watch) {
      return res.status(404).json({
        success: false,
        error: 'Whale watch not found'
      });
    }

    const adapter =
      adapters.get(
        String(watch.network)
          .trim()
          .toLowerCase()
      );

    if (
      !adapter ||
      typeof adapter.discoverTransfers !==
      'function'
    ) {
      return res.status(501).json({
        success: false,
        error:
          'Whale Watch transfer adapter is not configured for this network',
        network: watch.network
      });
    }

    const result =
      await adapter.discoverTransfers({
        network: watch.network,
        address: watch.address
      });

    if (!result?.success) {
      return res.status(502).json({
        success: false,
        error:
          result?.error ||
          'Whale activity discovery failed',
        network: watch.network,
        address: watch.address
      });
    }

    const transactions =
      Array.isArray(result.transactions)
        ? result.transactions
        : [];

    return res.json({
      success: true,
      watch,
      network: result.network,
      address: result.address,
      chainId: result.chainId || null,
      latestBlock:
        result.latestBlock || null,
      transactions,
      transactionCount:
        transactions.length,
      realtime:
        false,
      message:
        'Current blockchain scan window returned. Real-time polling is not enabled yet.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/monitor-vault-with-scam-pool',vaultMonitorLimiter,auth,async(req,res)=>{
    try{
      const wallets=await db.wallet.findMany({
        where:{userId:req.user.id},
        orderBy:{id:'desc'}
      });

      const notifications=[];

      for(const wallet of wallets){
        const network=String(wallet.network||'').trim().toLowerCase();
        const address=String(wallet.address||'').trim();
        const adapter=adapters.get(network);

        if(!adapter) continue;

        let result;

        try{
          result=await adapter.checkWallet({network,address});
        }catch(error){
          console.error(
            '[VAULT MONITOR] check error:',
            error?.message||error
          );
          continue;
        }

        if(!Array.isArray(result?.transactions)) continue;

        for(const tx of result.transactions){

          const from=String(tx?.from||'').trim();
          const to=String(tx?.to||'').trim();

          const transactionId=
            String(tx?.txid||tx?.hash||'').trim();

          if(!transactionId) continue;

          const isOutgoing =
            from.toLowerCase()===address.toLowerCase();

          const counterparty =
            isOutgoing ? to : from;

          if(!counterparty) continue;

          const direction =
            isOutgoing
              ? 'OUTGOING'
              : 'INCOMING';

          /*
           * Gerçek blockchain işlemindeki karşı tarafı
           * ScamAddress havuzunda kontrol ediyoruz.
           */
          const scam=await lookupScamIntelligence({
            network,
            address:counterparty
          });

          if(!scam.matched) continue;

          const scamAddressId =
            scam.matches?.[0]?.id || null;

          /*
           * Aynı işlem daha önce alarm oluşturduysa
           * tekrar SecurityAlert oluşturulmaz.
           */
          const existingAlert=
            await db.securityAlert.findFirst({
              where:{
                userId:req.user.id,
                walletId:wallet.id,
                transactionId,
                direction
              },
              select:{
                id:true
              }
            });

          let alertAlreadyExisted=Boolean(existingAlert);
          let alertPersisted=Boolean(existingAlert);

          if(!existingAlert){

            try{

              await db.securityAlert.create({
                data:{
                  userId:req.user.id,
                  walletId:wallet.id,

                  type:'SCAM_TRANSACTION',
                  severity:'HIGH',

                  title:
                    direction==='INCOMING'
                      ? '⚠️ Scam Adresten Transfer'
                      : 'Ÿš¨ Scam Adrese Transfer',

                  body:
                    (wallet.label||'Vault cüzdanı')+
                    (
                      direction==='INCOMING'
                        ? ' scam olarak işaretli bir adresten varlık aldı.'
                        : ' scam olarak işaretli bir adrese varlık gönderdi.'
                    ),

                  network,
                  walletAddress:address,
                  transactionId,
                  direction,

                  amount:
                    tx.amount===undefined ||
                    tx.amount===null
                      ? null
                      : Number(tx.amount)||0,

                  token:
                    tx.token||
                    tx.tokenName||
                    null,

                  counterparty,
                  scamAddressId
                }
              });

              alertPersisted=true;

              console.log(
                '[VAULT MONITOR] SecurityAlert created:',
                network,
                transactionId,
                direction
              );

            }catch(error){

              alertPersisted=false;

              console.error(
                '[VAULT MONITOR] SecurityAlert create error:',
                error?.message||error
              );

            }

          }else{

            console.log(
              '[VAULT MONITOR] duplicate alert skipped:',
              existingAlert.id
            );

          }

          if(!alertPersisted) continue;
          if(alertAlreadyExisted) continue;
          notifications.push({
            id:
              network+
              ':'+
              transactionId+
              ':'+
              address,

            type:'SCAM_TRANSACTION',
            severity:'HIGH',

            title:
              direction==='INCOMING'
                ? '⚠️ Scam Adresten Transfer'
                : 'Ÿš¨ Scam Adrese Transfer',

            body:
              (wallet.label||'Vault cüzdanı')+
              (
                direction==='INCOMING'
                  ? ' scam olarak işaretli bir adresten varlık aldı.'
                  : ' scam olarak işaretli bir adrese varlık gönderdi.'
              ),

            network,
            walletAddress:address,
            transactionId,
            direction,

            amount:
              tx.amount===undefined ||
              tx.amount===null
                ? 0
                : Number(tx.amount)||0,

            token:
              tx.token||
              tx.tokenName||
              null,

            counterparty,
            scamIntelligence:scam,

            alertPersisted:alertPersisted,
            alertAlreadyExisted
          });
        }
      }

      return res.json({notifications});

    }catch(error){

      console.error(
        '[VAULT MONITOR] error:',
        error
      );

      return res.status(500).json({
        notifications:[],
        error:'Vault monitor failed'
      });
    }
  });
app.post('/api/check-allowances',allowanceLimiter,auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    address:z.string().min(10).max(128)
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid wallet'
    });
  }

  const network=String(p.data.network).trim().toLowerCase();
  const address=String(p.data.address).trim();

  const supportedNetworks=[
    'ethereum',
    'bsc',
    'polygon',
    'arbitrum',
    'base',
    'optimism',
    'avalanche'
  ];

  if(!supportedNetworks.includes(network)){
    return res.status(400).json({
      success:false,
      error:'Allowance scan currently supports EVM networks only',
      network,
      supportedNetworks
    });
  }

  try{
    const adapter=adapters.get(network);

    if(!adapter || typeof adapter.checkAllowances!=='function'){
      return res.status(502).json({
        success:false,
        error:'EVM allowance adapter unavailable'
      });
    }

    const result=await adapter.checkAllowances({
      network,
      address
    });

    return res.json({
      success:true,
      ...result
    });

  }catch(error){
    console.error(
      `Allowance scan error [${network}]:`,
      error
    );

    return res.status(502).json({
      success:false,
      error:'Allowance scan unavailable'
    });
  }
});
app.post('/api/prepare-revoke',revokeLimiter,auth,async(req,res)=>{
  const p=z.object({
    network:z.string().min(2).max(30),
    owner:z.string().min(10).max(128),
    token:z.string().min(10).max(128),
    spender:z.string().min(10).max(128)
  }).safeParse(req.body);

  if(!p.success){
    return res.status(400).json({
      success:false,
      error:'Invalid revoke request'
    });
  }

  const network=String(p.data.network).trim().toLowerCase();
  const owner=String(p.data.owner).trim();
  const token=String(p.data.token).trim();
  const spender=String(p.data.spender).trim();

  const ownedWallet=await db.wallet.findFirst({
    where:{
      userId:req.user.id,
      network
    }
  });

  const ownerMatchesUserWallet =
    !!ownedWallet &&
    String(ownedWallet.address||'').trim().toLowerCase()===owner.toLowerCase();

  if(!ownerMatchesUserWallet){
    await securityEvent(req,{
      userId:req.user.id,
      eventType:"REVOKE_UNAUTHORIZED_OWNER",
      severity:"WARNING",
      success:false
    });

    return res.status(403).json({
      success:false,
      error:"Wallet ownership verification failed"
    });
  }

  const supportedNetworks=[
    'ethereum',
    'bsc',
    'polygon',
    'arbitrum',
    'base',
    'optimism',
    'avalanche'
  ];

  if(!supportedNetworks.includes(network)){
    return res.status(400).json({
      success:false,
      error:'Revoke currently supports EVM networks only',
      network,
      supportedNetworks
    });
  }

  try{
    const adapter=adapters.get(network);

    if(
      !adapter ||
      typeof adapter.prepareRevokeApproval !== 'function'
    ){
      return res.status(502).json({
        success:false,
        error:'EVM revoke adapter unavailable',
        network
      });
    }

    const result=await adapter.prepareRevokeApproval({
      network,
      owner,
      token,
      spender
    });

    if(!result?.success){
      return res.status(400).json({
        success:false,
        ...result
      });
    }

    return res.json({
      success:true,
      ...result
    });

  }catch(error){

    console.error(
      `Revoke preparation error [${network}]:`,
      error
    );

    return res.status(502).json({
      success:false,
      error:'Revoke preparation unavailable'
    });
  }
});

app.post('/api/portfolio', auth, async (req, res) => {
  try {
    const parsed = z.object({
      network: z.string().min(1).max(32),
      address: z.string().min(1).max(128)
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid portfolio request'
      });
    }

    const network = String(parsed.data.network || '').trim().toLowerCase();
    const address = String(parsed.data.address || '').trim();

    const adapter = adapters.get(network);

    if (!adapter || typeof adapter.checkWallet !== 'function') {
      return res.status(400).json({
        success: false,
        error: 'Network adapter unavailable',
        network
      });
    }

    const result = await adapter.checkWallet({
      network,
      address
    });

    if (!result || result.found === false) {
      return res.status(404).json({
        success: false,
        found: false,
        network,
        address
      });
    }

    const nativeBalance = result.balance ?? null;
    const balanceUnit = result.balanceUnit ?? null;
    const tokens = Array.isArray(result.tokens)
      ? result.tokens
      : Array.isArray(result.account?.trc20)
        ? result.account.trc20
        : [];

    const transactions = Array.isArray(result.transactions)
      ? result.transactions
      : [];

    return res.json({
      success: true,
      found: true,
      network,
      address,
      native: {
        balance: nativeBalance,
        symbol: balanceUnit
      },
      tokens,
      transactions,
      latestBlock: result.latestBlock ?? null,
      account: result.account ?? null
    });

  } catch (error) {
    console.error('[PORTFOLIO] error:', error);

    return res.status(502).json({
      success: false,
      error: error?.message || 'Portfolio data unavailable'
    });
  }
});


const FX_CACHE_TTL_MS = 15 * 60 * 1000;
let fxRateCache = { updatedAt: 0, rates: null };

app.get('/api/fx-rates', auth, async (_req, res) => {
  const now = Date.now();
  if (fxRateCache.rates && now - fxRateCache.updatedAt < FX_CACHE_TTL_MS) {
    return res.json({
      success: true,
      source: 'FRANKFURTER_ECB_CACHE',
      updatedAt: new Date(fxRateCache.updatedAt).toISOString(),
      rates: fxRateCache.rates
    });
  }

  try {
    const response = await fetch(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,TRY,JPY,CNY',
      { headers: { accept: 'application/json' } }
    );
    if (!response.ok) throw new Error(`Frankfurter HTTP ${response.status}`);

    const payload = await response.json();
    const incoming = payload?.rates || {};
    const rates = {
      USD: 1,
      EUR: Number(incoming.EUR),
      GBP: Number(incoming.GBP),
      TRY: Number(incoming.TRY),
      JPY: Number(incoming.JPY),
      CNY: Number(incoming.CNY)
    };
    for (const [code, value] of Object.entries(rates)) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid FX rate for ${code}`);
    }

    fxRateCache = { updatedAt: now, rates };
    return res.json({
      success: true,
      source: 'FRANKFURTER_ECB',
      updatedAt: new Date(now).toISOString(),
      rates
    });
  } catch (error) {
    console.error('[FX] live rate fetch failed:', error?.message || error);
    if (fxRateCache.rates) {
      return res.json({
        success: true,
        stale: true,
        source: 'FRANKFURTER_ECB_STALE_CACHE',
        updatedAt: new Date(fxRateCache.updatedAt).toISOString(),
        rates: fxRateCache.rates
      });
    }
    return res.status(503).json({ success: false, error: 'Live FX rates unavailable' });
  }
});

app.get('/api/live-gas-fees',auth,async(_,res)=>{
  try{
    const rpcConfigs = {
      eth: process.env.ETHEREUM_RPC || 'https://eth.drpc.org',
      bsc: process.env.BSC_RPC || 'https://bsc-dataseed.binance.org',
      polygon: process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com',
      arb: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc'
    };

    const fees = {};

    for(const [network,rpc] of Object.entries(rpcConfigs)){
      try{
        const provider = new ethers.JsonRpcProvider(rpc);
        const gasPrice = await provider.getFeeData();

        if(gasPrice.gasPrice !== null){
          const gwei = Number(
            ethers.formatUnits(gasPrice.gasPrice,'gwei')
          );

          fees[network] = `${gwei.toFixed(2)} Gwei`;
        }
      }catch(networkError){
        console.warn(
          `Live gas unavailable [${network}]:`,
          networkError?.message || networkError
        );
      }
    }

    return res.json({
      success:true,
      fees
    });

  }catch(error){
    console.error('Live gas fees error:',error);

    return res.status(502).json({
      success:false,
      error:'Live gas fees unavailable',
      fees:{}
    });
  }
}); 


  const addressListLimiter=rateLimit({
    windowMs:5*60*1000,
    max:30,
    standardHeaders:'draft-7',
    legacyHeaders:false,
    message:{success:false,error:'Too many address list requests. Please try again later.'}
  });

  const normalizeListNetwork=(value)=>String(value||'').trim().toLowerCase();

  const supportedAddressListNetworks=[
    'tron',
    'ethereum',
    'bsc',
    'polygon',
    'arbitrum',
    'base',
    'optimism',
    'avalanche'
  ];

  const normalizeListAddress=(network,address)=>{
    const raw=String(address||'').trim();

    if(network==='tron'){
      try{
        const decoded=bs58.decode(raw);
        if(decoded.length!==25){
          return null;
        }

        const payload=decoded.subarray(0,21);
        const checksum=decoded.subarray(21);
        const firstHash=createHash('sha256').update(payload).digest();
        const secondHash=createHash('sha256').update(firstHash).digest();

        if(!checksum.equals(secondHash.subarray(0,4))){
          return null;
        }

        if(payload[0]!==0x41){
          return null;
        }

        return raw;
      }catch{
        return null;
      }
    }

    if(!ethers.isAddress(raw)){
      return null;
    }

    return raw.toLowerCase();
  };

  const createAddressListEvent=(req,userId,eventType,success,details={})=>
    securityEvent(req,{
      userId,
      eventType,
      severity:success?'INFO':'WARNING',
      success,
      details
    });

  const createAddressListNotification=async({userId,type,network,address,resourceId})=>{
    try{
      const isWhitelist=type.startsWith('WHITELIST');
      const isAdd=type.endsWith('_ADD');
      const title=isWhitelist
        ? (isAdd ? 'Whitelist Güncellendi' : 'Whitelist Kaydı Kaldırıldı')
        : (isAdd ? 'Blacklist Güncellendi' : 'Blacklist Kaydı Kaldırıldı');
      const body=isWhitelist
        ? (isAdd
            ? `${network.toUpperCase()} ağındaki ${address} adresi Whitelist listenize eklendi.`
            : `${network.toUpperCase()} ağındaki ${address} adresi Whitelist listenizden kaldırıldı.`)
        : (isAdd
            ? `${network.toUpperCase()} ağındaki ${address} adresi Blacklist listenize eklendi.`
            : `${network.toUpperCase()} ağındaki ${address} adresi Blacklist listenizden kaldırıldı.`);
      await db.notification.create({
        data:{
          userId,
          type,
          severity:isWhitelist?'INFO':'WARNING',
          title,
          body,
          eventKey:`${type}:${userId}:${resourceId}`,
          network,
          resourceId
        }
      });
    }catch(error){
      if(error?.code!=='P2002'){
        console.error('[ADDRESS LIST NOTIFICATION] write failed:',error?.message||error);
      }
    }
  };

  app.get('/api/whitelist',addressListLimiter,auth,async(req,res)=>{
    try{
      const rows=await db.whitelistAddress.findMany({
        where:{userId:req.user.id},
        orderBy:{createdAt:'desc'}
      });

      return res.json({
        success:true,
        whitelist:rows
      });
    }catch(error){
      console.error('Whitelist GET error:',error);
      return res.status(500).json({
        success:false,
        error:'Failed to load whitelist'
      });
    }
  });

  app.post('/api/whitelist',addressListLimiter,auth,async(req,res)=>{
    const p=z.object({
      network:z.string().min(2).max(30),
      address:z.string().min(10).max(128),
      label:z.string().trim().max(100).optional().nullable()
    }).safeParse(req.body);

    if(!p.success){
      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{reason:'INVALID_INPUT'});
      return res.status(400).json({success:false,error:'Invalid whitelist input'});
    }

    const network=normalizeListNetwork(p.data.network);

    if(!supportedAddressListNetworks.includes(network)){
      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{reason:'UNSUPPORTED_NETWORK',network});
      return res.status(400).json({
        success:false,
        error:'Network not supported',
        network,
        supportedNetworks:supportedAddressListNetworks
      });
    }

    const address=normalizeListAddress(network,p.data.address);

    if(!address){
      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{reason:'INVALID_ADDRESS',network});
      return res.status(400).json({success:false,error:'Invalid address'});
    }

    try{
      const conflictingBlacklist = await db.blacklistAddress.findFirst({
        where:{ userId:req.user.id, network, address }
      });

      if(conflictingBlacklist){
        await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{reason:'BLACKLIST_CONFLICT',network,address});
        return res.status(409).json({
          success:false,
          error:'Address is already present in blacklist. Remove it from blacklist before adding to whitelist.'
        });
      }

      const row=await db.whitelistAddress.create({
        data:{
          userId:req.user.id,
          network,
          address,
          label:p.data.label||null
        }
      });

      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',true,{
        id:row.id,
        network,
        address
      });
      await createAddressListNotification({userId:req.user.id,type:'WHITELIST_ADD',network,address,resourceId:row.id});

      return res.status(201).json({
        success:true,
        whitelist:row
      });
    }catch(error){
      if(error?.code==='P2002'){
        await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{
          reason:'DUPLICATE',
          network,
          address
        });

        return res.status(409).json({
          success:false,
          error:'Address already exists in whitelist'
        });
      }

      console.error('Whitelist POST error:',error);
      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',false,{reason:'DATABASE_ERROR'});
      return res.status(500).json({
        success:false,
        error:'Failed to add whitelist address'
      });
    }
  });

  app.delete('/api/whitelist/:id',addressListLimiter,auth,async(req,res)=>{
    const id=z.string().cuid().safeParse(req.params.id);

    if(!id.success){
      return res.status(400).json({success:false,error:'Invalid whitelist id'});
    }

    try{
      const existing=await db.whitelistAddress.findFirst({
        where:{
          id:id.data,
          userId:req.user.id
        }
      });

      if(!existing){
        return res.status(404).json({
          success:false,
          error:'Whitelist address not found'
        });
      }

      await db.whitelistAddress.delete({
        where:{id:existing.id}
      });

      await createAddressListEvent(req,req.user.id,'WHITELIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });
      await createAddressListNotification({userId:req.user.id,type:'WHITELIST_REMOVE',network:existing.network,address:existing.address,resourceId:existing.id});

      return res.json({
        success:true,
        deletedId:existing.id
      });
    }catch(error){
      console.error('Whitelist DELETE error:',error);
      await createAddressListEvent(req,req.user.id,'WHITELIST_REMOVE',false,{reason:'DATABASE_ERROR'});
      return res.status(500).json({
        success:false,
        error:'Failed to remove whitelist address'
      });
    }
  });

  app.get('/api/blacklist',addressListLimiter,auth,async(req,res)=>{
    try{
      const rows=await db.blacklistAddress.findMany({
        where:{userId:req.user.id},
        orderBy:{createdAt:'desc'}
      });

      return res.json({
        success:true,
        blacklist:rows
      });
    }catch(error){
      console.error('Blacklist GET error:',error);
      return res.status(500).json({
        success:false,
        error:'Failed to load blacklist'
      });
    }
  });

  app.post('/api/blacklist',addressListLimiter,auth,async(req,res)=>{
    const p=z.object({
      network:z.string().min(2).max(30),
      address:z.string().min(10).max(128),
      label:z.string().trim().max(100).optional().nullable()
    }).safeParse(req.body);

    if(!p.success){
      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{reason:'INVALID_INPUT'});
      return res.status(400).json({success:false,error:'Invalid blacklist input'});
    }

    const network=normalizeListNetwork(p.data.network);

    if(!supportedAddressListNetworks.includes(network)){
      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{reason:'UNSUPPORTED_NETWORK',network});
      return res.status(400).json({
        success:false,
        error:'Network not supported',
        network,
        supportedNetworks:supportedAddressListNetworks
      });
    }

    const address=normalizeListAddress(network,p.data.address);

    if(!address){
      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{reason:'INVALID_ADDRESS',network});
      return res.status(400).json({success:false,error:'Invalid address'});
    }

    try{
      const conflictingWhitelist = await db.whitelistAddress.findFirst({
        where:{ userId:req.user.id, network, address }
      });

      if(conflictingWhitelist){
        await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{reason:'WHITELIST_CONFLICT',network,address});
        return res.status(409).json({
          success:false,
          error:'Address is already present in whitelist. Remove it from whitelist before adding to blacklist.'
        });
      }

      const row=await db.blacklistAddress.create({
        data:{
          userId:req.user.id,
          network,
          address,
          label:p.data.label||null
        }
      });

      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',true,{
        id:row.id,
        network,
        address
      });
      await createAddressListNotification({userId:req.user.id,type:'BLACKLIST_ADD',network,address,resourceId:row.id});

      return res.status(201).json({
        success:true,
        blacklist:row
      });
    }catch(error){
      if(error?.code==='P2002'){
        await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{
          reason:'DUPLICATE',
          network,
          address
        });

        return res.status(409).json({
          success:false,
          error:'Address already exists in blacklist'
        });
      }

      console.error('Blacklist POST error:',error);
      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',false,{reason:'DATABASE_ERROR'});
      return res.status(500).json({
        success:false,
        error:'Failed to add blacklist address'
      });
    }
  });

  app.delete('/api/blacklist/:id',addressListLimiter,auth,async(req,res)=>{
    const id=z.string().cuid().safeParse(req.params.id);

    if(!id.success){
      return res.status(400).json({success:false,error:'Invalid blacklist id'});
    }

    try{
      const existing=await db.blacklistAddress.findFirst({
        where:{
          id:id.data,
          userId:req.user.id
        }
      });

      if(!existing){
        return res.status(404).json({
          success:false,
          error:'Blacklist address not found'
        });
      }

      await db.blacklistAddress.delete({
        where:{id:existing.id}
      });

      await createAddressListEvent(req,req.user.id,'BLACKLIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });
      await createAddressListNotification({userId:req.user.id,type:'BLACKLIST_REMOVE',network:existing.network,address:existing.address,resourceId:existing.id});

      return res.json({
        success:true,
        deletedId:existing.id
      });
    }catch(error){
      console.error('Blacklist DELETE error:',error);
      await createAddressListEvent(req,req.user.id,'BLACKLIST_REMOVE',false,{reason:'DATABASE_ERROR'});
      return res.status(500).json({
        success:false,
        error:'Failed to remove blacklist address'
      });
    }
  });


/*
 * ============================================================
 * REALTIME WHALE ALERT ENGINE
 * ============================================================
 *
 * - Tüm aktif WhaleWatch kayıtlarını periyodik tarar.
 * - İlk başarılı tarama mevcut son işlemi baseline kabul eder.
 * - Sonraki taramalarda yeni işlemleri algılar.
 * - Yeni işlemleri SecurityAlert olarak kaydeder.
 * - lastSeenTxid / lastSeenAt cursor olarak kullanılır.
 * - Adapterlar gerçek blockchain verisini sağlamaya devam eder.
 * ============================================================
 */

const WHALE_ALERT_POLL_MS = Math.max(
  15000,
  Number(process.env.WHALE_ALERT_POLL_MS || 30000)
);

let whaleAlertPolling = false;

const normalizeWhaleTransaction = (transaction) => ({
  txid: String(
    transaction?.txid ||
    transaction?.transactionId ||
    ''
  ).trim(),
  timestamp:
    Number(transaction?.timestamp || 0) || null,
  direction:
    String(transaction?.direction || 'UNKNOWN').trim().toUpperCase(),
  amount:
    transaction?.amount === null ||
    transaction?.amount === undefined ||
    transaction?.amount === ''
      ? null
      : Number(transaction.amount),
  token:
    transaction?.token === null ||
    transaction?.token === undefined
      ? null
      : String(transaction.token),
  counterparty:
    String(
      transaction?.counterparty ||
      transaction?.from ||
      transaction?.to ||
      ''
    ).trim(),
  from:
    String(transaction?.from || '').trim(),
  to:
    String(transaction?.to || '').trim(),
  type:
    String(transaction?.type || 'BLOCKCHAIN_TRANSFER').trim(),
  confirmed:
    transaction?.confirmed !== false
});

const whaleTransactionTime = (transaction) =>
  Number(transaction?.timestamp || 0);

const createWhaleAlert = async ({
  watch,
  transaction
}) => {
  const tx = normalizeWhaleTransaction(transaction);

  if(!tx.txid){
    return {
      created: false,
      reason: 'missing_transaction_id'
    };
  }

  /*
   * Whale Alert yalnızca gerçek transferleri alarm olarak üretir.
   * Vote/contract/resource gibi aktiviteler:
   * UNKNOWN + 0 miktar => alarm üretmez.
   */
  const validDirections = [
    'INCOMING',
    'OUTGOING'
  ];

  const numericAmount =
    tx.amount === null ||
    tx.amount === undefined
      ? null
      : Number(tx.amount);

  if(
    !validDirections.includes(tx.direction) ||
    numericAmount === null ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ){
    return {
      created: false,
      filtered: true,
      reason: 'not_a_transfer'
    };
  }

  const existing =
    await db.securityAlert.findFirst({
      where: {
        userId: watch.userId,
        network: watch.network,
        walletAddress: watch.address,
        transactionId: tx.txid,
        direction: tx.direction
      },
      select: {
        id: true
      }
    });

  if(existing){
    return {
      created: false,
      duplicate: true,
      alertId: existing.id
    };
  }

  const amountText =
    tx.amount === null ||
    Number.isNaN(tx.amount)
      ? ''
      : String(tx.amount);

  const tokenText =
    tx.token ||
    '';

  const counterparty =
    tx.direction === 'OUTGOING'
      ? tx.to || tx.counterparty || watch.address
      : tx.from || tx.counterparty || watch.address;

  const title =
    tx.direction === 'OUTGOING'
      ? 'İzlenen Whale Adresinden Transfer'
      : 'İzlenen Whale Adresine Transfer';

  const bodyParts = [
    `${watch.network.toUpperCase()} ağı üzerinde izlenen adres için yeni blockchain işlemi tespit edildi.`,
    `İşlem: ${tx.txid}`,
    `Yön: ${tx.direction}`,
    amountText
      ? `Miktar: ${amountText}${tokenText ? ` ${tokenText}` : ''}`
      : null,
    counterparty
      ? `Karşı taraf: ${counterparty}`
      : null,
    `İşlem tipi: ${tx.type}`
  ].filter(Boolean);

  const alert =
    await db.securityAlert.create({
      data: {
        userId: watch.userId,
        walletId: null,
        type: 'WHALE_TRANSACTION',
        severity: 'INFO',
        title,
        body: bodyParts.join(' '),
        network: watch.network,
        walletAddress: watch.address,
        transactionId: tx.txid,
        direction: tx.direction,
        amount:
          tx.amount !== null &&
          !Number.isNaN(tx.amount)
            ? tx.amount
            : null,
        token:
          tokenText || null,
        counterparty,
        scamAddressId: null
      }
    });

  return {
    created: true,
    duplicate: false,
    alertId: alert.id
  };
};

const processWhaleWatch = async (watch) => {
  const network =
    String(watch.network || '')
      .trim()
      .toLowerCase();

  const address =
    String(watch.address || '').trim();

  const adapter =
    adapters.get(network);

  if(
    !adapter ||
    typeof adapter.discoverTransfers !== 'function'
  ){
    console.warn(
      `[WHALE ALERT] Adapter unavailable: ${network} ${address}`
    );
    return {
      success: false,
      reason: 'adapter_unavailable'
    };
  }

  let result;

  try{
    result =
      await adapter.discoverTransfers({
        network,
        address
      });
  }catch(error){
    console.error(
      `[WHALE ALERT] Discovery error ${network} ${address}:`,
      error?.message || error
    );

    return {
      success: false,
      reason: 'discovery_error'
    };
  }

  if(!result?.success){
    console.warn(
      `[WHALE ALERT] Discovery failed ${network} ${address}:`,
      result?.error || 'unknown error'
    );

    return {
      success: false,
      reason: 'discovery_failed'
    };
  }

  const transactions =
    Array.isArray(result.transactions)
      ? result.transactions
          .map(normalizeWhaleTransaction)
          .filter((tx) => tx.txid)
          .sort((a,b) => {
            const ta = whaleTransactionTime(a);
            const tb = whaleTransactionTime(b);

            if(ta !== tb){
              return tb - ta;
            }

            return String(b.txid)
              .localeCompare(String(a.txid));
          })
      : [];

  if(transactions.length === 0){
    return {
      success: true,
      baseline: false,
      newTransactions: 0,
      alertsCreated: 0
    };
  }

  const newest = transactions[0];

  /*
   * İlk başarılı tarama:
   * Mevcut blockchain durumunu baseline yap.
   * Geçmiş işlemler için alarm üretme.
   */
  if(!watch.lastSeenTxid){
    await db.whaleWatch.update({
      where: {
        id: watch.id
      },
      data: {
        lastSeenTxid: newest.txid,
        lastSeenAt:
          newest.timestamp
            ? new Date(newest.timestamp)
            : new Date()
      }
    });

    console.log(
      `[WHALE ALERT] Baseline oluşturuldu: ${network} ${address} ${newest.txid}`
    );

    return {
      success: true,
      baseline: true,
      newTransactions: 0,
      alertsCreated: 0,
      cursor: newest.txid
    };
  }

  const cursorIndex =
    transactions.findIndex(
      (tx) =>
        tx.txid === watch.lastSeenTxid
    );

  /*
   * Cursor mevcut tarama penceresinde bulunuyorsa,
   * onun önündeki işlemler yenidir.
   */
  let newTransactions;

  if(cursorIndex >= 0){
    newTransactions =
      transactions.slice(0, cursorIndex);
  }else{
    /*
     * Cursor mevcut pencerenin dışında.
     * Timestamp biliniyorsa yalnızca cursor'dan
     * daha yeni işlemleri kabul et.
     */
    const cursorTime =
      watch.lastSeenAt
        ? new Date(watch.lastSeenAt).getTime()
        : 0;

    if(cursorTime > 0){
      newTransactions =
        transactions.filter(
          (tx) =>
            whaleTransactionTime(tx) >
            cursorTime
        );
    }else{
      /*
       * Güvenli fallback:
       * Eski cursor bilinmiyorsa geçmiş işlemleri
       * topluca alarm olarak üretme.
       */
      newTransactions = [];
    }
  }

  let alertsCreated = 0;

  /*
   * Eski işlemden yeniye doğru işle.
   * Böylece birden fazla yeni işlem varsa
   * hepsi sırayla alarm üretir.
   */
  const chronologicalNewTransactions =
    [...newTransactions].sort((a,b) => {
      const ta = whaleTransactionTime(a);
      const tb = whaleTransactionTime(b);

      if(ta !== tb){
        return ta - tb;
      }

      return String(a.txid)
        .localeCompare(String(b.txid));
    });

  for(const transaction of chronologicalNewTransactions){
    try{
      const alertResult =
        await createWhaleAlert({
          watch,
          transaction
        });

      if(alertResult.created){
        alertsCreated += 1;

        console.log(
          `[WHALE ALERT] Yeni işlem alarmı: ${network} ${address} ${transaction.txid}`
        );
      }
    }catch(error){
      console.error(
        `[WHALE ALERT] Alert creation error ${network} ${address}:`,
        error?.message || error
      );

      /*
       * Alarm kaydı başarısız olursa cursor ilerletme.
       * Böylece işlem bir sonraki polling'de tekrar
       * güvenli biçimde ele alınabilir.
       */
      return {
        success: false,
        reason: 'alert_creation_failed',
        alertsCreated
      };
    }
  }

  /*
   * Yeni işlem varsa en güncel yeni işlemi cursor yap.
   * Yeni işlem yoksa cursor'a dokunma.
   */
  if(chronologicalNewTransactions.length > 0){
    const latestNew =
      chronologicalNewTransactions[
        chronologicalNewTransactions.length - 1
      ];

    await db.whaleWatch.update({
      where: {
        id: watch.id
      },
      data: {
        lastSeenTxid: latestNew.txid,
        lastSeenAt:
          latestNew.timestamp
            ? new Date(latestNew.timestamp)
            : new Date()
      }
    });
  }

  return {
    success: true,
    baseline: false,
    newTransactions:
      chronologicalNewTransactions.length,
    alertsCreated,
    cursor:
      chronologicalNewTransactions.length > 0
        ? chronologicalNewTransactions[
            chronologicalNewTransactions.length - 1
          ].txid
        : watch.lastSeenTxid
  };
};

const runWhaleAlertPolling = async () => {
  if(whaleAlertPolling){
    return;
  }

  whaleAlertPolling = true;

  try{
    const watches =
      await db.whaleWatch.findMany({
        orderBy: {
          createdAt: 'asc'
        }
      });

    if(watches.length === 0){
      return;
    }

    for(const watch of watches){
      try{
        await processWhaleWatch(watch);
      }catch(error){
        console.error(
          `[WHALE ALERT] Watch processing error ${watch.id}:`,
          error?.message || error
        );
      }
    }
  }catch(error){
    console.error(
      '[WHALE ALERT] Polling error:',
      error?.message || error
    );
  }finally{
    whaleAlertPolling = false;
  }
};

const whaleAlertInterval =
  setInterval(
    runWhaleAlertPolling,
    WHALE_ALERT_POLL_MS
  );

if(typeof whaleAlertInterval?.unref === 'function'){
  whaleAlertInterval.unref();
}

console.log(
  `[WHALE ALERT] Realtime polling hazır: ${WHALE_ALERT_POLL_MS / 1000}s`
);

/*
 * ============================================================
 * CENTRAL NOTIFICATION API
 * ============================================================
 */

app.get('/api/notifications', auth, async (req, res) => {
  try {
    await syncSecurityAlertsToCentralNotifications(req.user.id);

    const notifications = await db.notification.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    return res.json({
      success: true,
      notifications,
      unreadCount: notifications.filter(item => !item.read).length
    });
  } catch (error) {
    console.error('[NOTIFICATION LIST]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Notifications could not be loaded.'
    });
  }
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    const id = z.string().cuid().safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification id.'
      });
    }

    const existing = await db.notification.findFirst({
      where: {
        id: id.data,
        userId: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found.'
      });
    }

    const notification = await db.notification.update({
      where: {
        id: existing.id
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });

    return res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('[NOTIFICATION READ]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Notification could not be marked as read.'
    });
  }
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  try {
    const result = await db.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });

    return res.json({
      success: true,
      updatedCount: result.count
    });
  } catch (error) {
    console.error('[NOTIFICATION READ ALL]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Notifications could not be marked as read.'
    });
  }
});
const createCentralNotification = async ({
  userId,
  type,
  severity = 'INFO',
  title,
  body,
  eventKey = null,
  asset = null,
  network = null,
  resourceId = null
}

const syncSecurityAlertsToCentralNotifications = async (userId = null) => {
  try {
    const alerts = await db.securityAlert.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    let createdCount = 0;

    for (const alert of alerts) {
      if (!alert?.id || !alert?.userId) continue;

      const eventKey = `SECURITY_ALERT:${alert.id}`;

      const exists = await db.notification.findUnique({
        where: { eventKey }
      });

      if (exists) continue;

      const rawType =
        alert.type ||
        alert.alertType ||
        alert.eventType ||
        alert.category ||
        'SECURITY_ALERT';

      const normalizedType = String(rawType).toUpperCase();

      let type = 'SECURITY_ALERT';

      if (
        normalizedType.includes('SCAM') ||
        normalizedType.includes('VAULT') ||
        normalizedType.includes('SUSPICIOUS')
      ) {
        type = 'SCAM_ALERT';
      } else if (
        normalizedType.includes('WHALE') ||
        normalizedType.includes('TRANSFER')
      ) {
        type = 'WHALE_ALERT';
      }

      const severity = String(
        alert.severity ||
        alert.level ||
        'WARNING'
      ).toUpperCase();

      const title =
        alert.title ||
        alert.name ||
        (type === 'WHALE_ALERT'
          ? 'Balina İşlemi'
          : type === 'SCAM_ALERT'
            ? 'Güvenlik Uyarısı'
            : 'Güvenlik Bildirimi');

      let body =
        alert.body ||
        alert.message ||
        alert.description ||
        '';

      if (!body && alert.details) {
        body =
          typeof alert.details === 'string'
            ? alert.details
            : JSON.stringify(alert.details);
      }

      if (!body) {
        body = `${title} kaydı oluşturuldu.`;
      }

      try {
        await db.notification.create({
          data: {
            userId: alert.userId,
            type,
            severity,
            title: String(title),
            body: String(body),
            eventKey,
            asset: alert.asset ? String(alert.asset) : null,
            network: alert.network ? String(alert.network) : null,
            resourceId: String(alert.id),
            read: false
          }
        });

        createdCount++;
      } catch (createError) {
        if (createError?.code !== 'P2002') {
          console.error(
            '[CENTRAL NOTIFICATION] SecurityAlert sync error:',
            createError
          );
        }
      }
    }

    if (createdCount > 0) {
      console.log(
        `[CENTRAL NOTIFICATION] SecurityAlert sync: ${createdCount} yeni bildirim`
      );
    }
  } catch (error) {
    console.error(
      '[CENTRAL NOTIFICATION] SecurityAlert sync failed:',
      error
    );
  }
}) => {
  if (!userId || !type || !title || !body) {
    throw new Error('Central notification requires userId, type, title and body.');
  }

  try {
    if (eventKey) {
      const existing = await db.notification.findUnique({
        where: {
          eventKey
        }
      });

      if (existing) {
        return {
          created: false,
          duplicate: true,
          notification: existing
        };

;
      }
    }

    const notification = await db.notification.create({
      data: {
        userId,
        type,
        severity,
        title,
        body,
        eventKey,
        asset,
        network,
        resourceId
      }
    });

    return {
      created: true,
      duplicate: false,
      notification
    };
  } catch (error) {
    if (error?.code === 'P2002' && eventKey) {
      const existing = await db.notification.findUnique({
        where: {
          eventKey
        }
      });

      if (existing) {
        return {
          created: false,
          duplicate: true,
          notification: existing
        };
      }
    }

    console.error('[CENTRAL NOTIFICATION CREATE]', error?.message || error);
    throw error;
  }
};
const PRICE_ALERT_POLL_MS = Math.max(
  30000,
  Number(process.env.PRICE_ALERT_POLL_MS || 60000)
);

let priceAlertPolling = false;

const fetchPriceAlertPrices = async (assets) => {
  const uniqueAssets = Array.from(new Set(assets));

  if (uniqueAssets.length === 0) {
    return {};
  }

  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=' +
    encodeURIComponent(uniqueAssets.join(',')) +
    '&vs_currencies=usd';

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CoinGecko price alert HTTP ${response.status}`);
  }

  return response.json();
};

const runPriceAlertPolling = async () => {
  if (priceAlertPolling) {
    return;
  }

  priceAlertPolling = true;

  try {
    const alerts = await db.priceAlert.findMany({
      where: {
        enabled: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (alerts.length === 0) {
      return;
    }

    const prices = await fetchPriceAlertPrices(
      alerts.map((alert) => alert.asset)
    );

    for (const alert of alerts) {
      try {
        const price = Number(prices?.[alert.asset]?.usd);

        if (!Number.isFinite(price) || price <= 0) {
          console.error(
            `[PRICE ALERT] Invalid live price ${alert.asset}`
          );
          continue;
        }

        const shouldTrigger =
          alert.direction === 'ABOVE'
            ? price >= alert.targetPrice
            : alert.direction === 'BELOW'
              ? price <= alert.targetPrice
              : false;

        if (!shouldTrigger) {
          await db.priceAlert.update({
            where: {
              id: alert.id
            },
            data: {
              lastPrice: price
            }
          });

          continue;
        }

        const triggerResult = await db.$transaction(async (tx) => {
          const triggered = await tx.priceAlert.updateMany({
            where: {
              id: alert.id,
              enabled: true,
              triggered: false
            },
            data: {
              lastPrice: price,
              triggered: true,
              triggeredAt: new Date()
            }
          });

          if (triggered.count !== 1) {
            return {
              triggered: false,
              notification: false
            };
          }

          const eventKey = `PRICE_ALERT:${alert.id}`;

          const existingNotification = await tx.notification.findUnique({
            where: {
              eventKey
            }
          });

          let notificationCreated = false;

          if (!existingNotification) {
            await tx.notification.create({
              data: {
                userId: alert.userId,
                type: 'PRICE_ALERT',
                severity: 'WARNING',
                title: `Fiyat Alarmı: ${alert.asset}`,
                body:
                  `${alert.asset} fiyatı $${price} seviyesine ulaştı. ` +
                  `Hedef: $${alert.targetPrice} (${alert.direction}).`,
                eventKey,
                asset: alert.asset,
                network: alert.network,
                resourceId: alert.id
              }
            });

            notificationCreated = true;
          }

          return {
            triggered: true,
            notification: notificationCreated
          };
        });

        if (triggerResult.triggered) {
          console.log(
            `[PRICE ALERT] Triggered ${alert.id} ${alert.asset} ${price} ${alert.direction} ${alert.targetPrice}`
          );

          console.log(
            `[PRICE ALERT] Central notification ${triggerResult.notification ? 'created' : 'already exists'} ${alert.id}`
          );
        }
      } catch (error) {
        console.error(
          `[PRICE ALERT] Alert processing error ${alert.id}:`,
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error(
      '[PRICE ALERT] Polling error:',
      error?.message || error
    );
  } finally {
    priceAlertPolling = false;
  }
};

const priceAlertInterval = setInterval(
  runPriceAlertPolling,
  PRICE_ALERT_POLL_MS
);

if (typeof priceAlertInterval?.unref === 'function') {
  priceAlertInterval.unref();
}

console.log(
  `[PRICE ALERT] Polling hazır: ${PRICE_ALERT_POLL_MS / 1000}s`
);
const PRICE_ALERT_SUPPORTED_ASSETS = new Set([
  'tron',
  'solana',
  'bitcoin',
  'avalanche-2',
  'arbitrum',
  'polygon-ecosystem-token',
  'ethereum',
  'binancecoin',
  'pi-network'
]);

const normalizePriceAlertAsset = (value) => {
  if (typeof value !== 'string') return null;
  const asset = value.trim().toLowerCase();
  return PRICE_ALERT_SUPPORTED_ASSETS.has(asset) ? asset : null;
};
const normalizePriceAlertDirection = (value) => {
  if (typeof value !== 'string') return null;

  const direction = value.trim().toUpperCase();

  return direction === 'ABOVE' || direction === 'BELOW'
    ? direction
    : null;
};

app.post('/api/price-alerts', auth, async (req, res) => {
  try {
    const parsed = z.object({
      network: z.string().min(1).max(32).optional(),
      asset: z.string().min(1).max(64),
      targetPrice: z.number().finite().positive(),
      direction: z.string().optional(),
      enabled: z.boolean().optional()
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price alert input.'
      });
    }

    const asset = normalizePriceAlertAsset(parsed.data.asset);

    if (!asset) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported price alert asset.',
        supportedAssets: Array.from(PRICE_ALERT_SUPPORTED_ASSETS)
      });
    }

    const direction = normalizePriceAlertDirection(
      parsed.data.direction || 'ABOVE'
    );

    if (!direction) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be ABOVE or BELOW.'
      });
    }

    const network = typeof parsed.data.network === 'string'
      ? parsed.data.network.trim().toLowerCase()
      : asset;

    const alert = await db.priceAlert.create({
      data: {
        userId: req.user.id,
        network,
        asset,
        targetPrice: parsed.data.targetPrice,
        direction,
        enabled: parsed.data.enabled ?? true,
        triggered: false,
        triggeredAt: null,
        lastPrice: null
      }
    });

    return res.status(201).json({
      success: true,
      alert
    });
  } catch (error) {
    console.error('[PRICE ALERT CREATE]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Price alert could not be created.'
    });
  }
});
app.patch('/api/price-alerts/:id', auth, async (req, res) => {
  try {
    const id = z.string().cuid().safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price alert id.'
      });
    }

    const parsed = z.object({
      targetPrice: z.number().finite().positive().optional(),
      direction: z.string().optional(),
      enabled: z.boolean().optional(),
      asset: z.string().min(1).max(64).optional(),
      network: z.string().min(1).max(32).optional()
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price alert update.'
      });
    }

    const existing = await db.priceAlert.findFirst({
      where: {
        id: id.data,
        userId: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Price alert not found.'
      });
    }

    const data = {};

    if (parsed.data.targetPrice !== undefined) {
      data.targetPrice = parsed.data.targetPrice;
    }

    if (parsed.data.direction !== undefined) {
      const direction = normalizePriceAlertDirection(
        parsed.data.direction
      );

      if (!direction) {
        return res.status(400).json({
          success: false,
          error: 'Direction must be ABOVE or BELOW.'
        });
      }

      data.direction = direction;
    }

    if (parsed.data.enabled !== undefined) {
      data.enabled = parsed.data.enabled;
    }

    if (parsed.data.asset !== undefined) {
      const asset = normalizePriceAlertAsset(parsed.data.asset);

      if (!asset) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported price alert asset.'
        });
      }

      data.asset = asset;
    }

    if (parsed.data.network !== undefined) {
      data.network = parsed.data.network.trim().toLowerCase();
    }

    if (
      parsed.data.targetPrice !== undefined ||
      parsed.data.direction !== undefined ||
      parsed.data.asset !== undefined
    ) {
      data.triggered = false;
      data.triggeredAt = null;
    }

    const alert = await db.priceAlert.update({
      where: {
        id: existing.id
      },
      data
    });

    return res.json({
      success: true,
      alert
    });
  } catch (error) {
    console.error('[PRICE ALERT UPDATE]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Price alert could not be updated.'
    });
  }
});
app.delete('/api/price-alerts/:id', auth, async (req, res) => {
  try {
    const id = z.string().cuid().safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price alert id.'
      });
    }

    const existing = await db.priceAlert.findFirst({
      where: {
        id: id.data,
        userId: req.user.id
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Price alert not found.'
      });
    }

    await db.priceAlert.delete({
      where: {
        id: existing.id
      }
    });

    return res.json({
      success: true,
      deletedId: existing.id
    });
  } catch (error) {
    console.error('[PRICE ALERT DELETE]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Price alert could not be deleted.'
    });
  }
});
app.get('/api/price-alerts', auth, async (req, res) => {
  try {
    const alerts = await db.priceAlert.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      alerts
    });
  } catch (error) {
    console.error('[PRICE ALERT LIST]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Price alerts could not be loaded.'
    });
  }
});
/*
 * ============================================================
 * INHERITANCE PROTOCOL API
 * Non-custodial: private key / seed phrase tutulmaz.
 * ============================================================
 */

app.post('/api/inheritance', auth, async (req, res) => {
  try {
    const body = z.object({
      walletId: z.string().optional(),
      network: z.string().min(1).max(32),
      walletAddress: z.string().min(1).max(256),
      beneficiaryAddress: z.string().min(1).max(256),
      inactivityDays: z.number().int().min(1).max(3650)
    }).parse(req.body);

    const normalizedNetwork = body.network.trim().toLowerCase();
    const normalizedWalletAddress = body.walletAddress.trim().toLowerCase();

    let wallet = null;

    if (body.walletId) {
      wallet = await db.wallet.findFirst({
        where: {
          id: body.walletId,
          userId: req.user.id
        }
      });

      if (!wallet) {
        return res.status(404).json({
          success: false,
          error: 'Wallet not found or not owned by authenticated user.'
        });
      }

      if (
        wallet.network.trim().toLowerCase() !== normalizedNetwork ||
        wallet.address.trim().toLowerCase() !== normalizedWalletAddress
      ) {
        return res.status(400).json({
          success: false,
          error: 'Wallet information does not match the authenticated wallet.'
        });
      }
    } else {
      wallet = await db.wallet.findFirst({
        where: {
          userId: req.user.id,
          network: {
            equals: body.network
          },
          address: {
            equals: body.walletAddress
          }
        }
      });

      if (!wallet) {
        return res.status(403).json({
          success: false,
          error: 'Inheritance protocol requires a wallet owned by the authenticated user.'
        });
      }
    }

    const protocol = await db.inheritanceProtocol.create({
      data: {
        userId: req.user.id,
        walletId: wallet.id,
        network: body.network,
        walletAddress: body.walletAddress,
        beneficiaryAddress: body.beneficiaryAddress,
        inactivityDays: body.inactivityDays,
        lastHeartbeatAt: new Date(),
        status: 'DRAFT',
        executionStatus: 'NOT_READY'
      }
    });

    return res.status(201).json({
      success: true,
      protocol
    });
  } catch(error){
    console.error('Inheritance create error:', error);
    return res.status(400).json({
      success: false,
      error: error?.message || 'Failed to create inheritance protocol.'
    });
  }
});

app.get('/api/inheritance', auth, async (req, res) => {
  try {
    const protocols = await db.inheritanceProtocol.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({
      success: true,
      protocols
    });
  } catch(error){
    console.error('[INHERITANCE LIST]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Inheritance protocols could not be loaded.'
    });
  }
});

app.get('/api/inheritance/:id', auth, async (req, res) => {
  try {
    const protocol = await db.inheritanceProtocol.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if(!protocol){
      return res.status(404).json({
        success: false,
        error: 'Inheritance protocol not found.'
      });
    }

    return res.json({
      success: true,
      protocol
    });
  } catch(error){
    console.error('[INHERITANCE GET]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Inheritance protocol could not be loaded.'
    });
  }
});

app.post('/api/inheritance/:id/heartbeat', auth, async (req, res) => {
  try {
    const existing = await db.inheritanceProtocol.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if(!existing){
      return res.status(404).json({
        success: false,
        error: 'Inheritance protocol not found.'
      });
    }

    if(existing.status === 'CANCELLED'){
      return res.status(409).json({
        success: false,
        error: 'Cancelled inheritance protocol cannot receive heartbeat.'
      });
    }

    const now = new Date();

    const protocol = await db.inheritanceProtocol.update({
      where: {
        id: existing.id
      },
      data: {
        lastHeartbeatAt: now,
        expiresAt: new Date(
          now.getTime() + existing.inactivityDays * 24 * 60 * 60 * 1000
        ),
        status: existing.status === 'DRAFT' ? 'ACTIVE' : existing.status
      }
    });

    return res.json({
      success: true,
      protocol,
      heartbeatAt: now.toISOString()
    });
  } catch(error){
    console.error('[INHERITANCE HEARTBEAT]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Inheritance heartbeat could not be recorded.'
    });
  }
});

app.post('/api/inheritance/:id/cancel', auth, async (req, res) => {
  try {
    const existing = await db.inheritanceProtocol.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if(!existing){
      return res.status(404).json({
        success: false,
        error: 'Inheritance protocol not found.'
      });
    }

    if(existing.status === 'CANCELLED'){
      return res.json({
        success: true,
        protocol: existing
      });
    }

    const protocol = await db.inheritanceProtocol.update({
      where: {
        id: existing.id
      },
      data: {
        status: 'CANCELLED',
        executionStatus: 'NOT_READY'
      }
    });

    return res.json({
      success: true,
      protocol
    });
  } catch(error){
    console.error('[INHERITANCE CANCEL]', error?.message || error);

    return res.status(500).json({
      success: false,
      error: 'Inheritance protocol could not be cancelled.'
    });
  }
});
registerSecurityV2({
  app,
  auth,
  adapters,
  db,
  lookupScamIntelligence,
  lookupTransactionScamIntelligence
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Internal server error'})});
const server=app.listen(process.env.PORT||3000,()=>console.log('Safe Sentinel API listening'));
const shutdown=signal=>{
  console.log(`${signal} received; shutting down safely`);
  server.close(async()=>{
    await db.$disconnect();
    process.exit(0);
  });
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));







































