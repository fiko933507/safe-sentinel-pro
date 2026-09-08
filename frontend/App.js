import '@walletconnect/react-native-compat';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  FlatList,
  ScrollView,
  Dimensions,
  Linking,
  Platform,
  Alert,
  Image,
  Switch, Share } from
'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import axios from 'axios';
import { BrowserProvider, Contract } from 'ethers';
import { AppKit, AppKitProvider, useAccount, useProvider } from '@reown/appkit-react-native';
import { appKit } from './AppKitConfig';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const ERC20_REVOKE_ABI = [
'function approve(address spender, uint256 amount) returns (bool)',
'function allowance(address owner, address spender) view returns (uint256)'];

import { LineChart } from 'react-native-gifted-charts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Production: Expo public environment variables (never commit secrets to the client)
const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
const VIP_PAYMENT_USDT_ADDRESS =
process.env.EXPO_PUBLIC_VIP_PAYMENT_USDT_ADDRESS ||
'TY8UwgeCoEog8Lz6BseBXfaBRoZMG28QNn';

const VIP_MONTHLY_USDT =
Number(process.env.EXPO_PUBLIC_VIP_MONTHLY_USDT || 100);

const VIP_YEARLY_USDT =
Number(process.env.EXPO_PUBLIC_VIP_YEARLY_USDT || 1000);
const API_BASE_URL = BACKEND_URL;
const IS_PLAY_STORE_BUILD = process.env.EXPO_PUBLIC_PLAY_STORE_BUILD === 'true';
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {}
});
api.interceptors.request.use(async (config) => {
  try {
    let token = null;

    if (Platform.OS === 'web') {
      token = await AsyncStorage.getItem('user_secure_token');
    } else {
      token = await SecureStore.getItemAsync('user_secure_token');
    }

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn("Auth token okunamadı:", error);
  }

  return config;
});

// --- ENTEGRE EDİLEN YENİ SİSTEMLER (Yük Testi, Rate Limiting, Canlı Hata İzleme, Otomatik Yedekleme vb.) ---
const PerformanceMonitor = {
  logLoadTest: (moduleName, executionTimeMs) => {
    if (__DEV__) console.log(`[Yük Testi / Performance]: ${moduleName} modülü ${executionTimeMs}ms sürede render oldu.`);
  }
};

const LiveErrorTracker = {
  captureException: (error, context = 'Genel') => {
    console.error(`[Yerel Hata İzleme - Harici Servis Bağlı Değil] (${context}):`, error?.message || error);
  }
};

const RateLimiterGuard = (() => {
  const lastRequestTimes = {};
  const cooldownMs = 1000;

  return {
    checkLimit: (key = 'default') => {
      const now = Date.now();
      const lastRequestTime = lastRequestTimes[key] || 0;

      if (now - lastRequestTime < cooldownMs) {
        throw new Error("Rate limit aşıldı! Lütfen çok hızlı istek göndermeyin.");
      }

      lastRequestTimes[key] = now;
    }
  };
})();

const SecurityScannerMiddleware = {
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  },
  auditHeaders: {
    'x-security-mode': 'strict-enforced',
    'x-client-platform': 'react-native-secure'
  }
};

const ensureBackendConfigured = () => {
  if (!BACKEND_URL) {
    throw new Error('Backend URL yapılandırılmamış. EXPO_PUBLIC_BACKEND_URL tanımlayın.');
  }
};

const AutoBackupManager = {
  performBackup: async (key, data) => {
    try {
      await AsyncStorage.setItem(`@backup_${key}`, JSON.stringify({ timestamp: Date.now(), payload: data }));
    } catch (e) {
      LiveErrorTracker.captureException(e, 'AutoBackupManager');
    }
  }
};
// -------------------------------------------------------------------------------------------------

if (!(Platform.OS === 'android' && __DEV__)) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
}

/* ============================================================
   V26_GLOBAL_I18N
   Safe Sentinel Pro — Dil + Para Birimi
   ============================================================ */

const V26_GLOBAL_I18N = {
  tr: {
    name: 'Türkçe',
    nativeName: 'Türkçe'
  },
  en: {
    name: 'English',
    nativeName: 'English'
  }

};

const V26_CURRENCIES = {
  USD: {
    code: 'USD',
    symbol: '$',
    locale: 'en-US',
    label: 'US Dollar'
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    locale: 'de-DE',
    label: 'Euro'
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    locale: 'en-GB',
    label: 'British Pound'
  },
  TRY: {
    code: 'TRY',
    symbol: '₺',
    locale: 'tr-TR',
    label: 'Türk Lirası'
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    locale: 'ja-JP',
    label: 'Japanese Yen'
  },
  CNY: {
    code: 'CNY',
    symbol: '¥',
    locale: 'zh-CN',
    label: 'Chinese Yuan'
  }
};

const V26_TRANSLATIONS = {
  tr: {
    settings: 'Uygulama Ayarları',
    language: 'Dil',
    currency: 'Para Birimi',
    save: 'Kaydet',
    selectedLanguage: 'Seçili Dil',
    selectedCurrency: 'Seçili Para Birimi',
    languageSaved: 'Dil tercihiniz kaydedildi.',
    currencySaved: 'Para birimi tercihiniz kaydedildi.',
    unreadNotifications: 'Okunmamış Bildirim',
    preferencesTitle: 'Cüzdan Tercihleri ve Güvenlik',
    preferencesDescription: 'Güvenlik profilinizi ve uygulama tercihinizi kişiselleştirin.',
    autoScamBlock: 'Scam Risk Uyarıları',
    autoScamBlockDescription: 'Bilinen riskli adresleri analiz sonuçlarında uyarı olarak gösterir.',
    deleteAccount: 'Hesabı Kalıcı Olarak Sil',
    deleteAccountDescription: 'Hesabınızı ve hesabınıza bağlı kayıtları kalıcı olarak siler. Bu işlem geri alınamaz.',
    deleteAccountTitle: 'Hesabı Sil',
    deleteAccountConfirm: 'Hesabınızı ve ilişkili verilerinizi kalıcı olarak silmek istediğinizden emin misiniz?',
    deleteAccountCancel: 'Vazgeç',
    deleteAccountAction: 'Kalıcı Olarak Sil',
    deleteAccountFailed: 'Hesap silinemedi. Lütfen tekrar deneyin.',
    loginDescription: 'Yeni Nesil Kripto Güvenlik ve İstihbarat Asistanı',
    emailAddress: 'E-posta Adresi',
    loginPassword: 'Şifre',
    secureLogin: 'Güvenli Giriş Yap',
    createAccount: 'Yeni Hesap Oluştur (Kayıt Ol)',
    registerTitle: 'Yeni Hesap Kaydı',
    registerDescription: 'Bilgilerinizi girerek profilinizi oluşturun.',
    firstName: 'Adınız',
    lastName: 'Soyadınız',
    exampleFirstName: 'Örn: Fikret',
    exampleLastName: 'Örn: Bulat',
    completeRegistration: 'Hesabı Oluştur',
    backToLogin: 'Zaten hesabın var mı? Giriş Yap',
    dashboardActive: 'AKTİF',
    dashboardReady: 'HAZIR',
    dashboardWalletsMonitored: 'cüzdan izleniyor',
    dashboardNetworkStatus: 'AĞ DURUMU',
    dashboardLastBlock: 'Son blok',
    dashboardTotalPortfolio: 'TOPLAM PORTFÖY DEĞERİ',
    dashboardOpenPortfolio: 'PORTFÖYÜ AÇ',
    dashboardQuickScan: 'Hızlı Cüzdan Güvenlik Taraması',
    dashboardQuickScanDescription: 'Cüzdanı sorgula ve güvenlik kontrollerini başlat',
    dashboardLiveScan: 'LIVE SCAN',
    dashboardWalletAddress: 'CÜZDAN ADRESİ',
    dashboardWalletPlaceholder: 'cüzdan adresi...',
    dashboardQuerying: 'SORGULANIYOR...',
    dashboardQueryWallet: 'CÜZDANI SORGULA',
    dashboardWhitelist: 'WHITELIST',
    dashboardBlacklist: 'BLACKLIST',
    dashboardVault: 'KASA',
    dashboardSecurityStatus: 'Aktif Güvenlik Durumu',
    dashboardSecurityDescription: 'Kasanız ve güvenlik servislerinden gelen son durum',
    dashboardSecurityLog: 'GÜVENLİK GÜNLÜĞÜ',
    dashboardAnalysisWaiting: 'ANALİZ BEKLENİYOR',
    dashboardAnalysisAvailable: 'ANALİZ MEVCUT',
    dashboardWaiting: 'BEKLENİYOR',
    dashboardThreatIntelStatus: 'Tehdit istihbaratı durumu',
    dashboardVaultMonitoring: 'KASA İZLEME',
    dashboardLogout: 'ÇIKIŞ',
    dashboardWalletSecurityScore: 'CÜZDAN GÜVENLİK SKORU',
    dashboardSafeAddresses: 'WHITELIST',
    dashboardOpenSecurityAlerts: 'AÇIK GÜVENLİK BİLDİRİMLERİ',
    dashboardRevokeRecords: 'REVOKE KAYITLARI',
    dashboardBlockedAddresses: 'BLACKLIST',
    dashboardSecurityCenter: 'Güvenlik Merkezi',
    dashboardSecurityCenterDescription: 'İşlem, bağlantı, davranış ve sözleşme güvenliği',
    dashboardTransferShield: 'Transfer Kalkanı',
    dashboardAnalyzeOutgoing: 'Giden işlemleri analiz et',
    dashboardPhishingShield: 'Phishing Kalkanı',
    dashboardScanSuspiciousLinks: 'Şüpheli bağlantıları tara',
    dashboardAiBehavior: "Davran\u0131\u015F Analizi",
    dashboardAnalyzeWalletBehavior: "C\xFCzdan davran\u0131\u015F sinyallerini analiz et",
    dashboardSmartContract: 'Akıllı Sözleşme',
    dashboardInspectContractRisk: 'Kontrat riskini incele',
    dashboardRevokeCenter: 'Revoke Merkezi',
    dashboardCheckTokenPermissions: 'Token yetkilerini kontrol et',
    dashboardAvailable: 'MEVCUT',
    dashboardPlanned: 'PLANLANDI',
    dashboardWalletProtection: 'Cüzdan Koruma',
    dashboardWalletProtectionDescription: 'Adres, kasa ve acil durum güvenliği',
    dashboardSafeAddressesTitle: 'Whitelist',
    dashboardBlockedAddressesTitle: 'Blacklist',
    dashboardRecordLower: 'kayıt',
    dashboardVaultAssets: 'Kasa Varlıkları',
    dashboardMonitored: 'izleniyor',
    dashboardSecurityCircle: 'Güvenlik çemberi',
    dashboardIntelligenceMonitoring: 'İstihbarat ve İzleme',
    dashboardIntelligenceDescription: 'Zincir üzerindeki hareketleri ve tehditleri tek merkezde toplayın',
    dashboardWhaleWatch: 'Balina Takip',
    dashboardMonitorLargeMoves: 'Büyük hareketleri izle',
    dashboardAnalyzeThreatMatches: 'Tehdit eşleşmelerini analiz et',
    dashboardDeepChainIntel: 'Derin Zincir İstihbaratı',
    dashboardInspectAddressRelations: 'Adres ilişkilerini incele',
    dashboardEarlyThreatSignals: 'Erken tehdit sinyalleri',
    dashboardWalletBehaviorProfile: 'Cüzdan davranış profili',
    dashboardScamPatterns: 'Scam davranış kalıpları',
    dashboardAddressContractRelations: 'Adres ve kontrat ilişkileri',
    dashboardAssetsFinance: 'Varlık ve Finans',
    dashboardAssetsFinanceDescription: 'Portföy, gas, fiyat ve işlem yönetimi',
    dashboardPortfolio: 'Portföy',
    dashboardViewVaultAssets: 'Taranan cüzdan varlıklarını görüntüle',
    dashboardGasOptimization: 'Ağ İşlem Ücretleri',
    dashboardCompareNetworkFees: 'Canlı ağ ücretlerini karşılaştır',
    dashboardPriceAlert: 'Fiyat Alarmı',
    dashboardTrackTargetPrices: 'Hedef fiyatları takip et',
    dashboardTaxReport: 'Vergi Raporu',
    dashboardReportTransactionHistory: 'İşlem geçmişini raporla',
    dashboardMarketSentimentAnalysis: 'Piyasa ve sentiment analizi',
    dashboardStopLossTakeProfit: 'Stop-loss ve take-profit',
    dashboardOpenModule: 'MODÜLÜ AÇ',
    dashboardEmergencySecurity: 'Acil Güvenlik ve Varlık Koruma',
    dashboardEmergencySecurityDescription: 'Kritik durumlar ve uzun vadeli varlık güvenliği',
    dashboardEmergencyAssetLock: 'Acil Varlık Kilidi',
    dashboardEmergencyProtectionMode: 'Acil koruma modu',
    dashboardCryptoInheritance: 'Kripto Varlık Mirasçılığı',
    dashboardRecentTransactions: 'Son İşlemler',
    dashboardRecentTransactionsDescription: 'Son sorgulanan zincir hareketleri ve güvenlik sonuçları',
    dashboardRecordsUpper: 'KAYIT',
    dashboardNoTransactions: 'Henüz görüntülenecek işlem bulunmuyor.',
    dashboardTransactionsWillAppear: 'Cüzdan sorgusu yaptığınızda güvenlik sonuçları burada görünecek.',
    dashboardTransaction: 'İşlem',
    dashboardRisky: 'RİSKLİ',
    dashboardReviewed: 'İNCELENDİ',
    dashboardVipDescription: 'Gelişmiş güvenlik, sürekli kasa izleme ve genişletilmiş araç erişimi',
    dashboardVipActive: 'VIP AKTİF',
    dashboardStandard: 'STANDART',
    dashboardMonthly: 'AYLIK',
    dashboardYearly: 'YILLIK',
    dashboardVipMembershipPayment: 'VIP ÜYELİK VE ÖDEME',
    dashboardSystemOnline: 'SİSTEM ÇEVRİMİÇİ',
    dashboardSystemOffline: 'SİSTEM ÇEVRİMDIŞI',
    dashboardWallet: 'CÜZDAN',
    dashboardSettings: 'AYARLAR',
    toolBack: '‹ Geri Dön',
    toolTitleCryptoPolicies: 'Kripto Para ve Finansal Politikalar',
    toolTitlePortfolio: 'Cüzdan Portföyü',
    toolTitlePriceAlerts: 'Anlık Fiyat Alarmları',
    toolTitleOutboundShield: 'Transfer Kalkanı',
    toolTitleWhitelist: 'Whitelist',
    toolTitleBlacklist: 'Blacklist',
    toolTitleVault: 'Kasa Varlık Yönetimi',
    toolTitleNotifications: 'Bildirimler ve Dolandırıcılık Uyarıları',
    toolTitleVip: 'VIP Ödeme ve Hızlı Bildirim',
    toolTitleSmartContract: 'Akıllı Sözleşme Güvenlik Analizi',
    toolTitleBehavioral: 'Cüzdan Davranış Analizi',
    toolTitlePhishing: 'Phishing & DApp Kalkanı',
    toolTitleQuickTest: 'Hızlı Cüzdan Testi',
    toolTitleEmergencyLock: 'Acil Varlık Kilidi',
    toolTitleGasOpt: 'Ağ İşlem Ücretleri',
    toolTitleDeepIntel: 'Derin Zincir İstihbaratı',
    toolTitleAutoPhish: 'Otomatik Phishing Kalkanı',
    toolTitleGuardian: 'Guardian — Akıllı Cüzdan Koruma',
    toolTitleInheritance: "Kripto Varlık Mirasçılığı",
    toolTitleRevoke: 'Token & NFT Yetki İptal (Revoke)',
    toolTitleWhaleWatch: 'Riskli Adres / Whale (Balina) Takibi',
    toolTitleGasTime: 'Gas Ücreti Optimizatörü ve Zamanlayıcı',
    toolTitleAiMarket: "Piyasa \u0130stihbarat\u0131",
    toolTitleTaxReport: 'Vergi ve İşlem Geçmişi Raporlayıcı',
    toolTitleDexOrders: 'Otomatik Stop-Loss / Take-Profit (DEX Emirleri)',
    contractMintRpc: 'Mint RPC',
    contractMintCap: 'Mint Cap',
    contractMinterRole: 'MINTER_ROLE',
    contractOwnerMinterRole: 'Owner MINTER_ROLE',
    contractAdminRole: 'Admin Role',
    contractDefaultAdminDetected: 'DEFAULT_ADMIN_ROLE TESPİT EDİLDİ',
    wlDescription1: 'Güvenilir olarak işaretlediğiniz cüzdan adresleri burada yönetilir.',
    wlDescription2: 'Whitelist adresleri güvenlik sorgularında öncelikli olarak değerlendirilir.',
    wlSafeAddresses: 'Whitelist',
    wlRegistered: 'Kayıtlı güvenilir adresleriniz',
    wlEmpty: 'Henüz güvenli adres eklenmedi.',
    wlEmptyHelp1: 'Bir cüzdan adresini güvenli listeye eklemek için',
    wlEmptyHelp2: 'ana güvenlik merkezindeki + Whitelist butonunu kullanabilirsiniz.',
    wlSafeAddress: 'GÜVENLİ ADRES',
    commonRemove: 'Kaldır',
    blDescription1: 'Engellenen ve riskli olarak işaretlediğiniz cüzdan adresleri burada yönetilir.',
    blDescription2: 'Blacklist adresleri cüzdan sorgularında güvenlik kontrolünden önce değerlendirilir.',
    blRegistered: 'Kayıtlı engellenmiş adresleriniz',
    blEmpty: 'Henüz engellenmiş adres bulunmuyor.',
    blEmptyHelp1: 'Riskli olduğunu düşündüğünüz bir adresi ana güvenlik merkezinden',
    blEmptyHelp2: '+ Blacklist ile engelleyebilirsiniz.',
    blBlockedAddress: 'ENGELLİ ADRES',
    blRemoveBlock: 'Engeli Kaldır',
    vaultDescription1: 'Kasa, VIP kullanıcıların sürekli güvenlik takibine aldığı cüzdanları',
    vaultDescription2: 've bu cüzdanlarla ilişkili güvenlik bildirimlerini yönetir.',
    vaultAssetManagement: 'Kasa Varlık Yönetimi',
    vaultMonitoredWallets: 'Sürekli izlenen cüzdanlar',
    vaultEmpty: 'Kasada henüz izlenen cüzdan bulunmuyor.',
    vaultAddFromDashboard: 'Ana Ekrandan Kasa Cüzdanı Ekle',
    vaultUpgradeVip: 'VIP Üyeliğe Geç',
    vaultMonitoringActive: 'KASA İZLEMESİ AKTİF',
    vaultRemove: 'Kasadan Kaldır',
    vaultSecurityNotifications: 'Kasa Güvenlik Bildirimleri',
    vaultNotificationsEmpty: 'Henüz Kasa güvenlik bildirimi bulunmuyor.',
    vaultSecurityNotification: 'Kasa Güvenlik Bildirimi',
    securityNotificationReceived: 'Güvenlik bildirimi alındı.',
    notificationsCentral: 'Merkezi Bildirimler',
    notificationsDescription: 'Güvenlik, fiyat alarmı ve diğer sistem olayları',
    notificationsMarkAllRead: 'Tümünü Okundu Yap',
    notificationsEmpty: 'Henüz merkezi bildiriminiz bulunmuyor.',
    severityCritical: 'KRİTİK',
    severityHigh: 'YÜKSEK',
    severityWarning: 'UYARI',
    severityInfo: 'BİLGİ',
    notificationDefaultTitle: 'Safe Sentinel Bildirimi',
    notificationNoDetails: 'Bildirim ayrıntısı bulunmuyor.',
    notificationsRead: 'Okundu',
    notificationsRefreshInfo: 'Merkezi bildirimler sunucudan düzenli olarak yenilenir.',
    commonAnalyzing: 'Analiz Ediliyor...',
    commonRiskLevel: 'Risk Seviyesi',
    commonNetwork: 'Ağ',
    commonError: 'Hata',
    behaviorDescription: 'Gerçek zincir verilerinden cüzdanın davranışsal risk profilini çıkarın.',
    behaviorWalletPlaceholder: 'Analiz edilecek cüzdan adresi...',
    behaviorRun: '⚠️ Davranışsal Risk Profilini Çıkar',
    behaviorProfileScore: 'Profil Skoru',
    behaviorWalletAge: 'Cüzdan Yaşı',
    behaviorTotalTransactions: 'Toplam İşlem',
    behaviorSuccessfulTransactions: 'Başarılı İşlem',
    behaviorFailedTransactions: 'Başarısız İşlem',
    behaviorFailedRatio: 'Başarısızlık Oranı',
    behaviorIncoming: 'Gelen İşlemler',
    behaviorOutgoing: 'Giden İşlemler',
    behaviorUniqueCounterparties: 'Benzersiz Karşı Taraf',
    behaviorTokenTransfers: 'Token Transferleri',
    behaviorDistinctTokens: 'Farklı Token',
    behaviorMixerSignal: 'Mixer / Gizlilik Sinyali',
    behaviorBotAutomation: 'Bot / Otomasyon',
    behaviorRiskReasons: 'Risk Nedenleri',
    behaviorRiskSignals: 'Risk Sinyalleri',
    behaviorScamMatch: '⚠️ Scam istihbaratı ile eşleşme bulundu.',
    whaleDescription: 'Büyük balina cüzdanlarının fon transferlerini anlık takip edin.',
    whalePlaceholder: 'Takip edilecek balina cüzdan adresi...',
    whaleEmptyAddress: 'Adres boş olamaz',
    whaleAdded: 'Balina adresi izleme listesine eklendi.',
    whaleAdd: 'Balina Adresi Ekle',
    whaleActive: 'Aktif İzlenen Balinalar',
    whaleWaitingRealData: 'Gerçek işlem verisi bekleniyor',
    gasTimeDescription: '⛽ Ağ yoğunluğuna göre en ekonomik transfer saatini seçin.',
    gasTimeMode: 'Optimizasyon Modu',
    gasTimeStandard: 'Standard',
    gasTimeEconomic: 'Ekonomik (%30 Ucuz Zaman Dilimi)',
    gasTimeEmergency: 'Acil (Hızlı İşlem)',
    gasTimeConfigured: 'Gas zamanlayıcı şu moda göre ayarlandı:',
    gasTimeSave: 'Gas Stratejisini Kaydet',
    portfolioDescription: 'Grafik verileri yalnızca Kasa (Vault) bölümüne eklediğiniz aktif kripto ve cüzdan varlıklarınızdan derlenmektedir.',
    portfolioNoAssets: 'Kasada Varlık Bulunamadı!',
    portfolioNoAssetsDescription: 'Portföy grafiğini görebilmek için önce cüzdanınızı kasaya eklemelisiniz. Kasaya varlık eklemek VIP hesap gerektirir.',
    portfolioAddVaultVip: "Kasaya Varlık Ekle (VIP'e Geç)",
    portfolioVaultValue: 'Kasa Portföy Değeri',
    portfolioAssetsMonitored: 'Varlık İzleniyor',
    priceDescription: 'İstediğiniz kripto varlığı seçerek hedef fiyat eşiklerine ulaşıldığında anında push bildirimi alın.',
    priceSystemTitle: 'Kripto Fiyat Alarm Sistemi',
    priceSystemDescription: 'Seçilen varlık hedef değere ulaştığında haber ver.',
    priceSelectCrypto: 'Alarm Kurulacak Kripto:',
    priceTargetPlaceholder: 'Hedef Fiyat',
    priceVipLimitTitle: 'VIP Sınırı',
    priceVipLimitMessage: 'Standart hesaplar en fazla 8 adet fiyat alarmı kurabilir.',
    commonMissingInfo: 'Eksik Bilgi',
    priceEnterValidTarget: 'Lütfen geçerli bir hedef fiyat giriniz.',
    priceAlertCreated: 'Fiyat Alarmı Kuruldu',
    priceTargetActivated: 'için hedef aktif edildi:',
    commonSuccess: 'Başarılı',
    priceSavedBackend: "varlığı için fiyat alarmı backend'e kaydedildi.",
    priceSaveFailed: 'Kayıt Başarısız',
    priceBackendSaveFailed: "Fiyat alarmı backend'e kaydedilemedi.",
    priceSaveAlert: 'Alarmını Kaydet',
    priceActiveAlerts: 'Aktif Fiyat Alarmlarınız',
    priceNoAlerts: 'Henüz kayıtlı bir fiyat alarmınız bulunmuyor.',
    commonDelete: 'Sil',
    gasRecommendedNetwork: 'ÖNERİLEN AĞ',
    gasLowestLiveValue: 'Canlı gas verileri içindeki en düşük değer.',
    guardianDescription: 'Guardian güvenlik profiliniz backend ile senkronize edilir. Sistem cüzdan davranışı, Scam DNA, Security Graph ve Early Warning sinyallerini birlikte değerlendirir.',
    guardianNonCustodial: 'Non-custodial koruma motoru — işlem imzalamaz, fon taşımaz.',
    guardianThreshold: 'Kritik Alarm Eşik Değeri ($):',
    guardianThresholdPlaceholder: 'Örn: 500 USD...',
    guardianInvalidThreshold: 'Geçerli bir alarm eşik değeri girin.',
    guardianUpdated: 'Guardian güvenlik profili backend üzerinde güncellendi.',
    guardianUpdateFailed: 'Guardian profili güncellenemedi.',
    commonSaving: 'Kaydediliyor...',
    guardianSaveSettings: 'Guardian Ayarlarını Kaydet',
    guardianProfileUnavailable: 'Guardian profili alınamadı.',
    guardianProfileRefreshed: 'Guardian profili backend üzerinden yenilendi.',
    guardianProfileLoadFailed: 'Guardian profili yüklenemedi.',
    guardianRefreshProfile: 'Guardian Profilini Yenile',
    guardianProfileStatus: 'Profil durumu',
    guardianSynced: 'Backend ile senkronize',
    guardianNotLoaded: 'Henüz yüklenmedi',
    guardianLiveRisk: 'Guardian Canlı Risk Değerlendirmesi',
    guardianRiskDescription1: 'Seçili cüzdan Behavioral Fingerprint, Scam DNA,',
    guardianRiskDescription2: 'Security Graph ve Early Warning motorlarıyla değerlendirilir.',
    guardianAnalyzing: 'Guardian Analiz Ediyor...',
    guardianRunAnalysis: 'Guardian Risk Analizini Çalıştır',
    guardianDecision: 'Karar',
    guardianRiskScore: 'Risk Skoru',
    guardianRiskLevel: 'Risk Seviyesi',
    guardianProtectionMode: 'Koruma modu',
    quickDescription: 'Standart kullanıcılar ilk üyelikten sonra sadece 1 kez bu testi yapabilir. VIP kullanıcılar sınırsız sorgulama yapabilir.',
    quickWalletPlaceholder: 'Test edilecek cüzdan adresi...',
    quickStartTest: 'Hızlı Cüzdan Testini Başlat',
    emergencyDescription: 'Acil Varlık Kilidi: Bu sürümde gerçek blockchain kilitleme işlemi bağlı değildir. Bu ekran yalnızca yerel güvenlik senaryosunu gösterir.',
    emergencyStatus: 'Kilit Durumu: YEREL MOD — BLOCKCHAIN KİLİDİ DEĞİL',
    emergencyAlertMessage: 'Gerçek blockchain kilitleme işlemi bu sürümde aktif değil. Varlık transferi bu butonla dondurulmaz.',
    emergencyButton: 'Acil Varlık Kilidi — Gerçek Blockchain Kilidi Bağlı Değil',
    gasDescription: 'Güncel ağ gas ücretlerini karşılaştırın.',
    gasLiveFees: 'CANLI GAS ÜCRETLERİ',
    gasStrategy: 'Önerilen Gas Stratejisi',
    gasStrategyDescription: 'Canlı RPC verilerine göre ağ ücretlerini karşılaştırarak daha uygun ağı tercih edin.',
    deepIntelDescription: 'Blokzincir derinlik analizi ile cüzdanın fon kaynaklarını listeler.',
    deepIntelScan: 'İstihbarat Taraması',
    deepIntelCleanSource: 'Fon kaynağı temiz ve doğrulanmış borsalarla ilişkilendirilmiş.',
    outboundDescription: 'Cüzdanınızdan dışarıya yapacağınız transferleri test edin.',
    outboundRecipientPlaceholder: 'Hedef Alıcı Cüzdan Adresi...',
    commonScanning: 'Taranıyor...',
    outboundTestTransfer: 'Transferi Test Et',
    commonRiskLevel: 'Risk Seviyesi',
    contractDescription: 'EVM akıllı sözleşme adresini girerek gerçek blockchain verileri üzerinden temel güvenlik ve risk analizi yapın.',
    contractAddressPlaceholder: 'Akıllı Sözleşme Adresi (0x...)...',
    commonAnalyzing: 'Analiz Ediliyor...',
    contractAnalyze: 'Sözleşmeyi Analiz Et',
    commonRiskScore: 'Risk Skoru',
    contractBuyTax: 'Alış Vergisi',
    contractSellTax: 'Satış Vergisi',
    contractMintPermission: 'Mint Yetkisi',
    commonSupported: 'DESTEKLENİYOR',
    commonNotSupported: 'DESTEKLENMİYOR',
    commonDetected: 'TESPİT EDİLDİ',
    commonYes: 'EVET',
    commonNo: 'HAYIR',
    contractAdminCount: 'Admin Sayısı',
    phishingDescription: 'Ziyaret etmek istediğiniz web sitesinin sahte olup olmadığını test edin.',
    phishingScanSite: 'Bağlantıyı ve Siteyi Tara',
    phishingDomainAge: 'Alan Adı Yaşı',
    revokeDescription: "Kasaya (Vault) eklediğiniz kripto varlıklara ve NFT'lere ait aktif akıllı sözleşme harcama izinleri.",
    revokeNoAllowance: 'Revoke Taraması İçin Cüzdan Gerekli',
    revokeEmptyDescription: 'Revoke taraması için Vault’a desteklenen bir EVM cüzdanı ekleyin. Henüz tarama yapılmadığı için aktif harcama yetkisi sonucu bulunmuyor.',
    revokeAsset: 'Varlık',
    revokeSpenderContract: 'Spender / Kontrat',
    commonStatus: 'Durum',
    revokeRevoking: 'İptal Ediliyor...',
    revokePermission: 'Yetkiyi İptal Et (Revoke)',
    autoPhishDescription: 'Tarayıcı ve DApp bağlantılarınızı oltalama sitelerine karşı korur.',
    autoPhishActive: 'Bağlantı Tarama Koruması',
    autoPhishLast24h: 'Bağlantılar yalnızca kullanıcı tarama başlattığında kontrol edilir; sistem tarayıcı trafiğini otomatik olarak engellemez.',
    vipMembershipTitle: 'Safe Sentinel Pro VIP Üyelik',
    vipMembershipDescription: 'Genişletilmiş cüzdan sorgulama, kasa izleme ve gelişmiş güvenlik analizi modüllerine erişim sağlayın.',
    vipPayTrc20: 'TRC20 USDT ile Öde',
    vipTxidPlaceholder: 'İşlem Hash (TXID) değerini girin...',
    vipNotifyPayment: 'Ödemeyi Bildir ve Onayla',
    policiesDescription: 'Safe Sentinel Pro finansal varlık yönetimi, kripto işlemleri, hukuki bilgilendirme ve platform güvenliğiyle ilgili politika açıklamalarını sunar.',
    policiesAssetTitle: '1. Varlık Güvenliği ve Kasa Politikası',
    policiesAssetBody: 'Kasaya (Vault) eklenen cüzdanlar ve tespit edilen akıllı sözleşme harcama izinleri (Revoke), kullanılabilir tehdit istihbaratı kaynaklarıyla analiz edilir. Safe Sentinel Pro şüpheli etkileşimler için risk uyarıları üretir; kullanıcı onayı olmadan zincir üstü işlemleri durdurmaz veya varlıkları taşımaz.',
    policiesLegalTitle: '2. Hukuki Uyum ve Sorumluluk Reddi',
    policiesLegalBody: 'Platform, geçerli veri koruma ve finansal düzenlemelere uyum hedefiyle geliştirilir. Analizler, yapay zekâ sonuçları ve güvenlik taramaları yalnızca bilgilendirme amaçlıdır; yatırım, hukuk veya vergi tavsiyesi değildir.',
    policiesFeesTitle: '3. Şeffaflık ve Ücret Politikası',
    policiesFeesBody: 'Temel sorgulama hakları ve VIP abonelik koşulları kullanıcıya açıkça gösterilir. TRON/TRX ağı üzerinden yapılan VIP ödemeleri TXID doğrulamasından sonra etkinleştirilir. Ağ ücretleri ve geçerli abonelik bedelleri ödeme öncesinde ayrıca gösterilmelidir.',
    policiesPrivacyTitle: '4. Gizlilik ve Veri Koruma Standartları',
    policiesPrivacyBody: 'Kimlik doğrulama belirteçleri desteklenen mobil cihazlarda SecureStore içinde saklanır. Web ortamında kullanılan AsyncStorage şifreli kasa değildir; hassas veriler ve özel anahtarlar burada saklanmamalıdır. Safe Sentinel Pro kullanıcıların özel anahtarlarını talep etmemeli veya saklamamalıdır.',
    inheritDescription: 'Cüzdan sahibinin belirlediği hareketsizlik süresi dolduğunda uygulanacak miras talimatlarını yönetin. Zincir üstü aktarım, ayrıca doğrulanmış ve yetkilendirilmiş bir yürütme mekanizması gerektirir.',
    inheritProtocolTitle: 'Varlık Mirasçılığı Protokolü',
    inheritInactivityDays: 'Sinyal Yokluğu Süresi (Gün)',
    inheritDaysPlaceholder: 'Örn: 30 gün...',
    inheritBeneficiary: 'Varis Cüzdan Adresi',
    inheritBeneficiaryPlaceholder: 'Varis cüzdan adresi...',
    inheritCreate: 'Miras Protokolü Oluştur',
    inheritLoading: 'Miras protokolleri yükleniyor...',
    inheritEmpty: 'Henüz kayıtlı miras protokolü bulunmuyor.',
    inheritStatusActive: 'AKTİF',
    inheritStatusCancelled: 'İPTAL EDİLDİ',
    inheritStatusDraft: 'TASLAK',
    inheritProtocol: 'Miras Protokolü',
    inheritBeneficiaryShort: 'Varis',
    inheritInactivityPeriod: 'Hareketsizlik süresi',
    inheritDays: 'gün',
    inheritLastHeartbeat: 'Son sinyal',
    inheritRefreshHeartbeat: 'Sinyali Yenile',
    inheritCancel: 'Protokolü İptal Et',
    aiMarketDescription: "Canl\u0131 piyasa verilerinden \xFCretilen kural tabanl\u0131 duyarl\u0131l\u0131k ve risk g\xF6stergelerini g\xF6r\xFCnt\xFCleyin.",
    aiMarketAnalyzing: 'Analiz Ediliyor...',
    aiMarketRun: 'Piyasa Duyarlılık Analizini Çalıştır',
    aiMarketTitle: 'Piyasa İstihbaratı',
    aiMarketSentiment: 'Duyarlılık',
    aiMarketScore: 'Skor',
    aiMarketLiveData: 'Canlı Piyasa Verileri',
    aiMarketCap: 'Piyasa Değeri',
    aiMarketChange24h: '24 Saatlik Değişim',
    aiMarketVolume: 'İşlem Hacmi',
    aiMarketBtcDominance: 'BTC Dominansı',
    aiMarketEthDominance: 'ETH Dominansı',
    aiMarketVolumeRatio: 'Hacim / Piyasa Değeri',
    aiMarketSignals: 'Gerçek Piyasa Sinyalleri',
    aiMarketWhaleTrend: 'Balina Eğilimi',
    aiMarketSource: 'Kaynak',
    aiMarketAnalysis: 'Analiz',
    aiMarketDisclaimer: 'Bu sonuç gerçek piyasa verilerinden üretilen kural tabanlı bir analizdir; yatırım tavsiyesi değildir.',
    aiMarketUnavailable: 'Piyasa istihbaratı sonucu alınamadı.',
    taxDescription: 'Cüzdan hareketlerinizi vergi ve denetim raporu formatında dışa aktarın.',
    taxPeriod: 'Rapor Dönemi',
    taxReadyTitle: 'Yakında',
    taxReadyMessage: 'Doğrulanmış CSV/PDF dışa aktarma özelliği henüz production kullanımına açık değildir.',
    taxDownload: 'Raporlama Yakında Kullanılabilir',
    dexDescription: 'DEX üzerinde stop-loss ve take-profit emir taslakları oluşturun. Gerçek zincir üstü yürütme, cüzdan imzası ve desteklenen bir emir protokolü gerektirir.',
    dexSelectAsset: 'Varlık Seçin',
    dexAssetPlaceholder: 'Örn: TRX, ETH...',
    dexStopLossPlaceholder: 'Stop-Loss Fiyatı ($)...',
    dexTakeProfitPlaceholder: 'Take-Profit Fiyatı ($)...',
    dexMissingTitle: 'Eksik Bilgi',
    dexMissingMessage: 'Lütfen varlık, Stop-Loss ve Take-Profit fiyatlarını doldurun.',
    dexSavedMessage: 'için DEX emir taslağı kaydedildi. Zincir üstü yürütme henüz gerçekleştirilmedi.',
    dexSaveDraft: 'DEX Emir Taslağını Kaydet',
    dexRecommendedNetwork: 'ÖNERİLEN AĞ',
    dexLowestGas: 'Canlı gas verilerindeki en düşük değer.',
    dexActiveOrders: 'Aktif Emir Taslakları',
    dexNoOrders: 'Kayıtlı emir taslağı bulunmuyor.',
    dexCancel: 'İptal',
    registerStrongPasswordPlaceholder: 'Güçlü bir şifre belirleyin',
    registerVaultOptional: 'Kasaya Eklenecek Cüzdan (Opsiyonel)',
    registerVaultPlaceholder: 'T... veya 0x... adresiniz',
    registerVipQuestion: 'Kayıt Sırasında VIP Olmak İster misiniz?',
    commonErrorTitle: 'Hata',
    commonInfoTitle: 'Bilgi',
    commonSuccessTitle: 'Başarılı',
    commonConflictTitle: 'Çakışma Hatası',
    commonInvalidAddress: 'Geçersiz adres.',
    commonAddressRequired: 'Adres alanı boş olamaz!',
    whitelistNotFound: 'Adres Whitelist listesinde bulunamadı.',
    whitelistRemoved: 'Adres Whitelist listesinden kaldırıldı.',
    whitelistAlready: 'Bu adres zaten Whitelist listesinde ekli.',
    whitelistConflict: 'Bu adres zaten Blacklist listesinde kayıtlı!',
    whitelistAdded: 'Adres Whitelist listesine eklendi.',
    blacklistNotFound: 'Adres Blacklist listesinde bulunamadı.',
    blacklistRemoved: 'Adres Blacklist listesinden kaldırıldı.',
    blacklistAlready: 'Bu adres zaten Blacklist listesinde ekli.',
    blacklistConflict: 'Bu adres zaten Whitelist listesinde kayıtlı!',
    blacklistRiskAdded: 'Adres riskli olarak işaretlendi ve güvenlik kontrollerine eklendi.',
    vaultRemoveTitle: 'Kasa Adresini Kaldır',
    vaultRemoveConfirm: 'Bu cüzdanı Kasa izleme listesinden kaldırmak istediğinizden emin misiniz?',
    commonCancel: 'Vazgeç',
    commonRemove: 'Kaldır',
    vaultRemoved: 'Cüzdan Kasa izleme listesinden kaldırıldı.',
    vaultVipRequired: 'Vault cüzdanı eklemek için aktif VIP aboneliğiniz bulunmalıdır.',
    vaultAlready: 'Bu adres zaten kasada izleniyor.',
    vaultLimitTitle: 'Limit Doldu',
    vaultLimitMessage: 'VIP hesaplar kasaya en fazla 10 adet cüzdan ekleyebilir.',
    vaultAdded: 'Adres kasaya ve dinamik varlık/yetki yöneticisine eklendi.',
    inheritWalletMissingTitle: 'Cüzdan Adresi Eksik',
    inheritWalletMissingMessage: 'Miras protokolü için önce ana cüzdan adresini girin.',
    inheritBeneficiaryMissingMessage: 'Lütfen geçerli bir varis cüzdan adresi girin.',
    inheritInvalidDaysTitle: 'Geçersiz Süre',
    inheritInvalidDaysMessage: 'Sinyal yokluğu süresi 1 ile 3650 gün arasında olmalıdır.',
    inheritCreatedTitle: 'Miras Protokolü Oluşturuldu',
    inheritCreateFailedTitle: 'Miras Protokolü Hatası',
    inheritCreateFailed: 'Miras protokolü oluşturulamadı.',
    inheritHeartbeatUpdatedTitle: 'Heartbeat Güncellendi',
    inheritHeartbeatUpdated: 'Miras protokolünün yaşam sinyali backend üzerinde güncellendi.',
    inheritHeartbeatFailedTitle: 'Heartbeat Hatası',
    inheritHeartbeatFailed: 'Heartbeat güncellenemedi.',
    inheritCancelledTitle: 'Miras Protokolü İptal Edildi',
    inheritCancelled: 'Protokol backend üzerinde iptal edildi.',
    inheritCancelFailedTitle: 'İptal Hatası',
    inheritCancelFailed: 'Miras protokolü iptal edilemedi.', runtimeWalletNotConnected: "EVM c\xFCzdan ba\u011Fl\u0131 de\u011Fil.", runtimeWalletVerificationFailed: "Ba\u011Fl\u0131 c\xFCzdan adresi do\u011Frulanamad\u0131.", runtimeLoginSuccessTitle: "Giri\u015F Ba\u015Far\u0131l\u0131", runtimeLoginFailedTitle: "Giri\u015F Ba\u015Far\u0131s\u0131z", runtimeLoginFailedGeneric: "E-posta veya \u015Fifre hatal\u0131 ya da sunucuya ula\u015F\u0131lam\u0131yor.", runtimeMissingInfoTitle: "Eksik Bilgi", runtimeRegisterMissingFields: "L\xFCtfen ad, soyad, e-posta ve \u015Fifre alanlar\u0131n\u0131 doldurunuz.", runtimeInvalidPasswordTitle: "Ge\xE7ersiz \u015Eifre", runtimeInvalidPasswordMessage: "\u015Eifreniz en az 10 karakter olmal\u0131d\u0131r.", runtimeInvalidRegisterResponse: "Sunucudan ge\xE7ersiz kay\u0131t yan\u0131t\u0131 geldi.", runtimeRegisterSuccessTitle: "Kay\u0131t Ba\u015Far\u0131l\u0131", runtimeRegisterFailedTitle: "Kay\u0131t Ba\u015Far\u0131s\u0131z", runtimeRegisterFailedGeneric: "Kay\u0131t s\u0131ras\u0131nda sunucuya ula\u015F\u0131lamad\u0131.", runtimeStrongPasswordPlaceholder: "G\xFC\xE7l\xFC bir \u015Fifre belirleyin", runtimeOptionalVaultWallet: "Kasaya Eklenecek C\xFCzdan (Opsiyonel)", runtimeWalletPlaceholder: "T... veya 0x... adresiniz", runtimeRegisterVipQuestion: "Kay\u0131t S\u0131ras\u0131nda VIP Olmak \u0130ster misiniz?", runtimeInheritanceWalletMissingTitle: "C\xFCzdan Adresi Eksik", runtimeInheritanceWalletMissingMessage: "Miras protokol\xFC i\xE7in \xF6nce ana c\xFCzdan adresini girin.", runtimeInheritanceBeneficiaryMissing: "L\xFCtfen ge\xE7erli bir varis c\xFCzdan adresi girin.", runtimeInvalidDurationTitle: "Ge\xE7ersiz S\xFCre", runtimeInvalidDurationMessage: "Sinyal yoklu\u011Fu s\xFCresi 1 ile 3650 g\xFCn aras\u0131nda olmal\u0131d\u0131r.", runtimeInheritanceCreatedTitle: "Miras Protokol\xFC Olu\u015Fturuldu", runtimeInheritanceErrorTitle: "Miras Protokol\xFC Hatas\u0131", runtimeInheritanceCreateFailed: "Miras protokol\xFC olu\u015Fturulamad\u0131.", runtimeHeartbeatUpdatedTitle: "Heartbeat G\xFCncellendi", runtimeHeartbeatUpdatedMessage: "Miras protokol\xFCn\xFCn ya\u015Fam sinyali backend \xFCzerinde g\xFCncellendi.", runtimeHeartbeatErrorTitle: "Heartbeat Hatas\u0131", runtimeHeartbeatFailed: "Heartbeat g\xFCncellenemedi.", runtimeInheritanceCancelledTitle: "Miras Protokol\xFC \u0130ptal Edildi", runtimeInheritanceCancelledMessage: "Protokol backend \xFCzerinde iptal edildi.", runtimeCancelErrorTitle: "\u0130ptal Hatas\u0131", runtimeInheritanceCancelFailed: "Miras protokol\xFC iptal edilemedi.", runtimeVipRequiredTitle: "VIP Gerekli", runtimeVaultVipRequired: "Vault c\xFCzdan\u0131 eklemek i\xE7in aktif VIP aboneli\u011Finiz bulunmal\u0131d\u0131r.", runtimeVaultLimitTitle: "Vault Limiti", runtimeVaultLimitMessage: "VIP hesab\u0131n\u0131zda en fazla 10 c\xFCzdan izlenebilir.", runtimeVaultSyncErrorTitle: "Vault Senkronizasyon Hatas\u0131", runtimeVaultSyncErrorMessage: "C\xFCzdan backend'e kaydedilemedi.", runtimePortfolioNoData: "D\u0131\u015Fa aktar\u0131lacak ger\xE7ek blockchain verisi bulunamad\u0131.", runtimeEnterValidWallet: "L\xFCtfen sorgulanacak ge\xE7erli bir c\xFCzdan adresi girin!", runtimeInvalidWalletFormat: "Ge\xE7ersiz Adres Format\u0131", runtimeFreeQueryLimit: "\xDCcretsiz 1 sorgu hakk\u0131n\u0131z bitti. Standart kullan\u0131c\u0131lar i\xE7in sadece 1 kez bu test yap\u0131labilir. Sonraki c\xFCzdan sorgular\u0131 i\xE7in VIP \xFCyeli\u011Fe ge\xE7meniz gerekmektedir.", runtimeBlacklistWarning: "\u26A0\uFE0F D\u0130KKAT: Bu adres k\xFCresel scam havuzunda (Blacklist) kay\u0131tl\u0131 tehlikeli bir c\xFCzdand\u0131r!", runtimeBlockedRisk: "\u0130\u015Flem Engellendi (Riskli Adres)", runtimeCriticalSecurityAlert: "KR\u0130T\u0130K G\xDCVENL\u0130K UYARISI", runtimeScamWalletScanned: "Scam c\xFCzdan sorguland\u0131!", runtimeLoadingChain: "Backend sunucusundan ger\xE7ek zincir verileri \xE7ekiliyor...", runtimeScamAddressWarning: "\u26A0\uFE0F D\u0130KKAT: Bu adres evrensel a\u011Flar \xFCzerinde doland\u0131r\u0131c\u0131l\u0131k faaliyetleriyle ili\u015Fkilendirilmi\u015F!", runtimeDangerousScamAddress: "Tehlikeli / Scam Adres", runtimeScamWalletDetected: "Evrensel scam c\xFCzdan tespit edildi.", runtimeRevokeNotNeededTitle: "Revoke Gerekli De\u011Fil", runtimeRevokeNotNeededMessage: "Bu token i\xE7in belirtilen spender adresinin mevcut harcama yetkisi zaten s\u0131f\u0131r.", runtimeConnectEvmWallet: "\xD6nce EVM c\xFCzdan\u0131n\u0131z\u0131 ba\u011Flaman\u0131z gerekiyor.", runtimeRevokeUnsupportedNetwork: "Bu a\u011F i\xE7in revoke i\u015Flemi hen\xFCz desteklenmiyor.", runtimeInvalidConnectedEvmWallet: "Ba\u011Fl\u0131 EVM c\xFCzdan adresi ge\xE7ersiz.", runtimeInvalidTokenContract: "Token kontrat adresi ge\xE7ersiz.", runtimeInvalidSpenderContract: "Spender kontrat adresi ge\xE7ersiz.", runtimeRevokePrepareFailed: "Revoke i\u015Flemi backend taraf\u0131ndan haz\u0131rlanamad\u0131.", runtimeRevokeAllowanceMissing: "Backend revoke haz\u0131rl\u0131\u011F\u0131nda allowance de\u011Feri bulunamad\u0131.", runtimeRevokeSentTitle: "Revoke \u0130\u015Flemi G\xF6nderildi", runtimeRevokeConfirmedTitle: "Revoke Do\u011Fruland\u0131", runtimeRevokePrepareErrorTitle: "Revoke Haz\u0131rlama Hatas\u0131", runtimeInvalidAddressTitle: "Ge\xE7ersiz Adres", runtimeAnalysisFailedTitle: "Analiz Ba\u015Far\u0131s\u0131z", runtimeBehaviorAnalysisFailedTitle: "Davran\u0131\u015F Analizi Ba\u015Far\u0131s\u0131z", runtimeInvalidUrlTitle: "Ge\xE7ersiz URL", runtimePhishingAnalysisFailedTitle: "Phishing Analizi Ba\u015Far\u0131s\u0131z", runtimeTrc20PaymentTitle: "TRC20 USDT \xD6deme", runtimeErrorTitle: "Hata", runtimeInvalidTxidTitle: "Ge\xE7ersiz TXID", runtimeVipActivatedTitle: "VIP Aktivasyonu Ba\u015Far\u0131l\u0131", runtimeVerificationCompleteTitle: "Do\u011Frulama Tamamland\u0131", runtimeVipVerificationFailedTitle: "VIP Do\u011Frulama Ba\u015Far\u0131s\u0131z", runtimeSecurityCommandCenter: "SECURITY COMMAND CENTER", runtimeScamIntelligenceTitle: "SCAM INTELLIGENCE", runtimeBlockedAddressesTitle: "Blacklist"
  },
  en: {
    settings: 'Application Settings',
    language: 'Language',
    currency: 'Currency',
    save: 'Save',
    selectedLanguage: 'Selected Language',
    selectedCurrency: 'Selected Currency',
    languageSaved: 'Your language preference has been saved.',
    currencySaved: 'Your currency preference has been saved.',
    unreadNotifications: 'Unread Notifications',
    preferencesTitle: 'Wallet Preferences & Security',
    preferencesDescription: 'Customize your security profile and app preferences.',
    autoScamBlock: 'Scam Risk Warnings',
    autoScamBlockDescription: 'Shows known risky addresses as warnings in analysis results.',
    deleteAccount: 'Permanently Delete Account',
    deleteAccountDescription: 'Permanently deletes your account and associated records. This action cannot be undone.',
    deleteAccountTitle: 'Delete Account',
    deleteAccountConfirm: 'Are you sure you want to permanently delete your account and associated data?',
    deleteAccountCancel: 'Cancel',
    deleteAccountAction: 'Delete Permanently',
    deleteAccountFailed: 'The account could not be deleted. Please try again.',
    loginDescription: 'Next Generation Crypto Security and Intelligence Assistant',
    emailAddress: 'Email Address',
    loginPassword: 'Password',
    secureLogin: 'Secure Login',
    createAccount: 'Create New Account (Register)',
    registerTitle: 'Create Account',
    registerDescription: 'Enter your information to create your profile.',
    firstName: 'First Name',
    lastName: 'Last Name',
    exampleFirstName: 'Example: John',
    exampleLastName: 'Example: Smith',
    completeRegistration: 'Create Account',
    backToLogin: 'Already have an account? Sign In',
    dashboardActive: 'ACTIVE',
    dashboardReady: 'READY',
    dashboardWalletsMonitored: 'wallets monitored',
    dashboardNetworkStatus: 'NETWORK STATUS',
    dashboardLastBlock: 'Latest block',
    dashboardTotalPortfolio: 'TOTAL PORTFOLIO VALUE',
    dashboardOpenPortfolio: 'OPEN PORTFOLIO',
    dashboardQuickScan: 'Quick Wallet Security Scan',
    dashboardQuickScanDescription: 'Query the wallet and start security checks',
    dashboardLiveScan: 'LIVE SCAN',
    dashboardWalletAddress: 'WALLET ADDRESS',
    dashboardWalletPlaceholder: 'wallet address...',
    dashboardQuerying: 'QUERYING...',
    dashboardQueryWallet: 'QUERY WALLET',
    dashboardWhitelist: 'WHITELIST',
    dashboardBlacklist: 'BLACKLIST',
    dashboardVault: 'VAULT',
    dashboardSecurityStatus: 'Active Security Status',
    dashboardSecurityDescription: 'Latest status from your Vault and security services',
    dashboardSecurityLog: 'SECURITY LOG',
    dashboardAnalysisWaiting: 'WAITING FOR ANALYSIS',
    dashboardAnalysisAvailable: 'ANALYSIS AVAILABLE',
    dashboardWaiting: 'WAITING',
    dashboardThreatIntelStatus: 'Threat intelligence status',
    dashboardVaultMonitoring: 'VAULT MONITORING',
    dashboardLogout: 'LOG OUT',
    dashboardWalletSecurityScore: 'WALLET SECURITY SCORE',
    dashboardSafeAddresses: 'WHITELIST',
    dashboardOpenSecurityAlerts: 'OPEN SECURITY ALERTS',
    dashboardRevokeRecords: 'REVOKE RECORDS',
    dashboardBlockedAddresses: 'BLACKLIST',
    dashboardSecurityCenter: 'Security Center',
    dashboardSecurityCenterDescription: 'Transaction, connection, behavior and smart contract security',
    dashboardTransferShield: 'Transfer Shield',
    dashboardAnalyzeOutgoing: 'Analyze outgoing transactions',
    dashboardPhishingShield: 'Phishing Shield',
    dashboardScanSuspiciousLinks: 'Scan suspicious links',
    dashboardAiBehavior: "Behavior Analysis",
    dashboardAnalyzeWalletBehavior: "Analyze wallet behavior signals",
    dashboardSmartContract: 'Smart Contract',
    dashboardInspectContractRisk: 'Inspect contract risk',
    dashboardRevokeCenter: 'Revoke Center',
    dashboardCheckTokenPermissions: 'Check token permissions',
    dashboardAvailable: 'AVAILABLE',
    dashboardPlanned: 'PLANNED',
    dashboardWalletProtection: 'Wallet Protection',
    dashboardWalletProtectionDescription: 'Address, vault and emergency security',
    dashboardSafeAddressesTitle: 'Whitelist',
    dashboardBlockedAddressesTitle: 'Blacklist',
    dashboardRecordLower: 'records',
    dashboardVaultAssets: 'Vault Assets',
    dashboardMonitored: 'monitored',
    dashboardSecurityCircle: 'Security circle',
    dashboardIntelligenceMonitoring: 'Intelligence & Monitoring',
    dashboardIntelligenceDescription: 'Bring on-chain activity and threats together in one place',
    dashboardWhaleWatch: 'Whale Watch',
    dashboardMonitorLargeMoves: 'Monitor large movements',
    dashboardAnalyzeThreatMatches: 'Analyze threat matches',
    dashboardDeepChainIntel: 'Deep Chain Intelligence',
    dashboardInspectAddressRelations: 'Inspect address relationships',
    dashboardEarlyThreatSignals: 'Early threat signals',
    dashboardWalletBehaviorProfile: 'Wallet behavior profile',
    dashboardScamPatterns: 'Scam behavior patterns',
    dashboardAddressContractRelations: 'Address and contract relationships',
    dashboardAssetsFinance: 'Assets & Finance',
    dashboardAssetsFinanceDescription: 'Portfolio, gas, price and transaction management',
    dashboardPortfolio: 'Portfolio',
    dashboardViewVaultAssets: 'View scanned wallet assets',
    dashboardGasOptimization: 'Network Fees',
    dashboardCompareNetworkFees: 'Compare live network fees',
    dashboardPriceAlert: 'Price Alert',
    dashboardTrackTargetPrices: 'Track target prices',
    dashboardTaxReport: 'Tax Report',
    dashboardReportTransactionHistory: 'Report transaction history',
    dashboardMarketSentimentAnalysis: 'Market and sentiment analysis',
    dashboardStopLossTakeProfit: 'Stop-loss and take-profit',
    dashboardOpenModule: 'OPEN MODULE',
    dashboardEmergencySecurity: 'Emergency Security & Asset Protection',
    dashboardEmergencySecurityDescription: 'Critical situations and long-term asset security',
    dashboardEmergencyAssetLock: 'Emergency Asset Lock',
    dashboardEmergencyProtectionMode: 'Emergency protection mode',
    dashboardCryptoInheritance: 'Crypto Asset Inheritance',
    dashboardRecentTransactions: 'Recent Transactions',
    dashboardRecentTransactionsDescription: 'Recently queried on-chain activity and security results',
    dashboardRecordsUpper: 'RECORDS',
    dashboardNoTransactions: 'No transactions to display yet.',
    dashboardTransactionsWillAppear: 'Security results will appear here after you query a wallet.',
    dashboardTransaction: 'Transaction',
    dashboardRisky: 'RISKY',
    dashboardReviewed: 'REVIEWED',
    dashboardVipDescription: 'Advanced security, continuous vault monitoring and expanded tool access',
    dashboardVipActive: 'VIP ACTIVE',
    dashboardStandard: 'STANDARD',
    dashboardMonthly: 'MONTHLY',
    dashboardYearly: 'YEARLY',
    dashboardVipMembershipPayment: 'VIP MEMBERSHIP & PAYMENT',
    dashboardSystemOnline: 'SYSTEM ONLINE',
    dashboardSystemOffline: 'SYSTEM OFFLINE',
    dashboardWallet: 'WALLET',
    dashboardSettings: 'SETTINGS',
    toolBack: '‹ Back',
    toolTitleCryptoPolicies: 'Crypto & Financial Policies',
    toolTitlePortfolio: 'Wallet Portfolio',
    toolTitlePriceAlerts: 'Real-Time Price Alerts',
    toolTitleOutboundShield: 'Transfer Shield',
    toolTitleWhitelist: 'Safe Addresses',
    toolTitleBlacklist: 'Blocked Addresses',
    toolTitleVault: 'Vault Asset Management',
    toolTitleNotifications: 'Notifications & Scam Alerts',
    toolTitleVip: 'VIP Payment & Fast Notification',
    toolTitleSmartContract: 'Smart Contract Security Analysis',
    toolTitleBehavioral: 'Wallet Behavior Analysis',
    toolTitlePhishing: 'Phishing & DApp Shield',
    toolTitleQuickTest: 'Quick Wallet Test',
    toolTitleEmergencyLock: 'Emergency Asset Lock',
    toolTitleGasOpt: 'Network Fees',
    toolTitleDeepIntel: 'Deep Chain Intelligence',
    toolTitleAutoPhish: 'Automatic Phishing Shield',
    toolTitleGuardian: 'Guardian — Smart Wallet Protection',
    toolTitleInheritance: 'Crypto Asset Inheritance',
    toolTitleRevoke: 'Token & NFT Permission Revoke',
    toolTitleWhaleWatch: 'Risky Address / Whale Tracking',
    toolTitleGasTime: 'Gas Fee Optimizer & Scheduler',
    toolTitleAiMarket: "Market Intelligence",
    toolTitleTaxReport: 'Tax & Transaction History Reporter',
    toolTitleDexOrders: 'Automatic Stop-Loss / Take-Profit (DEX Orders)',
    contractMintRpc: 'Mint RPC',
    contractMintCap: 'Mint Cap',
    contractMinterRole: 'MINTER_ROLE',
    contractOwnerMinterRole: 'Owner MINTER_ROLE',
    contractAdminRole: 'Admin Role',
    contractDefaultAdminDetected: 'DEFAULT_ADMIN_ROLE DETECTED',
    wlDescription1: 'Wallet addresses you mark as trusted are managed here.',
    wlDescription2: 'Whitelist addresses are prioritized during security checks.',
    wlSafeAddresses: 'Safe Addresses',
    wlRegistered: 'Your registered trusted addresses',
    wlEmpty: 'No safe addresses have been added yet.',
    wlEmptyHelp1: 'To add a wallet address to your safe list,',
    wlEmptyHelp2: 'use the + Whitelist button in the main Security Center.',
    wlSafeAddress: 'SAFE ADDRESS',
    commonRemove: 'Remove',
    blDescription1: 'Wallet addresses you mark as blocked or risky are managed here.',
    blDescription2: 'Blacklist addresses are evaluated before wallet security checks.',
    blRegistered: 'Your registered blocked addresses',
    blEmpty: 'No blocked addresses found yet.',
    blEmptyHelp1: 'To block an address you consider risky,',
    blEmptyHelp2: 'use + Blacklist in the main Security Center.',
    blBlockedAddress: 'BLOCKED ADDRESS',
    blRemoveBlock: 'Remove Block',
    vaultDescription1: 'Vault manages wallets continuously monitored for VIP users',
    vaultDescription2: 'and security notifications associated with those wallets.',
    vaultAssetManagement: 'Vault Asset Management',
    vaultMonitoredWallets: 'Continuously monitored wallets',
    vaultEmpty: 'No wallets are currently monitored in the Vault.',
    vaultAddFromDashboard: 'Add Vault Wallet from Dashboard',
    vaultUpgradeVip: 'Upgrade to VIP',
    vaultMonitoringActive: 'VAULT MONITORING ACTIVE',
    vaultRemove: 'Remove from Vault',
    vaultSecurityNotifications: 'Vault Security Notifications',
    vaultNotificationsEmpty: 'No Vault security notifications yet.',
    vaultSecurityNotification: 'Vault Security Notification',
    securityNotificationReceived: 'Security notification received.',
    notificationsCentral: 'Central Notifications',
    notificationsDescription: 'Security, price alerts and other system events',
    notificationsMarkAllRead: 'Mark All as Read',
    notificationsEmpty: 'You have no central notifications yet.',
    severityCritical: 'CRITICAL',
    severityHigh: 'HIGH',
    severityWarning: 'WARNING',
    severityInfo: 'INFO',
    notificationDefaultTitle: 'Safe Sentinel Notification',
    notificationNoDetails: 'Notification details are unavailable.',
    notificationsRead: 'Read',
    notificationsRefreshInfo: 'Central notifications are refreshed regularly from the server.',
    commonAnalyzing: 'Analyzing...',
    commonRiskLevel: 'Risk Level',
    commonNetwork: 'Network',
    commonError: 'Error',
    behaviorDescription: 'Generate a behavioral risk profile from live on-chain wallet data.',
    behaviorWalletPlaceholder: 'Wallet address to analyze...',
    behaviorRun: '⚠️ Generate Behavioral Risk Profile',
    behaviorProfileScore: 'Profile Score',
    behaviorWalletAge: 'Wallet Age',
    behaviorTotalTransactions: 'Total Transactions',
    behaviorSuccessfulTransactions: 'Successful Transactions',
    behaviorFailedTransactions: 'Failed Transactions',
    behaviorFailedRatio: 'Failure Ratio',
    behaviorIncoming: 'Incoming Transactions',
    behaviorOutgoing: 'Outgoing Transactions',
    behaviorUniqueCounterparties: 'Unique Counterparties',
    behaviorTokenTransfers: 'Token Transfers',
    behaviorDistinctTokens: 'Distinct Tokens',
    behaviorMixerSignal: 'Mixer / Privacy Signal',
    behaviorBotAutomation: 'Bot / Automation',
    behaviorRiskReasons: 'Risk Reasons',
    behaviorRiskSignals: 'Risk Signals',
    behaviorScamMatch: '⚠️ Match found in scam intelligence.',
    whaleDescription: 'Track fund transfers of large whale wallets in real time.',
    whalePlaceholder: 'Whale wallet address to track...',
    whaleEmptyAddress: 'Address cannot be empty',
    whaleAdded: 'Whale address was added to the watch list.',
    whaleAdd: 'Add Whale Address',
    whaleActive: 'Actively Monitored Whales',
    whaleWaitingRealData: 'Waiting for real transaction data',
    gasTimeDescription: '⛽ Choose the most economical transfer time based on network congestion.',
    gasTimeMode: 'Optimization Mode',
    gasTimeStandard: 'Standard',
    gasTimeEconomic: 'Economical (30% Cheaper Time Window)',
    gasTimeEmergency: 'Emergency (Fast Transaction)',
    gasTimeConfigured: 'Gas scheduler configured for mode:',
    gasTimeSave: 'Save Gas Strategy',
    portfolioDescription: 'Chart data is compiled only from active crypto and wallet assets added to your Vault.',
    portfolioNoAssets: 'No Assets Found in Vault!',
    portfolioNoAssetsDescription: 'Add your wallet to the Vault before viewing the portfolio chart. Adding assets to the Vault requires a VIP account.',
    portfolioAddVaultVip: 'Add Asset to Vault (Upgrade to VIP)',
    portfolioVaultValue: 'Vault Portfolio Value',
    portfolioAssetsMonitored: 'Assets Monitored',
    priceDescription: 'Select a crypto asset and receive an instant push notification when it reaches your target price.',
    priceSystemTitle: 'Crypto Price Alert System',
    priceSystemDescription: 'Notify me when the selected asset reaches the target value.',
    priceSelectCrypto: 'Crypto for Price Alert:',
    priceTargetPlaceholder: 'Target Price',
    priceVipLimitTitle: 'VIP Limit',
    priceVipLimitMessage: 'Standard accounts can create up to 8 price alerts.',
    commonMissingInfo: 'Missing Information',
    priceEnterValidTarget: 'Please enter a valid target price.',
    priceAlertCreated: 'Price Alert Created',
    priceTargetActivated: 'target activated at:',
    commonSuccess: 'Success',
    priceSavedBackend: 'price alert was saved to the backend.',
    priceSaveFailed: 'Save Failed',
    priceBackendSaveFailed: 'The price alert could not be saved to the backend.',
    priceSaveAlert: 'Save Alert',
    priceActiveAlerts: 'Your Active Price Alerts',
    priceNoAlerts: 'You have no saved price alerts yet.',
    commonDelete: 'Delete',
    gasRecommendedNetwork: 'RECOMMENDED NETWORK',
    gasLowestLiveValue: 'Lowest value among live gas data.',
    guardianDescription: 'Your Guardian security profile is synchronized with the backend. The system evaluates wallet behavior, Scam DNA, Security Graph and Early Warning signals together.',
    guardianNonCustodial: 'Non-custodial protection engine — it does not sign transactions or move funds.',
    guardianThreshold: 'Critical Alert Threshold ($):',
    guardianThresholdPlaceholder: 'Example: 500 USD...',
    guardianInvalidThreshold: 'Enter a valid alert threshold.',
    guardianUpdated: 'Guardian security profile was updated on the backend.',
    guardianUpdateFailed: 'Guardian profile could not be updated.',
    commonSaving: 'Saving...',
    guardianSaveSettings: 'Save Guardian Settings',
    guardianProfileUnavailable: 'Guardian profile could not be retrieved.',
    guardianProfileRefreshed: 'Guardian profile was refreshed from the backend.',
    guardianProfileLoadFailed: 'Guardian profile could not be loaded.',
    guardianRefreshProfile: 'Refresh Guardian Profile',
    guardianProfileStatus: 'Profile status',
    guardianSynced: 'Synchronized with backend',
    guardianNotLoaded: 'Not loaded yet',
    guardianLiveRisk: 'Guardian Live Risk Assessment',
    guardianRiskDescription1: 'The selected wallet is evaluated using Behavioral Fingerprint, Scam DNA,',
    guardianRiskDescription2: 'Security Graph and Early Warning engines.',
    guardianAnalyzing: 'Guardian is Analyzing...',
    guardianRunAnalysis: 'Run Guardian Risk Analysis',
    guardianDecision: 'Decision',
    guardianRiskScore: 'Risk Score',
    guardianRiskLevel: 'Risk Level',
    guardianProtectionMode: 'Protection mode',
    quickDescription: 'Standard users can run this test only once after registration. VIP users have unlimited queries.',
    quickWalletPlaceholder: 'Wallet address to test...',
    quickStartTest: 'Start Quick Wallet Test',
    emergencyDescription: 'Emergency Asset Lock: Real blockchain locking is not connected in this version. This screen demonstrates only the local security scenario.',
    emergencyStatus: 'LOCK STATUS: LOCAL MODE — NOT A BLOCKCHAIN LOCK',
    emergencyAlertMessage: 'Real blockchain locking is not active in this version. Asset transfers are not frozen by this button.',
    emergencyButton: 'Emergency Asset Lock — Real Blockchain Lock Not Connected',
    gasDescription: 'Compare current network gas fees.',
    gasLiveFees: 'LIVE GAS FEES',
    gasStrategy: 'Recommended Gas Strategy',
    gasStrategyDescription: 'Compare network fees using live RPC data and choose the more cost-effective network.',
    deepIntelDescription: 'List wallet fund sources using deep blockchain analysis.',
    deepIntelScan: 'Intelligence Scan',
    deepIntelCleanSource: 'The fund source is associated with clean and verified exchanges.',
    outboundDescription: 'Test outgoing transfers from your wallet.',
    outboundRecipientPlaceholder: 'Recipient Wallet Address...',
    commonScanning: 'Scanning...',
    outboundTestTransfer: 'Test Transfer',
    commonRiskLevel: 'Risk Level',
    contractDescription: 'Enter an EVM smart contract address to perform basic security and risk analysis using real blockchain data.',
    contractAddressPlaceholder: 'Smart Contract Address (0x...)...',
    commonAnalyzing: 'Analyzing...',
    contractAnalyze: 'Analyze Contract',
    commonRiskScore: 'Risk Score',
    contractBuyTax: 'Buy Tax',
    contractSellTax: 'Sell Tax',
    contractMintPermission: 'Mint Permission',
    commonSupported: 'SUPPORTED',
    commonNotSupported: 'NOT SUPPORTED',
    commonDetected: 'DETECTED',
    commonYes: 'YES',
    commonNo: 'NO',
    contractAdminCount: 'Admin Count',
    phishingDescription: 'Test whether a website you plan to visit may be fraudulent.',
    phishingScanSite: 'Scan Link and Site',
    phishingDomainAge: 'Domain Age',
    revokeDescription: 'Active smart contract spending permissions for crypto assets and NFTs added to your Vault.',
    revokeNoAllowance: 'No Active Spending Permission Found',
    revokeEmptyDescription: 'When you add a wallet asset to the Vault, token and NFT permissions will appear here dynamically.',
    revokeAsset: 'Asset',
    revokeSpenderContract: 'Spender / Contract',
    commonStatus: 'Status',
    revokeRevoking: 'Revoking...',
    revokePermission: 'Revoke Permission',
    autoPhishDescription: 'Protect your browser and DApp connections against phishing websites.',
    autoPhishActive: 'Link Scan Protection',
    autoPhishLast24h: 'Links are checked only when the user starts a scan; the app does not automatically block browser traffic.',
    vipMembershipTitle: 'Safe Sentinel Pro VIP Membership',
    vipMembershipDescription: 'Get expanded wallet queries, vault monitoring and access to advanced security analysis modules.',
    vipPayTrc20: 'Pay with TRC20 USDT',
    vipTxidPlaceholder: 'Enter Transaction Hash (TXID)...',
    vipNotifyPayment: 'Submit Payment and Verify',
    policiesDescription: 'Safe Sentinel Pro provides policy information about digital asset management, crypto transactions, legal notices and platform security.',
    policiesAssetTitle: '1. Asset Security and Vault Policy',
    policiesAssetBody: 'Wallets added to the Vault and detected smart-contract spending permissions are analyzed against available threat-intelligence sources. Safe Sentinel Pro produces risk warnings for suspicious interactions; it does not stop on-chain transactions or move assets without user approval.',
    policiesLegalTitle: '2. Legal Compliance and Disclaimer',
    policiesLegalBody: 'The platform is developed with the goal of complying with applicable data-protection and financial regulations. Analyses, AI outputs and security scans are informational only and are not investment, legal or tax advice.',
    policiesFeesTitle: '3. Transparency and Fee Policy',
    policiesFeesBody: 'Base query allowances and VIP subscription terms are shown clearly. VIP payments made on the TRON/TRX network are activated after TXID verification. Network fees and applicable subscription charges should be displayed before payment.',
    policiesPrivacyTitle: '4. Privacy and Data Protection Standards',
    policiesPrivacyBody: 'Authentication tokens are stored in SecureStore on supported mobile devices. AsyncStorage used on the web is not an encrypted vault; sensitive data and private keys must not be stored there. Safe Sentinel Pro should never request or retain user private keys.',
    inheritDescription: 'Manage inheritance instructions that apply after the wallet owner’s selected inactivity period. On-chain transfer requires a separately verified and authorized execution mechanism.',
    inheritProtocolTitle: 'Digital Asset Inheritance Protocol',
    inheritInactivityDays: 'Inactivity Period (Days)',
    inheritDaysPlaceholder: 'Example: 30 days...',
    inheritBeneficiary: 'Beneficiary Wallet Address',
    inheritBeneficiaryPlaceholder: 'Beneficiary wallet address...',
    inheritCreate: 'Create Inheritance Protocol',
    inheritLoading: 'Loading inheritance protocols...',
    inheritEmpty: 'No inheritance protocol has been registered yet.',
    inheritStatusActive: 'ACTIVE',
    inheritStatusCancelled: 'CANCELLED',
    inheritStatusDraft: 'DRAFT',
    inheritProtocol: 'Inheritance Protocol',
    inheritBeneficiaryShort: 'Beneficiary',
    inheritInactivityPeriod: 'Inactivity period',
    inheritDays: 'days',
    inheritLastHeartbeat: 'Last heartbeat',
    inheritRefreshHeartbeat: 'Refresh Heartbeat',
    inheritCancel: 'Cancel Protocol',
    aiMarketDescription: "View rule-based sentiment and risk indicators generated from live market data.",
    aiMarketAnalyzing: 'Analyzing...',
    aiMarketRun: 'Run Market Sentiment Analysis',
    aiMarketTitle: 'Market Intelligence',
    aiMarketSentiment: 'Sentiment',
    aiMarketScore: 'Score',
    aiMarketLiveData: 'Live Market Data',
    aiMarketCap: 'Market Cap',
    aiMarketChange24h: '24-Hour Change',
    aiMarketVolume: 'Trading Volume',
    aiMarketBtcDominance: 'BTC Dominance',
    aiMarketEthDominance: 'ETH Dominance',
    aiMarketVolumeRatio: 'Volume / Market Cap',
    aiMarketSignals: 'Live Market Signals',
    aiMarketWhaleTrend: 'Whale Trend',
    aiMarketSource: 'Source',
    aiMarketAnalysis: 'Analysis',
    aiMarketDisclaimer: 'This result is a rule-based analysis generated from live market data; it is not investment advice.',
    aiMarketUnavailable: 'Market intelligence results are unavailable.',
    taxDescription: 'Export wallet activity in tax and audit report formats.',
    taxPeriod: 'Report Period',
    taxReadyTitle: 'Coming Soon',
    taxReadyMessage: 'Verified CSV/PDF export is not yet available for production use.',
    taxDownload: 'Reporting Available Soon',
    dexDescription: 'Create stop-loss and take-profit order drafts for a DEX. Actual on-chain execution requires a wallet signature and a supported order protocol.',
    dexSelectAsset: 'Select Asset',
    dexAssetPlaceholder: 'Example: TRX, ETH...',
    dexStopLossPlaceholder: 'Stop-Loss Price ($)...',
    dexTakeProfitPlaceholder: 'Take-Profit Price ($)...',
    dexMissingTitle: 'Missing Information',
    dexMissingMessage: 'Enter an asset plus Stop-Loss and Take-Profit prices.',
    dexSavedMessage: 'DEX order draft saved. No on-chain execution has occurred.',
    dexSaveDraft: 'Save DEX Order Draft',
    dexRecommendedNetwork: 'RECOMMENDED NETWORK',
    dexLowestGas: 'Lowest value in the live gas data.',
    dexActiveOrders: 'Active Order Drafts',
    dexNoOrders: 'No order drafts have been saved.',
    dexCancel: 'Cancel',
    registerStrongPasswordPlaceholder: 'Choose a strong password',
    registerVaultOptional: 'Wallet to Add to Vault (Optional)',
    registerVaultPlaceholder: 'Your T... or 0x... address',
    registerVipQuestion: 'Become VIP During Registration?',
    commonErrorTitle: 'Error',
    commonInfoTitle: 'Info',
    commonSuccessTitle: 'Success',
    commonConflictTitle: 'Conflict',
    commonInvalidAddress: 'Invalid address.',
    commonAddressRequired: 'Address cannot be empty.',
    whitelistNotFound: 'Address was not found in the whitelist.',
    whitelistRemoved: 'Address was removed from Safe Addresses.',
    whitelistAlready: 'This address is already in the whitelist.',
    whitelistConflict: 'This address is already in the blacklist.',
    whitelistAdded: 'Address was added to the whitelist.',
    blacklistNotFound: 'Address was not found in the blacklist.',
    blacklistRemoved: 'Address was removed from Blocked Addresses.',
    blacklistAlready: 'This address is already in the blacklist.',
    blacklistConflict: 'This address is already in the whitelist.',
    blacklistRiskAdded: 'Address was marked as risky and added to security checks.',
    vaultRemoveTitle: 'Remove Vault Address',
    vaultRemoveConfirm: 'Are you sure you want to remove this wallet from Vault monitoring?',
    commonCancel: 'Cancel',
    commonRemove: 'Remove',
    vaultRemoved: 'Wallet was removed from Vault monitoring.',
    vaultVipRequired: 'An active VIP subscription is required to add a Vault wallet.',
    vaultAlready: 'This address is already monitored in the Vault.',
    vaultLimitTitle: 'Limit Reached',
    vaultLimitMessage: 'VIP accounts can monitor up to 10 wallets in the Vault.',
    vaultAdded: 'Address was added to the Vault and dynamic asset/permission manager.',
    inheritWalletMissingTitle: 'Wallet Address Missing',
    inheritWalletMissingMessage: 'Enter the primary wallet address before creating an inheritance protocol.',
    inheritBeneficiaryMissingMessage: 'Enter a valid beneficiary wallet address.',
    inheritInvalidDaysTitle: 'Invalid Duration',
    inheritInvalidDaysMessage: 'The inactivity period must be between 1 and 3650 days.',
    inheritCreatedTitle: 'Inheritance Protocol Created',
    inheritCreateFailedTitle: 'Inheritance Protocol Error',
    inheritCreateFailed: 'The inheritance protocol could not be created.',
    inheritHeartbeatUpdatedTitle: 'Heartbeat Updated',
    inheritHeartbeatUpdated: 'The inheritance protocol heartbeat was updated on the backend.',
    inheritHeartbeatFailedTitle: 'Heartbeat Error',
    inheritHeartbeatFailed: 'The heartbeat could not be updated.',
    inheritCancelledTitle: 'Inheritance Protocol Cancelled',
    inheritCancelled: 'The protocol was cancelled on the backend.',
    inheritCancelFailedTitle: 'Cancellation Error',
    inheritCancelFailed: 'The inheritance protocol could not be cancelled.', runtimeWalletNotConnected: "EVM wallet is not connected.", runtimeWalletVerificationFailed: "Connected wallet address could not be verified.", runtimeLoginSuccessTitle: "Login Successful", runtimeLoginFailedTitle: "Login Failed", runtimeLoginFailedGeneric: "Email or password is incorrect, or the server is unreachable.", runtimeMissingInfoTitle: "Missing Information", runtimeRegisterMissingFields: "Please fill in first name, last name, email and password.", runtimeInvalidPasswordTitle: "Invalid Password", runtimeInvalidPasswordMessage: "Your password must be at least 10 characters long.", runtimeInvalidRegisterResponse: "The server returned an invalid registration response.", runtimeRegisterSuccessTitle: "Registration Successful", runtimeRegisterFailedTitle: "Registration Failed", runtimeRegisterFailedGeneric: "The server could not be reached during registration.", runtimeStrongPasswordPlaceholder: "Choose a strong password", runtimeOptionalVaultWallet: "Wallet to Add to Vault (Optional)", runtimeWalletPlaceholder: "Your T... or 0x... address", runtimeRegisterVipQuestion: "Would you like to become VIP during registration?", runtimeInheritanceWalletMissingTitle: "Wallet Address Missing", runtimeInheritanceWalletMissingMessage: "Enter the primary wallet address before creating an inheritance protocol.", runtimeInheritanceBeneficiaryMissing: "Please enter a valid beneficiary wallet address.", runtimeInvalidDurationTitle: "Invalid Duration", runtimeInvalidDurationMessage: "The inactivity period must be between 1 and 3650 days.", runtimeInheritanceCreatedTitle: "Inheritance Protocol Created", runtimeInheritanceErrorTitle: "Inheritance Protocol Error", runtimeInheritanceCreateFailed: "The inheritance protocol could not be created.", runtimeHeartbeatUpdatedTitle: "Heartbeat Updated", runtimeHeartbeatUpdatedMessage: "The inheritance protocol heartbeat was updated on the backend.", runtimeHeartbeatErrorTitle: "Heartbeat Error", runtimeHeartbeatFailed: "The heartbeat could not be updated.", runtimeInheritanceCancelledTitle: "Inheritance Protocol Cancelled", runtimeInheritanceCancelledMessage: "The protocol was cancelled on the backend.", runtimeCancelErrorTitle: "Cancellation Error", runtimeInheritanceCancelFailed: "The inheritance protocol could not be cancelled.", runtimeVipRequiredTitle: "VIP Required", runtimeVaultVipRequired: "An active VIP subscription is required to add a Vault wallet.", runtimeVaultLimitTitle: "Vault Limit", runtimeVaultLimitMessage: "A VIP account can monitor up to 10 wallets.", runtimeVaultSyncErrorTitle: "Vault Sync Error", runtimeVaultSyncErrorMessage: "The wallet could not be saved to the backend.", runtimePortfolioNoData: "No live blockchain data is available to export.", runtimeEnterValidWallet: "Please enter a valid wallet address to scan.", runtimeInvalidWalletFormat: "Invalid Address Format", runtimeFreeQueryLimit: "Your one free scan has been used. Upgrade to VIP for additional wallet scans.", runtimeBlacklistWarning: "\u26A0\uFE0F WARNING: This address is listed as dangerous in the scam blacklist.", runtimeBlockedRisk: "Scan Blocked (Risky Address)", runtimeCriticalSecurityAlert: "CRITICAL SECURITY ALERT", runtimeScamWalletScanned: "A scam-listed wallet was scanned.", runtimeLoadingChain: "Loading live blockchain data from the backend...", runtimeScamAddressWarning: "\u26A0\uFE0F WARNING: This address is associated with scam activity in available intelligence sources.", runtimeDangerousScamAddress: "Dangerous / Scam Address", runtimeScamWalletDetected: "A scam-listed wallet was detected.", runtimeRevokeNotNeededTitle: "Revoke Not Required", runtimeRevokeNotNeededMessage: "The spender allowance for this token is already zero.", runtimeConnectEvmWallet: "Connect your EVM wallet first.", runtimeRevokeUnsupportedNetwork: "Revoke is not supported on this network yet.", runtimeInvalidConnectedEvmWallet: "The connected EVM wallet address is invalid.", runtimeInvalidTokenContract: "The token contract address is invalid.", runtimeInvalidSpenderContract: "The spender contract address is invalid.", runtimeRevokePrepareFailed: "The backend could not prepare the revoke transaction.", runtimeRevokeAllowanceMissing: "The backend revoke preparation did not return an allowance value.", runtimeRevokeSentTitle: "Revoke Transaction Sent", runtimeRevokeConfirmedTitle: "Revoke Confirmed", runtimeRevokePrepareErrorTitle: "Revoke Preparation Error", runtimeInvalidAddressTitle: "Invalid Address", runtimeAnalysisFailedTitle: "Analysis Failed", runtimeBehaviorAnalysisFailedTitle: "Behavior Analysis Failed", runtimeInvalidUrlTitle: "Invalid URL", runtimePhishingAnalysisFailedTitle: "Phishing Analysis Failed", runtimeTrc20PaymentTitle: "TRC20 USDT Payment", runtimeErrorTitle: "Error", runtimeInvalidTxidTitle: "Invalid TXID", runtimeVipActivatedTitle: "VIP Activation Successful", runtimeVerificationCompleteTitle: "Verification Complete", runtimeVipVerificationFailedTitle: "VIP Verification Failed", runtimeSecurityCommandCenter: "SECURITY COMMAND CENTER", runtimeScamIntelligenceTitle: "SCAM INTELLIGENCE", runtimeBlockedAddressesTitle: "Blocked Addresses"
  },
  fr: {
    settings: 'Paramètres de l\'application',
    language: 'Langue',
    currency: 'Devise',
    save: 'Enregistrer',
    selectedLanguage: 'Langue sélectionnée',
    selectedCurrency: 'Devise sélectionnée',
    languageSaved: 'Votre préférence de langue a été enregistrée.',
    currencySaved: 'Votre préférence de devise a été enregistrée.',
    unreadNotifications: 'Notifications non lues',
    preferencesTitle: 'Préférences du portefeuille et sécurité',
    preferencesDescription: 'Personnalisez votre profil de sécurité et les préférences de l’application.',
    autoScamBlock: 'Blocage automatique des arnaques',
    autoScamBlockDescription: 'Bloquez les interactions avec les portefeuilles des pools dangereux.',
    loginDescription: 'Assistant nouvelle génération de sécurité et de renseignement crypto',
    emailAddress: 'Adresse e-mail',
    loginPassword: 'Mot de passe',
    secureLogin: 'Connexion sécurisée',
    createAccount: 'Créer un nouveau compte (Inscription)'
  },
  it: {
    settings: 'Impostazioni applicazione',
    language: 'Lingua',
    currency: 'Valuta',
    save: 'Salva',
    selectedLanguage: 'Lingua selezionata',
    selectedCurrency: 'Valuta selezionata',
    languageSaved: 'La preferenza della lingua è stata salvata.',
    currencySaved: 'La preferenza della valuta è stata salvata.',
    unreadNotifications: 'Notifiche non lette',
    preferencesTitle: 'Preferenze del portafoglio e sicurezza',
    preferencesDescription: 'Personalizza il tuo profilo di sicurezza e le preferenze dell’app.',
    autoScamBlock: 'Blocco automatico delle truffe',
    autoScamBlockDescription: 'Blocca le interazioni con i portafogli presenti nei pool pericolosi.',
    loginDescription: 'Assistente di nuova generazione per sicurezza e intelligence crypto',
    emailAddress: 'Indirizzo e-mail',
    loginPassword: 'Password',
    secureLogin: 'Accesso sicuro',
    createAccount: 'Crea nuovo account (Registrati)'
  },
  de: {
    settings: 'App-Einstellungen',
    language: 'Sprache',
    currency: 'Währung',
    save: 'Speichern',
    selectedLanguage: 'Ausgewählte Sprache',
    selectedCurrency: 'Ausgewählte Währung',
    languageSaved: 'Ihre Spracheinstellung wurde gespeichert.',
    currencySaved: 'Ihre Währungseinstellung wurde gespeichert.',
    unreadNotifications: 'Ungelesene Benachrichtigungen',
    preferencesTitle: 'Wallet-Einstellungen & Sicherheit',
    preferencesDescription: 'Passen Sie Ihr Sicherheitsprofil und Ihre App-Einstellungen an.',
    autoScamBlock: 'Automatische Scam-Sperre',
    autoScamBlockDescription: 'Blockieren Sie Interaktionen mit Wallets in gefährlichen Pools.',
    loginDescription: 'Krypto-Sicherheits- und Intelligence-Assistent der nächsten Generation',
    emailAddress: 'E-Mail-Adresse',
    loginPassword: 'Passwort',
    secureLogin: 'Sicher anmelden',
    createAccount: 'Neues Konto erstellen (Registrieren)'
  },
  es: {
    settings: 'Configuración de la aplicación',
    language: 'Idioma',
    currency: 'Moneda',
    save: 'Guardar',
    selectedLanguage: 'Idioma seleccionado',
    selectedCurrency: 'Moneda seleccionada',
    languageSaved: 'Se ha guardado su preferencia de idioma.',
    currencySaved: 'Se ha guardado su preferencia de moneda.',
    unreadNotifications: 'Notificaciones no leídas',
    preferencesTitle: 'Preferencias de cartera y seguridad',
    preferencesDescription: 'Personaliza tu perfil de seguridad y las preferencias de la aplicación.',
    autoScamBlock: 'Bloqueo automático de estafas',
    autoScamBlockDescription: 'Bloquea las interacciones con carteras de pools peligrosos.',
    loginDescription: 'Asistente de seguridad e inteligencia cripto de nueva generación',
    emailAddress: 'Dirección de correo electrónico',
    loginPassword: 'Contraseña',
    secureLogin: 'Inicio de sesión seguro',
    createAccount: 'Crear nueva cuenta (Registrarse)'
  },
  pt: {
    settings: 'Configurações do aplicativo',
    language: 'Idioma',
    currency: 'Moeda',
    save: 'Salvar',
    selectedLanguage: 'Idioma selecionado',
    selectedCurrency: 'Moeda selecionada',
    languageSaved: 'Sua preferência de idioma foi salva.',
    currencySaved: 'Sua preferência de moeda foi salva.',
    unreadNotifications: 'Notificações não lidas',
    preferencesTitle: 'Preferências da carteira e segurança',
    preferencesDescription: 'Personalize seu perfil de segurança e as preferências do aplicativo.',
    autoScamBlock: 'Bloqueio automático de golpes',
    autoScamBlockDescription: 'Bloqueie interações com carteiras em pools perigosos.',
    loginDescription: 'Assistente de segurança e inteligência cripto de nova geração',
    emailAddress: 'Endereço de e-mail',
    loginPassword: 'Senha',
    secureLogin: 'Login seguro',
    createAccount: 'Criar nova conta (Registrar)'
  },
  zh: {
    settings: '应用设置',
    language: '语言',
    currency: '货币',
    save: '保存',
    selectedLanguage: '当前语言',
    selectedCurrency: '当前货币',
    languageSaved: '语言偏好已保存。',
    currencySaved: '货币偏好已保存。',
    unreadNotifications: '未读通知',
    preferencesTitle: '钱包偏好与安全',
    preferencesDescription: '自定义您的安全配置和应用偏好。',
    autoScamBlock: '自动诈骗拦截',
    autoScamBlockDescription: '阻止与危险池中钱包的交互。',
    loginDescription: '新一代加密安全与情报助手',
    emailAddress: '电子邮箱',
    loginPassword: '密码',
    secureLogin: '安全登录',
    createAccount: '创建新账户（注册）'
  },
  ja: {
    settings: 'アプリ設定',
    language: '言語',
    currency: '通貨',
    save: '保存',
    selectedLanguage: '選択した言語',
    selectedCurrency: '選択した通貨',
    languageSaved: '言語設定が保存されました。',
    currencySaved: '通貨設定が保存されました。',
    unreadNotifications: '未読通知',
    preferencesTitle: 'ウォレット設定とセキュリティ',
    preferencesDescription: 'セキュリティプロファイルとアプリの設定をカスタマイズします。',
    autoScamBlock: '自動詐欺ブロック',
    autoScamBlockDescription: '危険なプール内のウォレットとの操作をブロックします。',
    loginDescription: '次世代の暗号資産セキュリティ・インテリジェンスアシスタント',
    emailAddress: 'メールアドレス',
    loginPassword: 'パスワード',
    secureLogin: '安全にログイン',
    createAccount: '新しいアカウントを作成（登録）'
  },
  ko: {
    settings: '앱 설정',
    language: '언어',
    currency: '통화',
    save: '저장',
    selectedLanguage: '선택한 언어',
    selectedCurrency: '선택한 통화',
    languageSaved: '언어 설정이 저장되었습니다.',
    currencySaved: '통화 설정이 저장되었습니다.',
    unreadNotifications: '읽지 않은 알림',
    preferencesTitle: '지갑 환경설정 및 보안',
    preferencesDescription: '보안 프로필과 앱 환경설정을 사용자 지정하세요.',
    autoScamBlock: '자동 사기 차단',
    autoScamBlockDescription: '위험한 풀의 지갑과의 상호작용을 차단합니다.',
    loginDescription: '차세대 암호화폐 보안 및 인텔리전스 어시스턴트',
    emailAddress: '이메일 주소',
    loginPassword: '비밀번호',
    secureLogin: '안전하게 로그인',
    createAccount: '새 계정 만들기 (가입)'
  },
  ar: {
    settings: 'إعدادات التطبيق',
    language: 'اللغة',
    currency: 'العملة',
    save: 'حفظ',
    selectedLanguage: 'اللغة المحددة',
    selectedCurrency: 'العملة المحددة',
    languageSaved: 'تم حفظ تفضيل اللغة.',
    currencySaved: 'تم حفظ تفضيل العملة.',
    unreadNotifications: 'الإشعارات غير المقروءة',
    preferencesTitle: 'تفضيلات المحفظة والأمان',
    preferencesDescription: 'خصص ملف الأمان وتفضيلات التطبيق.',
    autoScamBlock: 'الحظر التلقائي للاحتيال',
    autoScamBlockDescription: 'احظر التفاعلات مع المحافظ الموجودة في التجمعات الخطرة.',
    loginDescription: 'مساعد الجيل الجديد لأمن واستخبارات العملات المشفرة',
    emailAddress: 'عنوان البريد الإلكتروني',
    loginPassword: 'كلمة المرور',
    secureLogin: 'تسجيل دخول آمن',
    createAccount: 'إنشاء حساب جديد (تسجيل)'
  }
};

const V26_EXCHANGE_RATES_FROM_USD = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  TRY: 41.50,
  JPY: 145,
  CNY: 7.18
};

const v26GetTranslation = (language, key) => {
  const lang = V26_TRANSLATIONS[language] || V26_TRANSLATIONS.en;
  return lang[key] || V26_TRANSLATIONS.en[key] || key;
};

const v26FormatCurrency = (usdValue, currencyCode = 'USD') => {
  const amount = Number(usdValue);

  if (!Number.isFinite(amount)) {
    return '--';
  }

  const currency =
  V26_CURRENCIES[currencyCode] ||
  V26_CURRENCIES.USD;

  const rate =
  Number(V26_EXCHANGE_RATES_FROM_USD[currency.code]) || 1;

  const converted = amount * rate;

  return new Intl.NumberFormat(
    currency.locale,
    {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits:
      currency.code === 'JPY' ? 0 : 2,
      maximumFractionDigits:
      currency.code === 'JPY' ? 0 : 2
    }
  ).format(converted);
};

function App() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState(null);
  const { address: connectedWalletAddress, isConnected, chainId } = useAccount();
  const { provider: walletProvider, providerType } = useProvider();
  const ethersProvider = useMemo(
    () => walletProvider ? new BrowserProvider(walletProvider) : null,
    [walletProvider]
  );

  const getConnectedSigner = async () => {
    if (!ethersProvider || !isConnected || !connectedWalletAddress) {
      throw new Error(t("runtimeWalletNotConnected"));
    }

    const signer = await ethersProvider.getSigner();
    const signerAddress = await signer.getAddress();

    if (
    String(signerAddress).trim().toLowerCase() !==
    String(connectedWalletAddress).trim().toLowerCase())
    {
      throw new Error(t("runtimeWalletVerificationFailed"));
    }

    return signer;
  };
  useEffect(() => {
    if (!token) {
      setCentralNotifications([]);
      setCentralUnreadCount(0);
      centralSeenIdsRef.current.clear();
      return undefined;
    }

    const centralNotificationPolling = async () => {
      await loadCentralNotifications();
    };

    centralNotificationPolling();

    const timer = setInterval(
      centralNotificationPolling,
      60000
    );

    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    console.log('[REOWN WALLET]', {
      isConnected,
      connectedWalletAddress,
      chainId,
      providerType,
      hasProvider: !!walletProvider
    });
  }, [isConnected, connectedWalletAddress, chainId, providerType, walletProvider]);

  const [currentScreen, setCurrentScreen] = useState('login');
  const [selectedLanguage, setSelectedLanguage] = useState('tr');
  const [selectedCurrency, setSelectedCurrency] = useState('TRY');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regSurname, setRegSurname] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regVaultAddress, setRegVaultAddress] = useState('');
  const [regWantVip, setRegWantVip] = useState(false);

  const [name, setName] = useState('Fikret Bulat');
  const [userStatus, setUserStatus] = useState('free');
  const [queryCount, setQueryCount] = useState(0);
  const [queryWarning, setQueryWarning] = useState("");
  const [address, setAddress] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("tron");
  const [contractNetwork, setContractNetwork] = useState("ethereum");
  const [currentBalanceText, setCurrentBalanceText] = useState("Cüzdan adresini girip sorgulayın");
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const checkBackendHealth = useCallback(async () => {
    try {
      await api.get('/health');
      setApiOnline(true);
      return true;
    } catch (error) {
      setApiOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
    const healthTimer = setInterval(checkBackendHealth, 60000);
    return () => clearInterval(healthTimer);
  }, [checkBackendHealth]);

  const [activeModule, setActiveModule] = useState('dashboard');

  useEffect(() => {
    console.log('[ACTIVE MODULE DEBUG]', activeModule);
  }, [activeModule]);

  const [whitelist, setWhitelist] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [vault, setVault] = useState([]);
  const [vaultNotifications, setVaultNotifications] = useState([]);
  const [centralNotifications, setCentralNotifications] = useState([]);
  const [centralUnreadCount, setCentralUnreadCount] = useState(0);
  const centralSeenIdsRef = useRef(new Set());

  const [pendingPayments, setPendingPayments] = useState([]);
  const [paymentTxHashInput, setPaymentTxHashInput] = useState('');

  const [selectedVipPlan, setSelectedVipPlan] = useState('monthly');
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [walletTokens, setWalletTokens] = useState([]);
  const [walletRisk, setWalletRisk] = useState(null);
  const [walletScamIntel, setWalletScamIntel] = useState(null);
  const [walletLatestBlock, setWalletLatestBlock] = useState(null);
  const [walletNativeBalance, setWalletNativeBalance] = useState(null);

  const [isDarkMode, setIsDarkMode] = useState(true);

  const [highGasAlerts, setHighGasAlerts] = useState(true);

  const [selectedChartRange, setSelectedChartRange] = useState('1H');
  const [priceAlertsEnabled, setPriceAlertsEnabled] = useState(true);
  const [targetAlertPrice, setTargetAlertPrice] = useState('');
  const [alertTargetCrypto, setAlertTargetCrypto] = useState('TRX');
  const [savedPriceAlerts, setSavedPriceAlerts] = useState([]);

  const loadPriceAlerts = useCallback(async () => {
    if (!token) {
      setSavedPriceAlerts([]);
      return;
    }

    try {
      const response = await api.get('/api/price-alerts');

      const alerts = Array.isArray(response.data?.alerts) ?
      response.data.alerts :
      [];

      setSavedPriceAlerts(
        alerts.map((item) => ({
          id: String(item.id),
          crypto: PRICE_ALERT_ASSET_TO_SYMBOL[String(item.asset || '').toLowerCase()] || String(item.asset || '').toUpperCase(),
          price: String(item.targetPrice ?? ''),
          direction: item.direction || 'ABOVE',
          network: item.network || item.asset || ''
        }))
      );
    } catch (error) {
      console.error('[PRICE ALERTS] Liste yüklenemedi:', error);
    }
  }, [token]);

  useEffect(() => {
    loadPriceAlerts();
  }, [loadPriceAlerts]);

  const priceAlertsMode = "SERVER_MONITORED";
  const emergencyLockMode = "LOCAL_ONLY";
  const getFeatureRealityLabel = (feature) => {
    switch (feature) {
      case "priceAlerts":
        return priceAlertsMode === "LOCAL_ONLY" ?
        "YEREL — SUNUCU İZLEMESİ YOK" :
        "AKTİF";

      case "emergencyLock":
        return emergencyLockMode === "LOCAL_ONLY" ?
        "YEREL — BLOCKCHAIN KİLİDİ DEĞİL" :
        "AKTİF";

      case "aiMarket":
        return "GERÇEK AI VERİ KAYNAĞI BAĞLI DEĞİL";

      default:
        return "DURUM BİLİNMİYOR";
    }
  };

  const [contractAddress, setContractAddress] = useState('');
  const [contractAnalysisResult, setContractAnalysisResult] = useState(null);
  const [analyzingContract, setAnalyzingContract] = useState(false);

  const [behavioralAnalysisResult, setBehavioralAnalysisResult] = useState(null);
  const [analyzingBehavior, setAnalyzingBehavior] = useState(false);

  const [phishingUrl, setPhishingUrl] = useState('');
  const [phishingResult, setPhishingResult] = useState(null);
  const [analyzingPhishing, setAnalyzingPhishing] = useState(false);

  const [outboundRecipient, setOutboundRecipient] = useState('');
  const [outboundAmount, setOutboundAmount] = useState('');
  const [outboundCheckResult, setOutboundCheckResult] = useState(null);
  const [checkingOutbound, setCheckingOutbound] = useState(false);

  const [inheritEnabled, setInheritEnabled] = useState(false);
  const [inheritanceProtocols, setInheritanceProtocols] = useState([]);
  const [inheritanceLoading, setInheritanceLoading] = useState(false);
  const [inheritDays, setInheritDays] = useState('30');
  const [inheritBeneficiary, setInheritBeneficiary] = useState('');

  const loadInheritanceProtocols = useCallback(async () => {
    try {
      setInheritanceLoading(true);

      const response = await api.get('/api/inheritance');

      const protocols = Array.isArray(response.data?.protocols) ?
      response.data.protocols :
      [];

      setInheritanceProtocols(protocols);

      const backendNetwork =
      selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork;

      const activeProtocol = protocols.find(
        (protocol) =>
        protocol?.status === 'ACTIVE' &&
        protocol?.network === backendNetwork
      );

      if (activeProtocol) {
        setInheritEnabled(true);
        setInheritDays(String(activeProtocol.inactivityDays || 30));
        setInheritBeneficiary(activeProtocol.beneficiaryAddress || '');
      }

      return protocols;
    } catch (error) {
      console.warn(
        'Inheritance protocols load failed:',
        error?.response?.data?.error || error?.message
      );
      return [];
    } finally {
      setInheritanceLoading(false);
    }
  }, [selectedNetwork]);

  const createInheritanceProtocol = useCallback(async () => {
    const cleanWalletAddress = address.trim();
    const cleanBeneficiary = inheritBeneficiary.trim();

    const backendNetwork =
    selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork;

    if (!cleanWalletAddress) {
      Alert.alert(
        t('inheritWalletMissingTitle'),
        t('inheritWalletMissingMessage')
      );
      return false;
    }

    if (!cleanBeneficiary) {
      Alert.alert(
        t('commonMissingInfo'),
        t('inheritBeneficiaryMissingMessage')
      );
      return false;
    }

    const days = Number(inheritDays);

    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      Alert.alert(
        t('inheritInvalidDaysTitle'),
        t('inheritInvalidDaysMessage')
      );
      return false;
    }

    try {
      setInheritanceLoading(true);

      const response = await api.post('/api/inheritance', {
        network: backendNetwork,
        walletAddress: cleanWalletAddress,
        beneficiaryAddress: cleanBeneficiary,
        inactivityDays: days
      });

      if (!response.data?.success || !response.data?.protocol) {
        throw new Error(
          response.data?.error || t('inheritCreateFailed')
        );
      }

      const protocol = response.data.protocol;

      setInheritanceProtocols((current) => [
      protocol,
      ...current.filter((item) => item?.id !== protocol?.id)]
      );

      Alert.alert(t("runtimeInheritanceCreatedTitle"),

      `Protokol backend üzerinde oluşturuldu.\nDurum: ${protocol.status}\nAğ: ${protocol.network}\nSüre: ${protocol.inactivityDays} gün`
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        t('inheritCreateFailedTitle'),
        String(error?.response?.data?.error || '').includes('requires a wallet owned by the authenticated user') ? (selectedLanguage === 'tr' ? 'Miras protokolü için hesabınıza kayıtlı bir cüzdan seçmelisiniz.' : 'Select a wallet registered to your account for the inheritance protocol.') : (error?.response?.data?.error || error?.message || t('inheritCreateFailed'))
      );
      return false;
    } finally {
      setInheritanceLoading(false);
    }
  }, [
  address,
  inheritBeneficiary,
  inheritDays,
  selectedNetwork]
  );

  const heartbeatInheritanceProtocol = useCallback(async (protocolId) => {
    if (!protocolId) return false;

    try {
      setInheritanceLoading(true);

      const response = await api.post(
        `/api/inheritance/${protocolId}/heartbeat`
      );

      if (!response.data?.success || !response.data?.protocol) {
        throw new Error(
          response.data?.error || 'Heartbeat işlemi başarısız.'
        );
      }

      const protocol = response.data.protocol;

      setInheritanceProtocols((current) =>
      current.map((item) =>
      item?.id === protocol?.id ? protocol : item
      )
      );

      setInheritEnabled(protocol.status === 'ACTIVE');

      Alert.alert(
        t('inheritHeartbeatUpdatedTitle'),
        t('inheritHeartbeatUpdated')
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        t('inheritHeartbeatFailedTitle'),
        error?.response?.data?.error ||
        error?.message ||
        t('inheritHeartbeatFailed')
      );
      return false;
    } finally {
      setInheritanceLoading(false);
    }
  }, []);

  const cancelInheritanceProtocol = useCallback(async (protocolId) => {
    if (!protocolId) return false;

    try {
      setInheritanceLoading(true);

      const response = await api.post(
        `/api/inheritance/${protocolId}/cancel`
      );

      if (!response.data?.success || !response.data?.protocol) {
        throw new Error(
          response.data?.error || t('inheritCancelFailed')
        );
      }

      const protocol = response.data.protocol;

      setInheritanceProtocols((current) =>
      current.map((item) =>
      item?.id === protocol?.id ? protocol : item
      )
      );

      setInheritEnabled(false);

      Alert.alert(
        t('inheritCancelledTitle'),
        t('inheritCancelled')
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        t('inheritCancelFailedTitle'),
        error?.response?.data?.error ||
        error?.message ||
        t('inheritCancelFailed')
      );
      return false;
    } finally {
      setInheritanceLoading(false);
    }
  }, []);

  const [guardianEnabled, setGuardianEnabled] = useState(true);
  const [guardianAlertThreshold, setGuardianAlertThreshold] = useState('500');
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [guardianProfileLoaded, setGuardianProfileLoaded] = useState(false);
  const [guardianEvaluationResult, setGuardianEvaluationResult] = useState(null);
  const [guardianEvaluating, setGuardianEvaluating] = useState(false);
  const [guardianEvaluationError, setGuardianEvaluationError] = useState('');

  const [revokeList, setRevokeList] = useState([]);
  const [revokingIndex, setRevokingIndex] = useState(null);

  const [whaleWatchList, setWhaleWatchList] = useState([]);
  const [newWhaleAddress, setNewWhaleAddress] = useState('');
  const [gasOptimizerTarget, setGasOptimizerTarget] = useState('Standard');
  const [sentimentResult, setSentimentResult] = useState(null);
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);
  const [stopLossList, setStopLossList] = useState([]);
  const [slCrypto, setSlCrypto] = useState('TRX');
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');

  const [liveCryptoPrices, setLiveCryptoPrices] = useState({
    TRX: null,
    SOL: null,
    BTC: null,
    AVAX: null,
    ARB: null,
    POL: null,
    ETH: null,
    BNB: null,
    PI: null,
    NFT: null
  });
  const portfolioUsdValue = useMemo(() => {
    const nativeBalance = Number(walletNativeBalance);
    const nativeSymbolMap = {
      tron: "TRX",
      sol: "SOL",
      btc: "BTC",
      avax: "AVAX",
      arb: "ARB",
      polygon: "POL",
      eth: "ETH",
      bsc: "BNB",
      pi: "PI",
      nft: "NFT"
    };

    const nativeSymbol = nativeSymbolMap[selectedNetwork];
    const nativePrice = Number(liveCryptoPrices[nativeSymbol] || 0);

    const nativeUsd = Number.isFinite(nativeBalance) && Number.isFinite(nativePrice) ?
    nativeBalance * nativePrice :
    0;

    const tokenUsd = walletTokens.reduce((total, token) => {
      const balance = Number(token?.balance ?? 0);
      const price = Number(liveCryptoPrices[token?.symbol] ?? 0);

      if (!Number.isFinite(balance) || !Number.isFinite(price)) {
        return total;
      }

      return total + balance * price;
    }, 0);

    return nativeUsd + tokenUsd;
  }, [walletNativeBalance, walletTokens, liveCryptoPrices, selectedNetwork]);

  const [networkGasFees, setNetworkGasFees] = useState({
    tron: "\u2014",
    sol: "\u2014",
    btc: "\u2014",
    avax: "\u2014",
    arb: "\u2014",
    polygon: "\u2014",
    eth: "\u2014",
    bsc: "\u2014",
    pi: "\u2014",
    nft: "\u2014"
  });

  const [gasLastUpdated, setGasLastUpdated] = useState(null);
  const [gasLoading, setGasLoading] = useState(false);
  const [gasLiveError, setGasLiveError] = useState(false);

  const theme = useMemo(() => ({
    primary: '#3B82F6',
    primaryGradientStart: '#2563EB',
    primaryGradientEnd: '#1D4ED8',
    bg: isDarkMode ? '#090D16' : '#F4F6F9',
    cardBg: isDarkMode ? '#111827' : '#FFFFFF',
    textMain: isDarkMode ? '#F9FAFB' : '#1F2937',
    textSub: isDarkMode ? '#9CA3AF' : '#6B7280',
    inputBg: isDarkMode ? '#1F2937' : '#E5E7EB',
    inputTextColor: isDarkMode ? '#FFFFFF' : '#111827',
    itemBg: isDarkMode ? '#1F2937' : '#F9FAFB',
    borderCol: isDarkMode ? '#374151' : '#E5E7EB',
    netCardBg: isDarkMode ? '#1E293B' : '#FFFFFF'
  }), [isDarkMode]);

  const NETWORKS = useMemo(() => ({
    tron: { name: "TRON (TRX)", symbol: "TRX", badgeColor: theme.primary, badgeText: "TRC" },
    sol: { name: "Solana", symbol: "SOL", badgeColor: theme.primary, badgeText: "SOL" },
    btc: { name: "Bitcoin", symbol: "BTC", badgeColor: theme.primary, badgeText: "BTC" },
    avax: { name: "Avalanche", symbol: "AVAX", badgeColor: theme.primary, badgeText: "AVAX" },
    arb: { name: "Arbitrum", symbol: "ARB", badgeColor: theme.primary, badgeText: "ARB" },
    polygon: { name: "Polygon", symbol: "POL", badgeColor: theme.primary, badgeText: "POL" },
    eth: { name: "Ethereum", symbol: "ETH", badgeColor: theme.primary, badgeText: "ETH" },
    bsc: { name: "BNB Smart Chain", symbol: "BNB", badgeColor: theme.primary, badgeText: "BSC" },
    pi: { name: "Pi Network", symbol: "PI", badgeColor: theme.primary, badgeText: "PI" },
    nft: { name: "NFT Koleksiyonları", symbol: "NFT", badgeColor: theme.primary, badgeText: "NFT" }
  }), [theme]);

  const handleIsolatedError = useCallback((moduleName, error) => {
    LiveErrorTracker.captureException(error, moduleName);
    console.warn(`[Hata İzole Edildi - ${moduleName}]:`, error.message || error);
  }, []);

  const fetchLiveCoinGeckoPrices = useCallback(async () => {
    const startTime = Date.now();
    try {
      RateLimiterGuard.checkLimit('coingecko-prices');
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'tron,solana,bitcoin,avalanche-2,arbitrum,polygon-ecosystem-token,ethereum,binancecoin,pi-network,nft,tether,usd-coin',
          vs_currencies: 'usd'
        },
        headers: {
          ...SecurityScannerMiddleware.auditHeaders
        },
        timeout: 6000
      });
      if (response.data) {
        setLiveCryptoPrices({
          TRX: response.data.tron?.usd ? String(response.data.tron.usd) : null,
          SOL: response.data.solana?.usd ? String(response.data.solana.usd) : null,
          BTC: response.data.bitcoin?.usd ? String(response.data.bitcoin.usd) : null,
          AVAX: response.data['avalanche-2']?.usd ? String(response.data['avalanche-2'].usd) : null,
          ARB: response.data.arbitrum?.usd ? String(response.data.arbitrum.usd) : null,
          POL: response.data['polygon-ecosystem-token']?.usd ? String(response.data['polygon-ecosystem-token'].usd) : null,
          ETH: response.data.ethereum?.usd ? String(response.data.ethereum.usd) : null,
          USDT: response.data.tether?.usd ? String(response.data.tether.usd) : null,
          USDC: response.data['usd-coin']?.usd ? String(response.data['usd-coin'].usd) : null,
          BNB: response.data.binancecoin?.usd ? String(response.data.binancecoin.usd) : null,
          PI: response.data['pi-network']?.usd ? String(response.data['pi-network'].usd) : null,
          NFT: null
        });
      }
      PerformanceMonitor.logLoadTest('CoinGecko API', Date.now() - startTime);
    } catch (e) {
      handleIsolatedError("CoinGecko Canlı Fiyatlar", e);
    }
  }, [handleIsolatedError]);

  // V26_GLOBAL_SETTINGS_LOAD
  useEffect(() => {
    const loadGlobalSettings = async () => {
      try {
        const savedLanguage =
        await AsyncStorage.getItem('@safe_sentinel_language');

        const savedCurrency =
        await AsyncStorage.getItem('@safe_sentinel_currency');

        if (
        savedLanguage &&
        V26_GLOBAL_I18N[savedLanguage])
        {
          setSelectedLanguage(savedLanguage);
        }

        if (
        savedCurrency &&
        V26_CURRENCIES[savedCurrency])
        {
          setSelectedCurrency(savedCurrency);
        }
      } catch (error) {
        console.warn(
          '[GLOBAL SETTINGS] load failed:',
          error?.message || error
        );
      }
    };

    loadGlobalSettings();
  }, []);
  const loadSecureAndLocalData = useCallback(async () => {
    let sessionAuthenticated = false;

    try {
      const savedWhite = await AsyncStorage.getItem('@whitelist');
      const savedBlack = await AsyncStorage.getItem('@blacklist');
      const savedVault = await AsyncStorage.getItem('@vault');

      const secureApiKey =
      Platform.OS === 'web' ?
      await AsyncStorage.getItem('user_secure_token') :
      await SecureStore.getItemAsync('user_secure_token');

      if (savedWhite) {
        setWhitelist(JSON.parse(savedWhite));
      }

      if (savedBlack) {
        setBlacklist(JSON.parse(savedBlack));
      }

      if (secureApiKey) {
        setToken(secureApiKey);
        try {
          const meResponse = await api.get('/api/me', { timeout: 10000 });
          const restoredUser = meResponse.data?.user;

          if (!restoredUser) {
            throw new Error("Session doğrulaması başarısız.");
          }

          sessionAuthenticated = true;

          setName(restoredUser.name || '');
          setEmail(restoredUser.email || '');
          setUserStatus(restoredUser.status || 'free');
          // Oturum doğrulandı; uygulama açılışında otomatik Dashboard'a geçilmez.

          console.log("Session restored successfully.");
        } catch (authError) {
          sessionAuthenticated = false;

          console.warn(
            "Session restore failed:",
            authError?.response?.data?.error ||
            authError?.message ||
            authError
          );

          if (Platform.OS === 'web') {
            await AsyncStorage.removeItem('user_secure_token');
          } else {
            await SecureStore.deleteItemAsync('user_secure_token');
          }
        }
      }

      if (sessionAuthenticated) {
        try {
          const response = await api.get('/api/wallets');

          const backendWallets = Array.isArray(response.data?.wallets) ?
          response.data.wallets :
          [];

          const backendAddresses = backendWallets.
          map((wallet) => wallet?.address).
          filter(Boolean);

          setVault(backendAddresses);
          updateDynamicRevokeAndVaultData(backendAddresses);

          await AsyncStorage.setItem(
            '@vault',
            JSON.stringify(backendAddresses)
          );

          console.log(
            `Backend Wallet senkronizasyonu başarılı: ${backendAddresses.length} cüzdan`
          );
        } catch (walletError) {
          console.warn(
            "Backend Wallet API kullanılamadı, lokal Vault kullanılacak:",
            walletError?.message || walletError
          );

          if (savedVault) {
            const parsedVault = JSON.parse(savedVault);
            setVault(parsedVault);
            updateDynamicRevokeAndVaultData(parsedVault);
          }
        }
      } else if (savedVault) {
        const parsedVault = JSON.parse(savedVault);
        setVault(parsedVault);
        updateDynamicRevokeAndVaultData(parsedVault);
      }

      return sessionAuthenticated;
    } catch (e) {
      handleIsolatedError("Yerel veri yükleme hatası", e);
      return false;
    }
  }, [handleIsolatedError]);
  const fetchLiveGasFees = useCallback(async () => {
    setGasLoading(true);
    setGasLiveError(false);
    try {
      RateLimiterGuard.checkLimit('live-gas-fees');
      const response = await api.get(`/api/live-gas-fees`, {
        headers: {
          ...SecurityScannerMiddleware.auditHeaders
        },
        timeout: 5000
      });
      if (response.data && response.data.fees) {
        setNetworkGasFees(response.data.fees);
        setGasLastUpdated(new Date());
        setGasLiveError(false);
      }
    } catch (e) {
      setGasLiveError(true);
      handleIsolatedError("Gas Ücretleri", e);
    }
  }, [handleIsolatedError]);

  useEffect(() => {
    if (!(Platform.OS === 'android' && __DEV__)) {
      Notifications.requestPermissionsAsync().catch((e) =>
      handleIsolatedError("Bildirim İzni", e)
      );
    }

    const initializeApp = async () => {
      await checkBackendHealth();

      const authenticated = await loadSecureAndLocalData();

      if (authenticated) {
        await fetchLiveGasFees();
      }

      await fetchLiveCoinGeckoPrices();
    };

    initializeApp();
  }, [
  loadSecureAndLocalData,
  checkBackendHealth,
  fetchLiveCoinGeckoPrices,
  fetchLiveGasFees,
  handleIsolatedError]
  );
  const syncSecurityAddressLists = async () => {
    try {
      const [whiteResponse, blackResponse] =
      await Promise.all([
      api.get('/api/whitelist'),
      api.get('/api/blacklist')]
      );

      const whiteData =
      Array.isArray(whiteResponse?.data?.items) ?
      whiteResponse.data.items :
      Array.isArray(whiteResponse?.data?.whitelist) ?
      whiteResponse.data.whitelist :
      Array.isArray(whiteResponse?.data) ?
      whiteResponse.data :
      [];

      const blackData =
      Array.isArray(blackResponse?.data?.items) ?
      blackResponse.data.items :
      Array.isArray(blackResponse?.data?.blacklist) ?
      blackResponse.data.blacklist :
      Array.isArray(blackResponse?.data) ?
      blackResponse.data :
      [];

      setWhitelist(whiteData);
      setBlacklist(blackData);

      await AsyncStorage.setItem(
        '@whitelist',
        JSON.stringify(whiteData)
      );

      await AsyncStorage.setItem(
        '@blacklist',
        JSON.stringify(blackData)
      );

      return {
        whitelist: whiteData,
        blacklist: blackData
      };
      const removeSecurityAddress = async (type, id) => {
        try {
          if (!id) {
            throw new Error("Silinecek güvenlik adresi ID bulunamadı.");
          }

          const endpoint =
          type === "whitelist" ?
          `/api/whitelist/${id}` :
          `/api/blacklist/${id}`;

          await api.delete(endpoint);

          await syncSecurityAddressLists();

          return true;
        } catch (e) {
          handleIsolatedError(
            type === "whitelist" ?
            "Whitelist adres silme" :
            "Blacklist adres silme",
            e
          );
          return false;
        }
      };

    } catch (error) {
      console.error(
        '[SECURITY LIST SYNC]',
        error
      );

      return null;
    }
  };
  // V26_GLOBAL_SETTINGS_SAVE
  const saveGlobalLanguage = async (value) => {
    if (!V26_GLOBAL_I18N[value]) return;

    setSelectedLanguage(value);

    try {
      await AsyncStorage.setItem(
        '@safe_sentinel_language',
        value
      );
    } catch (error) {
      console.warn(
        '[GLOBAL SETTINGS] language save failed:',
        error?.message || error
      );
    }
  };

  const saveGlobalCurrency = async (value) => {
    if (!V26_CURRENCIES[value]) return;

    setSelectedCurrency(value);

    try {
      await AsyncStorage.setItem(
        '@safe_sentinel_currency',
        value
      );
    } catch (error) {
      console.warn(
        '[GLOBAL SETTINGS] currency save failed:',
        error?.message || error
      );
    }
  };

  const t = (key) =>
  v26GetTranslation(selectedLanguage, key);

  const formatCurrency = (usdValue) =>
  v26FormatCurrency(usdValue, selectedCurrency);

  const PRICE_ALERT_SYMBOL_TO_ASSET = {
    TRX: 'tron', SOL: 'solana', BTC: 'bitcoin', AVAX: 'avalanche-2',
    ARB: 'arbitrum', POL: 'polygon-ecosystem-token', ETH: 'ethereum',
    BNB: 'binancecoin', PI: 'pi-network'
  };
  const PRICE_ALERT_ASSET_TO_SYMBOL = Object.fromEntries(
    Object.entries(PRICE_ALERT_SYMBOL_TO_ASSET).map(([symbol, asset]) => [asset, symbol])
  );

  const securityListContains = (list, targetAddress, targetNetwork = selectedNetwork) => {
    const normalizedAddress = String(targetAddress || '').trim().toLowerCase();
    const normalizedNetwork = String(targetNetwork === 'eth' ? 'ethereum' : targetNetwork || '').trim().toLowerCase();

    return Array.isArray(list) && list.some((entry) => {
      const entryAddress = String(entry?.address || entry || '').trim().toLowerCase();
      const entryNetwork = String(entry?.network || normalizedNetwork).trim().toLowerCase();
      return entryAddress === normalizedAddress && entryNetwork === normalizedNetwork;
    });
  };

  const saveWhitelist = async (newList) => {
    const normalized = Array.isArray(newList) ?
    newList.
    map((item) => {
      if (typeof item === 'string') {
        return {
          address: item.trim(),
          network:
          selectedNetwork === 'eth' ?
          'ethereum' :
          selectedNetwork
        };
      }

      return {
        ...item,
        address: String(item?.address || '').trim(),
        network:
        item?.network || (

        selectedNetwork === 'eth' ?
        'ethereum' :
        selectedNetwork)

      };
    }).
    filter((item) => item.address) :
    [];

    const previous =
    Array.isArray(whitelist) ?
    whitelist :
    [];

    const conflict = normalized.find((item) =>
      securityListContains(blacklist, item.address, item.network)
    );

    if (conflict) {
      Alert.alert(
        'Whitelist',
        selectedLanguage === 'tr'
          ? 'Bu adres Blacklist içinde. Aynı adres iki listede birden bulunamaz. Önce Blacklist kaydını kaldırın.'
          : 'This address is already in the Blacklist. The same address cannot exist in both lists. Remove it from the Blacklist first.'
      );
      return previous;
    }

    for (const item of normalized) {
      const alreadyExists =
      previous.some((existing) =>
      String(existing?.address || existing).
      trim().
      toLowerCase() === item.address.toLowerCase()
      );

      if (!alreadyExists) {
        await api.post('/api/whitelist', {
          address: item.address,
          network: item.network
        });
      }
    }

    setWhitelist(normalized);

    await AsyncStorage.setItem(
      '@whitelist',
      JSON.stringify(normalized)
    );

    await AutoBackupManager.performBackup(
      'whitelist',
      normalized
    );

    return normalized;
  };

  const saveBlacklist = async (newList) => {
    const normalized = Array.isArray(newList) ?
    newList.
    map((item) => {
      if (typeof item === 'string') {
        return {
          address: item.trim(),
          network:
          selectedNetwork === 'eth' ?
          'ethereum' :
          selectedNetwork
        };
      }

      return {
        ...item,
        address: String(item?.address || '').trim(),
        network:
        item?.network || (

        selectedNetwork === 'eth' ?
        'ethereum' :
        selectedNetwork)

      };
    }).
    filter((item) => item.address) :
    [];

    const previous =
    Array.isArray(blacklist) ?
    blacklist :
    [];

    const conflict = normalized.find((item) =>
      securityListContains(whitelist, item.address, item.network)
    );

    if (conflict) {
      Alert.alert(
        'Blacklist',
        selectedLanguage === 'tr'
          ? 'Bu adres Whitelist içinde. Aynı adres iki listede birden bulunamaz. Önce Whitelist kaydını kaldırın.'
          : 'This address is already in the Whitelist. The same address cannot exist in both lists. Remove it from the Whitelist first.'
      );
      return previous;
    }

    for (const item of normalized) {
      const alreadyExists =
      previous.some((existing) =>
      String(existing?.address || existing).
      trim().
      toLowerCase() === item.address.toLowerCase()
      );

      if (!alreadyExists) {
        await api.post('/api/blacklist', {
          address: item.address,
          network: item.network
        });
      }
    }

    setBlacklist(normalized);

    await AsyncStorage.setItem(
      '@blacklist',
      JSON.stringify(normalized)
    );

    await AutoBackupManager.performBackup(
      'blacklist',
      normalized
    );

    return normalized;
  };

  const saveVault = async (newList) => {
    const backendNetwork = selectedNetwork === "eth" ? "ethereum" : selectedNetwork;

    try {
      if (!Array.isArray(newList)) {
        throw new Error("Geçersiz Vault listesi.");
      }

      /*
       * Backend artık Vault'un gerçek kaynağıdır.
       * VIP kontrolü ve maksimum 10 cüzdan kontrolü backend'de yapılır.
       */
      const currentResponse = await api.get('/api/wallets');

      const backendWallets = Array.isArray(currentResponse.data?.wallets) ?
      currentResponse.data.wallets :
      [];

      const backendAddresses = backendWallets.map((wallet) =>
      String(wallet.address || '').trim()
      );

      const addressesToCreate = newList.filter((address) => {
        const normalized = String(address || '').trim();
        return normalized && !backendAddresses.includes(normalized);
      });

      for (const walletAddress of addressesToCreate) {
        try {
          await api.post('/api/wallets', {
            network: backendNetwork,
            address: walletAddress,
            label: 'Safe Sentinel Vault'
          });
        } catch (walletError) {
          const status = walletError?.response?.status;
          const serverError = walletError?.response?.data?.error;

          /*
           * Aynı cüzdan zaten backend'de varsa devam edilir.
           * Diğer hatalar kullanıcıya bildirilir.
           */
          if (status !== 409 || serverError !== 'Wallet already saved') {
            throw walletError;
          }
        }
      }

      /*
       * Kayıtların backend tarafından gerçekten oluştuğunu
       * doğrulamak için listeyi tekrar çekiyoruz.
       */
      const finalResponse = await api.get('/api/wallets');

      const finalWallets = Array.isArray(finalResponse.data?.wallets) ?
      finalResponse.data.wallets :
      [];

      const finalAddresses = finalWallets.
      map((wallet) => String(wallet.address || '').trim()).
      filter(Boolean);

      setVault(finalAddresses);
      await AsyncStorage.setItem('@vault', JSON.stringify(finalAddresses));
      await AutoBackupManager.performBackup('vault', finalAddresses);
      updateDynamicRevokeAndVaultData(finalAddresses);

      console.log(
        `Backend Vault senkronizasyonu başarılı: ${finalAddresses.length} cüzdan`
      );

      return finalAddresses;
    } catch (error) {
      console.error("Vault backend senkronizasyon hatası:", error);

      const status = error?.response?.status;
      const serverError = error?.response?.data?.error;

      if (status === 403 && serverError === 'VIP subscription required') {
        Alert.alert(t("runtimeVipRequiredTitle"), t("runtimeVaultVipRequired")

        );
      } else if (status === 409 && serverError === 'Wallet limit reached') {
        Alert.alert(t("runtimeVaultLimitTitle"), t("runtimeVaultLimitMessage")

        );
      } else {
        Alert.alert(t("runtimeVaultSyncErrorTitle"),

        serverError || t("runtimeVaultSyncErrorMessage")
        );
      }

      throw error;
    }
  };
  const updateDynamicRevokeAndVaultData = async (vaultItems) => {
    if (!Array.isArray(vaultItems) || vaultItems.length === 0) {
      setRevokeList([]);
      return;
    }

    const results = [];

    for (const address of vaultItems) {
      const cleanAddr = String(address || '').trim();

      if (!cleanAddr) {
        continue;
      }

      try {
        if (/^0x[a-fA-F0-9]{40}$/.test(cleanAddr)) {
          const network =
          selectedNetwork === 'eth' ?
          'ethereum' :
          selectedNetwork;

          const response = await api.post(
            '/api/check-allowances',
            {
              network,
              address: cleanAddr
            },
            {
              headers: {
                ...SecurityScannerMiddleware.auditHeaders
              },
              timeout: 30000
            }
          );

          const allowances =
          Array.isArray(response.data?.allowances) ?
          response.data.allowances :
          [];

          results.push(
            ...allowances.map((item) => ({
              token:
              item.tokenSymbol ||
              item.tokenName ||
              item.token ||
              'EVM Token',

              spender:
              item.spender ||
              'Bilinmeyen Kontrat',

              allowance:
              item.unlimited ?
              'Sınırsız' :
              String(item.allowance ?? '0'),

              risk:
              item.risk || (
              item.unlimited ? 'Yüksek' : 'Orta'),

              address: cleanAddr,
              network:
              item.network || network,

              tokenAddress:
              item.token || null,

              unlimited:
              Boolean(item.unlimited)
            }))
          );
        }
      } catch (error) {
        console.warn(
          'Revoke allowance taraması başarısız:',
          error?.response?.data ||
          error?.message ||
          error
        );
      }
    }

    setRevokeList(results);
  };
  const [requestQueue, setRequestQueue] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const enqueueApiRequest = (requestTask) => {
    setRequestQueue((prev) => [...prev, requestTask]);
  };

  useEffect(() => {
    if (!isProcessingQueue && requestQueue.length > 0) {
      processQueue();
    }
  }, [requestQueue, isProcessingQueue]);

  const processQueue = async () => {
    setIsProcessingQueue(true);
    const currentTask = requestQueue[0];
    try {
      await currentTask();
    } catch (err) {
      handleIsolatedError("İstek Kuyruğu", err);
    } finally {
      setRequestQueue((prev) => prev.slice(1));
      setIsProcessingQueue(false);
    }
  };
  useEffect(() => {
    let monitorRunning = false;

    const runVaultMonitor = async () => {
      if (monitorRunning || vault.length === 0) {
        return;
      }

      monitorRunning = true;

      try {
        RateLimiterGuard.checkLimit('vault-monitor');

        const res = await api.post(
          '/api/monitor-vault-with-scam-pool',
          {
            vaultAddresses: vault,
            blacklistAddresses: blacklist
          },
          {
            headers: {
              ...SecurityScannerMiddleware.auditHeaders
            },
            timeout: 30000
          }
        );

        if (
        res.data &&
        Array.isArray(res.data.notifications) &&
        res.data.notifications.length > 0)
        {
          setVaultNotifications(res.data.notifications);

          res.data.notifications.forEach((notif) => {
            triggerLocalNotification(notif.title, notif.body);
          });
        }
      } catch (e) {
        handleIsolatedError('Vault Monitor', e);
      } finally {
        monitorRunning = false;
      }
    };

    runVaultMonitor();

    const interval = setInterval(() => {
      runVaultMonitor();
    }, 60000);

    return () => {
      clearInterval(interval);
      monitorRunning = false;
    };
  }, [vault, blacklist, handleIsolatedError]);

  const loadCentralNotifications = async () => {
    try {
      if (!token) return;

      const res = await axios.get(
        `${API_BASE_URL}/api/notifications`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const notifications = Array.isArray(res.data?.notifications) ?
      res.data.notifications :
      [];

      setCentralNotifications(notifications);
      setCentralUnreadCount(
        Number(res.data?.unreadCount || 0)
      );

      for (const notification of notifications) {
        if (
        notification?.id &&
        !notification.read &&
        !centralSeenIdsRef.current.has(notification.id))
        {
          centralSeenIdsRef.current.add(notification.id);

          try {
            await triggerLocalNotification(
              notification.title || 'Safe Sentinel',
              notification.body || ''
            );
          } catch (_) {}
        }
      }
    } catch (error) {
      console.warn(
        '[CENTRAL NOTIFICATION] load failed:',
        error?.response?.data || error?.message || error
      );
    }
  };

  const markCentralNotificationRead = async (id) => {
    if (!token || !id) return;

    try {
      await axios.patch(
        `${API_BASE_URL}/api/notifications/${id}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await loadCentralNotifications();
    } catch (error) {
      console.warn(
        '[CENTRAL NOTIFICATION] mark read failed:',
        error?.response?.data || error?.message || error
      );
    }
  };

  const markAllCentralNotificationsRead = async () => {
    if (!token) return;

    try {
      await axios.patch(
        `${API_BASE_URL}/api/notifications/read-all`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await loadCentralNotifications();
    } catch (error) {
      console.warn(
        '[CENTRAL NOTIFICATION] read-all failed:',
        error?.response?.data || error?.message || error
      );
    }
  };
  const triggerLocalNotification = async (title, body) => {
    if (Platform.OS === "web" || Platform.OS === "android" && __DEV__) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default' },
        trigger: null
      });
    } catch (e) {
      handleIsolatedError("Yerel Bildirim", e);
    }
  };

  const handleRevokeApproval = async (index) => {
    setRevokingIndex(index);

    try {
      RateLimiterGuard.checkLimit('revoke-approval');

      const item = revokeList[index];

      if (!item) {
        throw new Error('Revoke kaydı bulunamadı.');
      }

      if (!isConnected || !connectedWalletAddress) {
        throw new Error(t("runtimeConnectEvmWallet"));
      }

      const network = String(item.network || '').trim().toLowerCase();
      const owner = String(connectedWalletAddress || '').trim();
      const token = String(item.tokenAddress || '').trim();
      const spender = String(item.spender || '').trim();

      const supportedNetworks = [
      'ethereum',
      'bsc',
      'polygon',
      'arbitrum',
      'base',
      'optimism',
      'avalanche'];

      if (!supportedNetworks.includes(network)) {
        throw new Error(t("runtimeRevokeUnsupportedNetwork"));
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
        throw new Error(t("runtimeInvalidConnectedEvmWallet"));
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
        throw new Error(t("runtimeInvalidTokenContract"));
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(spender)) {
        throw new Error(t("runtimeInvalidSpenderContract"));
      }

      const response = await api.post(
        '/api/prepare-revoke',
        {
          network,
          owner,
          token,
          spender
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 10000
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.error || t("runtimeRevokePrepareFailed")

        );
      }

      const signer = await getConnectedSigner();
      const tokenContract = new Contract(
        token,
        ERC20_REVOKE_ABI,
        signer
      );

      const currentAllowance = await tokenContract.allowance(
        owner,
        spender
      );

      console.log('[REVOKE LIVE ALLOWANCE]', {
        network,
        owner,
        token,
        spender,
        allowance: currentAllowance.toString()
      });

      if (currentAllowance === 0n) {
        Alert.alert(t("runtimeRevokeNotNeededTitle"), t("runtimeRevokeNotNeededMessage")

        );
        return;
      }

      const backendAllowanceRaw = String(
        response.data?.allowanceRaw ?? ''
      ).trim();

      if (!backendAllowanceRaw) {
        throw new Error(t("runtimeRevokeAllowanceMissing")

        );
      }

      if (currentAllowance.toString() !== backendAllowanceRaw) {
        console.warn('[REVOKE ALLOWANCE MISMATCH]', {
          backendAllowanceRaw,
          currentAllowance: currentAllowance.toString(),
          network,
          owner,
          token,
          spender
        });

        throw new Error(
          'Allowance değeri işlem sırasında değişti. Güvenlik nedeniyle revoke işlemi durduruldu.'
        );
      }

      console.log('[REVOKE ALLOWANCE VERIFIED]', {
        network,
        owner,
        token,
        spender,
        allowanceRaw: currentAllowance.toString()
      });

      console.log('[REVOKE PREPARED]', {
        network,
        owner,
        token,
        spender,
        result: response.data
      });

      const networkChainIds = {
        ethereum: 1,
        bsc: 56,
        polygon: 137,
        arbitrum: 42161,
        base: 8453,
        optimism: 10,
        avalanche: 43114
      };

      const expectedChainId = networkChainIds[network];
      const currentChainId = Number(chainId);

      if (!expectedChainId || currentChainId !== expectedChainId) {
        throw new Error(
          'Cüzdan ağı ile revoke ağı eşleşmiyor. Beklenen chainId: ' +
          String(expectedChainId) +
          ', mevcut: ' +
          String(currentChainId || 'bilinmiyor') +
          '.'
        );
      }

      const tx = await tokenContract.approve(spender, 0);

      console.log('[REVOKE TRANSACTION SENT]', {
        hash: tx.hash,
        network,
        owner,
        token,
        spender
      });

      Alert.alert(t("runtimeRevokeSentTitle"),

      "İşlem blockchain'e gönderildi.\n\nTransaction:\n\nOnay bekleniyor..."
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error('Revoke transaction blockchain tarafından başarısız olarak sonuçlandı.');
      }

      console.log('[REVOKE TRANSACTION CONFIRMED]', {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status
      });
      // REVOKE POST-TX ON-CHAIN VERIFICATION
      const allowanceAfter = await tokenContract.allowance(owner, spender);

      console.log('[REVOKE ALLOWANCE AFTER]', {
        owner,
        token,
        spender,
        allowanceAfter: allowanceAfter.toString()
      });

      if (allowanceAfter !== 0n) {
        throw new Error(
          'Revoke transaction onaylandı ancak allowance blockchain üzerinde 0 olarak doğrulanamadı. Mevcut allowance: ' + allowanceAfter.toString()
        );
      }

      console.log('[REVOKE VERIFIED]', {
        hash: tx.hash,
        owner,
        token,
        spender,
        allowanceAfter: '0'
      });

      setRevokeList((prev) =>
      prev.filter((_, i) => i !== index)
      );

      Alert.alert(t("runtimeRevokeConfirmedTitle"),

      'Harcama yetkisi blockchain üzerinde 0 olarak doğrulandı.\n\nTransaction: ' + tx.hash
      );
    } catch (e) {
      console.error('[REVOKE PREPARE ERROR]', e);

      const message =
      e?.response?.data?.error ||
      e?.message ||
      'Revoke işlemi hazırlanırken bir hata oluştu.';

      Alert.alert(t("runtimeRevokePrepareErrorTitle"), message);
    } finally {
      setRevokingIndex(null);
    }
  };
  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem('user_secure_token');
      } else {
        await SecureStore.deleteItemAsync('user_secure_token');
      }
    } catch (error) {
      console.warn("Logout token temizleme hatası:", error);
    }

    setToken(null);
    setCurrentScreen('login');
    setActiveModule('dashboard');
  };
  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccountTitle'),
      t('deleteAccountConfirm'),
      [
      { text: t('deleteAccountCancel'), style: 'cancel' },
      {
        text: t('deleteAccountAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete('/api/me', { data: { confirmation: 'DELETE' } });

            if (Platform.OS === 'web') {
              await AsyncStorage.multiRemove([
              'user_secure_token',
              '@safe_sentinel_user']
              );
            } else {
              await SecureStore.deleteItemAsync('user_secure_token');
              await AsyncStorage.removeItem('@safe_sentinel_user');
            }

            setToken(null);
            setName('');
            setEmail('');
            setUserStatus('free');
            setActiveModule('dashboard');
            setCurrentScreen('login');
          } catch (error) {
            console.error('[ACCOUNT DELETE]', error?.response?.data || error?.message || error);
            Alert.alert(t('commonError'), t('deleteAccountFailed'));
          }
        }
      }]

    );
  };
  const requestWithBackendRecovery = async (requestFactory) => {
    try {
      return await requestFactory();
    } catch (firstError) {
      const status = firstError?.response?.status;
      const retryable =
        !firstError?.response ||
        firstError?.code === 'ECONNABORTED' ||
        [502, 503, 504].includes(status);

      if (!retryable) throw firstError;

      try {
        await axios.get(`${API_BASE_URL}/health`, { timeout: 20000 });
      } catch (_) {}

      await new Promise((resolve) => setTimeout(resolve, 1200));
      return await requestFactory();
    }
  };

  const handleLogin = async () => {
    const cleanEmail = SecurityScannerMiddleware.sanitizeInput(email).trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert(
        t("runtimeMissingInfoTitle"),
        selectedLanguage === 'tr' ? 'Lütfen e-posta ve şifrenizi girin.' : 'Enter your email and password.'
      );
      return;
    }

    try {
      setLoading(true);

      const response = await requestWithBackendRecovery(() =>
        axios.post(
          `${API_BASE_URL}/api/auth/login`,
          { email: cleanEmail, password: cleanPassword },
          {
            headers: { ...SecurityScannerMiddleware.auditHeaders },
            timeout: 30000
          }
        )
      );

      const { token, user } = response.data || {};
      if (!token || !user) {
        throw new Error('INVALID_LOGIN_RESPONSE');
      }

      setToken(token);
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem('user_secure_token', token);
      } else {
        await SecureStore.setItemAsync('user_secure_token', token);
      }

      setName(user.name || '');
      setEmail(user.email || cleanEmail);
      setUserStatus(user.status || 'free');
      setQueryCount(0);
      setApiOnline(true);
      setCurrentScreen('dashboard');
      setActiveModule('dashboard');

      Alert.alert(
        t("runtimeLoginSuccessTitle"),
        selectedLanguage === 'tr'
          ? `Hoş geldiniz ${user.name || ''}!`
          : `Welcome ${user.name || ''}!`
      );
    } catch (error) {
      console.error('Login error:', error);
      const status = error?.response?.status;
      const code = error?.code;
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message;

      const message = status === 401
        ? (selectedLanguage === 'tr' ? 'E-posta veya şifre hatalı.' : 'Incorrect email or password.')
        : status === 429
        ? (selectedLanguage === 'tr' ? 'Çok fazla giriş denemesi yapıldı. Kısa bir süre sonra tekrar deneyin.' : 'Too many login attempts. Please try again shortly.')
        : [502, 503, 504].includes(status) || code === 'ECONNABORTED' || !error?.response
        ? (selectedLanguage === 'tr'
            ? 'Güvenli sunucu bağlantısı şu anda hazırlanıyor. Otomatik yeniden deneme başarısız oldu; lütfen birkaç saniye sonra tekrar deneyin.'
            : 'The secure server connection is still starting. Automatic retry did not complete; please try again in a few seconds.')
        : serverMessage || t("runtimeLoginFailedGeneric");

      Alert.alert(t("runtimeLoginFailedTitle"), message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    const cleanName = SecurityScannerMiddleware.sanitizeInput(regName).trim();
    const cleanSurname = SecurityScannerMiddleware.sanitizeInput(regSurname).trim();
    const cleanEmail = SecurityScannerMiddleware.sanitizeInput(regEmail).trim().toLowerCase();
    const cleanPassword = regPassword.trim();
    const cleanVaultAddress = SecurityScannerMiddleware.sanitizeInput(regVaultAddress).trim();

    if (!cleanName || !cleanSurname || !cleanEmail || !cleanPassword) {
      Alert.alert(t("runtimeMissingInfoTitle"), t("runtimeRegisterMissingFields")

      );
      return;
    }

    if (cleanPassword.length < 10) {
      Alert.alert(t("runtimeInvalidPasswordTitle"), t("runtimeInvalidPasswordMessage")

      );
      return;
    }

    try {
      setLoading(true);

      const response = await requestWithBackendRecovery(() => axios.post(
        `${API_BASE_URL}/api/auth/register`,
        {
          name: `${cleanName} ${cleanSurname}`,
          email: cleanEmail,
          password: cleanPassword
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 30000
        }
      ));

      const { token, user } = response.data;
      setToken(token);

      if (!token || !user) {
        throw new Error(t("runtimeInvalidRegisterResponse"));
      }

      if (Platform.OS === 'web') {
        await AsyncStorage.setItem('user_secure_token', token);
      } else {
        await SecureStore.setItemAsync('user_secure_token', token);
      }

      setName(user.name || `${cleanName} ${cleanSurname}`);
      setEmail(user.email || cleanEmail);
      setPassword('');
      setUserStatus(user.status || 'free');
      setQueryCount(0);

      if (cleanVaultAddress) {
        const updatedVault = vault.includes(cleanVaultAddress) ?
        vault :
        [...vault, cleanVaultAddress];

        await saveVault(updatedVault);
      }

      setRegName('');
      setRegSurname('');
      setRegEmail('');
      setRegPassword('');
      setRegVaultAddress('');
      setRegWantVip(false);

      setCurrentScreen('dashboard');
      setActiveModule('dashboard');

      Alert.alert(t("runtimeRegisterSuccessTitle"),

      `Hoş geldiniz ${user.name || `${cleanName} ${cleanSurname}`}! Hesabınız oluşturuldu.`
      );

    } catch (error) {
      console.error("Registration error:", error);

      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message;
      const duplicateEmail = /already registered|already exists/i.test(String(serverMessage || ''));
      const message = (status === 409 || duplicateEmail)
        ? (selectedLanguage === 'tr' ? 'Bu e-posta adresi zaten kayıtlı.' : 'This email address is already registered.')
        : !error?.response
        ? (selectedLanguage === 'tr' ? 'Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.' : 'Cannot reach the server. Please try again.')
        : serverMessage || t("runtimeRegisterFailedGeneric");

      Alert.alert(t("runtimeRegisterFailedTitle"), message);
    } finally {
      setLoading(false);
    }
  };
  const handleOpenWalletConnection = async () => {
    try {
      await appKit.open();
    } catch (error) {
      console.error('[WALLET CONNECT]', error);
      Alert.alert(
        selectedLanguage === 'tr' ? 'Cüzdan Bağlantısı' : 'Wallet Connection',
        selectedLanguage === 'tr'
          ? 'Cüzdan bağlantı ekranı açılamadı. Lütfen tekrar deneyin.'
          : 'Wallet connection could not be opened. Please try again.'
      );
    }
  };

  const applyConnectedWalletToScanner = () => {
    const connected = String(connectedWalletAddress || '').trim();
    if (!isConnected || !connected) {
      handleOpenWalletConnection();
      return;
    }

    const chainToNetwork = {
      1: 'eth',
      56: 'bsc',
      137: 'polygon',
      42161: 'arb',
      43114: 'avax'
    };

    setAddress(connected);
    if (chainToNetwork[Number(chainId)]) {
      setSelectedNetwork(chainToNetwork[Number(chainId)]);
    }
    setQueryWarning('');
  };

  const shortenWalletAddress = (value) => {
    const text = String(value || '').trim();
    if (text.length <= 14) return text;
    return `${text.slice(0, 7)}…${text.slice(-5)}`;
  };

  const handleVipSelection = () => {
    setActiveModule('vipView');
  };

  const fetchPortfolioData = useCallback(async () => {
    const addressValue = String(address || '').trim();

    if (!addressValue) {
      setWalletNativeBalance(null);
      setWalletTokens([]);
      setWalletLatestBlock(null);
      return null;
    }

    try {
      const response = await api.post('/api/portfolio', {
        network: selectedNetwork === 'eth' ?
        'ethereum' :
        selectedNetwork,
        address: addressValue
      });

      const data = response?.data;

      if (!data?.success) {
        throw new Error(data?.error || 'Portfolio verisi alınamadı');
      }

      setApiOnline(true);
      setWalletNativeBalance(
        data.native?.balance ?? null
      );

      setWalletTokens(
        Array.isArray(data.tokens) ?
        data.tokens :
        []
      );

      setWalletLatestBlock(
        data.latestBlock ?? null
      );

      return data;

    } catch (error) {
      setApiOnline(Boolean(error?.response));
      console.error('[PORTFOLIO] Gerçek veri alınamadı:', error);

      setWalletNativeBalance(null);
      setWalletTokens([]);
      setWalletLatestBlock(null);

      return null;
    }
  }, [
  address,
  selectedNetwork,
  api]
  );

  const inheritanceModuleEffect = useEffect(() => {
    if (activeModule === 'inheritView') {
      loadInheritanceProtocols();
    }
  }, [activeModule, loadInheritanceProtocols]);
  useEffect(() => {
    if (activeModule === 'portfolioView') {
      fetchPortfolioData();
    }
  }, [
  activeModule,
  fetchPortfolioData]
  );
  useEffect(() => {
    if (activeModule === 'gasOptView' && token) {
      fetchLiveGasFees();
    }
  }, [activeModule, token, fetchLiveGasFees]);

  const exportPortfolioJSON = async () => {
    const data = await fetchPortfolioData();

    if (!data) {
      Alert.alert(
        'Portfolio', t("runtimePortfolioNoData")

      );
      return;
    }

    const json = JSON.stringify(data, null, 2);

    if (typeof window !== 'undefined' && window.document) {
      const blob = new Blob(
        [json],
        { type: 'application/json;charset=utf-8' }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'safe-sentinel-portfolio.json';
      link.click();

      URL.revokeObjectURL(url);
      return;
    }

    await Share.share({
      message: json,
      title: 'Safe Sentinel Portfolio JSON'
    });
  };

  const exportPortfolioCSV = async () => {
    const data = await fetchPortfolioData();

    if (!data) {
      Alert.alert(
        'Portfolio', t("runtimePortfolioNoData")

      );
      return;
    }

    const rows = [
    [
    'Network',
    'Address',
    'Asset',
    'Balance',
    'Symbol']];

    rows.push([
    data.network || '',
    data.address || '',
    'Native',
    data.native?.balance ?? '',
    data.native?.symbol ?? '']
    );

    for (const token of data.tokens || []) {
      rows.push([
      data.network || '',
      data.address || '',
      token.symbol || token.name || 'Token',
      token.balance ?? '',
      token.symbol || '']
      );
    }

    const csv = rows.
    map((row) =>
    row.
    map((value) =>
    '"' + String(value ?? '').replace(/"/g, '""') + '"'
    ).
    join(',')
    ).
    join('\\r\\n');

    if (typeof window !== 'undefined' && window.document) {
      const blob = new Blob(
        [csv],
        { type: 'text/csv;charset=utf-8' }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'safe-sentinel-portfolio.csv';
      link.click();

      URL.revokeObjectURL(url);
      return;
    }

    await Share.share({
      message: csv,
      title: 'Safe Sentinel Portfolio CSV'
    });
  };

  const getVaultPortfolioChartData = () => {
    const value = Number(portfolioUsdValue);

    if (!Number.isFinite(value) || value <= 0) {
      return [{ value: 0, label: 'Veri Yok' }];
    }

    return [
    { value, label: 'Mevcut' }];

  };
  const getRecommendedGasNetwork = useMemo(() => {
    const values = Object.entries(networkGasFees).map(([network, fee]) => {
      const match = String(fee).match(/[0-9]+(?:\.[0-9]+)?/);
      return { network, value: match ? Number(match[0]) : Infinity, fee };
    }).filter((item) => Number.isFinite(item.value));

    if (values.length === 0) return null;

    return values.reduce((lowest, current) =>
    current.value < lowest.value ? current : lowest
    );
  }, [networkGasFees]);

  const getChartDataForRange = (range) => {
    return getVaultPortfolioChartData();
  };
  const validateAddressFormat = (network, addr) => {
    const clean = SecurityScannerMiddleware.sanitizeInput(addr);
    if (!clean) return false;

    switch (network) {
      case 'tron':
        return clean.startsWith('T') && clean.length >= 30 && clean.length <= 45;
      case 'eth':
      case 'bsc':
      case 'polygon':
      case 'avax':
      case 'arb':
      case 'nft':
        return clean.startsWith('0x') && clean.length === 42;
      case 'btc':
        return (clean.startsWith('1') || clean.startsWith('3') || clean.startsWith('bc1')) && clean.length >= 26 && clean.length <= 62;
      case 'sol':
        return clean.length >= 32 && clean.length <= 44 && !clean.startsWith('0x');
      case 'pi':
        return clean.length >= 10;
      default:
        return true;
    }
  };

  const handleAddressCheck = async () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : "";
    if (!cleanAddr) {
      setQueryWarning(t("runtimeEnterValidWallet"));
      return;
    }

    const isValidFormat = validateAddressFormat(selectedNetwork, cleanAddr);
    if (!isValidFormat) {
      setQueryWarning(`? Hata: Girdiğiniz adres, seçtiğiniz ${NETWORKS[selectedNetwork].name} ağı formatıyla uyuşmuyor!`);
      setCurrentBalanceText(t("runtimeInvalidWalletFormat"));
      return;
    }

    if (securityListContains(whitelist, cleanAddr, selectedNetwork)) {
      setQueryWarning("");
      enqueueApiRequest(() => executeCheck(cleanAddr));
      return;
    }

    if (userStatus !== 'vip' && queryCount >= 1) {
      setQueryWarning(t("runtimeFreeQueryLimit"));
      setActiveModule('vipView');
      return;
    }

    setQueryWarning("");
    enqueueApiRequest(() => executeCheck(cleanAddr));
  };

  const executeCheck = async (cleanAddr) => {
    if (securityListContains(blacklist, cleanAddr, selectedNetwork)) {
      setQueryWarning(t("runtimeBlacklistWarning"));
      setCurrentBalanceText(t("runtimeBlockedRisk"));
      setTransactionHistory([]);
      triggerLocalNotification(t("runtimeCriticalSecurityAlert"), t("runtimeScamWalletScanned"));
      return;
    }

    setLoading(true);
    setCurrentBalanceText(t("runtimeLoadingChain"));
    setTransactionHistory([]);

    try {
      RateLimiterGuard.checkLimit('check-wallet');
      const backendNetwork = selectedNetwork === "eth" ? "ethereum" : selectedNetwork;
      const response = await api.post(`/api/check-wallet`, {
        network: backendNetwork,
        address: cleanAddr
      }, {
        headers: {
          ...SecurityScannerMiddleware.auditHeaders
        },
        timeout: 15000
      });

      if (response.data && response.data.success) {
        setApiOnline(true);
        setWalletNativeBalance(response.data.balance ?? null);

        setWalletTokens(
          Array.isArray(response.data.tokens) ?
          response.data.tokens :
          []
        );

        setWalletRisk(
          response.data.risk || null
        );

        setWalletScamIntel(
          response.data.scamIntelligence || null
        );

        setWalletLatestBlock(
          response.data.latestBlock ?? null
        );

        if (response.data.isScam) {
          setQueryWarning(t("runtimeScamAddressWarning"));
          setCurrentBalanceText(t("runtimeDangerousScamAddress"));
          triggerLocalNotification(t("runtimeCriticalSecurityAlert"), t("runtimeScamWalletDetected"));
        } else {
          const rawBal = Number(response.data.balance || 0);
          const formattedBal = rawBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
          setCurrentBalanceText(`Bakiye: ${formattedBal} ${NETWORKS[selectedNetwork].symbol}`);
        }

        const rawTxList = response.data.transactions || [];

        const counterpartyIntel =

        response.data.counterpartyScamIntelligence || null;

        const counterpartyTransactionMatches =

        Array.isArray(counterpartyIntel?.transactionMatches) ?

        counterpartyIntel.transactionMatches :

        [];

        const counterpartyMatchByTxid = new Map(

          counterpartyTransactionMatches.

          filter((match) => match?.txid).

          map((match) => [String(match.txid).toLowerCase(), match])

        );
        const formattedTx = rawTxList.map((tx, idx) => {
          let rawAmount = tx.amount ?? tx.value ?? "0.00";
          let calculatedAmount = String(rawAmount).trim();
          if (!calculatedAmount.includes(' ') && !isNaN(Number(calculatedAmount))) {
            const numVal = Number(calculatedAmount);
            calculatedAmount = `${numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${NETWORKS[selectedNetwork].symbol}`;
          }

          return {
            date: String(tx.date || `İşlem #${idx + 1}`),
            time: tx.time || "",
            from: String(tx.from || "Bilinmiyor"),
            to: String(tx.to || cleanAddr),
            type: String(tx.type || "Transfer"),
            txid: String(tx.txid || `0xHash_${idx}`),
            amount: calculatedAmount,

            counterparty: String(
              tx.counterparty ||
              tx.to ||
              tx.from ||
              cleanAddr
            ),

            scamMatched: Boolean(
              counterpartyMatchByTxid.get(
                String(tx.txid || "").toLowerCase()
              )?.scamIntelligence?.matched
            ),

            scamCategory:
            counterpartyMatchByTxid.get(
              String(tx.txid || "").toLowerCase()
            )?.scamIntelligence?.category || null,

            scamLabel:
            counterpartyMatchByTxid.get(
              String(tx.txid || "").toLowerCase()
            )?.scamIntelligence?.label || null,

            scamConfidence:
            counterpartyMatchByTxid.get(
              String(tx.txid || "").toLowerCase()
            )?.scamIntelligence?.confidence ?? null,

            scamSeverity:
            counterpartyMatchByTxid.get(
              String(tx.txid || "").toLowerCase()
            )?.scamIntelligence?.severity ?? null };
        });

        setTransactionHistory(formattedTx);

        if (userStatus !== 'vip') {
          setQueryCount((prev) => prev + 1);
        }
      } else {
        throw new Error("Zincir verisi alınamadı");
      }
    } catch (err) {
      const userFriendlyMsg = err.response?.status === 429 ?
      "Çok fazla istek gönderildi. Lütfen birkaç saniye bekleyin." :
      "Bağlantı hatası: Sunucuya ulaşılamıyor. Lütfen internet bağlantınızı kontrol edin.";

      setCurrentBalanceText('Bakiye alınamadı');
      setQueryWarning(userFriendlyMsg);
      handleIsolatedError("Cüzdan Sorgulama", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSmartContractAnalysis = async () => {
    const cleanContract = contractAddress ?
    SecurityScannerMiddleware.sanitizeInput(contractAddress).trim() :
    "";

    if (!cleanContract) {
      Alert.alert(t("runtimeMissingInfoTitle"),

      "Lütfen analiz edilecek geçerli bir akıllı sözleşme adresi girin."
      );
      return;
    }

    const isValidEvmAddress =
    /^0x[a-fA-F0-9]{40}$/.test(cleanContract);

    if (!isValidEvmAddress) {
      Alert.alert(t("runtimeInvalidAddressTitle"),

      "Akıllı sözleşme adresi 0x ile başlayan geçerli bir EVM adresi olmalıdır."
      );
      return;
    }

    setAnalyzingContract(true);
    setContractAnalysisResult(null);

    try {
      const backendNetwork = contractNetwork;

      const response = await api.post(
        "/api/analyze-contract",
        {
          network: backendNetwork,
          address: cleanContract
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 15000
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.error ||
          "Akıllı sözleşme analiz sonucu alınamadı."
        );
      }

      const data = response.data;
      const metadata = data.metadata || {};
      const checks = data.checks || {};

      const metadataReady =
      Boolean(data.isErc20) &&
      Boolean(checks.name) &&
      Boolean(checks.symbol) &&
      Boolean(checks.decimals);

      setContractAnalysisResult({
        network: data.network || backendNetwork,
        address: data.address || cleanContract,

        isContract: Boolean(data.isContract),
        isErc20: Boolean(data.isErc20),

        analysisStatus:
        data.analysisStatus || "ANALYZED",

        riskScore:
        selectedLanguage === 'tr' ?
        'Sınırlı Analiz' :
        'Limited Analysis',

        riskLevel:
        data.riskLevel || "Bilinmiyor",

        name:
        metadata.name || "Bilinmiyor",

        symbol:
        metadata.symbol || "Bilinmiyor",

        decimals:
        metadata.decimals ?? "Bilinmiyor",

        totalSupply:
        metadata.totalSupply || "Bilinmiyor",

        bytecodeLength:
        data.bytecodeLength ?? 0,

        buyTax:
        "Bu RPC analizinde hesaplanmadı",

        sellTax:
        "Bu RPC analizinde hesaplanmadı",

        mintable:
        data.securityInspection?.mint?.supported ? "RPC Mint yüzeyi tespit edildi" : "RPC Mint yüzeyi tespit edilmedi",
        mintDetails: data.securityInspection?.mint || null,
        adminDetails: data.securityInspection?.admin || null,

        lpLocked:
        "Bu RPC analizinde doğrulanmadı",

        aiThreatRadar:
        data.isContract ?
        metadataReady ?
        "Kontrat mevcut ve temel ERC20 arayüzü RPC üzerinden doğrulandı. Honeypot, vergi, mint yetkisi ve likidite kilidi bu temel analiz kapsamında doğrulanmadı." :
        "Kontrat bulundu ancak ERC20 metadata kontrollerinin tamamı doğrulanamadı." :
        "Girilen adres üzerinde dağıtılmış kontrat bytecode'u bulunamadı.",

        checks: {
          bytecodePresent:
          Boolean(checks.bytecodePresent),

          name:
          Boolean(checks.name),

          symbol:
          Boolean(checks.symbol),

          decimals:
          Boolean(checks.decimals),

          totalSupply:
          Boolean(checks.totalSupply)
        }
      });

    } catch (err) {
      console.error(
        "Smart Contract Analysis error:",
        err?.response?.data || err
      );

      const message =
      err?.response?.status === 401 ?
      "Oturum doğrulanamadı. Lütfen tekrar giriş yapın." :
      err?.response?.status === 400 ?
      err?.response?.data?.error ||
      "Kontrat veya ağ bilgisi geçersiz." :
      err?.response?.status === 502 ?
      "Blockchain RPC servisine ulaşılamadı. Lütfen tekrar deneyin." :
      "Akıllı sözleşme analiz servisine ulaşılamadı.";

      Alert.alert(t("runtimeAnalysisFailedTitle"),

      message
      );

      setContractAnalysisResult(null);

    } finally {
      setAnalyzingContract(false);
    }
  };const fetchMarketIntelligence = useCallback(async () => {
    try {
      setAnalyzingSentiment(true);

      const response = await api.get('/api/market-intelligence');
      const data = response?.data;

      if (!data?.success) {
        throw new Error(
          data?.error || 'Market Intelligence verisi alınamadı.'
        );
      }

      setSentimentResult({
        status: 'LIVE',
        title: 'Canlı Market Intelligence',
        message:
        'CoinGecko canlı piyasa verileri üzerinden kural tabanlı analiz.',
        score: data.score,
        sentiment: data.sentiment,
        riskLevel: data.riskLevel,
        socialVolume: data.socialVolume,
        whaleAccumulation: data.whaleAccumulation,
        recommendation: data.recommendation,
        market: data.market,
        signals: data.signals,
        source: data.source,
        analysisType: data.analysisType,
        timestamp: data.timestamp
      });

    } catch (error) {
      handleIsolatedError('Market Intelligence', error);

      setSentimentResult({
        status: 'ERROR',
        title: 'Piyasa İstihbaratı Kullanılamıyor',
        message:
        error?.response?.data?.error ||
        error?.message ||
        'Canlı piyasa verisi alınamadı.'
      });

    } finally {
      setAnalyzingSentiment(false);
    }
  }, [handleIsolatedError]);

  const handleGuardianEvaluate = async () => {
    const cleanAddr = address ?
    SecurityScannerMiddleware.sanitizeInput(address).trim() :
    '';

    if (!cleanAddr) {
      Alert.alert(
        'Guardian',
        'Guardian analizi için geçerli bir cüzdan adresi girin.'
      );
      return;
    }

    setGuardianEvaluating(true);
    setGuardianEvaluationError('');
    setGuardianEvaluationResult(null);

    try {
      const response = await api.post(
        '/api/guardian/evaluate',
        {
          network: selectedNetwork,
          address: cleanAddr
        },
        {
          timeout: 60000
        }
      );

      if (!response.data?.success || !response.data?.decision) {
        throw new Error(
          response.data?.error ||
          'Guardian değerlendirme sonucu alınamadı.'
        );
      }

      setGuardianEvaluationResult(response.data);

    } catch (error) {

      console.error(
        '[GUARDIAN EVALUATE]',
        error?.response?.data || error
      );

      const message =
      error?.response?.data?.error ||
      error?.message ||
      'Guardian değerlendirmesi tamamlanamadı.';

      setGuardianEvaluationError(message);
      setGuardianEvaluationResult(null);

    } finally {
      setGuardianEvaluating(false);
    }
  };
  const handleBehavioralAnalysis = async () => {
    const cleanAddr = address ?
    SecurityScannerMiddleware.sanitizeInput(address).trim() :
    "";

    if (!cleanAddr) {
      Alert.alert(t("runtimeMissingInfoTitle"),

      "Lütfen önce analiz edilecek bir cüzdan adresi girin!"
      );
      return;
    }

    const backendNetwork =
    selectedNetwork === "eth" ?
    "ethereum" :
    selectedNetwork;

    setAnalyzingBehavior(true);
    setBehavioralAnalysisResult(null);

    try {
      const response = await api.post(
        "/api/check-wallet",
        {
          network: backendNetwork,
          address: cleanAddr
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 30000
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.error ||
          "Cüzdan davranış analizi sonucu alınamadı."
        );
      }

      const data = response.data || {};
      const risk = data.risk || {};

      const score =
      Number.isFinite(Number(risk.score)) ?
      Number(risk.score) :
      null;

      const level =
      String(risk.level || "unknown").toLowerCase();

      const levelText =
      level === "critical" ?
      "Kritik" :
      level === "high" ?
      "Yüksek" :
      level === "medium" ?
      "Orta" :
      level === "low" ?
      "Düşük" :
      "Belirlenemedi";

      const walletAgeDays =
      Number.isFinite(Number(risk.walletAgeDays)) ?
      Number(risk.walletAgeDays) :
      null;

      const walletAgeText =
      walletAgeDays === null ?
      "Belirlenemedi" :
      walletAgeDays < 1 ?
      "1 günden yeni" :
      walletAgeDays < 30 ?
      `${Math.floor(walletAgeDays)} gün` :
      walletAgeDays < 365 ?
      `${(walletAgeDays / 30.4375).toFixed(1)} ay` :
      `${(walletAgeDays / 365.25).toFixed(1)} yıl`;

      const failedRatio =
      Number.isFinite(Number(risk.failedRatio)) ?
      Number(risk.failedRatio) :
      null;

      const failedRatioText =
      failedRatio === null ?
      "Belirlenemedi" :
      `%${(failedRatio * 100).toFixed(1)}`;

      const reasons =
      Array.isArray(risk.reasons) ?
      risk.reasons.filter(Boolean) :
      [];

      const signals =
      Array.isArray(risk.signals) ?
      risk.signals.filter(Boolean) :
      [];

      const summaryParts = [];

      if (score !== null) {
        summaryParts.push(
          `Risk skoru ${score}/100 (${levelText}).`
        );
      } else {
        summaryParts.push(
          `Risk seviyesi ${levelText}.`
        );
      }

      if (risk.totalTransactions !== undefined) {
        summaryParts.push(
          `Toplam ${risk.totalTransactions} işlem incelendi.`
        );
      }

      if (risk.failedTransactions !== undefined) {
        summaryParts.push(
          `Başarısız işlem: ${risk.failedTransactions}.`
        );
      }

      if (failedRatio !== null) {
        summaryParts.push(
          `Başarısızlık oranı ${failedRatioText}.`
        );
      }

      if (risk.uniqueCounterparties !== undefined) {
        summaryParts.push(
          `${risk.uniqueCounterparties} benzersiz karşı taraf bulundu.`
        );
      }

      if (risk.tokenTransferTransactions !== undefined) {
        summaryParts.push(
          `${risk.tokenTransferTransactions} token transferi bulundu.`
        );
      }

      if (risk.distinctTokens !== undefined) {
        summaryParts.push(
          `${risk.distinctTokens} farklı token görüldü.`
        );
      }

      setBehavioralAnalysisResult({
        walletAge: walletAgeText,

        avgHoldingTime:
        "Bu endpoint kapsamında hesaplanmadı",

        mixerInteraction:
        reasons.some((reason) =>
        /mixer|tornado|blender|privacy/i.test(
          String(reason)
        )
        ) ?
        "Risk sinyali bulundu" :
        "Açık mixer sinyali bulunmadı",

        botActivityScore:
        reasons.some((reason) =>
        /bot|automation|otomasyon/i.test(
          String(reason)
        )
        ) ?
        "Risk sinyali bulundu" :
        "Belirgin bot sinyali bulunmadı",

        behavioralScore:
        score === null ?
        `${levelText}` :
        `${score}/100 (${levelText})`,

        summary:
        summaryParts.join(" ") ||
        "Gerçek blockchain verileri üzerinden davranışsal analiz tamamlandı.",

        riskLevel:
        levelText,

        totalTransactions:
        risk.totalTransactions ?? 0,

        successfulTransactions:
        risk.successfulTransactions ?? 0,

        failedTransactions:
        risk.failedTransactions ?? 0,

        failedRatio:
        failedRatioText,

        incomingTransactions:
        risk.incomingTransactions ?? 0,

        outgoingTransactions:
        risk.outgoingTransactions ?? 0,

        uniqueCounterparties:
        risk.uniqueCounterparties ?? 0,

        uniqueIncomingAddresses:
        risk.uniqueIncomingAddresses ?? 0,

        uniqueOutgoingAddresses:
        risk.uniqueOutgoingAddresses ?? 0,

        tokenTransferTransactions:
        risk.tokenTransferTransactions ?? 0,

        distinctTokens:
        risk.distinctTokens ?? 0,

        mintTransactions:
        risk.mintTransactions ?? 0,

        burnTransactions:
        risk.burnTransactions ?? 0,

        balance:
        risk.balance ?? data.balance ?? null,

        balanceUnit:
        risk.balanceUnit ?? data.balanceUnit ?? null,

        reasons,

        signals,

        scamMatched:
        Boolean(risk.scamMatched),

        network:
        risk.network ||
        data.network ||
        backendNetwork,

        address:
        data.address ||
        cleanAddr
      });

    } catch (err) {
      console.error(
        "AI Behavioral Analysis error:",
        err?.response?.data || err
      );

      const status =
      err?.response?.status;

      const message =
      status === 401 ?
      "Oturum doğrulanamadı. Lütfen tekrar giriş yapın." :
      status === 404 ?
      "Bu cüzdan için blockchain verisi bulunamadı." :
      status === 400 ?
      err?.response?.data?.error ||
      "Cüzdan adresi veya ağ bilgisi geçersiz." :
      status === 502 ?
      "Blockchain veri servisine ulaşılamadı." :
      "AI Davranış analiz servisine ulaşılamadı.";

      Alert.alert(t("runtimeBehaviorAnalysisFailedTitle"),

      message
      );

      setBehavioralAnalysisResult(null);

    } finally {
      setAnalyzingBehavior(false);
    }
  };
  const handlePhishingAnalysis = async () => {
    const cleanUrl = phishingUrl ?
    SecurityScannerMiddleware.sanitizeInput(phishingUrl).trim() :
    "";

    if (!cleanUrl) {
      Alert.alert(t("runtimeMissingInfoTitle"),

      "Lütfen taranacak bir web sitesi veya DApp bağlantısı (URL) girin!"
      );
      return;
    }

    let normalizedUrl = cleanUrl;

    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      Alert.alert(t("runtimeInvalidUrlTitle"),

      "Lütfen geçerli bir HTTP veya HTTPS adresi girin."
      );
      return;
    }

    setAnalyzingPhishing(true);
    setPhishingResult(null);

    try {
      const response = await api.post(
        "/api/check-phishing",
        {
          url: normalizedUrl
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 15000
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.error ||
          "Phishing analiz sonucu alınamadı."
        );
      }

      const data = response.data;
      const record = data.matchedRecord || null;

      const dangerous =
      Boolean(data.matched) && (

      data.phishing === true ||
      data.malicious === true ||
      data.riskLevel === "HIGH");

      setPhishingResult({
        status: dangerous ?
        "⚠️ TEHLİKELİ (Tehdit İstihbaratı Eşleşmesi)" :
        " EŞLEŞME YOK (Güvenli olduğu garanti edilmez)",

        domainAge:
        "Bu kontrolde doğrulanmadı",

        sslValid:
        "Bu kontrolde doğrulanmadı",

        drainerRisk:
        data.phishing === true ?
        "Yüksek" :
        data.malicious === true ?
        "Malicious URL" :
        "Bilinmiyor",

        summary:
        data.summary ||
        "URLhaus tabanlı analiz tamamlandı.",

        hostname:
        data.hostname ||
        "",

        riskLevel:
        data.riskLevel ||
        "UNKNOWN",

        source:
        data.source ||
        "URLHAUS",

        matchType:
        data.matchType ||
        "NO_MATCH",

        phishing:
        Boolean(data.phishing),

        malicious:
        Boolean(data.malicious),

        matchedRecord: record ?
        {
          url: record.url || "",
          tags: Array.isArray(record.tags) ?
          record.tags :
          [],
          threat: record.threat || "",
          status: record.status || "",
          dateadded: record.dateadded || ""
        } :
        null
      });

    } catch (err) {
      console.error(
        "Phishing Shield error:",
        err?.response?.data || err
      );

      const message =
      err?.response?.status === 401 ?
      "Oturum doğrulanamadı. Lütfen tekrar giriş yapın." :
      err?.response?.status === 400 ?
      err?.response?.data?.error ||
      "URL bilgisi geçersiz." :
      err?.response?.status === 502 ?
      "Phishing tehdit istihbaratı kullanılamıyor." :
      "Phishing güvenlik servisine ulaşılamadı.";

      Alert.alert(t("runtimePhishingAnalysisFailedTitle"),

      message
      );

      setPhishingResult(null);

    } finally {
      setAnalyzingPhishing(false);
    }
  };
  const handleOutboundShieldCheck = async () => {
    const cleanRecipient = outboundRecipient ?
    SecurityScannerMiddleware.sanitizeInput(outboundRecipient) :
    "";

    const cleanAmount = outboundAmount ?
    SecurityScannerMiddleware.sanitizeInput(outboundAmount) :
    "";

    if (!cleanRecipient) {
      Alert.alert(t("runtimeMissingInfoTitle"),

      "Lütfen hedef alıcı cüzdan adresini girin!"
      );
      return;
    }

    setCheckingOutbound(true);
    setOutboundCheckResult(null);

    try {
      const backendNetwork =
      selectedNetwork === "eth" ?
      "ethereum" :
      selectedNetwork;

      const response = await api.post(
        "/api/check-transfer-recipient",
        {
          network: backendNetwork,
          recipient: cleanRecipient,
          amount: cleanAmount ? Number(cleanAmount) : undefined
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 15000
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.error || "Transfer Shield sonucu alınamadı"
        );
      }

      const intelligence =
      response.data.scamIntelligence || {};

      const matched =
      Boolean(response.data.scamMatched) ||
      Boolean(intelligence.matched);

      const inWhitelist = securityListContains(whitelist, cleanRecipient, selectedNetwork);
      const inBlacklist = securityListContains(blacklist, cleanRecipient, selectedNetwork);
      const riskLevel = inBlacklist ? "Çok Yüksek" : matched ? "Çok Yüksek" : inWhitelist ? "Liste Onaylı" : "Belirlenemedi";
      const actionTaken = inBlacklist ?
      "Bu adres kişisel Blacklist listenizde. Transferi göndermeden önce adresi yeniden doğrulayın." :
      matched ?
      "Bu adres scam istihbaratında eşleşti. Transferi göndermeden önce durdurun ve adresi tekrar doğrulayın." :
      inWhitelist ?
      "Bu adres kişisel Whitelist listenizde. Whitelist kaydı zincir üstü güvenlik garantisi değildir." :
      "Adres mevcut scam istihbaratıyla eşleşmedi. Bu sonuç adresin tamamen güvenli olduğu anlamına gelmez.";

      setOutboundCheckResult({
        network: backendNetwork,
        listStatus: inBlacklist ? 'BLACKLIST' : inWhitelist ? 'WHITELIST' : null,
        status: inBlacklist ? "⚠️ BLACKLIST UYARISI" : matched ?
        "⚠️ YÜKSEK RİSK" : inWhitelist ? "WHITELIST KAYDI" :
        "SCAM EŞLEŞMESİ YOK",
        recipient: cleanRecipient,
        amount: cleanAmount ?
        `${cleanAmount} ${NETWORKS[selectedNetwork].symbol}` :
        "Belirtilmedi",
        riskLevel,
        actionTaken,
        isBlocked: inBlacklist || matched,
        scamMatched: matched,
        scamCategory:
        intelligence.matches?.[0]?.category || null,
        scamLabel:
        intelligence.matches?.[0]?.label || null,
        confidence:
        intelligence.matches?.[0]?.confidence ?? null,
        evidenceCount:
        intelligence.evidenceCount ?? 0
      });

    } catch (err) {
      console.error(
        "Transfer Shield error:",
        err?.response?.data || err
      );

      const message =
      err?.response?.status === 401 ?
      "Oturum doğrulanamadı. Lütfen tekrar giriş yapın." :
      err?.response?.status === 400 ?
      err?.response?.data?.error || "Transfer bilgileri geçersiz." :
      "Transfer güvenlik servisine ulaşılamadı.";

      setOutboundCheckResult({
        status: "SERVİS KONTROLÜ BAŞARISIZ",
        recipient: cleanRecipient,
        amount: cleanAmount ?
        `${cleanAmount} ${NETWORKS[selectedNetwork].symbol}` :
        "Belirtilmedi",
        riskLevel: "Bilinmiyor",
        actionTaken: message,
        isBlocked: true,
        scamMatched: false,
        scamCategory: null,
        scamLabel: null,
        confidence: null,
        evidenceCount: 0
      });
    } finally {
      setCheckingOutbound(false);
    }
  };
  const handleOneClickVipPayment = async () => {
    try {
      const amount =
      selectedVipPlan === 'yearly' ?
      VIP_YEARLY_USDT :
      VIP_MONTHLY_USDT;

      await Clipboard.setStringAsync(VIP_PAYMENT_USDT_ADDRESS);

      Alert.alert(t("runtimeTrc20PaymentTitle"),

      `VIP ödeme bilgileri panoya kopyalandı.\n\n` +
      `Ağ: TRON / TRC20\n` +
      `Tutar: ${amount} USDT\n\n` +
      `${VIP_PAYMENT_USDT_ADDRESS}\n\n` +
      `USDT gönderirken ağ olarak TRON (TRC20) seçin.`
      );
    } catch (err) {
      Alert.alert(t("runtimeErrorTitle"),

      "USDT ödeme bilgileri kopyalanamadı. Lütfen tekrar deneyin."
      );
    }
  };
  const submitPaymentNotificationToSystem = async () => {
    const txid = SecurityScannerMiddleware.sanitizeInput(paymentTxHashInput).trim();

    if (!txid) {
      Alert.alert(t("runtimeMissingInfoTitle"), 'Lütfen ödemeye ait işlem Hash (TXID) değerini giriniz.');
      return;
    }

    if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
      Alert.alert(t("runtimeInvalidTxidTitle"), 'TXID 64 karakterlik hexadecimal işlem kimliği olmalıdır.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/api/vip/verify', { txid, plan: selectedVipPlan }, { timeout: 30000 });

      if (!response.data?.ok || response.data?.status !== 'vip') {
        throw new Error('VIP doğrulama başarısız oldu.');
      }

      const meResponse = await api.get('/api/me', { timeout: 10000 });
      const verifiedUser = meResponse.data?.user;

      if (!verifiedUser) {
        throw new Error('Kullanıcı durumu doğrulanamadı.');
      }

      setUserStatus(verifiedUser.status || 'free');

      if (verifiedUser.status === 'vip') {
        setPendingPayments((previous) => previous.filter((item) => item.txHash !== txid));
        setPaymentTxHashInput('');
        const expiryText = verifiedUser.expiresAt ? new Date(verifiedUser.expiresAt).toLocaleDateString('tr-TR') : 'aktif';
        Alert.alert(t("runtimeVipActivatedTitle"), `Ödemeniz doğrulandı. VIP üyeliğiniz ${expiryText} tarihine kadar aktiftir.`);
      } else {
        Alert.alert(t("runtimeVerificationCompleteTitle"), 'Ödeme doğrulandı ancak hesap durumu henüz VIP olarak yansımadı.');
      }
    } catch (error) {
      console.error('VIP verification error:', error?.response?.data || error);
      const status = error?.response?.status;
      const message = error?.response?.data?.error || (status === 401 ? 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.' : status === 409 ? 'Bu ödeme daha önce kullanılmış veya doğrulama için henüz bekliyor.' : status === 400 ? 'Ödeme doğrulanamadı. TXID, tutar veya alıcı bilgilerini kontrol edin.' : 'VIP ödeme doğrulama servisine ulaşılamadı.');
      Alert.alert(t("runtimeVipVerificationFailedTitle"), message);
    } finally {
      setLoading(false);
    }
  };
  const removeFromWhitelist = async (entry) => {
    try {
      const cleanAddr = SecurityScannerMiddleware.sanitizeInput(String(entry?.address || entry || '').trim());
      const matched = whitelist.find((item) => String(item?.address || item || '').trim().toLowerCase() === cleanAddr.toLowerCase());
      if (!matched) return Alert.alert(t('commonInfoTitle'), t('whitelistNotFound'));
      if (matched?.id) await api.delete(`/api/whitelist/${matched.id}`);
      await syncSecurityAddressLists();
      Alert.alert(t('commonSuccessTitle'), t('whitelistRemoved'));
    } catch (e) {
      handleIsolatedError('Whitelist Silme', e);
      Alert.alert(t('commonErrorTitle'), selectedLanguage === 'tr' ? 'Whitelist kaydı kaldırılamadı.' : 'Whitelist entry could not be removed.');
    }
  };

  const removeFromBlacklist = async (entry) => {
    try {
      const cleanAddr = SecurityScannerMiddleware.sanitizeInput(String(entry?.address || entry || '').trim());
      const matched = blacklist.find((item) => String(item?.address || item || '').trim().toLowerCase() === cleanAddr.toLowerCase());
      if (!matched) return Alert.alert(t('commonInfoTitle'), t('blacklistNotFound'));
      if (matched?.id) await api.delete(`/api/blacklist/${matched.id}`);
      await syncSecurityAddressLists();
      Alert.alert(t('commonSuccessTitle'), t('blacklistRemoved'));
    } catch (e) {
      handleIsolatedError('Blacklist Silme', e);
      Alert.alert(t('commonErrorTitle'), selectedLanguage === 'tr' ? 'Blacklist kaydı kaldırılamadı.' : 'Blacklist entry could not be removed.');
    }
  };

  const addToWhitelist = async () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : '';
    if (!cleanAddr) return Alert.alert(t('commonErrorTitle'), t('commonAddressRequired'));
    if (securityListContains(blacklist, cleanAddr, selectedNetwork)) return Alert.alert(t('commonConflictTitle'), t('whitelistConflict'));
    if (securityListContains(whitelist, cleanAddr, selectedNetwork)) return Alert.alert(t('commonInfoTitle'), t('whitelistAlready'));
    try {
      await saveWhitelist([...whitelist, { address: cleanAddr, network: selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork }]);
      await syncSecurityAddressLists();
      Alert.alert(t('commonSuccessTitle'), t('whitelistAdded'));
    } catch (e) { handleIsolatedError('Whitelist Ekleme', e); }
  };

  const addToBlacklist = async () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : '';
    if (!cleanAddr) return Alert.alert(t('commonErrorTitle'), t('commonAddressRequired'));
    if (securityListContains(whitelist, cleanAddr, selectedNetwork)) return Alert.alert(t('commonConflictTitle'), t('blacklistConflict'));
    if (securityListContains(blacklist, cleanAddr, selectedNetwork)) return Alert.alert(t('commonInfoTitle'), t('blacklistAlready'));
    try {
      await saveBlacklist([...blacklist, { address: cleanAddr, network: selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork }]);
      await syncSecurityAddressLists();
      Alert.alert(t('commonSuccessTitle'), t('blacklistRiskAdded'));
    } catch (e) { handleIsolatedError('Blacklist Ekleme', e); }
  };

  const addToVault = () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : "";
    if (!cleanAddr) return Alert.alert(t('commonErrorTitle'), t('commonAddressRequired'));
    if (userStatus !== 'vip') {
      Alert.alert('VIP', t('vaultVipRequired'));
      setActiveModule('vipView');
      return;
    }
    if (vault.includes(cleanAddr)) return Alert.alert(t('commonInfoTitle'), t('vaultAlready'));

    if (vault.length >= 10) {
      Alert.alert(t('vaultLimitTitle'), t('vaultLimitMessage'));
      return;
    }

    const updated = [...vault, cleanAddr];
    saveVault(updated);
    Alert.alert(t('commonSuccessTitle'), t('vaultAdded'));
  };

  if (currentScreen === 'login') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg, paddingHorizontal: 0 }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 22,
            paddingTop: 18,
            paddingBottom: 22
          }}>

          <View style={{ width: '100%', maxWidth: 440, alignItems: 'center', alignSelf: 'center' }}>
            <View
              style={{
                width: 190,
                height: 190,
                borderRadius: 38,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0B1522',
                borderWidth: 1,
                borderColor: '#20364D',
                shadowColor: '#1597FF',
                shadowOffset: { width: 0, height: 7 },
                shadowOpacity: 0.28,
                shadowRadius: 18,
                elevation: 9,
                marginBottom: 24
              }}>

              <Image
                source={require('./assets/yenilogo.png')}
                style={{
                  width: 260,
                  height: 260,
                  position: 'absolute',
                  left: -35,
                  top: -35
                }}
                resizeMode="cover" />
            </View>

            <Text
              style={{
                color: theme.textMain,
                fontSize: 27,
                fontWeight: '900',
                textAlign: 'center',
                letterSpacing: 0.6,
                marginBottom: 8
              }}>
              SAFE SENTINEL <Text style={{ color: theme.primary }}>PRO</Text>
            </Text>

            <Text
              style={{
                color: theme.textSub,
                fontSize: 14,
                lineHeight: 21,
                textAlign: 'center',
                marginBottom: 22
              }}>
              {t('loginDescription')}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 28 }}>
              {Object.entries(V26_GLOBAL_I18N).map(([code, item]) => {
                const active = selectedLanguage === code;
                return (
                  <TouchableOpacity
                    key={`login-language-${code}`}
                    onPress={() => saveGlobalLanguage(code)}
                    activeOpacity={0.84}
                    style={{
                      minWidth: 112,
                      height: 48,
                      paddingHorizontal: 18,
                      marginHorizontal: 5,
                      borderRadius: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: active ? theme.primary : 'transparent',
                      borderWidth: 1.5,
                      borderColor: active ? theme.primary : '#39506A',
                      shadowColor: active ? theme.primary : '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: active ? 0.22 : 0,
                      shadowRadius: 9,
                      elevation: active ? 4 : 0
                    }}>
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : theme.textMain,
                        fontSize: 14,
                        fontWeight: '800'
                      }}>
                      {item.nativeName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ width: '100%', marginBottom: 18 }}>
              <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: '800', marginBottom: 8 }}>
                {t('emailAddress')}
              </Text>
              <View
                style={{
                  width: '100%',
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.inputBg,
                  borderColor: '#39506A',
                  borderWidth: 1.3,
                  borderRadius: 16
                }}>
                <Text style={{ color: '#8FB4DA', fontSize: 19, marginLeft: 16, marginRight: 10 }}>✉</Text>
                <TextInput
                  style={{
                    flex: 1,
                    height: 58,
                    color: theme.inputTextColor,
                    fontSize: 15,
                    paddingRight: 16,
                    paddingVertical: 0,
                    textAlignVertical: 'center'
                  }}
                  placeholder="ornek@mail.com"
                  placeholderTextColor="#8190A4"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address" />
              </View>
            </View>

            <View style={{ width: '100%', marginBottom: 20 }}>
              <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: '800', marginBottom: 8 }}>
                {t('loginPassword')}
              </Text>
              <View
                style={{
                  width: '100%',
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.inputBg,
                  borderColor: '#39506A',
                  borderWidth: 1.3,
                  borderRadius: 16
                }}>
                <Text style={{ color: '#8FB4DA', fontSize: 18, marginLeft: 16, marginRight: 10 }}>🔒</Text>
                <TextInput
                  style={{
                    flex: 1,
                    height: 58,
                    color: theme.inputTextColor,
                    fontSize: 15,
                    paddingRight: 16,
                    paddingVertical: 0,
                    textAlignVertical: 'center'
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#8190A4"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry />
              </View>
            </View>

            <TouchableOpacity
              style={{
                width: '100%',
                height: 58,
                backgroundColor: theme.primary,
                borderRadius: 16,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 14,
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.28,
                shadowRadius: 13,
                elevation: 8
              }}
              activeOpacity={0.86}
              onPress={handleLogin}>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>{t('secureLogin')}</Text>
              <Text style={{ position: 'absolute', right: 22, color: '#FFFFFF', fontSize: 28, fontWeight: '300' }}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                width: '100%',
                height: 56,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderColor: '#39506A',
                borderRadius: 16,
                justifyContent: 'center',
                alignItems: 'center'
              }}
              activeOpacity={0.82}
              onPress={() => setCurrentScreen('register')}>
              <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 15 }}>{t('createAccount')}</Text>
            </TouchableOpacity>

            <View
              style={{
                width: '118%',
                height: 110,
                marginTop: 28,
                borderTopWidth: 1,
                borderTopColor: '#168CFF',
                borderTopLeftRadius: 260,
                borderTopRightRadius: 260,
                alignItems: 'center',
                paddingTop: 17
              }}>
              <Text style={{ color: '#168CFF', fontSize: 22, marginBottom: 8 }}>♢</Text>
              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.7,
                  textAlign: 'center'
                }}>
                {selectedLanguage === 'tr'
                  ? 'DAHA GÜVENLİ   |   DAHA BİLİNÇLİ   |   DAHA ÖZGÜR'
                  : 'SAFER   |   SMARTER   |   FREER'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (currentScreen === 'register') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
        <ScrollView contentContainerStyle={{ paddingVertical: 15, alignItems: 'center', width: '100%' }} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: theme.cardBg }]}>

            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 4 }}>{t('registerTitle')}</Text>
            <Text style={{ color: theme.textSub, fontSize: 8, textAlign: 'center', marginBottom: 7 }}>{t('registerDescription')}</Text>

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('firstName')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]}
              placeholder={t('exampleFirstName')}
              placeholderTextColor="#9CA3AF"
              value={regName}
              onChangeText={setRegName} />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('lastName')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]}
              placeholder={t('exampleLastName')}
              placeholderTextColor="#9CA3AF"
              value={regSurname}
              onChangeText={setRegSurname} />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('emailAddress')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]}
              placeholder="ornek@mail.com"
              placeholderTextColor="#9CA3AF"
              value={regEmail}
              onChangeText={setRegEmail}
              autoCapitalize="none" />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('loginPassword')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]}
              placeholder={t('registerStrongPasswordPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={regPassword}
              onChangeText={setRegPassword}
              secureTextEntry />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('registerVaultOptional')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]}
              placeholder={t('registerVaultPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={regVaultAddress}
              onChangeText={(text) => {
                setRegVaultAddress(text);
                if (text.trim().length > 0) {
                  setRegWantVip(true);
                }
              }} />

            <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginVertical: 8, padding: 10 }]}>
              <View style={styles.prefCardHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 10, fontWeight: '700' }]}>{t('registerVipQuestion')}</Text>
                </View>
                <Switch
                  trackColor={{ false: '#374151', true: theme.primary }}
                  thumbColor={regWantVip ? '#FFFFFF' : '#9CA3AF'}
                  onValueChange={() => setRegWantVip(!regWantVip)}
                  value={regWantVip} />

              </View>
            </View>

            <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 34, borderRadius: 6, marginTop: 4 }]} onPress={handleCompleteRegistration}>
              <Text style={[styles.buttonText, { fontSize: 10 }]}>{t('completeRegistration')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { width: '100%', height: 25, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.borderCol, borderRadius: 6, marginTop: 8 }]}
              onPress={() => setCurrentScreen('login')}>

              <Text style={{ color: theme.textSub, fontWeight: '600', fontSize: 11 }}>{t('backToLogin')}</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </SafeAreaView>);

  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      {activeModule !== 'dashboard' ?
      <SafeAreaView style={[styles.card, { backgroundColor: theme.cardBg, flex: 1, width: '100%', maxHeight: '100%', borderRadius: 0, marginVertical: 0 }]}>
          <View style={[styles.headerRow, { paddingHorizontal: 12, paddingTop: Math.max(8, insets.top + 4), paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.borderCol }]}>
            <Text numberOfLines={2} style={[styles.title, { color: theme.textMain, fontSize: 14, flex: 1, paddingRight: 8 }]}>
              {activeModule === 'preferencesView' ? t('preferencesTitle') :
            activeModule === 'cryptoPoliciesView' ? t('toolTitleCryptoPolicies') :
            activeModule === 'portfolioView' ? t('toolTitlePortfolio') :
            activeModule === 'priceAlertsView' ? t('toolTitlePriceAlerts') :
            activeModule === 'outboundShieldView' ? t('toolTitleOutboundShield') :
            activeModule === 'whitelistView' ? t('toolTitleWhitelist') :
            activeModule === 'blacklistView' ? t('toolTitleBlacklist') :
            activeModule === 'vaultView' ? t('toolTitleVault') :
            activeModule === 'notificationsView' ? t('toolTitleNotifications') :
            activeModule === 'vipView' ? t('toolTitleVip') :
            activeModule === 'smartContractView' ? t('toolTitleSmartContract') :
            activeModule === 'behavioralView' ? t('toolTitleBehavioral') :
            activeModule === 'phishingView' ? t('toolTitlePhishing') :
            activeModule === 'quickTestView' ? t('toolTitleQuickTest') :
            activeModule === 'emergencyLockView' ? t('toolTitleEmergencyLock') :
            activeModule === 'gasOptView' ? t('toolTitleGasOpt') :
            activeModule === 'deepIntelView' ? t('toolTitleDeepIntel') :
            activeModule === 'autoPhishView' ? t('toolTitleAutoPhish') :
            activeModule === 'guardianView' ? t('toolTitleGuardian') :
            activeModule === 'inheritView' ? t('toolTitleInheritance') :
            activeModule === 'revokeView' ? t('toolTitleRevoke') :
            activeModule === 'whaleWatchView' ? t('toolTitleWhaleWatch') :
            activeModule === 'gasTimeView' ? t('toolTitleGasTime') :
            activeModule === 'aiMarketView' ? t('toolTitleAiMarket') :
            activeModule === 'taxReportView' ? t('toolTitleTaxReport') :
            activeModule === 'dexOrdersView' ? t('toolTitleDexOrders') : ''}
            </Text>
            <TouchableOpacity onPress={() => setActiveModule('dashboard')} style={[styles.backButton, { backgroundColor: theme.inputBg, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginLeft: 8, marginRight: 8, flexShrink: 0 }]}>
               <Text style={[styles.backButtonText, { color: theme.primary, fontSize: 11 }]}>{t('toolBack')}</Text>
            </TouchableOpacity>
          </View>

          {activeModule === 'vipView' && IS_PLAY_STORE_BUILD ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
<View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, padding: 16 }]}>
  <Text style={{ color: theme.textMain, fontSize: 13, fontWeight: '900' }}>{selectedLanguage === 'tr' ? 'VIP Satın Alma' : 'VIP Purchase'}</Text>
  <Text style={{ color: theme.textSub, fontSize: 10, lineHeight: 16, marginTop: 7 }}>{selectedLanguage === 'tr' ? 'Google Play sürümünde dijital üyelik ödemeleri yalnız Google Play Billing üzerinden sunulacaktır. Bu test sürümünde doğrudan kripto ödeme kapalıdır.' : 'In the Google Play build, digital membership payments will be offered only through Google Play Billing. Direct crypto payment is disabled in this test build.'}</Text>
</View>
        </ScrollView> :
        activeModule === 'whitelistView' ?
        <ScrollView
          contentContainerStyle={styles.prefScrollContainer}
          showsVerticalScrollIndicator={false}>

              <Text style={styles.prefDescription}>
                {t('wlDescription1')}
                {t('wlDescription2')}
              </Text>

              <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: '#10B981'
            }]
            }>

                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                  style={[
                  styles.prefCardTitle,
                  {
                    color: theme.textMain,
                    fontSize: 12,
                    fontWeight: 'bold'
                  }]
                  }>

                      {t('wlSafeAddresses')}
                    </Text>

                    <Text
                  style={[
                  styles.prefCardSub,
                  {
                    color: theme.textSub,
                    fontSize: 10
                  }]
                  }>

                      {t('wlRegistered')}
                    </Text>
                  </View>

                  <Text
                style={{
                  color: '#10B981',
                  fontSize: 13,
                  fontWeight: 'bold'
                }}>

                    {whitelist.length}
                  </Text>
                </View>

                {whitelist.length === 0 ?
            <View
              style={{
                backgroundColor: theme.inputBg,
                padding: 14,
                borderRadius: 7,
                alignItems: 'center',
                marginTop: 8
              }}>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 10,
                  textAlign: 'center'
                }}>

                      {t('wlEmpty')}
                    </Text>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 9,
                  textAlign: 'center',
                  marginTop: 4
                }}>

                      {t('wlEmptyHelp1')}
                      {t('wlEmptyHelp2')}
                    </Text>
                  </View> :

            whitelist.map((addr, index) =>
            <View
              key={`${addr}-${index}`}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 7,
                padding: 9,
                marginTop: 6,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                      <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  fontWeight: '600',
                  lineHeight: 14
                }}
                selectable>

                        {String(addr?.address || addr || '')}{addr?.network ? `  •  ${String(addr.network).toUpperCase()}` : ''}
                      </Text>

                      <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 7
                }}>

                        <Text
                  style={{
                    color: '#10B981',
                    fontSize: 8,
                    fontWeight: 'bold'
                  }}>

                          {t('wlSafeAddress')}
                        </Text>

                        <TouchableOpacity
                  onPress={() => removeFromWhitelist(addr)}
                  style={{
                    backgroundColor: '#EF4444',
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 5
                  }}>

                          <Text
                    style={{
                      color: '#FFF',
                      fontSize: 8,
                      fontWeight: 'bold'
                    }}>

                            {t('commonRemove')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
            )
            }
              </View>
            </ScrollView> :

        activeModule === 'blacklistView' ?
        <ScrollView
          contentContainerStyle={styles.prefScrollContainer}
          showsVerticalScrollIndicator={false}>

              <Text style={styles.prefDescription}>
                {t('blDescription1')}
                {t('blDescription2')}
              </Text>

              <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: '#EF4444'
            }]
            }>

                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                  style={[
                  styles.prefCardTitle,
                  {
                    color: theme.textMain,
                    fontSize: 12,
                    fontWeight: 'bold'
                  }]
                  }>{t("runtimeBlockedAddressesTitle")}

                </Text>

                    <Text
                  style={[
                  styles.prefCardSub,
                  {
                    color: theme.textSub,
                    fontSize: 10
                  }]
                  }>

                      {t('blRegistered')}
                    </Text>
                  </View>

                  <Text
                style={{
                  color: '#EF4444',
                  fontSize: 13,
                  fontWeight: 'bold'
                }}>

                    {blacklist.length}
                  </Text>
                </View>

                {blacklist.length === 0 ?
            <View
              style={{
                backgroundColor: theme.inputBg,
                padding: 14,
                borderRadius: 7,
                alignItems: 'center',
                marginTop: 8
              }}>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 10,
                  textAlign: 'center'
                }}>

                      {t('blEmpty')}
                    </Text>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 9,
                  textAlign: 'center',
                  marginTop: 4
                }}>

                      {t('blEmptyHelp1')}
                      {t('blEmptyHelp2')}
                    </Text>
                  </View> :

            blacklist.map((addr, index) =>
            <View
              key={`${addr}-${index}`}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 7,
                padding: 9,
                marginTop: 6,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                      <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  fontWeight: '600',
                  lineHeight: 14
                }}
                selectable>

                        {String(addr?.address || addr || '')}{addr?.network ? `  •  ${String(addr.network).toUpperCase()}` : ''}
                      </Text>

                      <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 7
                }}>

                        <Text
                  style={{
                    color: '#EF4444',
                    fontSize: 8,
                    fontWeight: 'bold'
                  }}>

                          {t('blBlockedAddress')}
                        </Text>

                        <TouchableOpacity
                  onPress={() => removeFromBlacklist(addr)}
                  style={{
                    backgroundColor: '#10B981',
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 5
                  }}>

                          <Text
                    style={{
                      color: '#FFF',
                      fontSize: 8,
                      fontWeight: 'bold'
                    }}>

                            {t('blRemoveBlock')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
            )
            }
              </View>
            </ScrollView> :

        activeModule === 'vaultView' ?
        <ScrollView
          contentContainerStyle={styles.prefScrollContainer}
          showsVerticalScrollIndicator={false}>

              <Text style={styles.prefDescription}>
                {t('vaultDescription1')}
                {t('vaultDescription2')}
              </Text>

              <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: '#8B5CF6'
            }]
            }>

                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                  style={[
                  styles.prefCardTitle,
                  {
                    color: theme.textMain,
                    fontSize: 12,
                    fontWeight: 'bold'
                  }]
                  }>

                      {t('vaultAssetManagement')}
                    </Text>

                    <Text
                  style={[
                  styles.prefCardSub,
                  {
                    color: theme.textSub,
                    fontSize: 10
                  }]
                  }>

                      {t('vaultMonitoredWallets')}
                    </Text>
                  </View>

                  <Text
                style={{
                  color: '#8B5CF6',
                  fontSize: 13,
                  fontWeight: 'bold'
                }}>

                    {vault.length}/10
                  </Text>
                </View>

                {vault.length === 0 ?
            <View
              style={{
                backgroundColor: theme.inputBg,
                padding: 14,
                borderRadius: 7,
                alignItems: 'center',
                marginTop: 8
              }}>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 10,
                  textAlign: 'center'
                }}>

                      {t('vaultEmpty')}
                    </Text>

                    <TouchableOpacity
                style={[
                styles.button,
                {
                  backgroundColor: userStatus === 'vip' ?
                  '#8B5CF6' :
                  '#F59E0B',
                  width: '100%',
                  height: 36,
                  borderRadius: 6,
                  marginTop: 10
                }]
                }
                onPress={() => {
                  if (userStatus !== 'vip') {
                    setActiveModule('vipView');
                  } else {
                    setActiveModule('dashboard');
                  }
                }}>

                      <Text
                  style={[
                  styles.buttonText,
                  {
                    fontSize: 10
                  }]
                  }>

                        {userStatus === 'vip' ?
                  t('vaultAddFromDashboard') :
                  t('vaultUpgradeVip')}
                      </Text>
                    </TouchableOpacity>
                  </View> :

            vault.map((addr, index) =>
            <View
              key={`${addr}-${index}`}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 7,
                padding: 9,
                marginTop: 6,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                      <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  fontWeight: '600',
                  lineHeight: 14
                }}
                selectable>

                        {String(addr?.address || addr || '')}{addr?.network ? `  •  ${String(addr.network).toUpperCase()}` : ''}
                      </Text>

                      <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 7
                }}>

                        <Text
                  style={{
                    color: '#8B5CF6',
                    fontSize: 8,
                    fontWeight: 'bold'
                  }}>

                          {t('vaultMonitoringActive')}
                        </Text>

                        <TouchableOpacity
                  onPress={() => removeFromVault(addr)}
                  style={{
                    backgroundColor: '#EF4444',
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 5
                  }}>

                          <Text
                    style={{
                      color: '#FFF',
                      fontSize: 8,
                      fontWeight: 'bold'
                    }}>

                            {t('vaultRemove')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
            )
            }
              </View>

              <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: theme.borderCol,
              marginTop: 8
            }]
            }>

                <Text
              style={{
                color: theme.textMain,
                fontSize: 11,
                fontWeight: 'bold',
                marginBottom: 6
              }}>

                  {t('vaultSecurityNotifications')}
                </Text>

                {vaultNotifications.length === 0 ?
            <Text
              style={{
                color: theme.textSub,
                fontSize: 10,
                textAlign: 'center',
                paddingVertical: 10
              }}>

                    {t('vaultNotificationsEmpty')}
                  </Text> :

            vaultNotifications.slice(0, 10).map((item, index) =>
            <View
              key={`${item.id || index}-${index}`}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 6,
                padding: 8,
                marginBottom: 5,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                      <Text
                style={{
                  color: item.severity === 'HIGH' ?
                  '#EF4444' :
                  theme.primary,
                  fontSize: 9,
                  fontWeight: 'bold',
                  marginBottom: 2
                }}>

                        {item.title || item.type || t('vaultSecurityNotification')}
                      </Text>

                      <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  lineHeight: 13
                }}>

                        {item.message || item.description || t('securityNotificationReceived')}
                      </Text>

                      {item.createdAt ?
              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                          {String(item.createdAt)}
                        </Text> :
              null}
                    </View>
            )
            }
              </View>
            </ScrollView> :
        activeModule === 'notificationsView' ?
        <ScrollView
          contentContainerStyle={styles.prefScrollContainer}
          showsVerticalScrollIndicator={false}>

    <View
            testID="CENTRAL_NOTIFICATION_UI_V25_K2"
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: theme.borderCol
            }]
            }>

      <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8
              }}>

        <View style={{ flex: 1 }}>
          <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 13,
                    fontWeight: 'bold'
                  }}>

            {t('notificationsCentral')}
          </Text>

          <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 9,
                    marginTop: 3
                  }}>

            {t('notificationsDescription')}
          </Text>
        </View>

        <View
                style={{
                  backgroundColor:
                  centralUnreadCount > 0 ?
                  '#EF4444' :
                  '#10B981',
                  borderRadius: 12,
                  minWidth: 28,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  alignItems: 'center'
                }}>

          <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 9,
                    fontWeight: 'bold'
                  }}>

            {centralUnreadCount}
          </Text>
        </View>
      </View>

      <TouchableOpacity
              onPress={markAllCentralNotificationsRead}
              disabled={centralUnreadCount === 0}
              style={{
                alignSelf: 'flex-end',
                backgroundColor:
                centralUnreadCount === 0 ?
                theme.inputBg :
                theme.primary,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                marginBottom: 8,
                opacity: centralUnreadCount === 0 ? 0.5 : 1
              }}>

        <Text
                style={{
                  color:
                  centralUnreadCount === 0 ?
                  theme.textSub :
                  '#FFFFFF',
                  fontSize: 9,
                  fontWeight: 'bold'
                }}>

          {t('notificationsMarkAllRead')}
        </Text>
      </TouchableOpacity>

      {centralNotifications.length === 0 ?
            <View
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 7,
                padding: 14,
                alignItems: 'center'
              }}>

          <Text
                style={{
                  color: theme.textSub,
                  fontSize: 10,
                  textAlign: 'center'
                }}>

            {t('notificationsEmpty')}
          </Text>
        </View> :

            centralNotifications.map((notification, index) => {
              const isUnread = !notification.read;

              const severity =
              String(notification.severity || 'INFO').toUpperCase();

              const severityLabel =
              severity === 'CRITICAL' ?
              t('severityCritical') :
              severity === 'HIGH' ?
              t('severityHigh') :
              severity === 'WARNING' ?
              t('severityWarning') :
              t('severityInfo');

              return (
                <View
                  key={`${notification.id || 'notification'}-${index}`}
                  style={{
                    backgroundColor: theme.inputBg,
                    borderRadius: 7,
                    padding: 10,
                    marginBottom: 7,
                    borderWidth: isUnread ? 1.5 : 1,
                    borderColor:
                    severity === 'CRITICAL' || severity === 'HIGH' ?
                    '#EF4444' :
                    isUnread ?
                    theme.primary :
                    theme.borderCol
                  }}>

              <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start'
                    }}>

                <Text
                      style={{
                        flex: 1,
                        color:
                        severity === 'CRITICAL' || severity === 'HIGH' ?
                        '#EF4444' :
                        theme.textMain,
                        fontSize: 10,
                        fontWeight: 'bold',
                        marginRight: 8
                      }}>

                  {notification.title || t('notificationDefaultTitle')}
                </Text>

                <Text
                      style={{
                        color:
                        severity === 'CRITICAL' || severity === 'HIGH' ?
                        '#EF4444' :
                        theme.primary,
                        fontSize: 8,
                        fontWeight: 'bold'
                      }}>

                  {severityLabel}
                </Text>
              </View>

              <Text
                    style={{
                      color: theme.textMain,
                      fontSize: 9,
                      lineHeight: 14,
                      marginTop: 5
                    }}>

                {notification.body || t('notificationNoDetails')}
              </Text>

              <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 7
                    }}>

                <View style={{ flex: 1 }}>
                  {notification.createdAt ?
                      <Text
                        style={{
                          color: theme.textSub,
                          fontSize: 8
                        }}>

                      {String(notification.createdAt)}
                    </Text> :
                      null}

                  <Text
                        style={{
                          color: theme.textSub,
                          fontSize: 7,
                          marginTop: 2
                        }}>

                    {notification.type || 'SYSTEM'}
                    {notification.network ?
                        ` • ${notification.network}` :
                        ''}
                  </Text>
                </View>

                {isUnread ?
                    <TouchableOpacity
                      onPress={() =>
                      markCentralNotificationRead(notification.id)
                      }
                      style={{
                        backgroundColor: theme.primary,
                        paddingHorizontal: 9,
                        paddingVertical: 5,
                        borderRadius: 5
                      }}>

                    <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 8,
                          fontWeight: 'bold'
                        }}>

                      {t("notificationsRead")}
                    </Text>
                  </TouchableOpacity> :

                    <Text
                      style={{
                        color: '#10B981',
                        fontSize: 8,
                        fontWeight: 'bold'
                      }}>

                    {t("notificationsRead")}
                  </Text>
                    }
              </View>
            </View>);

            })
            }

      <View
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: theme.borderCol
              }}>

        <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  textAlign: 'center'
                }}>

          {t('notificationsRefreshInfo')}
        </Text>
      </View>
    </View>

    {vaultNotifications.length > 0 ?
          <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: theme.borderCol,
              marginTop: 8
            }]
            }>

        <Text
              style={{
                color: theme.textMain,
                fontSize: 11,
                fontWeight: 'bold',
                marginBottom: 6
              }}>

          {t('vaultSecurityNotifications')}
        </Text>

        {vaultNotifications.slice(0, 10).map((item, index) =>
            <View
              key={`${item.id || index}-vault-${index}`}
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 6,
                padding: 8,
                marginBottom: 5,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

            <Text
                style={{
                  color:
                  item.severity === 'HIGH' ?
                  '#EF4444' :
                  theme.primary,
                  fontSize: 9,
                  fontWeight: 'bold',
                  marginBottom: 2
                }}>

              {item.title || item.type || t('vaultSecurityNotification')}
            </Text>

            <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  lineHeight: 13
                }}>

              {item.message ||
                item.description ||
                item.body ||
                t('securityNotificationReceived')}
            </Text>

            {item.createdAt ?
              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                {String(item.createdAt)}
              </Text> :
              null}
          </View>
            )}
      </View> :
          null}
  </ScrollView> :
        activeModule === 'cryptoPoliciesView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                {t('policiesDescription')}
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{t('policiesAssetTitle')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                  {t('policiesAssetBody')}
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{t('policiesLegalTitle')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                  {t('policiesLegalBody')}
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{t('policiesFeesTitle')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                  {t('policiesFeesBody')}
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{t('policiesPrivacyTitle')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16 }}>
                  {t('policiesPrivacyBody')}
                </Text>
              </View>
            </ScrollView> :
        activeModule === 'portfolioView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
<Text style={styles.prefDescription}>{selectedLanguage === 'tr' ? 'Taranan cüzdanın gerçek zincir üstü bakiyelerini görüntüleyin. Vault, sürekli güvenlik izleme için ayrı bir özelliktir.' : 'View the scanned wallet’s live on-chain balances. Vault is a separate continuous security-monitoring feature.'}</Text>
{!address || (walletNativeBalance === null && walletTokens.length === 0) ?
  <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, padding: 16 }]}>
    <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 12 }}>{selectedLanguage === 'tr' ? 'Önce bir cüzdan tarayın' : 'Scan a wallet first'}</Text>
    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 6 }}>{selectedLanguage === 'tr' ? 'Ana ekranda bir cüzdan adresi sorguladığınızda portföy bakiyeleri burada gösterilir.' : 'Portfolio balances will appear here after you scan a wallet on the dashboard.'}</Text>
  </View> :
  <>
    <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, padding: 14 }]}>
      <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('commonNetwork')}: {NETWORKS[selectedNetwork]?.name || selectedNetwork}</Text>
      <Text selectable numberOfLines={1} style={{ color: theme.textSub, fontSize: 8, marginTop: 4 }}>{address}</Text>
      <Text style={{ color: theme.primary, fontSize: 22, fontWeight: '900', marginTop: 10 }}>{formatCurrency(portfolioUsdValue)}</Text>
      {walletNativeBalance !== null ? <Text style={{ color: theme.textMain, fontSize: 13, fontWeight: '800', marginTop: 7 }}>{Number(walletNativeBalance).toLocaleString('en-US', { maximumFractionDigits: 8 })} {NETWORKS[selectedNetwork]?.symbol || ''}</Text> : null}
      {walletLatestBlock ? <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>{t('dashboardLastBlock')}: {walletLatestBlock}</Text> : null}
    </View>
    <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
      <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 7 }}>{selectedLanguage === 'tr' ? 'Token Bakiyeleri' : 'Token Balances'}</Text>
      {walletTokens.filter((item) => Number(item?.balance || 0) > 0).length === 0 ?
        <Text style={{ color: theme.textSub, fontSize: 10 }}>{selectedLanguage === 'tr' ? 'Ek token bakiyesi bulunamadı.' : 'No additional token balance found.'}</Text> :
        walletTokens.filter((item) => Number(item?.balance || 0) > 0).map((item, index) =>
          <View key={`portfolio-token-${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: index === walletTokens.length - 1 ? 0 : 1, borderBottomColor: theme.borderCol }}>
            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '700' }}>{item?.symbol || item?.name || 'TOKEN'}</Text>
            <Text style={{ color: theme.textSub, fontSize: 10 }}>{Number(item?.balance || 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</Text>
          </View>)
      }
    </View>
  </>}
        </ScrollView> :
        activeModule === 'priceAlertsView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                {t('priceDescription')}
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}>{t('priceSystemTitle')}</Text>
                    <Text style={[styles.prefCardSub, { color: theme.textSub, fontSize: 10 }]}>{t('priceSystemDescription')}</Text>
                  </View>
                  <Switch
                trackColor={{ false: '#374151', true: theme.primary }}
                thumbColor={priceAlertsEnabled ? '#FFFFFF' : '#9CA3AF'}
                onValueChange={() => setPriceAlertsEnabled(!priceAlertsEnabled)}
                value={priceAlertsEnabled} />

                </View>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>{t('priceSelectCrypto')}</Text>

                <View style={styles.gridContainer}>
                  {Object.keys(NETWORKS).filter((key) => key !== 'nft' && PRICE_ALERT_SYMBOL_TO_ASSET[NETWORKS[key].symbol]).map((key) => {
                const sym = NETWORKS[key].symbol;
                const isSelected = alertTargetCrypto === sym;
                return (
                  <TouchableOpacity
                    key={key}
                    style={{
                      width: '31%',
                      paddingVertical: 6,
                      paddingHorizontal: 2,
                      borderRadius: 6,
                      backgroundColor: isSelected ? theme.primary : theme.inputBg,
                      borderWidth: 1,
                      borderColor: isSelected ? '#FFFFFF' : theme.borderCol,
                      alignItems: 'center',
                      marginBottom: 4
                    }}
                    onPress={() => setAlertTargetCrypto(sym)}>

                        <Text style={{ color: isSelected ? '#FFF' : theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{sym}</Text>
                      </TouchableOpacity>);

              })}
                </View>

                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, marginTop: 4, height: 36, fontSize: 11 }]}
              placeholder={`${t("priceTargetPlaceholder")} ${alertTargetCrypto} ($)...`}
              placeholderTextColor="#888"
              value={targetAlertPrice}
              onChangeText={setTargetAlertPrice}
              keyboardType="numeric" />

                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
              onPress={async () => {
                if (userStatus !== 'vip' && savedPriceAlerts.length >= 8) {
                  Alert.alert(t("priceVipLimitTitle"), t("priceVipLimitMessage"));
                  setActiveModule('vipView');
                  return;
                }

                if (!targetAlertPrice.trim()) {
                  Alert.alert(t("commonMissingInfo"), t("priceEnterValidTarget"));
                  return;
                }

                const sanitizedPrice = SecurityScannerMiddleware.sanitizeInput(targetAlertPrice);

                const networkEntry = Object.entries(NETWORKS).find(
                  ([, value]) => value.symbol === alertTargetCrypto
                );

                const networkKey = networkEntry ? networkEntry[0] : alertTargetCrypto.toLowerCase();

                try {
                  const response = await api.post('/api/price-alerts', {
                    asset: PRICE_ALERT_SYMBOL_TO_ASSET[alertTargetCrypto],
                    targetPrice: Number(sanitizedPrice),
                    direction: 'ABOVE',
                    network: networkKey
                  });

                  const savedAlert = response.data?.alert;

                  if (!savedAlert) {
                    throw new Error('Backend fiyat alarmı kaydını doğrulamadı.');
                  }

                  const newAlert = {
                    id: String(savedAlert.id),
                    crypto: String(savedAlert.asset || alertTargetCrypto).toUpperCase(),
                    price: String(savedAlert.targetPrice ?? sanitizedPrice),
                    direction: savedAlert.direction || 'ABOVE',
                    network: savedAlert.network || networkKey
                  };

                  setSavedPriceAlerts((current) => [newAlert, ...current]);
                  setTargetAlertPrice('');
                  triggerLocalNotification(t("priceAlertCreated"), `${newAlert.crypto} ${t("priceTargetActivated")} $${newAlert.price}`);
                  Alert.alert(t("commonSuccess"), `${newAlert.crypto} ${t("priceSavedBackend")}`);
                } catch (error) {
                  console.error('[PRICE ALERTS] Kaydetme başarısız:', error);
                  Alert.alert(
                    t("priceSaveFailed"),
                    error?.response?.data?.error === 'Unsupported price alert asset.' ? (selectedLanguage === 'tr' ? 'Bu varlık için fiyat alarmı şu anda desteklenmiyor.' : 'Price alerts are not supported for this asset yet.') : t("priceBackendSaveFailed")
                  );
                }
              }}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{alertTargetCrypto} {t("priceSaveAlert")}</Text>
                </TouchableOpacity>
              </View>

              {getRecommendedGasNetwork ?
          <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, marginTop: 8 }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>{t('gasRecommendedNetwork')}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold' }}>
                      {{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[getRecommendedGasNetwork.network] || getRecommendedGasNetwork.network.toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>
                      {getRecommendedGasNetwork.fee}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>{t('gasLowestLiveValue')}</Text>
                </View> :
          null}

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginTop: 8 }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>{t('priceActiveAlerts')} ({savedPriceAlerts.length}/8):</Text>
                {savedPriceAlerts.length === 0 ?
            <Text style={{ color: theme.textSub, fontSize: 11, textAlign: 'center', paddingVertical: 8 }}>{t('priceNoAlerts')}</Text> :

            savedPriceAlerts.map((item) =>
            <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4 }}>
                      <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}> {item.crypto} : ${item.price}</Text>
                      <TouchableOpacity
                onPress={async () => { try { await api.delete(`/api/price-alerts/${item.id}`); await loadPriceAlerts(); } catch (error) { Alert.alert(t('priceSaveFailed'), selectedLanguage === 'tr' ? 'Fiyat alarmı silinemedi.' : 'Price alert could not be deleted.'); } }}
                style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>

                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>{t('commonDelete')}</Text>
                      </TouchableOpacity>
                    </View>
            )
            }
              </View>
            </ScrollView> :
        activeModule === 'guardianView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                {t('guardianDescription')}
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}>
                      Safe Sentinel Guardian
                    </Text>
                    <Text style={[styles.prefCardSub, { color: theme.textSub, fontSize: 10 }]}>
                      {t('guardianNonCustodial')}
                    </Text>
                  </View>

                  <Switch
                trackColor={{ false: '#374151', true: theme.primary }}
                thumbColor={guardianEnabled ? '#FFFFFF' : '#9CA3AF'}
                onValueChange={setGuardianEnabled}
                value={guardianEnabled}
                disabled={guardianLoading} />

                </View>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>
                  {t('guardianThreshold')}
                </Text>

                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]}
              placeholder={t("guardianThresholdPlaceholder")}
              placeholderTextColor="#888"
              value={guardianAlertThreshold}
              onChangeText={setGuardianAlertThreshold}
              keyboardType="numeric"
              editable={!guardianLoading} />

                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, opacity: guardianLoading ? 0.6 : 1 }]}
              disabled={guardianLoading}
              onPress={async () => {
                const threshold = Number(guardianAlertThreshold);

                if (!Number.isFinite(threshold) || threshold < 0) {
                  Alert.alert('Guardian', t('guardianInvalidThreshold'));
                  return;
                }

                try {
                  setGuardianLoading(true);

                  const response = await api.put('/api/guardian/profile', {
                    enabled: guardianEnabled,
                    alertThresholdUsd: threshold
                  });

                  const profile = response.data?.profile;

                  if (profile) {
                    setGuardianEnabled(Boolean(profile.enabled));
                    setGuardianAlertThreshold(String(profile.alertThresholdUsd ?? threshold));
                    setGuardianProfileLoaded(true);
                  }

                  Alert.alert(
                    'Guardian',
                    t('guardianUpdated')
                  );
                } catch (error) {
                  Alert.alert(
                    'Guardian',
                    error?.response?.data?.error ||
                    error?.message ||
                    t('guardianUpdateFailed')
                  );
                } finally {
                  setGuardianLoading(false);
                }
              }}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>
                    {guardianLoading ? t('commonSaving') : t('guardianSaveSettings')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.borderCol, width: '100%', height: 36, borderRadius: 6, marginTop: 8 }]}
              disabled={guardianLoading}
              onPress={async () => {
                try {
                  setGuardianLoading(true);

                  const response = await api.get('/api/guardian/profile');
                  const profile = response.data?.profile;

                  if (!profile) {
                    throw new Error(t('guardianProfileUnavailable'));
                  }

                  setGuardianEnabled(Boolean(profile.enabled));
                  setGuardianAlertThreshold(String(profile.alertThresholdUsd ?? 500));
                  setGuardianProfileLoaded(true);

                  Alert.alert('Guardian', t('guardianProfileRefreshed'));
                } catch (error) {
                  Alert.alert(
                    'Guardian',
                    error?.response?.data?.error ||
                    error?.message ||
                    t('guardianProfileLoadFailed')
                  );
                } finally {
                  setGuardianLoading(false);
                }
              }}>

                  <Text style={[styles.buttonText, { color: theme.textMain, fontSize: 11 }]}>
                    {t('guardianRefreshProfile')}
                  </Text>
                </TouchableOpacity>

                <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 8 }}>
                  {t('guardianProfileStatus')}: {guardianProfileLoaded ? t('guardianSynced') : t('guardianNotLoaded')}
                </Text>
              </View>
                      <View style={{
            marginTop: 16,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.borderCol,
            borderRadius: 8,
            backgroundColor: theme.inputBg
          }}>

            <Text style={{
              color: theme.text,
              fontWeight: '700',
              fontSize: 15,
              marginBottom: 8
            }}>
              {t('guardianLiveRisk')}
            </Text>

            <Text style={{
              color: theme.subText,
              fontSize: 12,
              marginBottom: 10
            }}>
              {t('guardianRiskDescription1')}
              {t('guardianRiskDescription2')}
            </Text>

            <TouchableOpacity
              style={[
              styles.button,
              {
                backgroundColor: theme.primary,
                width: '100%',
                height: 36,
                borderRadius: 6,
                opacity: guardianEvaluating ? 0.6 : 1
              }]
              }
              disabled={guardianEvaluating}
              onPress={handleGuardianEvaluate}>

              <Text style={{
                color: '#FFFFFF',
                fontWeight: '700'
              }}>
                {guardianEvaluating ?
                t('guardianAnalyzing') :
                t('guardianRunAnalysis')}
              </Text>
            </TouchableOpacity>

            {guardianEvaluationError ?
            <Text style={{
              color: '#EF4444',
              marginTop: 10,
              fontSize: 12
            }}>
                {guardianEvaluationError}
              </Text> :
            null}

            {guardianEvaluationResult?.decision ?
            <View style={{ marginTop: 12 }}>

                <Text style={{
                color: theme.text,
                fontWeight: '700',
                marginBottom: 6
              }}>
                  {t('guardianDecision')}: {guardianEvaluationResult.decision.action}
                </Text>

                <Text style={{
                color: theme.text,
                marginBottom: 4
              }}>
                  {t('guardianRiskScore')}: {guardianEvaluationResult.decision.riskScore ?? 0}/100
                </Text>

                <Text style={{
                color: theme.text,
                marginBottom: 8
              }}>
                  {t('guardianRiskLevel')}: {guardianEvaluationResult.decision.riskLevel || 'UNKNOWN'}
                </Text>

                {Array.isArray(guardianEvaluationResult.decision.reasons) &&
              guardianEvaluationResult.decision.reasons.length > 0 ?
              <View style={{ marginBottom: 10 }}>

                    {guardianEvaluationResult.decision.reasons.map(
                  (reason, index) =>
                  <Text
                    key={`guardian-reason-${index}`}
                    style={{
                      color: theme.subText,
                      fontSize: 12,
                      marginBottom: 3
                    }}>

                          • {reason}
                        </Text>

                )}

                  </View> :
              null}

                {guardianEvaluationResult.components ?
              <View style={{
                borderTopWidth: 1,
                borderTopColor: theme.borderCol,
                paddingTop: 8
              }}>

                    <Text style={{
                  color: theme.text,
                  marginBottom: 4
                }}>
                      Behavioral: {guardianEvaluationResult.components.behavioral?.score ?? 0}/100
                      {' · '}
                      {guardianEvaluationResult.components.behavioral?.level || 'LOW'}
                    </Text>

                    <Text style={{
                  color: theme.text,
                  marginBottom: 4
                }}>
                      Scam DNA: {guardianEvaluationResult.components.scamDna?.score ?? 0}/100
                      {' · '}
                      {guardianEvaluationResult.components.scamDna?.level || 'LOW'}
                    </Text>

                    <Text style={{
                  color: theme.text,
                  marginBottom: 4
                }}>
                      Security Graph: {guardianEvaluationResult.components.securityGraph?.score ?? 0}/100
                      {' · '}
                      {guardianEvaluationResult.components.securityGraph?.level || 'LOW'}
                    </Text>

                    <Text style={{
                  color: theme.text,
                  marginBottom: 4
                }}>
                      Early Warning: {guardianEvaluationResult.components.earlyWarning?.score ?? 0}/100
                      {' · '}
                      {guardianEvaluationResult.components.earlyWarning?.level || 'LOW'}
                    </Text>

                    <Text style={{
                  color: theme.subText,
                  fontSize: 11,
                  marginTop: 6
                }}>
                      {t('guardianProtectionMode')}: {guardianEvaluationResult.protectionMode || 'NON_CUSTODIAL_READ_ONLY'}
                    </Text>

                  </View> :
              null}

              </View> :
            null}

          </View>
</ScrollView> : activeModule === 'inheritView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                {t('inheritDescription')}
              </Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}>{t('inheritProtocolTitle')}</Text>
                  </View>
                  <Switch
                trackColor={{ false: '#374151', true: theme.primary }}
                thumbColor={inheritEnabled ? '#FFFFFF' : '#9CA3AF'}
                onValueChange={setInheritEnabled}
                value={inheritEnabled} />

                </View>

                {inheritEnabled &&
            <>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 2 }}>{t('inheritInactivityDays')}:</Text>
                <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
                placeholder={t('inheritDaysPlaceholder')}
                placeholderTextColor="#888"
                value={inheritDays}
                onChangeText={setInheritDays}
                keyboardType="numeric" />

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>{t('inheritBeneficiary')}:</Text>
                <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]}
                placeholder={t('inheritBeneficiaryPlaceholder')}
                placeholderTextColor="#888"
                value={inheritBeneficiary}
                onChangeText={setInheritBeneficiary} />

                <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
                onPress={createInheritanceProtocol}
                disabled={inheritanceLoading}
                activeOpacity={0.8}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('inheritCreate')}</Text>

                    </TouchableOpacity>
                {inheritanceLoading &&
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                    {t('inheritLoading')}
                  </Text>
              }

                {!inheritanceLoading && inheritanceProtocols.length === 0 &&
              <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 10, textAlign: 'center' }}>
                    {t('inheritEmpty')}
                  </Text>
              }

                {!inheritanceLoading && inheritanceProtocols.map((protocol) => {
                const statusText =
                protocol.status === 'ACTIVE' ? t('inheritStatusActive') :
                protocol.status === 'CANCELLED' ? t('inheritStatusCancelled') :
                t('inheritStatusDraft');

                return (
                  <View
                    key={protocol.id}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.borderCol,
                      backgroundColor: theme.cardBg
                    }}>

                      <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                        {t('inheritProtocol')} — {statusText}
                      </Text>

                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        {t('commonNetwork')}: {protocol.network}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        {t('dashboardWallet')}: {protocol.walletAddress}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        {t('inheritBeneficiaryShort')}: {protocol.beneficiaryAddress}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        {t('inheritInactivityPeriod')}: {protocol.inactivityDays} {t('inheritDays')}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                        {t('inheritLastHeartbeat')}: {protocol.lastHeartbeatAt ? new Date(protocol.lastHeartbeatAt).toLocaleString() : '-'}
                      </Text>

                      {protocol.status !== 'CANCELLED' &&
                    <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                          <TouchableOpacity
                        style={[styles.button, { flex: 1, height: 34, borderRadius: 6, backgroundColor: theme.primary }]}
                        onPress={() => heartbeatInheritanceProtocol(protocol.id)}
                        disabled={inheritanceLoading}
                        activeOpacity={0.8}>

                            <Text style={[styles.buttonText, { fontSize: 10 }]}>{t('inheritRefreshHeartbeat')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                        style={[styles.button, { flex: 1, height: 34, borderRadius: 6, backgroundColor: '#8B0000' }]}
                        onPress={() => cancelInheritanceProtocol(protocol.id)}
                        disabled={inheritanceLoading}
                        activeOpacity={0.8}>

                            <Text style={[styles.buttonText, { fontSize: 10 }]}>{t('inheritCancel')}</Text>
                          </TouchableOpacity>
                        </View>
                    }
                    </View>);

              })}
                  </>
            }
              </View>
            </ScrollView> :
        activeModule === 'quickTestView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('quickDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]}
              placeholder={t("quickWalletPlaceholder")}
              placeholderTextColor="#888"
              value={address}
              onChangeText={setAddress} />

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleAddressCheck}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('quickStartTest')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView> :
        activeModule === 'emergencyLockView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('emergencyDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: '#7F1D1D', borderColor: '#EF4444' }]}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>{t('emergencyStatus')}</Text>
                <TouchableOpacity style={[styles.button, { backgroundColor: '#EF4444', width: '100%', height: 36, borderRadius: 6 }]} onPress={() => Alert.alert(t("toolTitleEmergencyLock"), t("emergencyAlertMessage"))}>
                   <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 11 }}>{t('emergencyButton')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView> :
        activeModule === 'gasOptView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
<Text style={styles.prefDescription}>{selectedLanguage === 'tr' ? 'Backend RPC kaynaklarından alınabilen gerçek ağ işlem ücretlerini görüntüleyin.' : 'View live network fees available from backend RPC sources.'}</Text>
{gasLoading ? <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center', marginVertical: 12 }}>{selectedLanguage === 'tr' ? 'Ağ ücretleri yükleniyor...' : 'Loading network fees...'}</Text> : null}
{Object.entries(networkGasFees).filter(([network, fee]) => ['eth','bsc','polygon','arb'].includes(network) && /[0-9]/.test(String(fee))).length === 0 ?
  <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: '#F59E0B' }]}>
    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: 'bold' }}>{selectedLanguage === 'tr' ? 'Canlı ağ ücreti alınamadı' : 'Live network fees unavailable'}</Text>
    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 5 }}>{selectedLanguage === 'tr' ? 'Boş değerler canlı veri olarak gösterilmez. Daha sonra tekrar deneyin.' : 'Empty values are not presented as live data. Try again later.'}</Text>
    <TouchableOpacity onPress={fetchLiveGasFees} style={[styles.button, { backgroundColor: theme.primary, marginTop: 10, height: 36 }]}><Text style={styles.buttonText}>{selectedLanguage === 'tr' ? 'Yeniden Dene' : 'Retry'}</Text></TouchableOpacity>
  </View> :
  <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 8 }}>{selectedLanguage === 'tr' ? 'CANLI AĞ ÜCRETLERİ' : 'LIVE NETWORK FEES'}</Text>
    {Object.entries(networkGasFees).filter(([network, fee]) => ['eth','bsc','polygon','arb'].includes(network) && /[0-9]/.test(String(fee))).map(([network, fee]) => <View key={network} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.inputBg, padding: 8, borderRadius: 6, marginBottom: 5 }}><Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[network]}</Text><Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold' }}>{fee}</Text></View>)}
    {gasLastUpdated ? <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 5 }}>{selectedLanguage === 'tr' ? 'Son güncelleme' : 'Last updated'}: {gasLastUpdated.toLocaleTimeString()}</Text> : null}
  </View>}
        </ScrollView> :
        activeModule === 'deepIntelView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer}>
              <Text style={styles.prefDescription}>{t('deepIntelDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>{t('deepIntelScan')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 15 }}>{t('deepIntelCleanSource')}</Text>
              </View>
            </ScrollView> :
        activeModule === 'autoPhishView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer}>
              <Text style={styles.prefDescription}>{t('autoPhishDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>{t('autoPhishActive')}</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 15 }}>{t('autoPhishLast24h')}</Text>
              </View>
            </ScrollView> :
        activeModule === 'preferencesView' ?
        <>

            <View
            style={[
            styles.prefCard,
            {
              backgroundColor: theme.itemBg,
              borderColor: theme.borderCol,
              marginBottom: 10
            }]
            }>

              <Text
              style={{
                color: theme.textMain,
                fontSize: 12,
                fontWeight: 'bold',
                marginBottom: 8
              }}>

                {t('settings')}
              </Text>

              <Text
              style={{
                color: theme.textSub,
                fontSize: 9,
                marginBottom: 5
              }}>

                {t('selectedLanguage')}
              </Text>

              <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 10 }}>

                {Object.entries(V26_GLOBAL_I18N).map(
                ([code, item]) => {
                  const active = selectedLanguage === code;

                  return (
                    <TouchableOpacity
                      key={code}
                      onPress={() =>
                      saveGlobalLanguage(code)
                      }
                      style={{
                        backgroundColor: active ?
                        theme.primary :
                        theme.inputBg,
                        borderWidth: 1,
                        borderColor: active ?
                        theme.primary :
                        theme.borderCol,
                        borderRadius: 6,
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                        marginRight: 6
                      }}>

                        <Text
                        style={{
                          color: active ?
                          '#FFFFFF' :
                          theme.textMain,
                          fontSize: 8,
                          fontWeight: 'bold'
                        }}>

                          {item.nativeName}
                        </Text>
                      </TouchableOpacity>);

                }
              )}
              </ScrollView>

              <Text
              style={{
                color: theme.textSub,
                fontSize: 9,
                marginBottom: 5
              }}>

                {t('selectedCurrency')}
              </Text>

              <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}>

                {Object.values(V26_CURRENCIES).map(
                (currency) => {
                  const active =
                  selectedCurrency === currency.code;

                  return (
                    <TouchableOpacity
                      key={currency.code}
                      onPress={() =>
                      saveGlobalCurrency(currency.code)
                      }
                      style={{
                        backgroundColor: active ?
                        theme.primary :
                        theme.inputBg,
                        borderWidth: 1,
                        borderColor: active ?
                        theme.primary :
                        theme.borderCol,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        marginRight: 6
                      }}>

                        <Text
                        style={{
                          color: active ?
                          '#FFFFFF' :
                          theme.textMain,
                          fontSize: 8,
                          fontWeight: 'bold'
                        }}>

                          {currency.symbol} {currency.code}
                        </Text>
                      </TouchableOpacity>);

                }
              )}
              </ScrollView>

              <View
              style={{
                marginTop: 9,
                paddingTop: 7,
                borderTopWidth: 1,
                borderTopColor: theme.borderCol
              }}>

                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8
                }}>

                  {t('language')}: {V26_GLOBAL_I18N[selectedLanguage]?.nativeName || selectedLanguage}
                </Text>

                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {t('currency')}: {selectedCurrency}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('preferencesDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 11, fontWeight: 'bold' }]}>{t('autoScamBlock')}</Text>
                    <Text style={[styles.prefCardSub, { color: theme.textSub, fontSize: 10 }]}>{t('autoScamBlockDescription')}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: '#EF4444' }]}>
                <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold', marginBottom: 5 }}>
                  {t('deleteAccount')}
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 9, lineHeight: 14, marginBottom: 9 }}>
                  {t('deleteAccountDescription')}
                </Text>
                <TouchableOpacity
                onPress={handleDeleteAccount}
                style={[styles.button, { backgroundColor: '#B91C1C', width: '100%', height: 36, borderRadius: 6 }]}>

                  <Text style={[styles.buttonText, { fontSize: 10 }]}>{t('deleteAccount')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            </> :
        activeModule === 'outboundShieldView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('outboundDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t("outboundRecipientPlaceholder")}
              placeholderTextColor="#888"
              value={outboundRecipient}
              onChangeText={setOutboundRecipient} />

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleOutboundShieldCheck}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{checkingOutbound ? t("commonScanning") : t("outboundTestTransfer")}</Text>
                </TouchableOpacity>

                {outboundCheckResult &&
            <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: outboundCheckResult.isBlocked ? '#EF4444' : '#10B981', fontWeight: 'bold', fontSize: 11 }}>{outboundCheckResult.status}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>{t('commonNetwork')}: {String(outboundCheckResult.network || selectedNetwork).toUpperCase()}</Text>
                    {outboundCheckResult.listStatus ? <Text style={{ color: outboundCheckResult.listStatus === 'BLACKLIST' ? '#EF4444' : '#10B981', fontSize: 10, marginTop: 2 }}>{outboundCheckResult.listStatus}</Text> : null}
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>{t('commonRiskLevel')}: {outboundCheckResult.riskLevel}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 2 }}>{outboundCheckResult.actionTaken}</Text>
                  </View>
            }
              </View>
            </ScrollView> :
        activeModule === 'smartContractView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('contractDescription')}</Text>
              <View style={[styles.gridContainer, { marginBottom: 9 }]}>
      {["ethereum", "bsc", "polygon", "arbitrum", "base", "optimism", "avalanche"].map((key) =>
        <TouchableOpacity
          key={key}
          onPress={() => setContractNetwork(key)}
          style={{
            width: '48%',
            paddingHorizontal: 8,
            paddingVertical: 8,
            marginBottom: 6,
            borderRadius: 8,
            backgroundColor: contractNetwork === key ? theme.primary : theme.inputBg,
            borderWidth: 1,
            borderColor: contractNetwork === key ? theme.primary : theme.borderCol
          }}>
          <Text style={{ color: contractNetwork === key ? '#FFF' : theme.textMain, fontSize: 9, fontWeight: '900', textAlign: 'center' }}>
            {key === 'ethereum' ? 'Ethereum' : key === 'bsc' ? 'BNB Chain' : key === 'polygon' ? 'Polygon' : key === 'arbitrum' ? 'Arbitrum' : key === 'base' ? 'Base' : key === 'optimism' ? 'Optimism' : 'Avalanche'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t("contractAddressPlaceholder")}
              placeholderTextColor="#888"
              value={contractAddress}
              onChangeText={setContractAddress} />

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleSmartContractAnalysis}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingContract ? t("commonAnalyzing") : t("contractAnalyze")}</Text>
                </TouchableOpacity>

                {contractAnalysisResult &&
            <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11 }}>{t('commonRiskScore')}: {contractAnalysisResult.riskScore}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>{t('contractBuyTax')}: {contractAnalysisResult.buyTax} | {t('contractSellTax')}: {contractAnalysisResult.sellTax}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>{t('contractMintPermission')}: {contractAnalysisResult.mintable}</Text>
                    {contractAnalysisResult.mintDetails &&
              <View style={{ marginTop: 4 }}>
                        <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractMintRpc')}: {contractAnalysisResult.mintDetails.supported ? t('commonSupported') : t('commonNotSupported')}</Text>
                        {contractAnalysisResult.mintDetails.capSupported &&
                <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractMintCap')}: {contractAnalysisResult.mintDetails.cap}</Text>
                }
                        {contractAnalysisResult.mintDetails.minterRoleSupported &&
                <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractMinterRole')}: {t('commonDetected')}</Text>
                }
                        {typeof contractAnalysisResult.mintDetails.ownerHasMinterRole === "boolean" &&
                <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractOwnerMinterRole')}: {contractAnalysisResult.mintDetails.ownerHasMinterRole ? t('commonYes') : t('commonNo')}</Text>
                }
                      </View>
              }
                    {contractAnalysisResult.adminDetails &&
              <View style={{ marginTop: 4 }}>
                        <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractAdminRole')}: {contractAnalysisResult.adminDetails.supported ? t('contractDefaultAdminDetected') : t('commonNotSupported')}</Text>
                        {contractAnalysisResult.adminDetails.countSupported &&
                <Text style={{ color: theme.textSub, fontSize: 9 }}>{t('contractAdminCount')}: {contractAnalysisResult.adminDetails.count}</Text>
                }
                      </View>
              }
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 4 }}>{contractAnalysisResult.aiThreatRadar}</Text>
                  </View>
            }
              </View>
            </ScrollView> :
        activeModule === 'behavioralView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('behaviorDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t("behaviorWalletPlaceholder")}
              placeholderTextColor="#888"
              value={address}
              onChangeText={setAddress} />

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleBehavioralAnalysis}>
                   <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingBehavior ? t('commonAnalyzing') : t('behaviorRun')}</Text>
                </TouchableOpacity>

                {behavioralAnalysisResult &&
            <View
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: theme.inputBg,
                borderRadius: 6
              }}>

                    <Text
                style={{
                  color: theme.primary,
                  fontWeight: 'bold',
                  fontSize: 12
                }}>

                      {t('behaviorProfileScore')}: {behavioralAnalysisResult.behavioralScore}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 4
                }}>

                      {t('commonRiskLevel')}: {behavioralAnalysisResult.riskLevel}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('commonNetwork')}: {behavioralAnalysisResult.network}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorWalletAge')}: {behavioralAnalysisResult.walletAge}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorTotalTransactions')}: {behavioralAnalysisResult.totalTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorSuccessfulTransactions')}: {behavioralAnalysisResult.successfulTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorFailedTransactions')}: {behavioralAnalysisResult.failedTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorFailedRatio')}: {behavioralAnalysisResult.failedRatio}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorIncoming')}: {behavioralAnalysisResult.incomingTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorOutgoing')}: {behavioralAnalysisResult.outgoingTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorUniqueCounterparties')}: {behavioralAnalysisResult.uniqueCounterparties}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorTokenTransfers')}: {behavioralAnalysisResult.tokenTransferTransactions}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorDistinctTokens')}: {behavioralAnalysisResult.distinctTokens}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 4
                }}>

                      {t('behaviorMixerSignal')}: {behavioralAnalysisResult.mixerInteraction}
                    </Text>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  marginTop: 2
                }}>

                      {t('behaviorBotAutomation')}: {behavioralAnalysisResult.botActivityScore}
                    </Text>

                    <Text
                style={{
                  color: theme.textSub,
                  fontSize: 10,
                  marginTop: 6,
                  lineHeight: 15
                }}>

                      {behavioralAnalysisResult.summary}
                    </Text>

                    {Array.isArray(behavioralAnalysisResult.reasons) &&
              behavioralAnalysisResult.reasons.length > 0 &&
              <View style={{ marginTop: 7 }}>
                          <Text
                  style={{
                    color: theme.primary,
                    fontWeight: 'bold',
                    fontSize: 10
                  }}>

                            {t('behaviorRiskReasons')}
                          </Text>

                          {behavioralAnalysisResult.reasons.map(
                  (reason, index) =>
                  <Text
                    key={`reason-${index}`}
                    style={{
                      color: theme.textSub,
                      fontSize: 9,
                      marginTop: 3
                    }}>

                                • {reason}
                              </Text>

                )}
                        </View>
              }

                    {Array.isArray(behavioralAnalysisResult.signals) &&
              behavioralAnalysisResult.signals.length > 0 &&
              <View style={{ marginTop: 7 }}>
                          <Text
                  style={{
                    color: theme.primary,
                    fontWeight: 'bold',
                    fontSize: 10
                  }}>

                            {t('behaviorRiskSignals')}
                          </Text>

                          {behavioralAnalysisResult.signals.map(
                  (signal, index) =>
                  <Text
                    key={`signal-${index}`}
                    style={{
                      color: theme.textSub,
                      fontSize: 9,
                      marginTop: 3
                    }}>

                                • {typeof signal === 'string' ?
                    ({
                      MANY_INCOMING_SOURCES: selectedLanguage === 'tr' ? 'Çok sayıda kaynaktan fon girişi' : 'Funds received from many sources',
                      COLLECTION_PATTERN: selectedLanguage === 'tr' ? 'Fon toplama davranışı' : 'Fund collection pattern',
                      MANY_OUTGOING_DESTINATIONS: selectedLanguage === 'tr' ? 'Çok sayıda hedefe fon çıkışı' : 'Funds sent to many destinations',
                      DISTRIBUTION_PATTERN: selectedLanguage === 'tr' ? 'Fon dağıtım davranışı' : 'Fund distribution pattern',
                      HIGH_ACTIVITY: selectedLanguage === 'tr' ? 'Yüksek işlem aktivitesi' : 'High transaction activity',
                      FAILED_TRANSACTIONS: selectedLanguage === 'tr' ? 'Başarısız işlem sinyali' : 'Failed transaction signal'
                    }[signal] || signal.replaceAll('_', ' ')) :
                    JSON.stringify(signal)}
                              </Text>

                )}
                        </View>
              }

                    {behavioralAnalysisResult.scamMatched &&
              <Text
                style={{
                  color: theme.primary,
                  fontWeight: 'bold',
                  fontSize: 10,
                  marginTop: 7
                }}>

                         {t('behaviorScamMatch')}
                      </Text>
              }
                  </View>
            }
              </View>
            </ScrollView> :
        activeModule === 'phishingView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('phishingDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder="https://example-dapp.com..."
              placeholderTextColor="#888"
              value={phishingUrl}
              onChangeText={setPhishingUrl} />

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handlePhishingAnalysis}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingPhishing ? t("commonScanning") : t("phishingScanSite")}</Text>
                </TouchableOpacity>

                {phishingResult &&
            <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11 }}>{phishingResult.status}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>{t('phishingDomainAge')}: {phishingResult.domainAge} | SSL: {phishingResult.sslValid}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 4 }}>{phishingResult.summary}</Text>
                  </View>
            }
              </View>
            </ScrollView> :
        activeModule === 'revokeView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                {t('revokeDescription')}
              </Text>
              {revokeList.length === 0 ?
          <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: '#EF4444', alignItems: 'center', padding: 16 }]}>
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>{t('revokeNoAllowance')}</Text>
                  <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center' }}>{t('revokeEmptyDescription')}</Text>
                </View> :

          revokeList.map((item, index) =>
          <View key={index} style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 2 }}>{t('revokeAsset')}: {item.token}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 2 }}>{t('revokeSpenderContract')}: {item.spender}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginBottom: 6 }}>{t('commonStatus')}: {item.allowance}</Text>
                    <TouchableOpacity
              style={{ backgroundColor: '#EF4444', height: 34, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}
              onPress={() => handleRevokeApproval(index)}>

                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>
                        {revokingIndex === index ? t("revokeRevoking") : t("revokePermission")}
                      </Text>
                    </TouchableOpacity>
                  </View>
          )
          }
            </ScrollView> :
        activeModule === 'whaleWatchView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('whaleDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t("whalePlaceholder")}
              placeholderTextColor="#888"
              value={newWhaleAddress}
              onChangeText={setNewWhaleAddress} />

                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
              onPress={() => {
                if (!newWhaleAddress.trim()) return Alert.alert(t("commonError"), t("whaleEmptyAddress"));
                setWhaleWatchList([SecurityScannerMiddleware.sanitizeInput(newWhaleAddress), ...whaleWatchList]);
                setNewWhaleAddress('');
                Alert.alert(t("commonSuccess"), t("whaleAdded"));
              }}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('whaleAdd')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>{t('whaleActive')}:</Text>
                {whaleWatchList.map((w, idx) =>
            <View key={idx} style={{ backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4 }}>
                    <Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold' }}> {w}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 2 }}>{t('whaleWaitingRealData')}</Text>
                  </View>
            )}
              </View>
            </ScrollView> :
        activeModule === 'gasTimeView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
               <Text style={styles.prefDescription}>{t('gasTimeDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>{t('gasTimeMode')}:</Text>
                {[t('gasTimeStandard'), t('gasTimeEconomic'), t('gasTimeEmergency')].map((mode) =>
            <TouchableOpacity
              key={mode}
              style={{ padding: 6, backgroundColor: gasOptimizerTarget === mode ? theme.primary : theme.inputBg, borderRadius: 6, marginBottom: 4 }}
              onPress={() => setGasOptimizerTarget(mode)}>

                    <Text style={{ color: gasOptimizerTarget === mode ? '#FFF' : theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{mode}</Text>
                  </TouchableOpacity>
            )}
                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginTop: 4 }]}
              onPress={() => Alert.alert(t("commonSuccess"), `${t("gasTimeConfigured")} ${gasOptimizerTarget}`)}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('gasTimeSave')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView> :
        activeModule === 'aiMarketView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
               <Text style={styles.prefDescription}>🧠 {t('aiMarketDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginBottom: 8 }]}
              onPress={fetchMarketIntelligence}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingSentiment ? t('aiMarketAnalyzing') : t('aiMarketRun')}</Text>
                </TouchableOpacity>

                {sentimentResult &&
            <View style={{ backgroundColor: theme.inputBg, padding: 8, borderRadius: 6 }}>

    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 5 }}>
      {sentimentResult.title || t('aiMarketTitle')}
    </Text>

    {sentimentResult.status === 'LIVE' ?
              <>
        <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 3 }}>
          {t('aiMarketSentiment')}: {sentimentResult.sentiment}
        </Text>

        <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 3 }}>
          {t('commonRiskLevel')}: {sentimentResult.riskLevel}
        </Text>

        <Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>
          {t('aiMarketScore')}: {sentimentResult.score}/100
        </Text>

        {sentimentResult.market ?
                <View style={{ marginTop: 4, paddingTop: 5, borderTopWidth: 1, borderTopColor: theme.borderCol }}>

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
              {t('aiMarketLiveData')}
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketCap')}: {formatCurrency(Number(sentimentResult.market.totalMarketCapUsd || 0))}
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketChange24h')}: {Number(sentimentResult.market.marketCapChange24hPct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketVolume')}: {formatCurrency(Number(sentimentResult.market.totalVolumeUsd || 0))}
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketBtcDominance')}: {Number(sentimentResult.market.btcDominancePct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketEthDominance')}: {Number(sentimentResult.market.ethDominancePct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              {t('aiMarketVolumeRatio')}: {(Number(sentimentResult.market.volumeToMarketCapRatio || 0) * 100).toFixed(2)}%
            </Text>

          </View> :
                null}

        {sentimentResult.signals && sentimentResult.signals.length > 0 ?
                <View style={{ marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: theme.borderCol }}>

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold', marginBottom: 3 }}>
              {t('aiMarketSignals')}
            </Text>

            {sentimentResult.signals.map((signal, index) =>
                  <Text
                    key={`market-signal-${index}`}
                    style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>

                • {signal}
              </Text>
                  )}

          </View> :
                null}

        <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>
          {t('aiMarketWhaleTrend')}: {sentimentResult.whaleAccumulation}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 4 }}>
          {sentimentResult.recommendation}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 6 }}>
          {t('aiMarketSource')}: {sentimentResult.source || 'COINGECKO'}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
          {t('aiMarketAnalysis')}: {sentimentResult.analysisType || 'RULE_BASED_MARKET_INTELLIGENCE'}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 4 }}>
          {t('aiMarketDisclaimer')}
        </Text>
      </> :

              <Text style={{ color: theme.textSub, fontSize: 10 }}>
        {sentimentResult.message || t('aiMarketUnavailable')}
      </Text>
              }

  </View>
            }
              </View>
            </ScrollView> :
        activeModule === 'taxReportView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('taxDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>{t('taxPeriod')}:</Text>
                <TouchableOpacity
              style={[styles.button, { backgroundColor: '#6B7280', width: '100%', height: 36, borderRadius: 6 }]}
              onPress={() => Alert.alert(t('taxReadyTitle'), t('taxReadyMessage'))}
              disabled={true}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('taxDownload')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView> :
        activeModule === 'dexOrdersView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>{t('dexDescription')}</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>{t('dexSelectAsset')}:</Text>
                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t('dexAssetPlaceholder')}
              placeholderTextColor="#888"
              value={slCrypto}
              onChangeText={setSlCrypto} />

                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t('dexStopLossPlaceholder')}
              placeholderTextColor="#888"
              value={slPrice}
              onChangeText={setSlPrice}
              keyboardType="numeric" />

                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t('dexTakeProfitPlaceholder')}
              placeholderTextColor="#888"
              value={tpPrice}
              onChangeText={setTpPrice}
              keyboardType="numeric" />

                <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
              onPress={() => {
                if (!slCrypto.trim() || !slPrice || !tpPrice) {
                  Alert.alert(t('dexMissingTitle'), t('dexMissingMessage'));
                  return;
                }
                const newOrder = { id: Date.now().toString(), crypto: slCrypto, sl: slPrice, tp: tpPrice };
                setStopLossList([newOrder, ...stopLossList]);
                setSlPrice('');
                setTpPrice('');
                Alert.alert(t('commonSuccess'), `${slCrypto} ${t('dexSavedMessage')}`);
              }}>

                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('dexSaveDraft')}</Text>
                </TouchableOpacity>
              </View>

              {getRecommendedGasNetwork ?
          <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, marginTop: 8 }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>{t('dexRecommendedNetwork')}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold' }}>
                      {{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[getRecommendedGasNetwork.network] || getRecommendedGasNetwork.network.toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>
                      {getRecommendedGasNetwork.fee}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>{t('dexLowestGas')}</Text>
                </View> :
          null}

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginTop: 8 }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>{t('dexActiveOrders')} ({stopLossList.length}):</Text>
                {stopLossList.length === 0 ?
            <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center', paddingVertical: 6 }}>{t('dexNoOrders')}</Text> :

            stopLossList.map((o) =>
            <View key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4, alignItems: 'center' }}>
                      <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{o.crypto} | SL: ${o.sl} - TP: ${o.tp}</Text>
                      <TouchableOpacity onPress={() => setStopLossList(stopLossList.filter((x) => x.id !== o.id))} style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#FFF', fontSize: 9 }}>{t('dexCancel')}</Text>
                      </TouchableOpacity>
                    </View>
            )
            }
              </View>
            </ScrollView> :
        activeModule === 'vipView' ?
        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, alignItems: 'center', padding: 16 }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 2 }}>{t('vipMembershipTitle')}</Text>
                <Text style={{ color: theme.textSub, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>{t('vipMembershipDescription')}</Text>

                <View style={{ width: '100%', marginBottom: 12, alignItems: 'center' }}>
                  <QRCode value={VIP_PAYMENT_USDT_ADDRESS} size={130} />
                  <Text style={{ color: theme.textMain, fontSize: 9, marginTop: 6, textAlign: 'center' }}>{VIP_PAYMENT_USDT_ADDRESS}</Text>
                </View>

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginBottom: 8 }]} onPress={handleOneClickVipPayment}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('vipPayTrc20')}</Text>
                </TouchableOpacity>

                <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, width: '100%', marginBottom: 8, height: 36, fontSize: 11 }]}
              placeholder={t("vipTxidPlaceholder")}
              placeholderTextColor="#888"
              value={paymentTxHashInput}
              onChangeText={setPaymentTxHashInput} />

                <TouchableOpacity style={[styles.button, { backgroundColor: '#10B981', width: '100%', height: 36, borderRadius: 6 }]} onPress={submitPaymentNotificationToSystem}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{t('vipNotifyPayment')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView> :
        null}
        </SafeAreaView> :

      <ScrollView contentContainerStyle={styles.dashboardContainer} showsVerticalScrollIndicator={false}>

          {/* SAFE SENTINEL SECURITY COMMAND CENTER */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 16,
            marginBottom: 12
          }}>

            <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14
            }}>

              <View style={{ flex: 1 }}>
                <Text
                style={{
                  color: theme.textMain,
                  fontSize: 18,
                  fontWeight: "900",
                  letterSpacing: 0.4
                }}>

                  SAFE SENTINEL
                </Text>
                <Text
                style={{
                  color: theme.primary,
                  fontSize: 10,
                  fontWeight: "800",
                  marginTop: 2
                }}>{t("runtimeSecurityCommandCenter")}

              </Text>
              </View>

              <View
              style={{
                backgroundColor: apiOnline ? "#062E24" : "#3A1111",
                borderColor: apiOnline ? "#10B981" : "#EF4444",
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 9,
                paddingVertical: 6
              }}>

                <Text
                style={{
                  color: apiOnline ? "#10B981" : "#EF4444",
                  fontSize: 8,
                  fontWeight: "900"
                }}>

                  {apiOnline ? t("dashboardSystemOnline") : t("dashboardSystemOffline")}
                </Text>
              </View>

              </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 }}>
      <TouchableOpacity
        onPress={() => setProfileMenuOpen((prev) => !prev)}
        activeOpacity={0.82}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBg, borderColor: theme.borderCol, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '76%' }}>
        <Text style={{ color: theme.primary, fontSize: 17, marginRight: 8 }}>◉</Text>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.textMain, fontSize: 10, fontWeight: '900' }}>{name || (selectedLanguage === 'tr' ? 'Profil' : 'Profile')}</Text>
          <Text style={{ color: theme.textSub, fontSize: 8 }}>{userStatus === 'vip' ? 'VIP' : (selectedLanguage === 'tr' ? 'Standart' : 'Standard')}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { setProfileMenuOpen(false); setActiveModule('notificationsView'); }}
        activeOpacity={0.82}
        style={{ width: 44, height: 40, backgroundColor: theme.inputBg, borderColor: theme.borderCol, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textMain, fontSize: 17 }}>🔔</Text>
        {centralUnreadCount > 0 ?
          <View style={{ position: 'absolute', right: -4, top: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>{centralUnreadCount > 99 ? '99+' : centralUnreadCount}</Text>
          </View> : null}
      </TouchableOpacity>
    </View>
    {/* SAFE_SENTINEL_CONNECTED_WALLET_CARD */}
    <View style={{
      backgroundColor: theme.itemBg,
      borderColor: isConnected ? '#10B981' : theme.borderCol,
      borderWidth: 1,
      borderRadius: 12,
      padding: 11,
      marginBottom: 10
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: '900' }}>
            {selectedLanguage === 'tr' ? 'Web3 Cüzdanı' : 'Web3 Wallet'}
          </Text>
          <Text style={{ color: isConnected ? '#10B981' : theme.textSub, fontSize: 9, marginTop: 3, fontWeight: '700' }}>
            {isConnected && connectedWalletAddress
              ? `${shortenWalletAddress(connectedWalletAddress)}  •  ${selectedLanguage === 'tr' ? 'Bağlı' : 'Connected'}`
              : (selectedLanguage === 'tr' ? 'Henüz cüzdan bağlı değil' : 'No wallet connected')}
          </Text>
          {isConnected && chainId ?
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>Chain ID: {String(chainId)}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={handleOpenWalletConnection}
          activeOpacity={0.84}
          style={{
            backgroundColor: isConnected ? theme.inputBg : theme.primary,
            borderRadius: 9,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderWidth: isConnected ? 1 : 0,
            borderColor: theme.borderCol
          }}>
          <Text style={{ color: isConnected ? theme.primary : '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
            {isConnected
              ? (selectedLanguage === 'tr' ? 'YÖNET' : 'MANAGE')
              : (selectedLanguage === 'tr' ? 'CÜZDAN BAĞLA' : 'CONNECT WALLET')}
          </Text>
        </TouchableOpacity>
      </View>
      {isConnected && connectedWalletAddress ?
        <TouchableOpacity
          onPress={applyConnectedWalletToScanner}
          activeOpacity={0.84}
          style={{
            marginTop: 9,
            borderTopWidth: 1,
            borderTopColor: theme.borderCol,
            paddingTop: 9
          }}>
          <Text style={{ color: theme.primary, fontSize: 9, fontWeight: '900', textAlign: 'center' }}>
            {selectedLanguage === 'tr' ? 'BAĞLI CÜZDANI TARAMA ALANINA AKTAR' : 'USE CONNECTED WALLET FOR SCAN'}
          </Text>
        </TouchableOpacity> : null}
    </View>
    {profileMenuOpen ?
      <View style={{ backgroundColor: theme.inputBg, borderColor: theme.borderCol, borderWidth: 1, borderRadius: 10, padding: 8, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => { setProfileMenuOpen(false); setActiveModule('vaultView'); }} style={{ paddingVertical: 9, paddingHorizontal: 8 }}>
          <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '800' }}>{selectedLanguage === 'tr' ? 'Cüzdan / Kasa' : 'Wallet / Vault'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setProfileMenuOpen(false); setActiveModule('preferencesView'); }} style={{ paddingVertical: 9, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: theme.borderCol }}>
          <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '800' }}>{selectedLanguage === 'tr' ? 'Ayarlar' : 'Settings'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setProfileMenuOpen(false); handleLogout(); }} style={{ paddingVertical: 9, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: theme.borderCol }}>
          <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '900' }}>{selectedLanguage === 'tr' ? 'Çıkış' : 'Sign Out'}</Text>
        </TouchableOpacity>
      </View> : null}

            <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8
            }}>

              <View
              style={{
                flex: 1,
                minWidth: 150,
                backgroundColor: theme.inputBg,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  {t("dashboardWalletSecurityScore")}
                </Text>
                <Text
                style={{
                  color: theme.primary,
                  fontSize: 25,
                  fontWeight: "900",
                  marginTop: 4
                }}>

                  {walletRisk?.score ?? walletRisk?.riskScore ?? "--"}
                  {walletRisk ? "/100" : ""}
                </Text>
                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 2
                }}>

                  {walletRisk?.level || t("dashboardAnalysisWaiting")}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 150,
                backgroundColor: theme.inputBg,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                <Text style={{ color: theme.textSub, fontSize: 8 }}>{t("runtimeScamIntelligenceTitle")}

              </Text>
                <Text
                style={{
                  color: walletScamIntel ? "#10B981" : theme.textMain,
                  fontSize: 15,
                  fontWeight: "900",
                  marginTop: 7
                }}>

                  {walletScamIntel ? t("dashboardAnalysisAvailable") : t("dashboardWaiting")}
                </Text>
                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {t("dashboardThreatIntelStatus")}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 150,
                backgroundColor: theme.inputBg,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  {t("dashboardVaultMonitoring")}
                </Text>
                <Text
                style={{
                  color: vault.length > 0 ? "#10B981" : theme.textMain,
                  fontSize: 15,
                  fontWeight: "900",
                  marginTop: 7
                }}>

                  {vault.length > 0 ? t("dashboardActive") : t("dashboardReady")}
                </Text>
                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {vault.length}/10 {t("dashboardWalletsMonitored")}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 150,
                backgroundColor: theme.inputBg,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.borderCol
              }}>

                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  {t("dashboardNetworkStatus")}
                </Text>
                <Text
                style={{
                  color: theme.primary,
                  fontSize: 14,
                  fontWeight: "900",
                  marginTop: 7
                }}>

                  {NETWORKS[selectedNetwork]?.name || selectedNetwork}
                </Text>
                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {t("dashboardLastBlock")}: {walletLatestBlock ?? "--"}
                </Text>
              </View>
            </View>

            <View
            style={{
              marginTop: 10,
              backgroundColor: theme.inputBg,
              borderRadius: 9,
              padding: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }}>

              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                    {t("dashboardTotalPortfolio")}
                </Text>
                <Text
                style={{
                  color: theme.textMain,
                  fontSize: 17,
                  fontWeight: "900",
                  marginTop: 3
                }}>

                  ${portfolioUsdValue > 0 ? portfolioUsdValue.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }) : "--"}
                </Text>
                {walletNativeBalance !== null && walletNativeBalance !== undefined ?
                <Text style={{ color: theme.primary, fontSize: 11, fontWeight: "900", marginTop: 4 }}>
                  {Number(walletNativeBalance).toLocaleString("en-US", { maximumFractionDigits: 8 })} {NETWORKS[selectedNetwork]?.symbol || ""}
                </Text> : null}
                {walletTokens.filter((token) => Number(token?.balance || 0) > 0).slice(0, 3).map((token, index) =>
                <Text key={`dashboard-token-${token?.symbol || token?.name || index}`} style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
                  {token?.symbol || token?.name || "TOKEN"}: {Number(token?.balance || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                </Text>)}
              </View>

              <TouchableOpacity
              onPress={() => setActiveModule("portfolioView")}
              style={{
                backgroundColor: theme.primary,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 7
              }}>

                <Text
                style={{
                  color: "#FFF",
                  fontSize: 8,
                  fontWeight: "900"
                }}>

                  {t("dashboardOpenPortfolio")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* HIZLI CÜZDAN GÜVENLİK TARAMASI */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10
            }}>

              <View>
                <Text
                style={{
                  color: theme.textMain,
                  fontSize: 14,
                  fontWeight: "900"
                }}>

                  {t("dashboardQuickScan")}
                </Text>
                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {t("dashboardQuickScanDescription")}
                </Text>
              </View>

              <Text
              style={{
                color: theme.primary,
                fontSize: 8,
                fontWeight: "900"
              }}>

                {t("dashboardLiveScan")}
              </Text>
            </View>

            <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 9 }}>

              {Object.keys(NETWORKS).map((key) => {
              const net = NETWORKS[key];
              const selected = selectedNetwork === key;

              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSelectedNetwork(key)}
                  style={{
                    minWidth: 70,
                    paddingHorizontal: 9,
                    paddingVertical: 7,
                    marginRight: 6,
                    borderRadius: 8,
                    backgroundColor: selected ?
                    theme.primary :
                    theme.inputBg,
                    borderWidth: 1,
                    borderColor: selected ?
                    theme.primary :
                    theme.borderCol
                  }}>

                    <Text
                    style={{
                      color: selected ? "#FFF" : theme.textMain,
                      fontSize: 9,
                      fontWeight: "900",
                      textAlign: "center"
                    }}>

                      {net.symbol}
                    </Text>
                    <Text
                    style={{
                      color: selected ? "#E2E8F0" : theme.textSub,
                      fontSize: 7,
                      textAlign: "center",
                      marginTop: 2
                    }}>

                      ${liveCryptoPrices[net.symbol] || "0.00"}
                    </Text>
                  </TouchableOpacity>);

            })}
            </ScrollView>

            <Text
            style={{
              color: theme.textSub,
              fontSize: 8,
              fontWeight: "700",
              marginBottom: 4
            }}>

              {t("dashboardWalletAddress")}
            </Text>

            <TextInput
            style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              color: theme.inputTextColor,
              borderColor: theme.borderCol,
              height: 40,
              fontSize: 11,
              marginBottom: 8
            }]
            }
            placeholder={`${NETWORKS[selectedNetwork].name} ${t("dashboardWalletPlaceholder")}`}
            placeholderTextColor="#777"
            value={address}
            onChangeText={setAddress} />

            {queryWarning ?
          <Text
            style={{
              color: "#EF4444",
              fontSize: 9,
              fontWeight: "800",
              marginBottom: 8
            }}>

                {queryWarning}
              </Text> :
          null}

            <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 7
            }}>

              <TouchableOpacity
              onPress={handleAddressCheck}
              style={{
                flex: 2,
                minWidth: 190,
                height: 38,
                backgroundColor: theme.primary,
                borderRadius: 7,
                justifyContent: "center",
                alignItems: "center"
              }}>

                <Text
                style={{
                  color: "#FFF",
                  fontSize: 10,
                  fontWeight: "900"
                }}>

                  {loading ? t("dashboardQuerying") : t("dashboardQueryWallet")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
              onPress={addToWhitelist}
              style={{
                flex: 1,
                minWidth: 105,
                height: 38,
                backgroundColor: theme.inputBg,
                borderColor: "#10B981",
                borderWidth: 1,
                borderRadius: 7,
                justifyContent: "center",
                alignItems: "center"
              }}>

                <Text style={{ color: "#10B981", fontSize: 9, fontWeight: "900" }}>
                  + {t("dashboardWhitelist")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
              onPress={addToBlacklist}
              style={{
                flex: 1,
                minWidth: 105,
                height: 38,
                backgroundColor: theme.inputBg,
                borderColor: "#EF4444",
                borderWidth: 1,
                borderRadius: 7,
                justifyContent: "center",
                alignItems: "center"
              }}>

                <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "900" }}>
                  + {t("dashboardBlacklist")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
              onPress={addToVault}
              style={{
                flex: 1,
                minWidth: 105,
                height: 38,
                backgroundColor: theme.inputBg,
                borderColor: "#8B5CF6",
                borderWidth: 1,
                borderRadius: 7,
                justifyContent: "center",
                alignItems: "center"
              }}>

                <Text style={{ color: "#8B5CF6", fontSize: 9, fontWeight: "900" }}>
                  + {t("dashboardVault")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* AKTİF GÜVENLİK DURUMU */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 9
            }}>

              <View>
                <Text
                style={{
                  color: theme.textMain,
                  fontSize: 14,
                  fontWeight: "900"
                }}>

                  {t("dashboardSecurityStatus")}
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
                  {t("dashboardSecurityDescription")}
                </Text>
              </View>

              <TouchableOpacity
              onPress={() => setActiveModule("notificationsView")}>

                <Text
                style={{
                  color: theme.primary,
                  fontSize: 8,
                  fontWeight: "900"
                }}>

                   {t("dashboardSecurityLog")}
                </Text>
              </TouchableOpacity>
            {/* V25-K2-UNREAD-BADGE */}
            {centralUnreadCount > 0 ?
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#EF4444',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 3
              }}>

                <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 7,
                  fontWeight: 'bold'
                }}>

                  {centralUnreadCount > 99 ?
                '99+' :
                centralUnreadCount}
                </Text>
              </View> :
            null}
            </View>

            <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 7
            }}>

              <View
              style={{
                flex: 1,
                minWidth: 145,
                backgroundColor: theme.inputBg,
                padding: 10,
                borderRadius: 8
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardSafeAddresses")}
                </Text>
                <Text
                style={{
                  color: "#10B981",
                  fontSize: 17,
                  fontWeight: "900",
                  marginTop: 3
                }}>

                  {whitelist.length}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 145,
                backgroundColor: theme.inputBg,
                padding: 10,
                borderRadius: 8
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardBlockedAddresses")}
                </Text>
                <Text
                style={{
                  color: "#EF4444",
                  fontSize: 17,
                  fontWeight: "900",
                  marginTop: 3
                }}>

                  {blacklist.length}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 145,
                backgroundColor: theme.inputBg,
                padding: 10,
                borderRadius: 8
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardOpenSecurityAlerts")}
                </Text>
                <Text
                style={{
                  color: vaultNotifications.length > 0 ?
                  "#F59E0B" :
                  "#10B981",
                  fontSize: 17,
                  fontWeight: "900",
                  marginTop: 3
                }}>

                  {vaultNotifications.length}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                minWidth: 145,
                backgroundColor: theme.inputBg,
                padding: 10,
                borderRadius: 8
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardRevokeRecords")}
                </Text>
                <Text
                style={{
                  color: revokeList.length > 0 ?
                  "#F59E0B" :
                  "#10B981",
                  fontSize: 17,
                  fontWeight: "900",
                  marginTop: 3
                }}>

                  {revokeList.length}
                </Text>
              </View>
            </View>
          </View>

          {/* GÜVENLİK MERKEZİ */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <Text
            style={{
              color: theme.textMain,
              fontSize: 14,
              fontWeight: "900"
            }}>

              {t("dashboardSecurityCenter")}
            </Text>
            <Text
            style={{
              color: theme.textSub,
              fontSize: 8,
              marginTop: 3,
              marginBottom: 10
            }}>

              {t("dashboardSecurityCenterDescription")}
            </Text>

            <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8
            }}>

              {[
            [t("dashboardTransferShield"), t("dashboardAnalyzeOutgoing"), "outboundShieldView", t("dashboardAvailable")],
            [t("dashboardAiBehavior"), t("dashboardAnalyzeWalletBehavior"), "behavioralView", t("dashboardAvailable")],
            [t("dashboardSmartContract"), t("dashboardInspectContractRisk"), "smartContractView", t("dashboardAvailable")],
            [t("dashboardRevokeCenter"), t("dashboardCheckTokenPermissions"), "revokeView", t("dashboardAvailable")]].
            map((item, index) =>
            <TouchableOpacity
              key={index}
              onPress={() => setActiveModule(item[2])}
              activeOpacity={0.82}
              style={{
                flex: 1,
                minWidth: 185,
                backgroundColor: theme.inputBg,
                borderColor: theme.borderCol,
                borderWidth: 1,
                borderRadius: 9,
                padding: 11
              }}>

                  <Text
                style={{
                  color: theme.textMain,
                  fontSize: 11,
                  fontWeight: "900"
                }}>

                    {item[0]}
                  </Text>
                  <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                    {item[1]}
                  </Text>
                  <Text
                style={{
                  color: theme.primary,
                  fontSize: 7,
                  fontWeight: "900",
                  marginTop: 9
                }}>

                    {item[3]}
                  </Text>
                </TouchableOpacity>
            )}
            </View>
          </View>

          {/* CÜZDAN KORUMA */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              {t("dashboardWalletProtection")}
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              {t("dashboardWalletProtectionDescription")}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
            [t("dashboardSafeAddressesTitle"), `${whitelist.length} ${t("dashboardRecordLower")}`, "whitelistView", t("dashboardAvailable")],
            [t("dashboardBlockedAddressesTitle"), `${blacklist.length} ${t("dashboardRecordLower")}`, "blacklistView", t("dashboardAvailable")],
            [t("dashboardVaultAssets"), `${vault.length}/10 ${t("dashboardMonitored")}`, "vaultView", t("dashboardAvailable")],
            ["Guardian", t("dashboardSecurityCircle"), "guardianView", t("dashboardAvailable")]].
            map((item, index) =>
            <TouchableOpacity
              key={index}
              onPress={() => setActiveModule(item[2])}
              style={{
                flex: 1,
                minWidth: 185,
                backgroundColor: theme.inputBg,
                borderColor: theme.borderCol,
                borderWidth: 1,
                borderRadius: 9,
                padding: 11
              }}>

                  <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900" }}>
                    {item[0]}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>
                    {item[1]}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 7, fontWeight: "900", marginTop: 9 }}>
                    {item[3]}
                  </Text>
                </TouchableOpacity>
            )}
            </View>
          </View>

          {/* Production: planned/non-live intelligence cards are hidden until real data integrations are ready. */}

          {/* VARLIK VE FİNANS */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              {t("dashboardAssetsFinance")}
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              {t("dashboardAssetsFinanceDescription")}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
            [t("dashboardPortfolio"), t("dashboardViewVaultAssets"), "portfolioView"],
            [t("dashboardPriceAlert"), t("dashboardTrackTargetPrices"), "priceAlertsView"]].
            map((item, index) =>
            <TouchableOpacity
              key={index}
              onPress={() => setActiveModule(item[2])}
              style={{
                flex: 1,
                minWidth: 185,
                backgroundColor: theme.inputBg,
                borderColor: theme.borderCol,
                borderWidth: 1,
                borderRadius: 9,
                padding: 11
              }}>

                  <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900" }}>
                    {item[0]}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>
                    {item[1]}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 7, fontWeight: "900", marginTop: 9 }}>
                    {t("dashboardOpenModule")}
                  </Text>
                </TouchableOpacity>
            )}
            </View>
          </View>

          {/* ACİL GÜVENLİK */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: "#7F1D1D",
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              {t("dashboardEmergencySecurity")}
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              {t("dashboardEmergencySecurityDescription")}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
            ["Guardian", t("dashboardSecurityCircle"), "guardianView", t("dashboardAvailable")]].
            map((item, index) =>
            <TouchableOpacity
              key={index}
              onPress={() => setActiveModule(item[2])}
              style={{
                flex: 1,
                minWidth: 185,
                backgroundColor: theme.inputBg,
                borderColor: "#7F1D1D",
                borderWidth: 1,
                borderRadius: 9,
                padding: 11
              }}>

                  <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900" }}>
                    {item[0]}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>
                    {item[1]}
                  </Text>
                  <Text style={{ color: "#F59E0B", fontSize: 7, fontWeight: "900", marginTop: 9 }}>
                    {item[3]}
                  </Text>
                </TouchableOpacity>
            )}
            </View>
          </View>

          {/* SON İŞLEMLER */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.borderCol,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 9
            }}>

              <View>
                <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
                  {t("dashboardRecentTransactions")}
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
                  {t("dashboardRecentTransactionsDescription")}
                </Text>
              </View>

              <Text style={{ color: theme.primary, fontSize: 8, fontWeight: "900" }}>
                {transactionHistory.length} {t("dashboardRecordsUpper")}
              </Text>
            </View>

            {transactionHistory.length === 0 ?
          <View
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: 9,
              padding: 18,
              alignItems: "center"
            }}>

                <Text style={{ color: theme.textSub, fontSize: 9 }}>
                  {t("dashboardNoTransactions")}
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 4 }}>
                  {t("dashboardTransactionsWillAppear")}
                </Text>
              </View> :

          transactionHistory.slice(0, 6).map((item, index) =>
          <View
            key={`${item.txid || index}-${index}`}
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: 8,
              padding: 10,
              marginBottom: 6,
              borderWidth: 1,
              borderColor: item.scamMatched ?
              "#EF4444" :
              theme.borderCol
            }}>

                  <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}>

                    <Text
                style={{
                  color: theme.textMain,
                  fontSize: 10,
                  fontWeight: "900"
                }}>

                      {item.type || t("dashboardTransaction")}
                    </Text>

                    <Text
                style={{
                  color: item.scamMatched ? "#EF4444" : "#10B981",
                  fontSize: 8,
                  fontWeight: "900"
                }}>

                      {item.scamMatched ? t("dashboardRisky") : t("dashboardReviewed")}
                    </Text>
                  </View>

                  <Text
              style={{
                color: theme.textSub,
                fontSize: 8,
                marginTop: 4
              }}
              numberOfLines={1}>

                    {item.amount || "--"}
                  </Text>

                  <Text
              style={{
                color: theme.textSub,
                fontSize: 7,
                marginTop: 3
              }}
              numberOfLines={1}>

                    TxID: {item.txid || "--"}
                  </Text>
                </View>
          )
          }
          </View>

          {/* VIP */}
          <View
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.primary,
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12
          }}>

            <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }}>

              <View style={{ flex: 1 }}>
                <Text
                style={{
                  color: theme.textMain,
                  fontSize: 14,
                  fontWeight: "900"
                }}>

                  Safe Sentinel Pro VIP
                </Text>

                <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}>

                  {t("dashboardVipDescription")}
                </Text>
              </View>

              <Text
              style={{
                color: "#10B981",
                fontSize: 8,
                fontWeight: "900"
              }}>

                {userStatus === "vip" ? t("dashboardVipActive") : t("dashboardStandard")}
              </Text>
            </View>

            <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 10,
              marginBottom: 9
            }}>

              <View
              style={{
                flex: 1,
                backgroundColor: theme.inputBg,
                borderRadius: 8,
                padding: 9
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardMonthly")}
                </Text>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900", marginTop: 2 }}>
                  {IS_PLAY_STORE_BUILD ? (selectedLanguage === 'tr' ? 'Yakında' : 'Coming soon') : `${VIP_MONTHLY_USDT} USDT`}
                </Text>
              </View>

              <View
              style={{
                flex: 1,
                backgroundColor: theme.inputBg,
                borderRadius: 8,
                padding: 9
              }}>

                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  {t("dashboardYearly")}
                </Text>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900", marginTop: 2 }}>
                  {IS_PLAY_STORE_BUILD ? (selectedLanguage === 'tr' ? 'Yakında' : 'Coming soon') : `${VIP_YEARLY_USDT} USDT`}
                </Text>
              </View>
            </View>

            <TouchableOpacity
            onPress={() => setActiveModule("vipView")}
            style={{
              backgroundColor: theme.primary,
              height: 38,
              borderRadius: 7,
              justifyContent: "center",
              alignItems: "center"
            }}>

              <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "900" }}>
                {t("dashboardVipMembershipPayment")}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      }
    </SafeAreaView>);

}

const DASHBOARD_TOOL_GROUPS = [
{
  id: "security",
  title: "GÜVENLİK MERKEZİ",
  subtitle: "Kritik güvenlik kontrolleri",
  tools: [
  {
    title: "Transfer Kalkanı",
    subtitle: "Giden işlemleri kontrol et",
    action: "ANALİZ ET",
    mod: "outboundShieldView",
    icon: ""
  },
  {
    title: "Phishing Kalkanı",
    subtitle: "Şüpheli bağlantıları tara",
    action: "TARA",
    mod: "phishingView",
    icon: ""
  },
  {
    title: "Davranış Analizi",
    subtitle: "Cüzdan davranışını analiz et",
    action: "ANALİZ ET",
    mod: "behavioralView",
    icon: "🧠"
  },
  {
    title: "Revoke Merkezi",
    subtitle: "Token izinlerini kontrol et",
    action: "KONTROL ET",
    mod: "revokeView",
    icon: ""
  },
  {
    title: "Akıllı Sözleşme",
    subtitle: "Kontrat risklerini analiz et",
    action: "İNCELE",
    mod: "smartContractView",
    icon: ""
  }]

},
{
  id: "wallet",
  title: "CÜZDAN KORUMA",
  subtitle: "Adres ve kasa güvenliği",
  tools: [
  {
    title: "Whitelist",
    subtitle: "Güvenilir adresleri yönet",
    action: "YÖNET",
    mod: "whitelistView",
    label: "WHITELIST",
    dynamic: "whitelist"
  },
  {
    title: "Blacklist",
    subtitle: "Riskli adresleri yönet",
    action: "YÖNET",
    mod: "blacklistView",
    label: "BLACKLIST",
    dynamic: "blacklist"
  },
  {
    title: "Kasa Varlıkları",
    subtitle: "İzlenen cüzdanları yönet",
    action: "YÖNET",
    mod: "vaultView",
    label: "VAULT",
    dynamic: "vault"
  }]

},
{
  id: "advanced",
  title: "İSTİHBARAT & FİNANS",
  subtitle: "İzleme, analiz ve varlık araçları",
  tools: [

  {
    title: "Portföy",
    subtitle: "Taranan cüzdan varlıklarını görüntüle",
    mod: "portfolioView",
    icon: ""
  },
  {
    title: "Ağ İşlem Ücretleri",
    subtitle: "Ağ ücretlerini takip et",
    mod: "gasOptView",
    icon: "⛽"
  },
  {
    title: "Fiyat Alarmı",
    subtitle: "Hedef fiyatları takip et",
    mod: "priceAlertsView",
    icon: ""
  }]

}];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16
  },
  dashboardContainer: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 1120 : "100%",
    alignSelf: "center"
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12
  },
  button: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 25,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold'
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  prefScrollContainer: {
    padding: 12
  },
  prefDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 12,
    lineHeight: 16
  },
  prefCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8
  },
  prefCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontWeight: 'bold'
  },
  backButton: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  backButtonText: {
    fontWeight: 'bold'
  },

  prefCardTitle: {
    fontSize: 12,
    fontWeight: 'bold'
  },

  prefCardSub: {
    fontSize: 10,
    marginTop: 2
  } });

export default function SafeSentinelApp() {
  return (
    <SafeAreaProvider>
      <AppKitProvider instance={appKit}>
        <App />
        <AppKit />
      </AppKitProvider>
    </SafeAreaProvider>);

}
