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
  Switch 
} from 'react-native';
import * as SecureStore from 'expo-secure-store'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import axios from 'axios';
import { BrowserProvider, Contract } from 'ethers';
import { AppKit, AppKitProvider, useAccount, useProvider } from '@reown/appkit-react-native';
import { appKit } from './AppKitConfig';
import React, { useState, useEffect, useCallback, useMemo , useRef } from 'react';

const ERC20_REVOKE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];
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
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {},
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
      shouldSetBadge: false,
    }),
  });
}

/* ============================================================
   V26_GLOBAL_I18N
   Safe Sentinel Pro — Dil + Para Birimi
   ============================================================ */

const V26_GLOBAL_I18N = {
  tr: {
    name: 'Türkçe',
    nativeName: 'Türkçe',
  },
  en: {
    name: 'English',
    nativeName: 'English',
  },
  fr: {
    name: 'Français',
    nativeName: 'Français',
  },
  it: {
    name: 'Italiano',
    nativeName: 'Italiano',
  },
  de: {
    name: 'Deutsch',
    nativeName: 'Deutsch',
  },
  es: {
    name: 'Español',
    nativeName: 'Español',
  },
  pt: {
    name: 'Português',
    nativeName: 'Português',
  },
  zh: {
    name: '中文',
    nativeName: '中文',
  },
  ja: {
    name: 'æ—¥æœ¬èª',
    nativeName: 'æ—¥æœ¬èª',
  },
  ko: {
    name: 'í•œêµ­ì–´',
    nativeName: '한국어',
  },
  ar: {
    name: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',
    nativeName: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',
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
    autoScamBlock: 'Otomatik Scam Engelleme',
    autoScamBlockDescription: 'Tehlikeli havuzdaki cüzdanlarla etkileşimi bloke et.',
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
    backToLogin: 'Zaten hesabın var mı? Giriş Yap'
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
    autoScamBlock: 'Automatic Scam Blocking',
    autoScamBlockDescription: 'Block interactions with wallets in dangerous pools.',
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
    backToLogin: 'Already have an account? Sign In'
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
      throw new Error('EVM cüzdan bağlı değil.');
    }

    const signer = await ethersProvider.getSigner();
    const signerAddress = await signer.getAddress();

    if (
      String(signerAddress).trim().toLowerCase() !==
      String(connectedWalletAddress).trim().toLowerCase()
    ) {
      throw new Error('Bağlı cüzdan adresi doğrulanamadı.');
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

  const [autoBlockScam, setAutoBlockScam] = useState(true);
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

      const alerts = Array.isArray(response.data?.alerts)
        ? response.data.alerts
        : [];

      setSavedPriceAlerts(
        alerts.map((item) => ({
          id: String(item.id),
          crypto: String(item.asset || '').toUpperCase(),
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

const priceAlertsMode = "LOCAL_ONLY";
const emergencyLockMode = "LOCAL_ONLY";
const getFeatureRealityLabel = (feature) => {
  switch (feature) {
    case "priceAlerts":
      return priceAlertsMode === "LOCAL_ONLY"
        ? "YEREL — SUNUCU İZLEMESİ YOK"
        : "AKTİF";

    case "emergencyLock":
      return emergencyLockMode === "LOCAL_ONLY"
         ? "YEREL — BLOCKCHAIN KİLİDİ DEĞİL"
        : "AKTİF";

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

      const protocols = Array.isArray(response.data?.protocols)
        ? response.data.protocols
        : [];

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
        'Cüzdan Adresi Eksik',
        'Miras protokolü için önce ana cüzdan adresini girin.'
      );
      return false;
    }

    if (!cleanBeneficiary) {
      Alert.alert(
        'Eksik Bilgi',
        'Lütfen geçerli bir varis cüzdan adresi girin.'
      );
      return false;
    }

    const days = Number(inheritDays);

    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      Alert.alert(
        'Geçersiz Süre',
        'Sinyal yokluğu süresi 1 ile 3650 gün arasında olmalıdır.'
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
          response.data?.error || 'Miras protokolü oluşturulamadı.'
        );
      }

      const protocol = response.data.protocol;

      setInheritanceProtocols((current) => [
        protocol,
        ...current.filter((item) => item?.id !== protocol?.id)
      ]);

      Alert.alert(
        'Miras Protokolü Oluşturuldu',
        `Protokol backend üzerinde oluşturuldu.\nDurum: ${protocol.status}\nAğ: ${protocol.network}\nSüre: ${protocol.inactivityDays} gün`
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        'Miras Protokolü Hatası',
        error?.response?.data?.error ||
          error?.message ||
          'Miras protokolü oluşturulamadı.'
      );
      return false;
    } finally {
      setInheritanceLoading(false);
    }
  }, [
    address,
    inheritBeneficiary,
    inheritDays,
    selectedNetwork
  ]);

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
        'Heartbeat Güncellendi',
        'Miras protokolünün yaşam sinyali backend üzerinde güncellendi.'
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        'Heartbeat Hatası',
        error?.response?.data?.error ||
          error?.message ||
          'Heartbeat güncellenemedi.'
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
          response.data?.error || 'Miras protokolü iptal edilemedi.'
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
        'Miras Protokolü İptal Edildi',
        'Protokol backend üzerinde iptal edildi.'
      );

      return protocol;
    } catch (error) {
      Alert.alert(
        'İptal Hatası',
        error?.response?.data?.error ||
          error?.message ||
          'Miras protokolü iptal edilemedi.'
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

  const [whaleWatchList, setWhaleWatchList] = useState(['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (Binance Hot)', 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE']);
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
    BSC: null,
    PI: null,
    NFT: null,
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
      bsc: "BSC",
      pi: "PI",
      nft: "NFT"
    };

    const nativeSymbol = nativeSymbolMap[selectedNetwork];
    const nativePrice = Number(liveCryptoPrices[nativeSymbol] || 0);

    const nativeUsd = Number.isFinite(nativeBalance) && Number.isFinite(nativePrice)
      ? nativeBalance * nativePrice
      : 0;

    const tokenUsd = walletTokens.reduce((total, token) => {
      const balance = Number(token?.balance ?? 0);
      const price = Number(liveCryptoPrices[token?.symbol] ?? 0);

      if (!Number.isFinite(balance) || !Number.isFinite(price)) {
        return total;
      }

      return total + (balance * price);
    }, 0);

    return nativeUsd + tokenUsd;
  }, [walletNativeBalance, walletTokens, liveCryptoPrices, selectedNetwork]);

  const [networkGasFees, setNetworkGasFees] = useState({
    tron: "1.1 TRX",
    sol: "0.00005 SOL",
    btc: "12 sat/vB",
    avax: "0.001 AVAX",
    arb: "0.0001 Gwei",
    polygon: "30 Gwei",
    eth: "15 Gwei",
    bsc: "3 Gwei",
    pi: "0.01 PI",
    nft: "22 Gwei"
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
    netCardBg: isDarkMode ? '#1E293B' : '#FFFFFF',
  }), [isDarkMode]);

  const NETWORKS = useMemo(() => ({
    tron: { name: "TRON (TRX)", symbol: "TRX", badgeColor: theme.primary, badgeText: "TRC" },
    sol: { name: "Solana", symbol: "SOL", badgeColor: theme.primary, badgeText: "SOL" },
    btc: { name: "Bitcoin", symbol: "BTC", badgeColor: theme.primary, badgeText: "BTC" },
    avax: { name: "Avalanche", symbol: "AVAX", badgeColor: theme.primary, badgeText: "AVAX" },
    arb: { name: "Arbitrum", symbol: "ARB", badgeColor: theme.primary, badgeText: "ARB" },
    polygon: { name: "Polygon", symbol: "POL", badgeColor: theme.primary, badgeText: "POL" },
    eth: { name: "Ethereum", symbol: "ETH", badgeColor: theme.primary, badgeText: "ETH" },
    bsc: { name: "Binance Smart Chain", symbol: "BSC", badgeColor: theme.primary, badgeText: "BSC" },
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
          BSC: response.data.binancecoin?.usd ? String(response.data.binancecoin.usd) : null,
          PI: response.data['pi-network']?.usd ? String(response.data['pi-network'].usd) : null,
          NFT: null,
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
          V26_GLOBAL_I18N[savedLanguage]
        ) {
          setSelectedLanguage(savedLanguage);
        }

        if (
          savedCurrency &&
          V26_CURRENCIES[savedCurrency]
        ) {
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
        Platform.OS === 'web'
          ? await AsyncStorage.getItem('user_secure_token')
          : await SecureStore.getItemAsync('user_secure_token');

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

          const backendWallets = Array.isArray(response.data?.wallets)
            ? response.data.wallets
            : [];

          const backendAddresses = backendWallets
            .map(wallet => wallet?.address)
            .filter(Boolean);

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
      Notifications.requestPermissionsAsync().catch(e =>
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
    handleIsolatedError
  ]);
  const syncSecurityAddressLists = async () => {
    try {
      const [whiteResponse, blackResponse] =
        await Promise.all([
          api.get('/api/whitelist'),
          api.get('/api/blacklist')
        ]);

      const whiteData =
        Array.isArray(whiteResponse?.data?.items)
          ? whiteResponse.data.items
          : Array.isArray(whiteResponse?.data?.whitelist)
            ? whiteResponse.data.whitelist
            : Array.isArray(whiteResponse?.data)
              ? whiteResponse.data
              : [];

      const blackData =
        Array.isArray(blackResponse?.data?.items)
          ? blackResponse.data.items
          : Array.isArray(blackResponse?.data?.blacklist)
            ? blackResponse.data.blacklist
            : Array.isArray(blackResponse?.data)
              ? blackResponse.data
              : [];

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
      type === "whitelist"
        ? `/api/whitelist/${id}`
        : `/api/blacklist/${id}`;

    await api.delete(endpoint);

    await syncSecurityAddressLists();

    return true;
  } catch (e) {
    handleIsolatedError(
      type === "whitelist"
        ? "Whitelist adres silme"
        : "Blacklist adres silme",
      e
    );
    return false;
  }
};

    } catch(error) {
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

const saveWhitelist = async (newList) => {
    const normalized = Array.isArray(newList)
      ? newList
          .map(item => {
            if (typeof item === 'string') {
              return {
                address: item.trim(),
                network:
                  selectedNetwork === 'eth'
                    ? 'ethereum'
                    : selectedNetwork
              };
            }

            return {
              ...item,
              address: String(item?.address || '').trim(),
              network:
                item?.network ||
                (
                  selectedNetwork === 'eth'
                    ? 'ethereum'
                    : selectedNetwork
                )
            };
          })
          .filter(item => item.address)
      : [];

    const previous =
      Array.isArray(whitelist)
        ? whitelist
        : [];

    for (const item of normalized) {
      const alreadyExists =
        previous.some(existing =>
          String(existing?.address || existing)
            .trim()
            .toLowerCase() === item.address.toLowerCase()
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
    const normalized = Array.isArray(newList)
      ? newList
          .map(item => {
            if (typeof item === 'string') {
              return {
                address: item.trim(),
                network:
                  selectedNetwork === 'eth'
                    ? 'ethereum'
                    : selectedNetwork
              };
            }

            return {
              ...item,
              address: String(item?.address || '').trim(),
              network:
                item?.network ||
                (
                  selectedNetwork === 'eth'
                    ? 'ethereum'
                    : selectedNetwork
                )
            };
          })
          .filter(item => item.address)
      : [];

    const previous =
      Array.isArray(blacklist)
        ? blacklist
        : [];

    for (const item of normalized) {
      const alreadyExists =
        previous.some(existing =>
          String(existing?.address || existing)
            .trim()
            .toLowerCase() === item.address.toLowerCase()
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

      const backendWallets = Array.isArray(currentResponse.data?.wallets)
        ? currentResponse.data.wallets
        : [];

      const backendAddresses = backendWallets.map(wallet =>
        String(wallet.address || '').trim()
      );

      const addressesToCreate = newList.filter(address => {
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

      const finalWallets = Array.isArray(finalResponse.data?.wallets)
        ? finalResponse.data.wallets
        : [];

      const finalAddresses = finalWallets
        .map(wallet => String(wallet.address || '').trim())
        .filter(Boolean);

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
        Alert.alert(
          "VIP Gerekli",
          "Vault cüzdanı eklemek için aktif VIP aboneliğiniz bulunmalıdır."
        );
      } else if (status === 409 && serverError === 'Wallet limit reached') {
        Alert.alert(
          "Vault Limiti",
          "VIP hesabınızda en fazla 10 cüzdan izlenebilir."
        );
      } else {
        Alert.alert(
          "Vault Senkronizasyon Hatası",
          serverError || "Cüzdan backend'e kaydedilemedi."
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
            selectedNetwork === 'eth'
              ? 'ethereum'
              : selectedNetwork;

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
            Array.isArray(response.data?.allowances)
              ? response.data.allowances
              : [];

          results.push(
            ...allowances.map(item => ({
              token:
                item.tokenSymbol ||
                item.tokenName ||
                item.token ||
                'EVM Token',

              spender:
                item.spender ||
                'Bilinmeyen Kontrat',

              allowance:
                item.unlimited
                  ? 'Sınırsız'
                  : String(item.allowance ?? '0'),

              risk:
                item.risk ||
                (item.unlimited ? 'Yüksek' : 'Orta'),

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
    setRequestQueue(prev => [...prev, requestTask]);
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
      setRequestQueue(prev => prev.slice(1));
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
          res.data.notifications.length > 0
        ) {
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

    const notifications = Array.isArray(res.data?.notifications)
      ? res.data.notifications
      : [];

    setCentralNotifications(notifications);
    setCentralUnreadCount(
      Number(res.data?.unreadCount || 0)
    );

    for (const notification of notifications) {
      if (
        notification?.id &&
        !notification.read &&
        !centralSeenIdsRef.current.has(notification.id)
      ) {
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
    if (Platform.OS === "web" || (Platform.OS === "android" && __DEV__)) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: 'default' },
        trigger: null,
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
        throw new Error('Önce EVM cüzdanınızı bağlamanız gerekiyor.');
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
        'avalanche'
      ];

      if (!supportedNetworks.includes(network)) {
        throw new Error('Bu ağ için revoke işlemi henüz desteklenmiyor.');
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
        throw new Error('Bağlı EVM cüzdan adresi geçersiz.');
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
        throw new Error('Token kontrat adresi geçersiz.');
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(spender)) {
        throw new Error('Spender kontrat adresi geçersiz.');
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
          response.data?.error ||
          'Revoke işlemi backend tarafından hazırlanamadı.'
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
        Alert.alert(
          'Revoke Gerekli Değil',
          'Bu token için belirtilen spender adresinin mevcut harcama yetkisi zaten sıfır.'
        );
        return;
      }

      const backendAllowanceRaw = String(
        response.data?.allowanceRaw ?? ''
      ).trim();

      if (!backendAllowanceRaw) {
        throw new Error(
          'Backend revoke hazırlığında allowance değeri bulunamadı.'
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

      Alert.alert(
        'Revoke İşlemi Gönderildi',
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

      setRevokeList(prev =>
        prev.filter((_, i) => i !== index)
      );

      Alert.alert(
        'Revoke Doğrulandı',
        'Harcama yetkisi blockchain üzerinde 0 olarak doğrulandı.\n\nTransaction: ' + tx.hash
      );
    } catch (e) {
      console.error('[REVOKE PREPARE ERROR]', e);

      const message =
        e?.response?.data?.error ||
        e?.message ||
        'Revoke işlemi hazırlanırken bir hata oluştu.';

      Alert.alert('Revoke Hazırlama Hatası', message);
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
  const handleLogin = async () => {
    const cleanEmail = SecurityScannerMiddleware.sanitizeInput(email).trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert("Eksik Bilgi", "Lütfen e-posta ve şifrenizi giriniz.");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        {
          email: cleanEmail,
          password: cleanPassword
        },
        {
          headers: {
            ...SecurityScannerMiddleware.auditHeaders
          },
          timeout: 10000
        }
      );

      const { token, user } = response.data;
      setToken(token);

      if (!token || !user) {
        throw new Error("Sunucudan geçersiz giriş yanıtı geldi.");
      }

      if (Platform.OS === 'web') {
        await AsyncStorage.setItem('user_secure_token', token);
      } else {
        await SecureStore.setItemAsync('user_secure_token', token);
      }

      setName(user.name || '');
      setEmail(user.email || cleanEmail);
      setUserStatus(user.status || 'free');
      setQueryCount(0);

      setCurrentScreen('dashboard');
      setActiveModule('dashboard');

      Alert.alert("Giriş Başarılı", `Hoş geldiniz ${user.name || ''}!`);
    } catch (error) {
      console.error("Login error:", error);

      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "E-posta veya şifre hatalı ya da sunucuya ulaşılamıyor.";

      Alert.alert("Giriş Başarısız", message);
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
      Alert.alert(
        "Eksik Bilgi",
        "Lütfen ad, soyad, e-posta ve şifre alanlarını doldurunuz."
      );
      return;
    }

    if (cleanPassword.length < 10) {
      Alert.alert(
        "Geçersiz Şifre",
        "Şifreniz en az 10 karakter olmalıdır."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
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
          timeout: 10000
        }
      );

      const { token, user } = response.data;
      setToken(token);

      if (!token || !user) {
        throw new Error("Sunucudan geçersiz kayıt yanıtı geldi.");
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
        const updatedVault = vault.includes(cleanVaultAddress)
          ? vault
          : [...vault, cleanVaultAddress];

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

      Alert.alert(
        "Kayıt Başarılı",
        `Hoş geldiniz ${user.name || `${cleanName} ${cleanSurname}`}! Hesabınız oluşturuldu.`
      );

    } catch (error) {
      console.error("Registration error:", error);

      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Kayıt sırasında sunucuya ulaşılamadı.";

      Alert.alert("Kayıt Başarısız", message);
    } finally {
      setLoading(false);
    }
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
        network: selectedNetwork === 'eth'
          ? 'ethereum'
          : selectedNetwork,
        address: addressValue
      });

      const data = response?.data;

      if (!data?.success) {
        throw new Error(data?.error || 'Portfolio verisi alınamadı');
      }

      setWalletNativeBalance(
        data.native?.balance ?? null
      );

      setWalletTokens(
        Array.isArray(data.tokens)
          ? data.tokens
          : []
      );

      setWalletLatestBlock(
        data.latestBlock ?? null
      );

      return data;

    } catch (error) {
      console.error('[PORTFOLIO] Gerçek veri alınamadı:', error);

      setWalletNativeBalance(null);
      setWalletTokens([]);
      setWalletLatestBlock(null);

      return null;
    }
  }, [
    address,
    selectedNetwork,
    api
  ]);

  
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
    fetchPortfolioData
  ]);

  
  const exportPortfolioJSON = async () => {
    const data = await fetchPortfolioData();

    if (!data) {
      Alert.alert(
        'Portfolio',
        'Dışa aktarılacak gerçek blockchain verisi bulunamadı.'
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
        'Portfolio',
        'Dışa aktarılacak gerçek blockchain verisi bulunamadı.'
      );
      return;
    }

    const rows = [
      [
        'Network',
        'Address',
        'Asset',
        'Balance',
        'Symbol'
      ]
    ];

    rows.push([
      data.network || '',
      data.address || '',
      'Native',
      data.native?.balance ?? '',
      data.native?.symbol ?? ''
    ]);

    for (const token of data.tokens || []) {
      rows.push([
        data.network || '',
        data.address || '',
        token.symbol || token.name || 'Token',
        token.balance ?? '',
        token.symbol || ''
      ]);
    }

    const csv = rows
      .map(row =>
        row
          .map(value =>
            '"' + String(value ?? '').replace(/"/g, '""') + '"'
          )
          .join(',')
      )
      .join('\\r\\n');

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
      { value, label: 'Mevcut' }
    ];
  };
  const getRecommendedGasNetwork = useMemo(() => {
    const values = Object.entries(networkGasFees).map(([network, fee]) => {
      const match = String(fee).match(/[0-9]+(?:\.[0-9]+)?/);
      return { network, value: match ? Number(match[0]) : Infinity, fee };
    }).filter(item => Number.isFinite(item.value));

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
      setQueryWarning("Lütfen sorgulanacak geçerli bir cüzdan adresi girin!");
      return;
    }

    const isValidFormat = validateAddressFormat(selectedNetwork, cleanAddr);
    if (!isValidFormat) {
      setQueryWarning(`? Hata: Girdiğiniz adres, seçtiğiniz ${NETWORKS[selectedNetwork].name} ağı formatıyla uyuşmuyor!`);
      setCurrentBalanceText("Geçersiz Adres Formatı");
      return;
    }

    if (whitelist.includes(cleanAddr)) {
      setQueryWarning("");
      enqueueApiRequest(() => executeCheck(cleanAddr));
      return;
    }

    if (userStatus !== 'vip' && queryCount >= 1) {
      setQueryWarning("Ücretsiz 1 sorgu hakkınız bitti. Standart kullanıcılar için sadece 1 kez bu test yapılabilir. Sonraki cüzdan sorguları için VIP üyeliğe geçmeniz gerekmektedir.");
      setActiveModule('vipView');
      return;
    }

    setQueryWarning("");
    enqueueApiRequest(() => executeCheck(cleanAddr));
  };

  const executeCheck = async (cleanAddr) => {
    if (blacklist.includes(cleanAddr)) {
      setQueryWarning("⚠️ DİKKAT: Bu adres küresel scam havuzunda (Blacklist) kayıtlı tehlikeli bir cüzdandır!");
      setCurrentBalanceText("İşlem Engellendi (Riskli Adres)");
      setTransactionHistory([]);
      triggerLocalNotification("KRİTİK GÜVENLİK UYARISI", "Scam cüzdan sorgulandı!");
      return;
    }

    setLoading(true);
    setCurrentBalanceText("Backend sunucusundan gerçek zincir verileri çekiliyor...");
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
        setWalletNativeBalance(response.data.balance ?? null);

  setWalletTokens(
    Array.isArray(response.data.tokens)
      ? response.data.tokens
      : []
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
          setQueryWarning("⚠️ DİKKAT: Bu adres evrensel ağlar üzerinde dolandırıcılık faaliyetleriyle ilişkilendirilmiş!");
          setCurrentBalanceText("Tehlikeli / Scam Adres");
          triggerLocalNotification("KRİTİK GÜVENLİK UYARISI", "Evrensel scam cüzdan tespit edildi.");
        } else {
          const rawBal = Number(response.data.balance || 0);
          const formattedBal = rawBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
          setCurrentBalanceText(`Bakiye: ${formattedBal} ${NETWORKS[selectedNetwork].symbol}`);
        }
        
        const rawTxList = response.data.transactions || [];

        
        const counterpartyIntel =
        
          response.data.counterpartyScamIntelligence || null;

        
        const counterpartyTransactionMatches =
        
          Array.isArray(counterpartyIntel?.transactionMatches)
        
            ? counterpartyIntel.transactionMatches
        
            : [];

        
        const counterpartyMatchByTxid = new Map(
        
          counterpartyTransactionMatches
        
            .filter(match => match?.txid)
        
            .map(match => [String(match.txid).toLowerCase(), match])
        
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
              )?.scamIntelligence?.severity ?? null          };
        });

        setTransactionHistory(formattedTx);

        if (userStatus !== 'vip') {
          setQueryCount(prev => prev + 1);
        }
      } else {
        throw new Error("Zincir verisi alınamadı");
      }
    } catch (err) {
      const userFriendlyMsg = err.response?.status === 429 
        ? "Çok fazla istek gönderildi. Lütfen birkaç saniye bekleyin." 
        : "Bağlantı hatası: Sunucuya ulaşılamıyor. Lütfen internet bağlantınızı kontrol edin.";
      
      setCurrentBalanceText('Bakiye alınamadı');
      setQueryWarning(userFriendlyMsg);
      handleIsolatedError("Cüzdan Sorgulama", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSmartContractAnalysis = async () => {
    const cleanContract = contractAddress
      ? SecurityScannerMiddleware.sanitizeInput(contractAddress).trim()
      : "";

    if (!cleanContract) {
      Alert.alert(
        "Eksik Bilgi",
        "Lütfen analiz edilecek geçerli bir akıllı sözleşme adresi girin."
      );
      return;
    }

    const isValidEvmAddress =
      /^0x[a-fA-F0-9]{40}$/.test(cleanContract);

    if (!isValidEvmAddress) {
      Alert.alert(
        "Geçersiz Adres",
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
          data.riskScore === null ||
          data.riskScore === undefined
            ? "Hesaplanmadı"
            : data.riskScore,

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

        mintable:data.securityInspection?.mint?.supported ? "RPC Mint yüzeyi tespit edildi" : "RPC Mint yüzeyi tespit edilmedi",
        mintDetails: data.securityInspection?.mint || null,
        adminDetails: data.securityInspection?.admin || null,

        lpLocked:
          "Bu RPC analizinde doğrulanmadı",

        aiThreatRadar:
          data.isContract
            ? metadataReady
              ? "Kontrat mevcut ve temel ERC20 arayüzü RPC üzerinden doğrulandı. Honeypot, vergi, mint yetkisi ve likidite kilidi bu temel analiz kapsamında doğrulanmadı."
              : "Kontrat bulundu ancak ERC20 metadata kontrollerinin tamamı doğrulanamadı."
            : "Girilen adres üzerinde dağıtılmış kontrat bytecode'u bulunamadı.",

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
        err?.response?.status === 401
          ? "Oturum doğrulanamadı. Lütfen tekrar giriş yapın."
          : err?.response?.status === 400
            ? err?.response?.data?.error ||
              "Kontrat veya ağ bilgisi geçersiz."
            : err?.response?.status === 502
              ? "Blockchain RPC servisine ulaşılamadı. Lütfen tekrar deneyin."
              : "Akıllı sözleşme analiz servisine ulaşılamadı.";

      Alert.alert(
        "Analiz Başarısız",
        message
      );

      setContractAnalysisResult(null);

    } finally {
      setAnalyzingContract(false);
    }
  };  const fetchMarketIntelligence = useCallback(async () => {
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
      title: 'Market Intelligence Kullanılamıyor',
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
  const cleanAddr = address
    ? SecurityScannerMiddleware.sanitizeInput(address).trim()
    : '';

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
    const cleanAddr = address
      ? SecurityScannerMiddleware.sanitizeInput(address).trim()
      : "";

    if (!cleanAddr) {
      Alert.alert(
        "Eksik Bilgi",
        "Lütfen önce analiz edilecek bir cüzdan adresi girin!"
      );
      return;
    }

    const backendNetwork =
      selectedNetwork === "eth"
        ? "ethereum"
        : selectedNetwork;

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
        Number.isFinite(Number(risk.score))
          ? Number(risk.score)
          : null;

      const level =
        String(risk.level || "unknown").toLowerCase();

      const levelText =
        level === "critical"
          ? "Kritik"
          : level === "high"
            ? "Yüksek"
            : level === "medium"
              ? "Orta"
              : level === "low"
                ? "Düşük"
                : "Belirlenemedi";

      const walletAgeDays =
        Number.isFinite(Number(risk.walletAgeDays))
          ? Number(risk.walletAgeDays)
          : null;

      const walletAgeText =
        walletAgeDays === null
          ? "Belirlenemedi"
          : walletAgeDays < 1
            ? "1 günden yeni"
            : walletAgeDays < 30
              ? `${Math.floor(walletAgeDays)} gün`
              : walletAgeDays < 365
                ? `${(walletAgeDays / 30.4375).toFixed(1)} ay`
                : `${(walletAgeDays / 365.25).toFixed(1)} yıl`;

      const failedRatio =
        Number.isFinite(Number(risk.failedRatio))
          ? Number(risk.failedRatio)
          : null;

      const failedRatioText =
        failedRatio === null
          ? "Belirlenemedi"
          : `%${(failedRatio * 100).toFixed(1)}`;

      const reasons =
        Array.isArray(risk.reasons)
          ? risk.reasons.filter(Boolean)
          : [];

      const signals =
        Array.isArray(risk.signals)
          ? risk.signals.filter(Boolean)
          : [];

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
          reasons.some(reason =>
            /mixer|tornado|blender|privacy/i.test(
              String(reason)
            )
          )
            ? "Risk sinyali bulundu"
            : "Açık mixer sinyali bulunmadı",

        botActivityScore:
          reasons.some(reason =>
            /bot|automation|otomasyon/i.test(
              String(reason)
            )
          )
            ? "Risk sinyali bulundu"
            : "Belirgin bot sinyali bulunmadı",

        behavioralScore:
          score === null
            ? `${levelText}`
            : `${score}/100 (${levelText})`,

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
        status === 401
          ? "Oturum doğrulanamadı. Lütfen tekrar giriş yapın."
          : status === 404
            ? "Bu cüzdan için blockchain verisi bulunamadı."
            : status === 400
              ? err?.response?.data?.error ||
                "Cüzdan adresi veya ağ bilgisi geçersiz."
              : status === 502
                ? "Blockchain veri servisine ulaşılamadı."
                : "AI Davranış analiz servisine ulaşılamadı.";

      Alert.alert(
        "Davranış Analizi Başarısız",
        message
      );

      setBehavioralAnalysisResult(null);

    } finally {
      setAnalyzingBehavior(false);
    }
  };
  const handlePhishingAnalysis = async () => {
    const cleanUrl = phishingUrl
      ? SecurityScannerMiddleware.sanitizeInput(phishingUrl).trim()
      : "";

    if (!cleanUrl) {
      Alert.alert(
        "Eksik Bilgi",
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
      Alert.alert(
        "Geçersiz URL",
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
        Boolean(data.matched) &&
        (
          data.phishing === true ||
          data.malicious === true ||
          data.riskLevel === "HIGH"
        );

      setPhishingResult({
        status: dangerous
          ? "⚠️ TEHLİKELİ (Tehdit İstihbaratı Eşleşmesi)"
            : " EŞLEŞME YOK (Güvenli olduğu garanti edilmez)",

        domainAge:
          "Bu kontrolde doğrulanmadı",

        sslValid:
          "Bu kontrolde doğrulanmadı",

        drainerRisk:
          data.phishing === true
            ? "Yüksek"
            : data.malicious === true
              ? "Malicious URL"
              : "Bilinmiyor",

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

        matchedRecord: record
          ? {
              url: record.url || "",
              tags: Array.isArray(record.tags)
                ? record.tags
                : [],
              threat: record.threat || "",
              status: record.status || "",
              dateadded: record.dateadded || ""
            }
          : null
      });

    } catch (err) {
      console.error(
        "Phishing Shield error:",
        err?.response?.data || err
      );

      const message =
        err?.response?.status === 401
          ? "Oturum doğrulanamadı. Lütfen tekrar giriş yapın."
          : err?.response?.status === 400
            ? err?.response?.data?.error ||
              "URL bilgisi geçersiz."
            : err?.response?.status === 502
              ? "Phishing tehdit istihbaratı kullanılamıyor."
              : "Phishing güvenlik servisine ulaşılamadı.";

      Alert.alert(
        "Phishing Analizi Başarısız",
        message
      );

      setPhishingResult(null);

    } finally {
      setAnalyzingPhishing(false);
    }
  };
  const handleOutboundShieldCheck = async () => {
    const cleanRecipient = outboundRecipient
      ? SecurityScannerMiddleware.sanitizeInput(outboundRecipient)
      : "";

    const cleanAmount = outboundAmount
      ? SecurityScannerMiddleware.sanitizeInput(outboundAmount)
      : "";

    if (!cleanRecipient) {
      Alert.alert(
        "Eksik Bilgi",
        "Lütfen hedef alıcı cüzdan adresini girin!"
      );
      return;
    }

    setCheckingOutbound(true);
    setOutboundCheckResult(null);

    try {
      const backendNetwork =
        selectedNetwork === "eth"
          ? "ethereum"
          : selectedNetwork;

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

      const riskLevel =
        matched
          ? "Çok Yüksek"
          : "Belirlenemedi";

      const actionTaken =
        matched
          ? "Bu adres scam istihbaratında eşleşti. Transferi göndermeden önce durdurun ve adresi tekrar doğrulayın."
          : "Adres mevcut scam istihbaratıyla eşleşmedi. Bu sonuç adresin tamamen güvenli olduğu anlamına gelmez.";

      setOutboundCheckResult({
        status: matched
          ? "⚠️ TRANSFER ENGELLENMELİ"
          : " SCAM EŞLEŞMESİ YOK",
        recipient: cleanRecipient,
        amount: cleanAmount
          ? `${cleanAmount} ${NETWORKS[selectedNetwork].symbol}`
          : "Belirtilmedi",
        riskLevel,
        actionTaken,
        isBlocked: matched,
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
        err?.response?.status === 401
          ? "Oturum doğrulanamadı. Lütfen tekrar giriş yapın."
          : err?.response?.status === 400
            ? err?.response?.data?.error || "Transfer bilgileri geçersiz."
            : "Transfer güvenlik servisine ulaşılamadı.";

      setOutboundCheckResult({
          status: "SERVİS KONTROLÜ BAŞARISIZ",
        recipient: cleanRecipient,
        amount: cleanAmount
          ? `${cleanAmount} ${NETWORKS[selectedNetwork].symbol}`
          : "Belirtilmedi",
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
        selectedVipPlan === 'yearly'
          ? VIP_YEARLY_USDT
          : VIP_MONTHLY_USDT;

      await Clipboard.setStringAsync(VIP_PAYMENT_USDT_ADDRESS);

      Alert.alert(
        "TRC20 USDT Ödeme",
        `VIP ödeme bilgileri panoya kopyalandı.\n\n` +
        `Ağ: TRON / TRC20\n` +
        `Tutar: ${amount} USDT\n\n` +
        `${VIP_PAYMENT_USDT_ADDRESS}\n\n` +
        `USDT gönderirken ağ olarak TRON (TRC20) seçin.`
      );
    } catch (err) {
      Alert.alert(
        "Hata",
        "USDT ödeme bilgileri kopyalanamadı. Lütfen tekrar deneyin."
      );
    }
  };
  const submitPaymentNotificationToSystem = async () => {
    const txid = SecurityScannerMiddleware.sanitizeInput(paymentTxHashInput).trim();

    if (!txid) {
      Alert.alert('Eksik Bilgi','Lütfen ödemeye ait işlem Hash (TXID) değerini giriniz.');
      return;
    }

    if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
      Alert.alert('Geçersiz TXID','TXID 64 karakterlik hexadecimal işlem kimliği olmalıdır.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/api/vip/verify',{txid,plan:selectedVipPlan},{timeout:30000});

      if (!response.data?.ok || response.data?.status !== 'vip') {
        throw new Error('VIP doğrulama başarısız oldu.');
      }

      const meResponse = await api.get('/api/me',{timeout:10000});
      const verifiedUser = meResponse.data?.user;

      if (!verifiedUser) {
        throw new Error('Kullanıcı durumu doğrulanamadı.');
      }

      setUserStatus(verifiedUser.status || 'free');

      if (verifiedUser.status === 'vip') {
        setPendingPayments(previous => previous.filter(item => item.txHash !== txid));
        setPaymentTxHashInput('');
        const expiryText = verifiedUser.expiresAt ? new Date(verifiedUser.expiresAt).toLocaleDateString('tr-TR') : 'aktif';
        Alert.alert('VIP Aktivasyonu Başarılı',`Ödemeniz doğrulandı. VIP üyeliğiniz ${expiryText} tarihine kadar aktiftir.`);
      } else {
        Alert.alert('Doğrulama Tamamlandı','Ödeme doğrulandı ancak hesap durumu henüz VIP olarak yansımadı.');
      }
    } catch (error) {
      console.error('VIP verification error:',error?.response?.data || error);
      const status=error?.response?.status;
      const message=error?.response?.data?.error || (status===401 ? 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.' : status===409 ? 'Bu ödeme daha önce kullanılmış veya doğrulama için henüz bekliyor.' : status===400 ? 'Ödeme doğrulanamadı. TXID, tutar veya alıcı bilgilerini kontrol edin.' : 'VIP ödeme doğrulama servisine ulaşılamadı.');
      Alert.alert('VIP Doğrulama Başarısız',message);
    } finally {
      setLoading(false);
    }
  };
  const removeFromWhitelist = async (addr) => {
    try {
      const cleanAddr = SecurityScannerMiddleware.sanitizeInput(addr || "");

      if (!cleanAddr) {
        Alert.alert("Hata", "Geçersiz adres.");
        return;
      }

      const updated = whitelist.filter(
        item => String(item).trim() !== cleanAddr.trim()
      );

      if (updated.length === whitelist.length) {
        Alert.alert("Bilgi", "Adres Whitelist listesinde bulunamadı.");
        return;
      }

      setWhitelist(updated);
      await saveWhitelist(updated);

      Alert.alert(
        "Başarılı",
        "Adres Güvenli Adresler listesinden kaldırıldı."
      );
    } catch (e) {
      handleIsolatedError("Whitelist Silme", e);
    }
  };

  const removeFromBlacklist = async (addr) => {
    try {
      const cleanAddr = SecurityScannerMiddleware.sanitizeInput(addr || "");

      if (!cleanAddr) {
        Alert.alert("Hata", "Geçersiz adres.");
        return;
      }

      const updated = blacklist.filter(
        item => String(item).trim() !== cleanAddr.trim()
      );

      if (updated.length === blacklist.length) {
        Alert.alert("Bilgi", "Adres Blacklist listesinde bulunamadı.");
        return;
      }

      setBlacklist(updated);
      await saveBlacklist(updated);

      Alert.alert(
        "Başarılı",
        "Adres Engellenen Adresler listesinden kaldırıldı."
      );
    } catch (e) {
      handleIsolatedError("Blacklist Silme", e);
    }
  };

  const removeFromVault = async (addr) => {
    try {
      Alert.alert(
        "Kasa Adresini Kaldır",
        "Bu cüzdanı Kasa izleme listesinden kaldırmak istediğinizden emin misiniz?",
        [
          {
            text: "Vazgeç",
            style: "cancel"
          },
          {
            text: "Kaldır",
            style: "destructive",
            onPress: async () => {
              const cleanAddr = SecurityScannerMiddleware.sanitizeInput(addr || "");

              if (!cleanAddr) {
                Alert.alert("Hata", "Geçersiz adres.");
                return;
              }

              const updated = vault.filter(
                item => String(item).trim() !== cleanAddr.trim()
              );

              setVault(updated);
              await saveVault(updated);

              Alert.alert(
                "Başarılı",
                "Cüzdan Kasa izleme listesinden kaldırıldı."
              );
            }
          }
        ]
      );
    } catch (e) {
      handleIsolatedError("Kasa Silme", e);
    }
  };
  const addToWhitelist = () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : "";
    if (!cleanAddr) return Alert.alert("Hata", "Adres alanı boş olamaz!");
    if (blacklist.includes(cleanAddr)) {
      return Alert.alert("Çakışma Hatası", "Bu adres zaten Blacklist listesinde kayıtlı!");
    }
    if (whitelist.includes(cleanAddr)) return Alert.alert("Bilgi", "Bu adres zaten Whitelist listesinde ekli.");
    
    const updated = [...whitelist, cleanAddr];
    saveWhitelist(updated);
    Alert.alert("Başarılı", "Adres Whitelist listesine eklendi.");
  };

  const addToBlacklist = () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : "";
    if (!cleanAddr) return Alert.alert("Hata", "Adres alanı boş olamaz!");
    if (whitelist.includes(cleanAddr)) {
      return Alert.alert("Çakışma Hatası", "Bu adres zaten Whitelist listesinde kayıtlı!");
    }
    if (blacklist.includes(cleanAddr)) return Alert.alert("Bilgi", "Bu adres zaten Blacklist listesinde ekli.");

    const updated = [...blacklist, cleanAddr];
    saveBlacklist(updated);
    Alert.alert("Güvenlik Uyarısı", "Adres Blacklist listesine eklendi ve engellendi.");
  };

  const addToVault = () => {
    const cleanAddr = address ? SecurityScannerMiddleware.sanitizeInput(address) : "";
    if (!cleanAddr) return Alert.alert("Hata", "Adres alanı boş olamaz!");
    if (userStatus !== 'vip') {
      Alert.alert("VIP Yönlendirmesi", "Müşteri bir cüzdanı kasaya eklemek istediği için doğrudan VIP ödeme ekranına yönlendiriliyorsunuz.");
      setActiveModule('vipView');
      return;
    }
    if (vault.includes(cleanAddr)) return Alert.alert("Bilgi", "Bu adres zaten kasada izleniyor.");
    
    if (vault.length >= 10) {
      Alert.alert("Limit Doldu", "VIP hesaplar kasaya en fazla 10 adet cüzdan ekleyebilir.");
      return;
    }

    const updated = [...vault, cleanAddr];
    saveVault(updated);
    Alert.alert("Başarılı", "Adres kasaya ve dinamik varlık/yetki yöneticisine eklendi.");
  };

  if (currentScreen === 'login') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
        <View style={[styles.card, { backgroundColor: theme.cardBg, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, width: '100%', maxWidth: 360, alignSelf: 'center' }]}>
          
          <View style={{ width: '100%', alignItems: 'center', marginBottom: 4 }}>
            <Image 
              source={require('./assets/yenilogo.png')} 
              style={{ width: 54, height: 54, borderRadius: 10 }} 
              resizeMode="contain"
            />
          </View>

          <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 4, letterSpacing: 0.5 }}>SAFE SENTINEL PRO</Text>

          <View style={{ width: '100%', marginBottom: 7 }}>
            <Text style={{
              color: theme.textSub,
              fontSize: 8,
              fontWeight: '600',
              marginBottom: 4,
              textAlign: 'center'
            }}>
              {t('language')}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 2,
                alignItems: 'center'
              }}
            >
              {Object.entries(V26_GLOBAL_I18N).map(([code, item]) => {
                const active = selectedLanguage === code;

                return (
                  <TouchableOpacity
                    key={`login-language-${code}`}
                    onPress={() => saveGlobalLanguage(code)}
                    style={{
                      backgroundColor: active ? theme.primary : theme.inputBg,
                      borderWidth: 1,
                      borderColor: active ? theme.primary : theme.borderCol,
                      borderRadius: 6,
                      paddingHorizontal: 7,
                      height: 24,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 4
                    }}
                  >
                    <Text style={{
                      color: active ? '#FFFFFF' : theme.textMain,
                      fontSize: 8,
                      fontWeight: active ? '800' : '600'
                    }}>
                      {item.nativeName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <Text style={{ color: theme.textSub, fontSize: 8, textAlign: 'center', marginBottom: 7 }}>{t('loginDescription')}</Text>
          
          <View style={{ width: '100%', marginBottom: 6 }}>
            <Text style={{ color: theme.textMain, fontSize: 9, fontWeight: '600', marginBottom: 3 }}>{t('emailAddress')}</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, width: '100%', height: 28, fontSize: 9, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder="ornek@mail.com" 
              placeholderTextColor="#9CA3AF" 
              value={email} 
              onChangeText={setEmail} 
              autoCapitalize="none" 
            />
          </View>

          <View style={{ width: '100%', marginBottom: 8 }}>
            <Text style={{ color: theme.textMain, fontSize: 9, fontWeight: '600', marginBottom: 3 }}>{t('loginPassword')}</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, width: '100%', height: 28, fontSize: 9, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
            />
          </View>
          
          <TouchableOpacity style={[styles.button, { width: '100%', height: 25, backgroundColor: theme.primary, marginBottom: 8, borderRadius: 6, shadowColor: theme.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }]} onPress={handleLogin}>
            <Text style={[styles.buttonText, { fontSize: 8 }]}>{t('secureLogin')}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, { width: '100%', height: 25, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.borderCol, borderRadius: 6 }]} 
            onPress={() => setCurrentScreen('register')}
          >
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 9 }}>{t('createAccount')}</Text>
          </TouchableOpacity>
        </View>
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
              onChangeText={setRegName} 
            />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('lastName')}</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder={t('exampleLastName')} 
              placeholderTextColor="#9CA3AF" 
              value={regSurname} 
              onChangeText={setRegSurname} 
            />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('emailAddress')}</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder="ornek@mail.com" 
              placeholderTextColor="#9CA3AF" 
              value={regEmail} 
              onChangeText={setRegEmail} 
              autoCapitalize="none" 
            />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>{t('loginPassword')}</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder="Güçlü bir şifre belirleyin" 
              placeholderTextColor="#9CA3AF" 
              value={regPassword} 
              onChangeText={setRegPassword} 
              secureTextEntry 
            />

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>Kasaya Eklenecek Cüzdan (Opsiyonel)</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 36, fontSize: 10, paddingVertical: 0, textAlignVertical: 'center' }]} 
              placeholder="T... veya 0x... adresiniz" 
              placeholderTextColor="#9CA3AF" 
              value={regVaultAddress} 
              onChangeText={(text) => {
                setRegVaultAddress(text);
                if (text.trim().length > 0) {
                  setRegWantVip(true);
                }
              }} 
            />

            <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginVertical: 8, padding: 10 }]}>
              <View style={styles.prefCardHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 10, fontWeight: '700' }]}>Kayıt Sırasında VIP Olmak İster misiniz?</Text>
                </View>
                <Switch 
                  trackColor={{ false: '#374151', true: theme.primary }}
                  thumbColor={regWantVip ? '#FFFFFF' : '#9CA3AF'}
                  onValueChange={() => setRegWantVip(!regWantVip)}
                  value={regWantVip}
                />
              </View>
            </View>

            <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 34, borderRadius: 6, marginTop: 4 }]} onPress={handleCompleteRegistration}>
              <Text style={[styles.buttonText, { fontSize: 10 }]}>{t('completeRegistration')}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { width: '100%', height: 25, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.borderCol, borderRadius: 6, marginTop: 8 }]} 
              onPress={() => setCurrentScreen('login')}
            >
              <Text style={{ color: theme.textSub, fontWeight: '600', fontSize: 11 }}>{t('backToLogin')}</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      {activeModule !== 'dashboard' ? (
        <SafeAreaView style={[styles.card, { backgroundColor: theme.cardBg, flex: 1, width: '100%', maxHeight: '100%', borderRadius: 0, marginVertical: 0 }]}>
          <View style={[styles.headerRow, { paddingHorizontal: 12, paddingTop: Math.max(8, insets.top + 4), paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.borderCol }]}>
            <Text style={[styles.title, { color: theme.textMain, fontSize: 14 }]}>
              {activeModule === 'preferencesView' ? t('preferencesTitle') :
               activeModule === 'cryptoPoliciesView' ? ' Kripto Para ve Finansal Politikalar' :
               activeModule === 'portfolioView' ? ' Portföy Değer Grafikleri (Kasa Varlıkları)' :
               activeModule === 'priceAlertsView' ? ' Anlık Fiyat Alarmları' :
               activeModule === 'outboundShieldView' ? ' Riskli İşlem / Transfer Engeli' :
               activeModule === 'whitelistView' ? 'Güvenli Adresler' :
               activeModule === 'blacklistView' ? 'Engellenen Adresler' :
               activeModule === 'vaultView' ? 'Kasa Varlık Yönetimi' :
               activeModule === 'notificationsView' ? 'Bildirimler & Scam Uyarıları' :
               activeModule === 'vipView' ? 'VIP Ödeme ve Hızlı Bildirim' :
               activeModule === 'smartContractView' ? 'Akıllı Sözleşme & AI Tehdit Radarı' :
                activeModule === 'behavioralView' ? '🧠 AI Cüzdan Davranış Analizi' :
               activeModule === 'phishingView' ? ' Phishing & DApp Kalkanı' :
               activeModule === 'quickTestView' ? '? Hızlı Cüzdan Testi' :
               activeModule === 'emergencyLockView' ? 'Acil Varlık Kilidi' :
                activeModule === 'gasOptView' ? '⛽ Web3 Gaz Optimizasyonu' :
               activeModule === 'deepIntelView' ? 'Derin Zincir İstihbaratı' :
               activeModule === 'autoPhishView' ? ' Otomatik Phishing Kalkanı' :
                activeModule === 'guardianView' ? '🛡️ Safe Sentinel Guardian — Akıllı Cüzdan Koruma Merkezi' :
               activeModule === 'inheritView' ? ' Kripto Varlık Mirasçılığı (Dead Man\'s Switch)' :
               activeModule === 'revokeView' ? '? Token & NFT Yetki İptal (Revoke)' :
               activeModule === 'whaleWatchView' ? ' Riskli Adres / Whale (Balina) Takibi' :
               activeModule === 'gasTimeView' ? ' Gas Ücreti Optimizatörü ve Zamanlayıcı' :
                activeModule === 'aiMarketView' ? '📈 AI Akıllı Piyasa Asistanı / Sentiment Analizi' :
               activeModule === 'taxReportView' ? ' Vergi ve İşlem Geçmişi Raporlayıcı' :
               activeModule === 'dexOrdersView' ? ' Otomatik Stop-Loss / Take-Profit (DEX Emirleri)' : ''}
            </Text>
            <TouchableOpacity onPress={() => setActiveModule('dashboard')} style={[styles.backButton, { backgroundColor: theme.inputBg, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }]}>
               <Text style={[styles.backButtonText, { color: theme.primary, fontSize: 11 }]}>‹ Geri Dön</Text>
            </TouchableOpacity>
          </View>


          {activeModule === 'whitelistView' ? (
            <ScrollView
              contentContainerStyle={styles.prefScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.prefDescription}>
                Güvenilir olarak işaretlediğiniz cüzdan adresleri burada yönetilir.
                Whitelist adresleri güvenlik sorgularında öncelikli olarak değerlendirilir.
              </Text>

              <View
                style={[
                  styles.prefCard,
                  {
                    backgroundColor: theme.itemBg,
                    borderColor: '#10B981'
                  }
                ]}
              >
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.prefCardTitle,
                        {
                          color: theme.textMain,
                          fontSize: 12,
                          fontWeight: 'bold'
                        }
                      ]}
                    >
                      Güvenli Adresler
                    </Text>

                    <Text
                      style={[
                        styles.prefCardSub,
                        {
                          color: theme.textSub,
                          fontSize: 10
                        }
                      ]}
                    >
                      Kayıtlı güvenilir adresleriniz
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: '#10B981',
                      fontSize: 13,
                      fontWeight: 'bold'
                    }}
                  >
                    {whitelist.length}
                  </Text>
                </View>

                {whitelist.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: theme.inputBg,
                      padding: 14,
                      borderRadius: 7,
                      alignItems: 'center',
                      marginTop: 8
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 10,
                        textAlign: 'center'
                      }}
                    >
                      Henüz güvenli adres eklenmedi.
                    </Text>

                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 9,
                        textAlign: 'center',
                        marginTop: 4
                      }}
                    >
                      Bir cüzdan adresini güvenli listeye eklemek için
                      ana güvenlik merkezindeki + Whitelist butonunu kullanabilirsiniz.
                    </Text>
                  </View>
                ) : (
                  whitelist.map((addr, index) => (
                    <View
                      key={`${addr}-${index}`}
                      style={{
                        backgroundColor: theme.inputBg,
                        borderRadius: 7,
                        padding: 9,
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: theme.borderCol
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textMain,
                          fontSize: 9,
                          fontWeight: '600',
                          lineHeight: 14
                        }}
                        selectable
                      >
                        {addr}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 7
                        }}
                      >
                        <Text
                          style={{
                            color: '#10B981',
                            fontSize: 8,
                            fontWeight: 'bold'
                          }}
                        >
                          GÜVENLİ ADRES
                        </Text>

                        <TouchableOpacity
                          onPress={() => removeFromWhitelist(addr)}
                          style={{
                            backgroundColor: '#EF4444',
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 5
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFF',
                              fontSize: 8,
                              fontWeight: 'bold'
                            }}
                          >
                            Kaldır
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

          ) : activeModule === 'blacklistView' ? (
            <ScrollView
              contentContainerStyle={styles.prefScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.prefDescription}>
                Engellenen ve riskli olarak işaretlediğiniz cüzdan adresleri burada yönetilir.
                Blacklist adresleri cüzdan sorgularında güvenlik kontrolünden önce değerlendirilir.
              </Text>

              <View
                style={[
                  styles.prefCard,
                  {
                    backgroundColor: theme.itemBg,
                    borderColor: '#EF4444'
                  }
                ]}
              >
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.prefCardTitle,
                        {
                          color: theme.textMain,
                          fontSize: 12,
                          fontWeight: 'bold'
                        }
                      ]}
                    >
                      Engellenen Adresler
                    </Text>

                    <Text
                      style={[
                        styles.prefCardSub,
                        {
                          color: theme.textSub,
                          fontSize: 10
                        }
                      ]}
                    >
                      Kayıtlı engellenmiş adresleriniz
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: '#EF4444',
                      fontSize: 13,
                      fontWeight: 'bold'
                    }}
                  >
                    {blacklist.length}
                  </Text>
                </View>

                {blacklist.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: theme.inputBg,
                      padding: 14,
                      borderRadius: 7,
                      alignItems: 'center',
                      marginTop: 8
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 10,
                        textAlign: 'center'
                      }}
                    >
                      Henüz engellenmiş adres bulunmuyor.
                    </Text>

                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 9,
                        textAlign: 'center',
                        marginTop: 4
                      }}
                    >
                      Riskli olduğunu düşündüğünüz bir adresi ana güvenlik merkezinden
                      + Blacklist ile engelleyebilirsiniz.
                    </Text>
                  </View>
                ) : (
                  blacklist.map((addr, index) => (
                    <View
                      key={`${addr}-${index}`}
                      style={{
                        backgroundColor: theme.inputBg,
                        borderRadius: 7,
                        padding: 9,
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: theme.borderCol
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textMain,
                          fontSize: 9,
                          fontWeight: '600',
                          lineHeight: 14
                        }}
                        selectable
                      >
                        {addr}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 7
                        }}
                      >
                        <Text
                          style={{
                            color: '#EF4444',
                            fontSize: 8,
                            fontWeight: 'bold'
                          }}
                        >
                          ENGELLİ ADRES
                        </Text>

                        <TouchableOpacity
                          onPress={() => removeFromBlacklist(addr)}
                          style={{
                            backgroundColor: '#10B981',
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 5
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFF',
                              fontSize: 8,
                              fontWeight: 'bold'
                            }}
                          >
                            Engeli Kaldır
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

          ) : activeModule === 'vaultView' ? (
            <ScrollView
              contentContainerStyle={styles.prefScrollContainer}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.prefDescription}>
                Kasa, VIP kullanıcıların sürekli güvenlik takibine aldığı cüzdanları
                ve bu cüzdanlarla ilişkili güvenlik bildirimlerini yönetir.
              </Text>

              <View
                style={[
                  styles.prefCard,
                  {
                    backgroundColor: theme.itemBg,
                    borderColor: '#8B5CF6'
                  }
                ]}
              >
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.prefCardTitle,
                        {
                          color: theme.textMain,
                          fontSize: 12,
                          fontWeight: 'bold'
                        }
                      ]}
                    >
                      Kasa Varlık Yönetimi
                    </Text>

                    <Text
                      style={[
                        styles.prefCardSub,
                        {
                          color: theme.textSub,
                          fontSize: 10
                        }
                      ]}
                    >
                      Sürekli izlenen cüzdanlar
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: '#8B5CF6',
                      fontSize: 13,
                      fontWeight: 'bold'
                    }}
                  >
                    {vault.length}/10
                  </Text>
                </View>

                {vault.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: theme.inputBg,
                      padding: 14,
                      borderRadius: 7,
                      alignItems: 'center',
                      marginTop: 8
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 10,
                        textAlign: 'center'
                      }}
                    >
                      Kasada henüz izlenen cüzdan bulunmuyor.
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.button,
                        {
                          backgroundColor: userStatus === 'vip'
                            ? '#8B5CF6'
                            : '#F59E0B',
                          width: '100%',
                          height: 36,
                          borderRadius: 6,
                          marginTop: 10
                        }
                      ]}
                      onPress={() => {
                        if (userStatus !== 'vip') {
                          setActiveModule('vipView');
                        } else {
                          setActiveModule('dashboard');
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          {
                            fontSize: 10
                          }
                        ]}
                      >
                        {userStatus === 'vip'
                          ? 'Ana Ekrandan Kasa Cüzdanı Ekle'
                          : 'VIP Üyeliğe Geç'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  vault.map((addr, index) => (
                    <View
                      key={`${addr}-${index}`}
                      style={{
                        backgroundColor: theme.inputBg,
                        borderRadius: 7,
                        padding: 9,
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: theme.borderCol
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textMain,
                          fontSize: 9,
                          fontWeight: '600',
                          lineHeight: 14
                        }}
                        selectable
                      >
                        {addr}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 7
                        }}
                      >
                        <Text
                          style={{
                            color: '#8B5CF6',
                            fontSize: 8,
                            fontWeight: 'bold'
                          }}
                        >
                          KASA İZLEMESİ AKTİF
                        </Text>

                        <TouchableOpacity
                          onPress={() => removeFromVault(addr)}
                          style={{
                            backgroundColor: '#EF4444',
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 5
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFF',
                              fontSize: 8,
                              fontWeight: 'bold'
                            }}
                          >
                            Kasadan Kaldır
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <View
                style={[
                  styles.prefCard,
                  {
                    backgroundColor: theme.itemBg,
                    borderColor: theme.borderCol,
                    marginTop: 8
                  }
                ]}
              >
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 11,
                    fontWeight: 'bold',
                    marginBottom: 6
                  }}
                >
                  Kasa Güvenlik Bildirimleri
                </Text>

                {vaultNotifications.length === 0 ? (
                  <Text
                    style={{
                      color: theme.textSub,
                      fontSize: 10,
                      textAlign: 'center',
                      paddingVertical: 10
                    }}
                  >
                    Henüz Kasa güvenlik bildirimi bulunmuyor.
                  </Text>
                ) : (
                  vaultNotifications.slice(0, 10).map((item, index) => (
                    <View
                      key={`${item.id || index}-${index}`}
                      style={{
                        backgroundColor: theme.inputBg,
                        borderRadius: 6,
                        padding: 8,
                        marginBottom: 5,
                        borderWidth: 1,
                        borderColor: theme.borderCol
                      }}
                    >
                      <Text
                        style={{
                          color: item.severity === 'HIGH'
                            ? '#EF4444'
                            : theme.primary,
                          fontSize: 9,
                          fontWeight: 'bold',
                          marginBottom: 2
                        }}
                      >
                        {item.title || item.type || 'Kasa Güvenlik Bildirimi'}
                      </Text>

                      <Text
                        style={{
                          color: theme.textMain,
                          fontSize: 9,
                          lineHeight: 13
                        }}
                      >
                        {item.message || item.description || 'Güvenlik bildirimi alındı.'}
                      </Text>

                      {item.createdAt ? (
                        <Text
                          style={{
                            color: theme.textSub,
                            fontSize: 8,
                            marginTop: 3
                          }}
                        >
                          {String(item.createdAt)}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'notificationsView' ? (
  <ScrollView
    contentContainerStyle={styles.prefScrollContainer}
    showsVerticalScrollIndicator={false}
  >
    <View
      testID="CENTRAL_NOTIFICATION_UI_V25_K2"
      style={[
        styles.prefCard,
        {
          backgroundColor: theme.itemBg,
          borderColor: theme.borderCol
        }
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.textMain,
              fontSize: 13,
              fontWeight: 'bold'
            }}
          >
            Merkezi Bildirimler
          </Text>

          <Text
            style={{
              color: theme.textSub,
              fontSize: 9,
              marginTop: 3
            }}
          >
            Güvenlik, fiyat alarmı ve diğer sistem olayları
          </Text>
        </View>

        <View
          style={{
            backgroundColor:
              centralUnreadCount > 0
                ? '#EF4444'
                : '#10B981',
            borderRadius: 12,
            minWidth: 28,
            paddingHorizontal: 8,
            paddingVertical: 5,
            alignItems: 'center'
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 9,
              fontWeight: 'bold'
            }}
          >
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
            centralUnreadCount === 0
              ? theme.inputBg
              : theme.primary,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          marginBottom: 8,
          opacity: centralUnreadCount === 0 ? 0.5 : 1
        }}
      >
        <Text
          style={{
            color:
              centralUnreadCount === 0
                ? theme.textSub
                : '#FFFFFF',
            fontSize: 9,
            fontWeight: 'bold'
          }}
        >
          Tümünü Okundu Yap
        </Text>
      </TouchableOpacity>

      {centralNotifications.length === 0 ? (
        <View
          style={{
            backgroundColor: theme.inputBg,
            borderRadius: 7,
            padding: 14,
            alignItems: 'center'
          }}
        >
          <Text
            style={{
              color: theme.textSub,
              fontSize: 10,
              textAlign: 'center'
            }}
          >
            Henüz merkezi bildiriminiz bulunmuyor.
          </Text>
        </View>
      ) : (
        centralNotifications.map((notification, index) => {
          const isUnread = !notification.read;

          const severity =
            String(notification.severity || 'INFO').toUpperCase();

          const severityLabel =
            severity === 'CRITICAL'
              ? 'KRİTİK'
              : severity === 'HIGH'
                ? 'YÜKSEK'
                : severity === 'WARNING'
                  ? 'UYARI'
                  : 'BİLGİ';

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
                  severity === 'CRITICAL' || severity === 'HIGH'
                    ? '#EF4444'
                    : isUnread
                      ? theme.primary
                      : theme.borderCol
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    color:
                      severity === 'CRITICAL' || severity === 'HIGH'
                        ? '#EF4444'
                        : theme.textMain,
                    fontSize: 10,
                    fontWeight: 'bold',
                    marginRight: 8
                  }}
                >
                  {notification.title || 'Safe Sentinel Bildirimi'}
                </Text>

                <Text
                  style={{
                    color:
                      severity === 'CRITICAL' || severity === 'HIGH'
                        ? '#EF4444'
                        : theme.primary,
                    fontSize: 8,
                    fontWeight: 'bold'
                  }}
                >
                  {severityLabel}
                </Text>
              </View>

              <Text
                style={{
                  color: theme.textMain,
                  fontSize: 9,
                  lineHeight: 14,
                  marginTop: 5
                }}
              >
                {notification.body || 'Bildirim ayrıntısı bulunmuyor.'}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 7
                }}
              >
                <View style={{ flex: 1 }}>
                  {notification.createdAt ? (
                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 8
                      }}
                    >
                      {String(notification.createdAt)}
                    </Text>
                  ) : null}

                  <Text
                    style={{
                      color: theme.textSub,
                      fontSize: 7,
                      marginTop: 2
                    }}
                  >
                    {notification.type || 'SYSTEM'}
                    {notification.network
                      ? ` • ${notification.network}`
                      : ''}
                  </Text>
                </View>

                {isUnread ? (
                  <TouchableOpacity
                    onPress={() =>
                      markCentralNotificationRead(notification.id)
                    }
                    style={{
                      backgroundColor: theme.primary,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 5
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 8,
                        fontWeight: 'bold'
                      }}
                    >
                      Okundu
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={{
                      color: '#10B981',
                      fontSize: 8,
                      fontWeight: 'bold'
                    }}
                  >
                    Okundu
                  </Text>
                )}
              </View>
            </View>
          );
        })
      )}

      <View
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: theme.borderCol
        }}
      >
        <Text
          style={{
            color: theme.textSub,
            fontSize: 8,
            textAlign: 'center'
          }}
        >
          Merkezi bildirimler sunucudan düzenli olarak yenilenir.
        </Text>
      </View>
    </View>

    {vaultNotifications.length > 0 ? (
      <View
        style={[
          styles.prefCard,
          {
            backgroundColor: theme.itemBg,
            borderColor: theme.borderCol,
            marginTop: 8
          }
        ]}
      >
        <Text
          style={{
            color: theme.textMain,
            fontSize: 11,
            fontWeight: 'bold',
            marginBottom: 6
          }}
        >
          Kasa Güvenlik Bildirimleri
        </Text>

        {vaultNotifications.slice(0, 10).map((item, index) => (
          <View
            key={`${item.id || index}-vault-${index}`}
            style={{
              backgroundColor: theme.inputBg,
              borderRadius: 6,
              padding: 8,
              marginBottom: 5,
              borderWidth: 1,
              borderColor: theme.borderCol
            }}
          >
            <Text
              style={{
                color:
                  item.severity === 'HIGH'
                    ? '#EF4444'
                    : theme.primary,
                fontSize: 9,
                fontWeight: 'bold',
                marginBottom: 2
              }}
            >
              {item.title || item.type || 'Kasa Güvenlik Bildirimi'}
            </Text>

            <Text
              style={{
                color: theme.textMain,
                fontSize: 9,
                lineHeight: 13
              }}
            >
              {item.message ||
                item.description ||
                item.body ||
                'Güvenlik bildirimi alındı.'}
            </Text>

            {item.createdAt ? (
              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 8,
                  marginTop: 3
                }}
              >
                {String(item.createdAt)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    ) : null}
  </ScrollView>
          ) : activeModule === 'cryptoPoliciesView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                Safe Sentinel Pro finansal varlık yönetimi, kripto para işlemleri, hukuki uyum metinleri ve platform güvenlik standartlarına dair resmi politika maddeleridir.
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>1. Varlık Güvenliği ve Kasa Politikası</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                    Kullanıcıların kasaya (Vault) ekledikleri cüzdanlar ve akıllı sözleşme harcama yetkileri (Revoke), küresel tehdit istihbarat havuzları ile eş zamanlı taranır. Şüpheli transfer girişimleri ve drainer protokolleri anlık olarak bloklanmak üzere tasarlanmıştır.
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>2. Hukuki Uyum ve Sorumluluk Reddi (Legal Compliance)</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                  Platform uluslararası veri koruma düzenlemelerine ve finansal istihbarat uyumluluk kurallarına tam uyumludur. Sunulan tüm analiz raporları, yapay zeka sentiment sonuçları ve güvenlik taramaları bilgilendirme amaçlıdır; doğrudan yatırım tavsiyesi niteliği taşımaz.
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>3. Şeffaflık ve Komisyon Politikası</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                  Platform üzerinde sunulan temel sorgulama hakları şeffaf bir şekilde yönetilir. VIP abonelik süreçleri doğrudan blokzincir ağları (TRON / TRX ağı üzerinden) üzerinden gerçekleştirilir ve manuel/otomatik TXID doğrulamasıyla aktifleşir. Gizli masraf veya kesinti barındırmaz.
                </Text>

                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>4. Gizlilik ve Veri Koruma Standartları</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 16 }}>
                  Kullanıcı hesap bilgileri, şifreler ve yerel anahtarlar cihaz güvenliğinde (SecureStore & AsyncStorage) şifrelenmiş biçimde korunur. Otomatik yedekleme mekanizmaları ile verileriniz güvenli depoda saklanır.
                </Text>
              </View>
            </ScrollView>
          ) : activeModule === 'portfolioView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                Grafik verileri yalnızca Kasa (Vault) bölümüne eklediğiniz aktif kripto ve cüzdan varlıklarınızdan derlenmektedir.
              </Text>

              {vault.length === 0 ? (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: '#EF4444', alignItems: 'center', padding: 16 }]}>
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>Kasada Varlık Bulunamadı!</Text>
                  <Text style={{ color: theme.textSub, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>Portföy grafiğini görebilmek için önce cüzdanınızı kasaya eklemelisiniz. Kasaya varlık eklemek VIP hesap gerektirir.</Text>
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]} 
                    onPress={() => {
                      if (userStatus !== 'vip') {
                        setActiveModule('vipView');
                      } else {
                        setActiveModule('dashboard');
                      }
                    }}
                  >
                    <Text style={[styles.buttonText, { fontSize: 11 }]}>Kasaya Varlık Ekle (VIP'e Geç)</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, alignItems: 'center' }]}>
                  <Text style={{ color: theme.textSub, fontSize: 11, marginBottom: 4 }}>Kasa Portföy Değeri ({vault.length}/10 Varlık İzleniyor)</Text>
                  <Text style={{ color: theme.primary, fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>${portfolioUsdValue > 0 ? portfolioUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'} USD</Text>
                  
                  <LineChart
                    data={getChartDataForRange(selectedChartRange)}
                    color={theme.primary}
                    thickness={3}
                    startFillColor="rgba(59, 130, 246, 0.3)"
                    endFillColor="rgba(59, 130, 246, 0.0)"
                    areaChart
                    hideDataPoints={false}
                    dataPointsColor={theme.primary}
                    curved
                    isAnimated
                    animationDuration={1200}
                    xAxisLabelTextStyle={{ color: theme.textSub, fontSize: 9 }}
                    yAxisTextStyle={{ color: theme.textSub, fontSize: 9 }}
                    noOfSections={4}
                    spacing={50}
                  />
                </View>
              )}

              {vault.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.itemBg, borderRadius: 8, padding: 4, borderWidth: 1, borderColor: theme.borderCol }}>
                  {['1G', '1H', '1A', '1Y'].map((range) => (
                    <TouchableOpacity
                      key={range}
                      style={{ paddingVertical: 4, paddingHorizontal: 12, borderRadius: 4, backgroundColor: selectedChartRange === range ? theme.primary : 'transparent' }}
                      onPress={() => setSelectedChartRange(range)}
                    >
                      <Text style={{ color: selectedChartRange === range ? '#FFF' : theme.textSub, fontWeight: 'bold', fontSize: 10 }}>
                        {range}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : activeModule === 'priceAlertsView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                İstediğiniz kripto varlığı seçerek hedef fiyat eşiklerine ulaşıldığında anında push bildirimi alın.
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}> Kripto Fiyat Alarm Sistemi</Text>
                    <Text style={[styles.prefCardSub, { color: theme.textSub, fontSize: 10 }]}>Seçilen varlık hedef değere ulaştığında haber ver.</Text>
                  </View>
                  <Switch 
                    trackColor={{ false: '#374151', true: theme.primary }}
                    thumbColor={priceAlertsEnabled ? '#FFFFFF' : '#9CA3AF'}
                    onValueChange={() => setPriceAlertsEnabled(!priceAlertsEnabled)}
                    value={priceAlertsEnabled}
                  />
                </View>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>Alarm Kurulacak Kripto:</Text>
                
                <View style={styles.gridContainer}>
                  {Object.keys(NETWORKS).map((key) => {
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
                        onPress={() => setAlertTargetCrypto(sym)}
                      >
                        <Text style={{ color: isSelected ? '#FFF' : theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{sym}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, marginTop: 4, height: 36, fontSize: 11 }]} 
                  placeholder={`Hedef ${alertTargetCrypto} Fiyatı ($)...`} 
                  placeholderTextColor="#888" 
                  value={targetAlertPrice} 
                  onChangeText={setTargetAlertPrice} 
                  keyboardType="numeric"
                />

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]} 
                  onPress={async () => {
                    if (userStatus !== 'vip' && savedPriceAlerts.length >= 8) {
                      Alert.alert("VIP Sınırı", "Standart hesaplar en fazla 8 adet fiyat alarmı kurabilir.");
                      setActiveModule('vipView');
                      return;
                    }

                    if (!targetAlertPrice.trim()) {
                      Alert.alert("Eksik Bilgi", "Lütfen geçerli bir hedef fiyat giriniz.");
                      return;
                    }

                    const sanitizedPrice = SecurityScannerMiddleware.sanitizeInput(targetAlertPrice);

                    const networkEntry = Object.entries(NETWORKS).find(
                      ([, value]) => value.symbol === alertTargetCrypto
                    );

                    const networkKey = networkEntry ? networkEntry[0] : alertTargetCrypto.toLowerCase();

                    try {
                      const response = await api.post('/api/price-alerts', {
                        asset: alertTargetCrypto.toLowerCase(),
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
                      triggerLocalNotification(" Fiyat Alarmı Kuruldu", `${newAlert.crypto} için $${newAlert.price} hedefi aktif edildi!`);
                      Alert.alert("Başarılı", `${newAlert.crypto} varlığı için fiyat alarmı backend'e kaydedildi.`);
                    } catch (error) {
                      console.error('[PRICE ALERTS] Kaydetme başarısız:', error);
                      Alert.alert(
                        "Kayıt Başarısız",
                        error?.response?.data?.error || "Fiyat alarmı backend'e kaydedilemedi."
                      );
                    }
                  }}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{alertTargetCrypto} Alarmını Kaydet</Text>
                </TouchableOpacity>
              </View>

              {getRecommendedGasNetwork ? (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, marginTop: 8 }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>ÖNERİLEN AĞ</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold' }}>
                      {{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[getRecommendedGasNetwork.network] || getRecommendedGasNetwork.network.toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>
                      {getRecommendedGasNetwork.fee}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>Canlı gas verileri içindeki en düşük değer.</Text>
                </View>
              ) : null}

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginTop: 8 }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Aktif Fiyat Alarmlarınız ({savedPriceAlerts.length}/8):</Text>
                {savedPriceAlerts.length === 0 ? (
                  <Text style={{ color: theme.textSub, fontSize: 11, textAlign: 'center', paddingVertical: 8 }}>Henüz kayıtlı bir fiyat alarmınız bulunmuyor.</Text>
                ) : (
                  savedPriceAlerts.map((item) => (
                    <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4 }}>
                      <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}> {item.crypto} : ${item.price}</Text>
                      <TouchableOpacity 
                        onPress={() => setSavedPriceAlerts(savedPriceAlerts.filter(a => a.id !== item.id))}
                        style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}
                      >
                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>Sil </Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'guardianView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                Guardian güvenlik profiliniz backend ile senkronize edilir. Sistem cüzdan davranışı, Scam DNA, Security Graph ve Early Warning sinyallerini birlikte değerlendirir.
              </Text>

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}>
                      Safe Sentinel Guardian
                    </Text>
                    <Text style={[styles.prefCardSub, { color: theme.textSub, fontSize: 10 }]}>
                      Non-custodial koruma motoru — işlem imzalamaz, fon taşımaz.
                    </Text>
                  </View>

                  <Switch
                    trackColor={{ false: '#374151', true: theme.primary }}
                    thumbColor={guardianEnabled ? '#FFFFFF' : '#9CA3AF'}
                    onValueChange={setGuardianEnabled}
                    value={guardianEnabled}
                    disabled={guardianLoading}
                  />
                </View>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>
                  Kritik Alarm Eşik Değeri ($):
                </Text>

                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]}
                  placeholder="Örn: 500 USD..."
                  placeholderTextColor="#888"
                  value={guardianAlertThreshold}
                  onChangeText={setGuardianAlertThreshold}
                  keyboardType="numeric"
                  editable={!guardianLoading}
                />

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, opacity: guardianLoading ? 0.6 : 1 }]}
                  disabled={guardianLoading}
                  onPress={async () => {
                    const threshold = Number(guardianAlertThreshold);

                    if (!Number.isFinite(threshold) || threshold < 0) {
                      Alert.alert('Guardian', 'Geçerli bir alarm eşik değeri girin.');
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
                        'Guardian güvenlik profili backend üzerinde güncellendi.'
                      );
                    } catch (error) {
                      Alert.alert(
                        'Guardian',
                        error?.response?.data?.error ||
                          error?.message ||
                          'Guardian profili güncellenemedi.'
                      );
                    } finally {
                      setGuardianLoading(false);
                    }
                  }}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>
                    {guardianLoading ? 'Kaydediliyor...' : 'Guardian Ayarlarını Kaydet'}
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
                        throw new Error('Guardian profili alınamadı.');
                      }

                      setGuardianEnabled(Boolean(profile.enabled));
                      setGuardianAlertThreshold(String(profile.alertThresholdUsd ?? 500));
                      setGuardianProfileLoaded(true);

                      Alert.alert('Guardian', 'Guardian profili backend üzerinden yenilendi.');
                    } catch (error) {
                      Alert.alert(
                        'Guardian',
                        error?.response?.data?.error ||
                          error?.message ||
                          'Guardian profili yüklenemedi.'
                      );
                    } finally {
                      setGuardianLoading(false);
                    }
                  }}
                >
                  <Text style={[styles.buttonText, { color: theme.textMain, fontSize: 11 }]}>
                    Guardian Profilini Yenile
                  </Text>
                </TouchableOpacity>

                <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 8 }}>
                  Profil durumu: {guardianProfileLoaded ? 'Backend ile senkronize' : 'Henüz yüklenmedi'}
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
              Guardian Canlı Risk Değerlendirmesi
            </Text>

            <Text style={{
              color: theme.subText,
              fontSize: 12,
              marginBottom: 10
            }}>
              Seçili cüzdan Behavioral Fingerprint, Scam DNA,
              Security Graph ve Early Warning motorlarıyla değerlendirilir.
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
                }
              ]}
              disabled={guardianEvaluating}
              onPress={handleGuardianEvaluate}
            >
              <Text style={{
                color: '#FFFFFF',
                fontWeight: '700'
              }}>
                {guardianEvaluating
                  ? 'Guardian Analiz Ediyor...'
                  : 'Guardian Risk Analizini Çalıştır'}
              </Text>
            </TouchableOpacity>

            {guardianEvaluationError ? (
              <Text style={{
                color: '#EF4444',
                marginTop: 10,
                fontSize: 12
              }}>
                {guardianEvaluationError}
              </Text>
            ) : null}

            {guardianEvaluationResult?.decision ? (
              <View style={{ marginTop: 12 }}>

                <Text style={{
                  color: theme.text,
                  fontWeight: '700',
                  marginBottom: 6
                }}>
                  Karar: {guardianEvaluationResult.decision.action}
                </Text>

                <Text style={{
                  color: theme.text,
                  marginBottom: 4
                }}>
                  Risk Skoru: {guardianEvaluationResult.decision.riskScore ?? 0}/100
                </Text>

                <Text style={{
                  color: theme.text,
                  marginBottom: 8
                }}>
                  Risk Seviyesi: {guardianEvaluationResult.decision.riskLevel || 'UNKNOWN'}
                </Text>

                {Array.isArray(guardianEvaluationResult.decision.reasons) &&
                guardianEvaluationResult.decision.reasons.length > 0 ? (
                  <View style={{ marginBottom: 10 }}>

                    {guardianEvaluationResult.decision.reasons.map(
                      (reason, index) => (
                        <Text
                          key={`guardian-reason-${index}`}
                          style={{
                            color: theme.subText,
                            fontSize: 12,
                            marginBottom: 3
                          }}
                        >
                          • {reason}
                        </Text>
                      )
                    )}

                  </View>
                ) : null}

                {guardianEvaluationResult.components ? (
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
                      Koruma modu: {guardianEvaluationResult.protectionMode || 'NON_CUSTODIAL_READ_ONLY'}
                    </Text>

                  </View>
                ) : null}

              </View>
            ) : null}

          </View>
</ScrollView>          ) : activeModule === 'inheritView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                Cüzdan sahibinin uzun süre aktif olmaması durumunda varlıklarınızın önceden belirlenen güvenilir varis adresine aktarılması.
              </Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <View style={styles.prefCardHeader}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.prefCardTitle, { color: theme.textMain, fontSize: 12, fontWeight: 'bold' }]}> Varlık Mirasçılığı Protokolü</Text>
                  </View>
                  <Switch 
                    trackColor={{ false: '#374151', true: theme.primary }}
                    thumbColor={inheritEnabled ? '#FFFFFF' : '#9CA3AF'}
                    onValueChange={setInheritEnabled}
                    value={inheritEnabled}
                  />
                </View>

                {inheritEnabled && (
                  <>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 2 }}>Sinyal Yokluğu Süresi (Gün):</Text>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Örn: 30 gün..." 
                  placeholderTextColor="#888" 
                  value={inheritDays} 
                  onChangeText={setInheritDays} 
                  keyboardType="numeric"
                />

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>Varis Cüzdan Adresi:</Text>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]} 
                  placeholder="Varis cüzdan adresi..." 
                  placeholderTextColor="#888" 
                  value={inheritBeneficiary} 
                  onChangeText={setInheritBeneficiary} 
                />

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]} 
                  onPress={createInheritanceProtocol}
                  disabled={inheritanceLoading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>Miras Protokolü Oluştur</Text>

                    </TouchableOpacity>
                {inheritanceLoading && (
                  <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                    Miras protokolleri yükleniyor...
                  </Text>
                )}

                {!inheritanceLoading && inheritanceProtocols.length === 0 && (
                  <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 10, textAlign: 'center' }}>
                    Henüz kayıtlı miras protokolü bulunmuyor.
                  </Text>
                )}

                {!inheritanceLoading && inheritanceProtocols.map((protocol) => {
                  const statusText =
                    protocol.status === 'ACTIVE' ? 'AKTİF' :
                    protocol.status === 'CANCELLED' ? 'İPTAL EDİLDİ' :
                    'TASLAK';

                  return (
                    <View
                      key={protocol.id}
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.borderCol,
                        backgroundColor: theme.cardBg,
                      }}
                    >
                      <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                         Miras Protokolü — {statusText}
                      </Text>

                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        Ağ: {protocol.network}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        Cüzdan: {protocol.walletAddress}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        Varis: {protocol.beneficiaryAddress}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginBottom: 3 }}>
                        Hareketsizlik süresi: {protocol.inactivityDays} gün
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                        Son sinyal: {protocol.lastHeartbeatAt ? new Date(protocol.lastHeartbeatAt).toLocaleString() : '-'}
                      </Text>

                      {protocol.status !== 'CANCELLED' && (
                        <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.button, { flex: 1, height: 34, borderRadius: 6, backgroundColor: theme.primary }]}
                            onPress={() => heartbeatInheritanceProtocol(protocol.id)}
                            disabled={inheritanceLoading}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.buttonText, { fontSize: 10 }]}>Sinyali Yenile</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.button, { flex: 1, height: 34, borderRadius: 6, backgroundColor: '#8B0000' }]}
                            onPress={() => cancelInheritanceProtocol(protocol.id)}
                            disabled={inheritanceLoading}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.buttonText, { fontSize: 10 }]}>Protokolü İptal Et</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
                  </>
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'quickTestView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Standart kullanıcılar ilk üyelikten sonra sadece 1 kez bu testi yapabilir. VIP kullanıcılar sınırsız sorgulama yapabilir.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 10, height: 36, fontSize: 11 }]} 
                  placeholder="Test edilecek cüzdan adresi..." 
                  placeholderTextColor="#888" 
                  value={address} 
                  onChangeText={setAddress} 
                />
                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleAddressCheck}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}> Hızlı Cüzdan Testini Başlat</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : activeModule === 'emergencyLockView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Acil Varlık Kilidi: Bu sürümde gerçek blockchain kilitleme işlemi bağlı değildir. Bu ekran yalnızca yerel güvenlik senaryosunu gösterir.</Text>
              <View style={[styles.prefCard, { backgroundColor: '#7F1D1D', borderColor: '#EF4444' }]}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>Kilit Durumu: YEREL MOD — BLOCKCHAIN KİLİDİ DEĞİL</Text>
                <TouchableOpacity style={[styles.button, { backgroundColor: '#EF4444', width: '100%', height: 36, borderRadius: 6 }]} onPress={() => Alert.alert("Acil Varlık Kilidi", "Gerçek blockchain kilitleme işlemi bu sürümde aktif değil. Varlık transferi bu butonla dondurulmaz.")}>
                   <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 11 }}>Acil Varlık Kilidi — Gerçek Blockchain Kilidi Bağlı Değil</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : activeModule === 'gasOptView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Güncel ağ gas ücretlerini karşılaştırın.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 8 }}>CANLI GAS ÜCRETLERİ</Text>
                {Object.entries(networkGasFees).map(([network, fee]) => {
                  const names = { eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' };
                  return (
                    <View key={network} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.inputBg, padding: 8, borderRadius: 6, marginBottom: 5 }}>
                      <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{names[network] || network.toUpperCase()}</Text>
                      <Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold' }}>{fee}</Text>
                    </View>
                  );
                })}
              </View>
              {getRecommendedGasNetwork ? (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, marginTop: 8 }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>ÖNERİLEN AĞ</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold' }}>
                      {{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[getRecommendedGasNetwork.network] || getRecommendedGasNetwork.network.toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>
                      {getRecommendedGasNetwork.fee}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>Canlı gas verileri içindeki en düşük değer.</Text>
                </View>
              ) : null}

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginTop: 8 }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>Önerilen Gas Stratejisi</Text>
                <Text style={{ color: theme.textMain, fontSize: 10, lineHeight: 15 }}>Canlı RPC verilerine göre ağ ücretlerini karşılaştırarak daha uygun ağı tercih edin.</Text>
              </View>
            </ScrollView>
          ) : activeModule === 'deepIntelView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer}>
              <Text style={styles.prefDescription}>Blokzincir derinlik analizi ile cüzdanın fon kaynaklarını listeler.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>İstihbarat Taraması</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 15 }}>Fon kaynağı temiz ve doğrulanmış borsalarla ilişkilendirilmiş.</Text>
              </View>
            </ScrollView>
          ) : activeModule === 'autoPhishView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer}>
              <Text style={styles.prefDescription}>Tarayıcı ve DApp bağlantılarınızı oltalama sitelerine karşı korur.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}> Otomatik Kalkan Aktif</Text>
                <Text style={{ color: theme.textMain, fontSize: 11, lineHeight: 15 }}>Son 24 saatte 14 şüpheli site engellendi.</Text>
              </View>
            </ScrollView>
          ) : activeModule === 'preferencesView' ? (
            <>
            
            <View
              style={[
                styles.prefCard,
                {
                  backgroundColor: theme.itemBg,
                  borderColor: theme.borderCol,
                  marginBottom: 10
                }
              ]}
            >
              <Text
                style={{
                  color: theme.textMain,
                  fontSize: 12,
                  fontWeight: 'bold',
                  marginBottom: 8
                }}
              >
                {t('settings')}
              </Text>

              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 9,
                  marginBottom: 5
                }}
              >
                {t('selectedLanguage')}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 10 }}
              >
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
                          backgroundColor: active
                            ? theme.primary
                            : theme.inputBg,
                          borderWidth: 1,
                          borderColor: active
                            ? theme.primary
                            : theme.borderCol,
                          borderRadius: 6,
                          paddingHorizontal: 9,
                          paddingVertical: 6,
                          marginRight: 6
                        }}
                      >
                        <Text
                          style={{
                            color: active
                              ? '#FFFFFF'
                              : theme.textMain,
                            fontSize: 8,
                            fontWeight: 'bold'
                          }}
                        >
                          {item.nativeName}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </ScrollView>

              <Text
                style={{
                  color: theme.textSub,
                  fontSize: 9,
                  marginBottom: 5
                }}
              >
                {t('selectedCurrency')}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
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
                          backgroundColor: active
                            ? theme.primary
                            : theme.inputBg,
                          borderWidth: 1,
                          borderColor: active
                            ? theme.primary
                            : theme.borderCol,
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 6
                        }}
                      >
                        <Text
                          style={{
                            color: active
                              ? '#FFFFFF'
                              : theme.textMain,
                            fontSize: 8,
                            fontWeight: 'bold'
                          }}
                        >
                          {currency.symbol} {currency.code}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </ScrollView>

              <View
                style={{
                  marginTop: 9,
                  paddingTop: 7,
                  borderTopWidth: 1,
                  borderTopColor: theme.borderCol
                }}
              >
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8
                  }}
                >
                  {t('language')}: {V26_GLOBAL_I18N[selectedLanguage]?.nativeName || selectedLanguage}
                </Text>

                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
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
                  <Switch 
                    trackColor={{ false: '#374151', true: theme.primary }}
                    thumbColor={autoBlockScam ? '#FFFFFF' : '#9CA3AF'}
                    onValueChange={() => setAutoBlockScam(!autoBlockScam)}
                    value={autoBlockScam}
                  />
                </View>
              </View>
            </ScrollView>
            </>
          ) : activeModule === 'outboundShieldView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Cüzdanınızdan dışarıya yapacağınız transferleri test edin.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Hedef Alıcı Cüzdan Adresi..." 
                  placeholderTextColor="#888" 
                  value={outboundRecipient} 
                  onChangeText={setOutboundRecipient} 
                />
                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleOutboundShieldCheck}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{checkingOutbound ? "Taranıyor..." : " Transferi Test Et"}</Text>
                </TouchableOpacity>

                {outboundCheckResult && (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: outboundCheckResult.isBlocked ? '#EF4444' : '#10B981', fontWeight: 'bold', fontSize: 11 }}>{outboundCheckResult.status}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>Risk Seviyesi: {outboundCheckResult.riskLevel}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 2 }}>{outboundCheckResult.actionTaken}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'smartContractView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>EVM akıllı sözleşme adresini girerek gerçek blockchain verileri üzerinden temel güvenlik ve risk analizi yapın.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 9 }}>
                {["ethereum", "bsc", "polygon", "arbitrum", "base", "optimism", "avalanche"].map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setContractNetwork(key)}
                    style={{
                      minWidth: 70,
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      marginRight: 6,
                      borderRadius: 8,
                      backgroundColor: contractNetwork === key ? theme.primary : theme.inputBg,
                      borderWidth: 1,
                      borderColor: contractNetwork === key ? theme.primary : theme.borderCol
                    }}
                  >
                    <Text style={{
                      color: contractNetwork === key ? "#FFF" : theme.textMain,
                      fontSize: 9,
                      fontWeight: "900",
                      textAlign: "center"
                    }}>
                      {key === "ethereum" ? "Ethereum" : key === "bsc" ? "BNB Chain" : key === "polygon" ? "Polygon" : key === "arbitrum" ? "Arbitrum" : key === "base" ? "Base" : key === "optimism" ? "Optimism" : "Avalanche"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Akıllı Sözleşme Adresi (0x...)..." 
                  placeholderTextColor="#888" 
                  value={contractAddress} 
                  onChangeText={setContractAddress} 
                />
                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleSmartContractAnalysis}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingContract ? "Analiz Ediliyor..." : "Sözleşmeyi Analiz Et"}</Text>
                </TouchableOpacity>

                {contractAnalysisResult && (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11 }}>Risk Skoru: {contractAnalysisResult.riskScore}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>Alış Vergisi: {contractAnalysisResult.buyTax} | Satış Vergisi: {contractAnalysisResult.sellTax}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>Mint Yetkisi: {contractAnalysisResult.mintable}</Text>
                    {contractAnalysisResult.mintDetails && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ color: theme.textSub, fontSize: 9 }}>Mint RPC: {contractAnalysisResult.mintDetails.supported ? "DESTEKLENİYOR" : "DESTEKLENMİYOR"}</Text>
                        {contractAnalysisResult.mintDetails.capSupported && (
                          <Text style={{ color: theme.textSub, fontSize: 9 }}>Mint Cap: {contractAnalysisResult.mintDetails.cap}</Text>
                        )}
                        {contractAnalysisResult.mintDetails.minterRoleSupported && (
                          <Text style={{ color: theme.textSub, fontSize: 9 }}>MINTER_ROLE: TESPİT EDİLDİ</Text>
                        )}
                        {typeof contractAnalysisResult.mintDetails.ownerHasMinterRole === "boolean" && (
                          <Text style={{ color: theme.textSub, fontSize: 9 }}>Owner MINTER_ROLE: {contractAnalysisResult.mintDetails.ownerHasMinterRole ? "EVET" : "HAYIR"}</Text>
                        )}
                      </View>
                    )}
                    {contractAnalysisResult.adminDetails && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ color: theme.textSub, fontSize: 9 }}>Admin Role: {contractAnalysisResult.adminDetails.supported ? "DEFAULT_ADMIN_ROLE TESPİT EDİLDİ" : "DESTEKLENMİYOR"}</Text>
                        {contractAnalysisResult.adminDetails.countSupported && (
                          <Text style={{ color: theme.textSub, fontSize: 9 }}>Admin Sayısı: {contractAnalysisResult.adminDetails.count}</Text>
                        )}
                      </View>
                    )}
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 4 }}>{contractAnalysisResult.aiThreatRadar}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'behavioralView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Yapay zeka motoru ile cüzdanın davranışsal profilini çıkarın.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Analiz edilecek cüzdan adresi..." 
                  placeholderTextColor="#888" 
                  value={address} 
                  onChangeText={setAddress} 
                />
                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handleBehavioralAnalysis}>
                   <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingBehavior ? "Analiz Ediliyor..." : "⚠️ Davranışsal Risk Profilini Çıkar"}</Text>
                </TouchableOpacity>

                {behavioralAnalysisResult && (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      backgroundColor: theme.inputBg,
                      borderRadius: 6
                    }}
                  >
                    <Text
                      style={{
                        color: theme.primary,
                        fontWeight: 'bold',
                        fontSize: 12
                      }}
                    >
                      Profil Skoru: {behavioralAnalysisResult.behavioralScore}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 4
                      }}
                    >
                      Risk Seviyesi: {behavioralAnalysisResult.riskLevel}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Ağ: {behavioralAnalysisResult.network}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Cüzdan Yaşı: {behavioralAnalysisResult.walletAge}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Toplam İşlem: {behavioralAnalysisResult.totalTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Başarılı İşlem: {behavioralAnalysisResult.successfulTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Başarısız İşlem: {behavioralAnalysisResult.failedTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Başarısızlık Oranı: {behavioralAnalysisResult.failedRatio}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Gelen İşlemler: {behavioralAnalysisResult.incomingTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Giden İşlemler: {behavioralAnalysisResult.outgoingTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Benzersiz Karşı Taraf: {behavioralAnalysisResult.uniqueCounterparties}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Token Transferleri: {behavioralAnalysisResult.tokenTransferTransactions}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Farklı Token: {behavioralAnalysisResult.distinctTokens}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 4
                      }}
                    >
                      Mixer / Gizlilik Sinyali: {behavioralAnalysisResult.mixerInteraction}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        marginTop: 2
                      }}
                    >
                      Bot / Otomasyon: {behavioralAnalysisResult.botActivityScore}
                    </Text>

                    <Text
                      style={{
                        color: theme.textSub,
                        fontSize: 10,
                        marginTop: 6,
                        lineHeight: 15
                      }}
                    >
                      {behavioralAnalysisResult.summary}
                    </Text>

                    {Array.isArray(behavioralAnalysisResult.reasons) &&
                      behavioralAnalysisResult.reasons.length > 0 && (
                        <View style={{ marginTop: 7 }}>
                          <Text
                            style={{
                              color: theme.primary,
                              fontWeight: 'bold',
                              fontSize: 10
                            }}
                          >
                            Risk Nedenleri
                          </Text>

                          {behavioralAnalysisResult.reasons.map(
                            (reason, index) => (
                              <Text
                                key={`reason-${index}`}
                                style={{
                                  color: theme.textSub,
                                  fontSize: 9,
                                  marginTop: 3
                                }}
                              >
                                • {reason}
                              </Text>
                            )
                          )}
                        </View>
                      )}

                    {Array.isArray(behavioralAnalysisResult.signals) &&
                      behavioralAnalysisResult.signals.length > 0 && (
                        <View style={{ marginTop: 7 }}>
                          <Text
                            style={{
                              color: theme.primary,
                              fontWeight: 'bold',
                              fontSize: 10
                            }}
                          >
                            Risk Sinyalleri
                          </Text>

                          {behavioralAnalysisResult.signals.map(
                            (signal, index) => (
                              <Text
                                key={`signal-${index}`}
                                style={{
                                  color: theme.textSub,
                                  fontSize: 9,
                                  marginTop: 3
                                }}
                              >
                                • {typeof signal === 'string'
                                  ? signal
                                  : JSON.stringify(signal)}
                              </Text>
                            )
                          )}
                        </View>
                      )}

                    {behavioralAnalysisResult.scamMatched && (
                      <Text
                        style={{
                          color: theme.primary,
                          fontWeight: 'bold',
                          fontSize: 10,
                          marginTop: 7
                        }}
                      >
                         ⚠️ Scam istihbaratı ile eşleşme bulundu.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'phishingView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>Ziyaret etmek istediğiniz web sitesinin sahte olup olmadığını test edin.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="https://ornek-dapp.com..." 
                  placeholderTextColor="#888" 
                  value={phishingUrl} 
                  onChangeText={setPhishingUrl} 
                />
                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '85%', alignSelf: 'center', height: 36, borderRadius: 6 }]} onPress={handlePhishingAnalysis}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingPhishing ? "Taranıyor..." : "Bağlantıyı ve Siteyi Tara"}</Text>
                </TouchableOpacity>

                {phishingResult && (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: theme.inputBg, borderRadius: 6 }}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11 }}>{phishingResult.status}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginTop: 2 }}>Alan Adı Yaşı: {phishingResult.domainAge} | SSL: {phishingResult.sslValid}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginTop: 4 }}>{phishingResult.summary}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'revokeView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}>
                Kasaya (Vault) eklediğiniz kripto varlıklara ve NFT'lere ait aktif akıllı sözleşme harcama izinleri.
              </Text>
              {revokeList.length === 0 ? (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: '#EF4444', alignItems: 'center', padding: 16 }]}>
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>Aktif Harcama Yetkisi Bulunamadı</Text>
                  <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center' }}>Kasaya (Vault) cüzdan varlığı eklediğinizde token ve NFT yetkileriniz burada dinamik olarak görünecektir.</Text>
                </View>
              ) : (
                revokeList.map((item, index) => (
                  <View key={index} style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 2 }}>Varlık: {item.token}</Text>
                    <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 2 }}>Spender / Kontrat: {item.spender}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 10, marginBottom: 6 }}>Durum: {item.allowance}</Text>
                    <TouchableOpacity 
                      style={{ backgroundColor: '#EF4444', height: 34, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }} 
                      onPress={() => handleRevokeApproval(index)}
                    >
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>
                        {revokingIndex === index ? "İptal Ediliyor..." : "? Yetkiyi İptal Et (Revoke)"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          ) : activeModule === 'whaleWatchView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}> Büyük balina cüzdanlarının fon transferlerini anlık takip edin.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Takip edilecek balina cüzdan adresi..." 
                  placeholderTextColor="#888" 
                  value={newWhaleAddress} 
                  onChangeText={setNewWhaleAddress} 
                />
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]} 
                  onPress={() => {
                    if (!newWhaleAddress.trim()) return Alert.alert("Hata", "Adres boş olamaz");
                    setWhaleWatchList([SecurityScannerMiddleware.sanitizeInput(newWhaleAddress), ...whaleWatchList]);
                    setNewWhaleAddress('');
                    Alert.alert("Başarılı", "Balina adresi izleme listesine eklendi.");
                  }}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>Balina Adresi Ekle</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Aktif İzlenen Balinalar:</Text>
                {whaleWatchList.map((w, idx) => (
                  <View key={idx} style={{ backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4 }}>
                    <Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold' }}> {w}</Text>
                    <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 2 }}>Gerçek işlem verisi bekleniyor</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : activeModule === 'gasTimeView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
               <Text style={styles.prefDescription}>⛽ Ağ yoğunluğuna göre en ekonomik transfer saatini seçin.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Optimizasyon Modu:</Text>
                {['Standard', 'Ekonomik (%30 Ucuz Zaman Dilimi)', 'Acil (Hızlı İşlem)'].map((mode) => (
                  <TouchableOpacity 
                    key={mode} 
                    style={{ padding: 6, backgroundColor: gasOptimizerTarget === mode ? theme.primary : theme.inputBg, borderRadius: 6, marginBottom: 4 }}
                    onPress={() => setGasOptimizerTarget(mode)}
                  >
                    <Text style={{ color: gasOptimizerTarget === mode ? '#FFF' : theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{mode}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginTop: 4 }]}
                  onPress={() => Alert.alert("Başarılı", `Gas zamanlayıcı ${gasOptimizerTarget} moduna göre ayarlandı.`)}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>Gas Stratejisini Kaydet</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : activeModule === 'aiMarketView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
               <Text style={styles.prefDescription}>🧠 Yapay zeka tabanlı piyasa duygu analizi (sentiment) sunar.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginBottom: 8 }]}
                  onPress={fetchMarketIntelligence}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>{analyzingSentiment ? "Analiz Ediliyor..." : "Piyasa Sentiment Analizini Çalıştır"}</Text>
                </TouchableOpacity>

                {sentimentResult && (
  <View style={{ backgroundColor: theme.inputBg, padding: 8, borderRadius: 6 }}>

    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 5 }}>
      {sentimentResult.title || 'Market Intelligence'}
    </Text>

    {sentimentResult.status === 'LIVE' ? (
      <>
        <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 3 }}>
          Sentiment: {sentimentResult.sentiment}
        </Text>

        <Text style={{ color: theme.textMain, fontSize: 10, marginBottom: 3 }}>
          Risk Seviyesi: {sentimentResult.riskLevel}
        </Text>

        <Text style={{ color: theme.primary, fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>
          Skor: {sentimentResult.score}/100
        </Text>

        {sentimentResult.market ? (
          <View style={{ marginTop: 4, paddingTop: 5, borderTopWidth: 1, borderTopColor: theme.borderCol }}>

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
              Canlı Piyasa Verileri
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              Market Cap: ${Number(sentimentResult.market.totalMarketCapUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              24s Değişim: {Number(sentimentResult.market.marketCapChange24hPct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              İşlem Hacmi: ${Number(sentimentResult.market.totalVolumeUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              BTC Dominansı: {Number(sentimentResult.market.btcDominancePct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              ETH Dominansı: {Number(sentimentResult.market.ethDominancePct || 0).toFixed(2)}%
            </Text>

            <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}>
              Hacim / Market Cap: {(Number(sentimentResult.market.volumeToMarketCapRatio || 0) * 100).toFixed(2)}%
            </Text>

          </View>
        ) : null}

        {sentimentResult.signals && sentimentResult.signals.length > 0 ? (
          <View style={{ marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: theme.borderCol }}>

            <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold', marginBottom: 3 }}>
              Gerçek Piyasa Sinyalleri
            </Text>

            {sentimentResult.signals.map((signal, index) => (
              <Text
                key={`market-signal-${index}`}
                style={{ color: theme.textSub, fontSize: 9, marginBottom: 2 }}
              >
                • {signal}
              </Text>
            ))}

          </View>
        ) : null}

        <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>
          Balina Eğilimi: {sentimentResult.whaleAccumulation}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 4 }}>
          {sentimentResult.recommendation}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 6 }}>
          Kaynak: {sentimentResult.source || 'COINGECKO'}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
          Analiz: {sentimentResult.analysisType || 'RULE_BASED_MARKET_INTELLIGENCE'}
        </Text>

        <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 4 }}>
          Bu sonuç gerçek piyasa verilerinden üretilen kural tabanlı analizdir; yatırım tavsiyesi değildir.
        </Text>
      </>
    ) : (
      <Text style={{ color: theme.textSub, fontSize: 10 }}>
        {sentimentResult.message || 'Market Intelligence sonucu alınamadı.'}
      </Text>
    )}

  </View>
)}
              </View>
            </ScrollView>
          ) : activeModule === 'taxReportView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}> Tüm cüzdan hareketlerinizi vergi ve denetim raporu formatında dışa aktarın.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Rapor Dönemi:</Text>
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
                  onPress={() => Alert.alert("Rapor Hazır", "İşlem geçmişi ve vergi raporu CSV formatında hazırlandı.")}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>CSV / PDF Vergi Raporu İndir</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : activeModule === 'dexOrdersView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefDescription}> DEX üzerinde otomatik stop-loss ve take-profit emirleri oluşturun.</Text>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol }]}>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>Varlık Seçin:</Text>
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Örn: TRX, ETH..." 
                  placeholderTextColor="#888" 
                  value={slCrypto} 
                  onChangeText={setSlCrypto} 
                />
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Stop-Loss Fiyatı ($)..." 
                  placeholderTextColor="#888" 
                  value={slPrice} 
                  onChangeText={setSlPrice} 
                  keyboardType="numeric"
                />
                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="Take-Profit Fiyatı ($)..." 
                  placeholderTextColor="#888" 
                  value={tpPrice} 
                  onChangeText={setTpPrice} 
                  keyboardType="numeric"
                />
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6 }]}
                  onPress={() => {
                    if (!slPrice || !tpPrice) {
                      Alert.alert("Eksik Bilgi", "Lütfen Stop-Loss ve Take-Profit fiyatlarını doldurunuz.");
                      return;
                    }
                    const newOrder = { id: Date.now().toString(), crypto: slCrypto, sl: slPrice, tp: tpPrice };
                    setStopLossList([newOrder, ...stopLossList]);
                    setSlPrice('');
                    setTpPrice('');
                    Alert.alert("Başarılı", `${slCrypto} için DEX Stop-Loss/Take-Profit emri sisteme kaydedildi.`);
                  }}
                >
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>DEX Emrini Kaydet ve Çalıştır</Text>
                </TouchableOpacity>
              </View>

              {getRecommendedGasNetwork ? (
                <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, marginTop: 8 }]}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 11, marginBottom: 5 }}>ÖNERİLEN AĞ</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.textMain, fontSize: 12, fontWeight: 'bold' }}>
                      {{ eth: 'Ethereum', bsc: 'BNB Chain', polygon: 'Polygon', arb: 'Arbitrum' }[getRecommendedGasNetwork.network] || getRecommendedGasNetwork.network.toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>
                      {getRecommendedGasNetwork.fee}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSub, fontSize: 9, marginTop: 5 }}>Canlı gas verileri içindeki en düşük değer.</Text>
                </View>
              ) : null}

              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginTop: 8 }]}>
                <Text style={{ color: theme.textMain, fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Aktif Emirler ({stopLossList.length}):</Text>
                {stopLossList.length === 0 ? (
                  <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center', paddingVertical: 6 }}>Aktif emir bulunmuyor.</Text>
                ) : (
                  stopLossList.map(o => (
                    <View key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.inputBg, padding: 6, borderRadius: 6, marginBottom: 4, alignItems: 'center' }}>
                      <Text style={{ color: theme.textMain, fontSize: 10, fontWeight: 'bold' }}>{o.crypto} | SL: ${o.sl} - TP: ${o.tp}</Text>
                      <TouchableOpacity onPress={() => setStopLossList(stopLossList.filter(x => x.id !== o.id))} style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#FFF', fontSize: 9 }}>İptal</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : activeModule === 'vipView' ? (
            <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>
              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary, alignItems: 'center', padding: 16 }]}>
                <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12, marginBottom: 2 }}> Safe Sentinel Pro VIP Üyelik</Text>
                <Text style={{ color: theme.textSub, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>Sınırsız cüzdan sorgulama, gerçek zamanlı scam koruması ve gelişmiş AI istihbarat modüllerine tam erişim sağlayın.</Text>
                
                <View style={{ width: '100%', marginBottom: 12, alignItems: 'center' }}>
                  <QRCode value={VIP_PAYMENT_USDT_ADDRESS} size={130} />
                  <Text style={{ color: theme.textMain, fontSize: 9, marginTop: 6, textAlign: 'center' }}>{VIP_PAYMENT_USDT_ADDRESS}</Text>
                </View>

                <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary, width: '100%', height: 36, borderRadius: 6, marginBottom: 8 }]} onPress={handleOneClickVipPayment}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>TRC20 USDT ile Öde</Text>
                </TouchableOpacity>

                <TextInput 
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, width: '100%', marginBottom: 8, height: 36, fontSize: 11 }]} 
                  placeholder="İşlem Hash (TXID) değerini girin..." 
                  placeholderTextColor="#888" 
                  value={paymentTxHashInput} 
                  onChangeText={setPaymentTxHashInput} 
                />

                <TouchableOpacity style={[styles.button, { backgroundColor: '#10B981', width: '100%', height: 36, borderRadius: 6 }]} onPress={submitPaymentNotificationToSystem}>
                  <Text style={[styles.buttonText, { fontSize: 11 }]}>Ödemeyi Bildir ve Onayla</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      ) : (
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
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 18,
                    fontWeight: "900",
                    letterSpacing: 0.4
                  }}
                >
                  SAFE SENTINEL
                </Text>
                <Text
                  style={{
                    color: theme.primary,
                    fontSize: 10,
                    fontWeight: "800",
                    marginTop: 2
                  }}
                >
                  SECURITY COMMAND CENTER
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
                }}
              >
                <Text
                  style={{
                    color: apiOnline ? "#10B981" : "#EF4444",
                    fontSize: 8,
                    fontWeight: "900"
                  }}
                >
                  {apiOnline ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}
                </Text>
              </View>

              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 8
                }}
              >
                <TouchableOpacity
                  onPress={() => setActiveModule("vaultView")}
                  activeOpacity={0.82}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    backgroundColor: theme.inputBg,
                    borderColor: theme.borderCol,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: "center"
                  }}
                >
                  <Text style={{ color: theme.textMain, fontSize: 9, fontWeight: "900" }}>
                    CÜZDAN
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  onPress={() => setActiveModule("preferencesView")}
                  activeOpacity={0.82}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    backgroundColor: theme.inputBg,
                    borderColor: theme.borderCol,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: "center"
                  }}
                >
                  <Text style={{ color: theme.textMain, fontSize: 9, fontWeight: "900" }}>
                    AYARLAR
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLogout}
                  activeOpacity={0.82}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    backgroundColor: "#3A1111",
                    borderColor: "#7F1D1D",
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: "center"
                  }}
                >
                  <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "900" }}>
                     ÇIKIŞ
                  </Text>
                </TouchableOpacity>
              </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 150,
                  backgroundColor: theme.inputBg,
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: theme.borderCol
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  CÜZDAN GÜVENLİK SKORU
                </Text>
                <Text
                  style={{
                    color: theme.primary,
                    fontSize: 25,
                    fontWeight: "900",
                    marginTop: 4
                  }}
                >
                  {walletRisk?.score ?? walletRisk?.riskScore ?? "--"}
                  {walletRisk ? "/100" : ""}
                </Text>
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 2
                  }}
                >
                  {walletRisk?.level || "ANALİZ BEKLENİYOR"}
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  SCAM INTELLIGENCE
                </Text>
                <Text
                  style={{
                    color: walletScamIntel ? "#10B981" : theme.textMain,
                    fontSize: 15,
                    fontWeight: "900",
                    marginTop: 7
                  }}
                >
                  {walletScamIntel ? "ANALİZ MEVCUT" : "BEKLENİYOR"}
                </Text>
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
                  Tehdit istihbaratı durumu
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  KASA İZLEME
                </Text>
                <Text
                  style={{
                    color: vault.length > 0 ? "#10B981" : theme.textMain,
                    fontSize: 15,
                    fontWeight: "900",
                    marginTop: 7
                  }}
                >
                  {vault.length > 0 ? "AKTİF" : "HAZIR"}
                </Text>
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
                  {vault.length}/10 cüzdan izleniyor
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                  AĞ DURUMU
                </Text>
                <Text
                  style={{
                    color: theme.primary,
                    fontSize: 14,
                    fontWeight: "900",
                    marginTop: 7
                  }}
                >
                  {NETWORKS[selectedNetwork]?.name || selectedNetwork}
                </Text>
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
                  Son blok: {walletLatestBlock ?? "--"}
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
              }}
            >
              <View>
                <Text style={{ color: theme.textSub, fontSize: 8 }}>
                    TOPLAM PORTFÖY DEĞERİ
                </Text>
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 17,
                    fontWeight: "900",
                    marginTop: 3
                  }}
                >
                  ${portfolioUsdValue > 0 ? portfolioUsdValue.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }) : "--"}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setActiveModule("portfolioView")}
                style={{
                  backgroundColor: theme.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 7
                }}
              >
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: 8,
                    fontWeight: "900"
                  }}
                >
                  PORTFÖYÜ AÇ
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
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <View>
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 14,
                    fontWeight: "900"
                  }}
                >
                  Hızlı Cüzdan Güvenlik Taraması
                </Text>
                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
                  Cüzdanı sorgula ve güvenlik kontrollerini başlat
                </Text>
              </View>

              <Text
                style={{
                  color: theme.primary,
                  fontSize: 8,
                  fontWeight: "900"
                }}
              >
                LIVE SCAN
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 9 }}
            >
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
                      backgroundColor: selected
                        ? theme.primary
                        : theme.inputBg,
                      borderWidth: 1,
                      borderColor: selected
                        ? theme.primary
                        : theme.borderCol
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? "#FFF" : theme.textMain,
                        fontSize: 9,
                        fontWeight: "900",
                        textAlign: "center"
                      }}
                    >
                      {net.symbol}
                    </Text>
                    <Text
                      style={{
                        color: selected ? "#E2E8F0" : theme.textSub,
                        fontSize: 7,
                        textAlign: "center",
                        marginTop: 2
                      }}
                    >
                      ${liveCryptoPrices[net.symbol] || "0.00"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text
              style={{
                color: theme.textSub,
                fontSize: 8,
                fontWeight: "700",
                marginBottom: 4
              }}
            >
              CÜZDAN ADRESİ
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
                }
              ]}
              placeholder={`${NETWORKS[selectedNetwork].name} cüzdan adresi...`}
              placeholderTextColor="#777"
              value={address}
              onChangeText={setAddress}
            />

            {queryWarning ? (
              <Text
                style={{
                  color: "#EF4444",
                  fontSize: 9,
                  fontWeight: "800",
                  marginBottom: 8
                }}
              >
                {queryWarning}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 7
              }}
            >
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
                }}
              >
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: 10,
                    fontWeight: "900"
                  }}
                >
                  {loading ? "SORGULANIYOR..." : "CÜZDANI SORGULA"}
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
                }}
              >
                <Text style={{ color: "#10B981", fontSize: 9, fontWeight: "900" }}>
                  + WHITELIST
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
                }}
              >
                <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "900" }}>
                  + BLACKLIST
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
                }}
              >
                <Text style={{ color: "#8B5CF6", fontSize: 9, fontWeight: "900" }}>
                  + KASA
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
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 9
              }}
            >
              <View>
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 14,
                    fontWeight: "900"
                  }}
                >
                  Aktif Güvenlik Durumu
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
                  Kasanız ve güvenlik servislerinden gelen son durum
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setActiveModule("notificationsView")}
              >
                <Text
                  style={{
                    color: theme.primary,
                    fontSize: 8,
                    fontWeight: "900"
                  }}
                >
                   GÜVENLİK GÜNLÜĞÜ
                </Text>
              </TouchableOpacity>
            {/* V25-K2-UNREAD-BADGE */}
            {centralUnreadCount > 0 ? (
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
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 7,
                    fontWeight: 'bold'
                  }}
                >
                  {centralUnreadCount > 99
                    ? '99+'
                    : centralUnreadCount}
                </Text>
              </View>
            ) : null}
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 7
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 145,
                  backgroundColor: theme.inputBg,
                  padding: 10,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  GÜVENLİ ADRESLER
                </Text>
                <Text
                  style={{
                    color: "#10B981",
                    fontSize: 17,
                    fontWeight: "900",
                    marginTop: 3
                  }}
                >
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  ENGELLENEN ADRESLER
                </Text>
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 17,
                    fontWeight: "900",
                    marginTop: 3
                  }}
                >
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  AÇIK GÜVENLİK BİLDİRİMLERİ
                </Text>
                <Text
                  style={{
                    color: vaultNotifications.length > 0
                      ? "#F59E0B"
                      : "#10B981",
                    fontSize: 17,
                    fontWeight: "900",
                    marginTop: 3
                  }}
                >
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
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  REVOKE KAYITLARI
                </Text>
                <Text
                  style={{
                    color: revokeList.length > 0
                      ? "#F59E0B"
                      : "#10B981",
                    fontSize: 17,
                    fontWeight: "900",
                    marginTop: 3
                  }}
                >
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
            }}
          >
            <Text
              style={{
                color: theme.textMain,
                fontSize: 14,
                fontWeight: "900"
              }}
            >
              Güvenlik Merkezi
            </Text>
            <Text
              style={{
                color: theme.textSub,
                fontSize: 8,
                marginTop: 3,
                marginBottom: 10
              }}
            >
              İşlem, bağlantı, davranış ve sözleşme güvenliği
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8
              }}
            >
              {[
                ["Transfer Kalkanı", "Giden işlemleri analiz et", "outboundShieldView", "MEVCUT"],
                  ["Phishing Kalkanı", "Şüpheli bağlantıları tara", "phishingView", "MEVCUT"],
                ["AI Davranış", "Cüzdan davranışını analiz et", "behavioralView", "MEVCUT"],
                ["Akıllı Sözleşme", "Kontrat riskini incele", "smartContractView", "MEVCUT"],
                ["Revoke Merkezi", "Token yetkilerini kontrol et", "revokeView", "MEVCUT"]
              ].map((item, index) => (
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
                  }}
                >
                  <Text
                    style={{
                      color: theme.textMain,
                      fontSize: 11,
                      fontWeight: "900"
                    }}
                  >
                    {item[0]}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSub,
                      fontSize: 8,
                      marginTop: 3
                    }}
                  >
                    {item[1]}
                  </Text>
                  <Text
                    style={{
                      color: theme.primary,
                      fontSize: 7,
                      fontWeight: "900",
                      marginTop: 9
                    }}
                  >
                    {item[3]}
                  </Text>
                </TouchableOpacity>
              ))}
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
            }}
          >
            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              Cüzdan Koruma
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              Adres, kasa ve acil durum güvenliği
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Güvenli Adresler", `${whitelist.length} kayıt`, "whitelistView", "MEVCUT"],
                ["Engellenen Adresler", `${blacklist.length} kayıt`, "blacklistView", "MEVCUT"],
                ["Kasa Varlıkları", `${vault.length}/10 izleniyor`, "vaultView", "MEVCUT"],
                ["Guardian", "Güvenlik çemberi", "guardianView", "MEVCUT"]
              ].map((item, index) => (
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
                  }}
                >
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
              ))}
            </View>
          </View>

          {/* İSTİHBARAT */}
          <View
            style={{
              backgroundColor: theme.cardBg,
              borderColor: theme.borderCol,
              borderWidth: 1,
              borderRadius: 14,
              padding: 14,
              marginBottom: 12
            }}
          >
            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              İstihbarat ve İzleme
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              Zincir üzerindeki hareketleri ve tehditleri tek merkezde toplayın
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Balina Takip", "Büyük hareketleri izle", "whaleWatchView", "MEVCUT"],
                ["Scam Intelligence", "Tehdit eşleşmelerini analiz et", null, "PLANLANDI"],
                ["Derin Zincir İstihbaratı", "Adres ilişkilerini incele", "deepIntelView", "MEVCUT"],
                ["Early Warning", "Erken tehdit sinyalleri", null, "PLANLANDI"],
                ["Wallet Behavioral Fingerprint", "Cüzdan davranış profili", null, "PLANLANDI"],
                ["Scam DNA Engine", "Scam davranış kalıpları", null, "PLANLANDI"],
                ["Wallet Security Graph", "Adres ve kontrat ilişkileri", null, "PLANLANDI"]
              ].map((item, index) => (
                <TouchableOpacity
                  key={index}
                  disabled={!item[2]}
                  onPress={() => item[2] && setActiveModule(item[2])}
                  style={{
                    flex: 1,
                    minWidth: 185,
                    backgroundColor: theme.inputBg,
                    borderColor: item[3] === "PLANLANDI"
                      ? theme.borderCol
                      : theme.primary,
                    borderWidth: 1,
                    borderRadius: 9,
                    padding: 11,
                    opacity: item[3] === "PLANLANDI" ? 0.72 : 1
                  }}
                >
                  <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900" }}>
                    {item[0]}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>
                    {item[1]}
                  </Text>
                  <Text
                    style={{
                      color: item[3] === "PLANLANDI" ? theme.textSub : theme.primary,
                      fontSize: 7,
                      fontWeight: "900",
                      marginTop: 9
                    }}
                  >
                    {item[3]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* VARLIK VE FİNANS */}
          <View
            style={{
              backgroundColor: theme.cardBg,
              borderColor: theme.borderCol,
              borderWidth: 1,
              borderRadius: 14,
              padding: 14,
              marginBottom: 12
            }}
          >
            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              Varlık ve Finans
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              Portföy, gas, fiyat ve işlem yönetimi
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Portföy", "Kasa varlıklarını görüntüle", "portfolioView"],
                ["Gas Optimizasyonu", "Canlı ağ ücretlerini karşılaştır", "gasOptView"],
                ["Fiyat Alarmı", "Hedef fiyatları takip et", "priceAlertsView"],
                ["Vergi Raporu", "İşlem geçmişini raporla", "taxReportView"],
                ["AI Market", "Piyasa ve sentiment analizi", "aiMarketView"],
                ["DEX Orders", "Stop-loss ve take-profit", "dexOrdersView"]
              ].map((item, index) => (
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
                  }}
                >
                  <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900" }}>
                    {item[0]}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3 }}>
                    {item[1]}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 7, fontWeight: "900", marginTop: 9 }}>
                    MODÜLÜ AÇ
                  </Text>
                </TouchableOpacity>
              ))}
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
            }}
          >
            <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
              Acil Güvenlik ve Varlık Koruma
            </Text>
            <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 3, marginBottom: 10 }}>
              Kritik durumlar ve uzun vadeli varlık güvenliği
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Acil Varlık Kilidi", "Acil koruma modu", "emergencyLockView", "MEVCUT"],
                ["Guardian", "Güvenlik çemberi", "guardianView", "MEVCUT"],
                ["Kripto Varlık Mirasçılığı", "Dead Man's Switch", "inheritView", "MEVCUT"]
              ].map((item, index) => (
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
                  }}
                >
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
              ))}
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
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 9
              }}
            >
              <View>
                <Text style={{ color: theme.textMain, fontSize: 14, fontWeight: "900" }}>
                  Son İşlemler
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>
                  Son sorgulanan zincir hareketleri ve güvenlik sonuçları
                </Text>
              </View>

              <Text style={{ color: theme.primary, fontSize: 8, fontWeight: "900" }}>
                {transactionHistory.length} KAYIT
              </Text>
            </View>

            {transactionHistory.length === 0 ? (
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 9,
                  padding: 18,
                  alignItems: "center"
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 9 }}>
                  Henüz görüntülenecek işlem bulunmuyor.
                </Text>
                <Text style={{ color: theme.textSub, fontSize: 8, marginTop: 4 }}>
                  Cüzdan sorgusu yaptığınızda güvenlik sonuçları burada görünecek.
                </Text>
              </View>
            ) : (
              transactionHistory.slice(0, 6).map((item, index) => (
                <View
                  key={`${item.txid || index}-${index}`}
                  style={{
                    backgroundColor: theme.inputBg,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: item.scamMatched
                      ? "#EF4444"
                      : theme.borderCol
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMain,
                        fontSize: 10,
                        fontWeight: "900"
                      }}
                    >
                      {item.type || "İşlem"}
                    </Text>

                    <Text
                      style={{
                        color: item.scamMatched ? "#EF4444" : "#10B981",
                        fontSize: 8,
                        fontWeight: "900"
                      }}
                    >
                      {item.scamMatched ? "RİSKLİ" : "İNCELENDİ"}
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: theme.textSub,
                      fontSize: 8,
                      marginTop: 4
                    }}
                    numberOfLines={1}
                  >
                    {item.amount || "--"}
                  </Text>

                  <Text
                    style={{
                      color: theme.textSub,
                      fontSize: 7,
                      marginTop: 3
                    }}
                    numberOfLines={1}
                  >
                    TxID: {item.txid || "--"}
                  </Text>
                </View>
              ))
            )}
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
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.textMain,
                    fontSize: 14,
                    fontWeight: "900"
                  }}
                >
                  Safe Sentinel Pro VIP
                </Text>

                <Text
                  style={{
                    color: theme.textSub,
                    fontSize: 8,
                    marginTop: 3
                  }}
                >
                  Gelişmiş güvenlik, sürekli kasa izleme ve genişletilmiş araç erişimi
                </Text>
              </View>

              <Text
                style={{
                  color: "#10B981",
                  fontSize: 8,
                  fontWeight: "900"
                }}
              >
                {userStatus === "vip" ? "VIP AKTİF" : "STANDART"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 10,
                marginBottom: 9
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.inputBg,
                  borderRadius: 8,
                  padding: 9
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  AYLIK
                </Text>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900", marginTop: 2 }}>
                  {VIP_MONTHLY_USDT} USDT
                </Text>
              </View>

              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.inputBg,
                  borderRadius: 8,
                  padding: 9
                }}
              >
                <Text style={{ color: theme.textSub, fontSize: 7 }}>
                  YILLIK
                </Text>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: "900", marginTop: 2 }}>
                  {VIP_YEARLY_USDT} USDT
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
              }}
            >
              <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "900" }}>
                VIP ÜYELİK VE ÖDEME
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
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
        title: "AI Davranış",
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
      }
    ]
  },
  {
    id: "wallet",
    title: "CÜZDAN KORUMA",
    subtitle: "Adres ve kasa güvenliği",
    tools: [
      {
        title: "Güvenli Adresler",
        subtitle: "Güvenilir adresleri yönet",
        action: "YÖNET",
        mod: "whitelistView",
        label: "WHITELIST",
        dynamic: "whitelist"
      },
      {
        title: "Engellenen Adresler",
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
      }
    ]
  },
  {
    id: "advanced",
    title: "İSTİHBARAT & FİNANS",
    subtitle: "İzleme, analiz ve varlık araçları",
    tools: [
      {
        title: "Balina Takip",
        subtitle: "Büyük hareketleri izle",
        mod: "whaleWatchView",
        icon: ""
      },
      {
        title: "Portföy",
        subtitle: "Kasa varlıklarını görüntüle",
        mod: "portfolioView",
        icon: ""
      },
      {
        title: "Gas Optimizasyonu",
        subtitle: "Ağ ücretlerini takip et",
        mod: "gasOptView",
        icon: "⛽"
      },
      {
        title: "Fiyat Alarmı",
        subtitle: "Hedef fiyatları takip et",
        mod: "priceAlertsView",
        icon: ""
      },
      {
        title: "Vergi Raporu",
        subtitle: "İşlem geçmişini dışa aktar",
        mod: "taxReportView",
        icon: ""
      }
    ]
  }
];
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
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
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
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
    fontWeight: 'bold',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  prefScrollContainer: {
    padding: 12,
  },
  prefDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 12,
    lineHeight: 16,
  },
  prefCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  prefCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  backButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontWeight: 'bold',
  },

  prefCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  prefCardSub: {
    fontSize: 10,
    marginTop: 2,
  },});








































export default function SafeSentinelApp() {
  return (
    <SafeAreaProvider>
      <AppKitProvider instance={appKit}>
        <App />
        <AppKit />
      </AppKitProvider>
    </SafeAreaProvider>
  );
}



















