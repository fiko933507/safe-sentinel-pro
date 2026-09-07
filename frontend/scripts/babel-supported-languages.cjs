const {
  SUPPORTED_PRODUCTION_LANGUAGES,
  HIDDEN_PRODUCTION_MODULES
} = require('../production-feature-registry.cjs');

module.exports = function safeSentinelProductionUiPlugin({ types: t }) {
  const supported = new Set(SUPPORTED_PRODUCTION_LANGUAGES);
  const hiddenProductionModules = new Set(HIDDEN_PRODUCTION_MODULES);

  const runtimeTranslations = {
    runtimeWalletNotConnected: ['EVM cüzdan bağlı değil.', 'EVM wallet is not connected.'],
    runtimeWalletVerificationFailed: ['Bağlı cüzdan adresi doğrulanamadı.', 'Connected wallet address could not be verified.'],
    runtimeLoginSuccessTitle: ['Giriş Başarılı', 'Login Successful'],
    runtimeLoginFailedTitle: ['Giriş Başarısız', 'Login Failed'],
    runtimeLoginFailedGeneric: ['E-posta veya şifre hatalı ya da sunucuya ulaşılamıyor.', 'Email or password is incorrect, or the server is unreachable.'],
    runtimeMissingInfoTitle: ['Eksik Bilgi', 'Missing Information'],
    runtimeRegisterMissingFields: ['Lütfen ad, soyad, e-posta ve şifre alanlarını doldurunuz.', 'Please fill in first name, last name, email and password.'],
    runtimeInvalidPasswordTitle: ['Geçersiz Şifre', 'Invalid Password'],
    runtimeInvalidPasswordMessage: ['Şifreniz en az 10 karakter olmalıdır.', 'Your password must be at least 10 characters long.'],
    runtimeInvalidRegisterResponse: ['Sunucudan geçersiz kayıt yanıtı geldi.', 'The server returned an invalid registration response.'],
    runtimeRegisterSuccessTitle: ['Kayıt Başarılı', 'Registration Successful'],
    runtimeRegisterFailedTitle: ['Kayıt Başarısız', 'Registration Failed'],
    runtimeRegisterFailedGeneric: ['Kayıt sırasında sunucuya ulaşılamadı.', 'The server could not be reached during registration.'],
    runtimeStrongPasswordPlaceholder: ['Güçlü bir şifre belirleyin', 'Choose a strong password'],
    runtimeOptionalVaultWallet: ['Kasaya Eklenecek Cüzdan (Opsiyonel)', 'Wallet to Add to Vault (Optional)'],
    runtimeWalletPlaceholder: ['T... veya 0x... adresiniz', 'Your T... or 0x... address'],
    runtimeRegisterVipQuestion: ['Kayıt Sırasında VIP Olmak İster misiniz?', 'Would you like to become VIP during registration?'],
    runtimeInheritanceWalletMissingTitle: ['Cüzdan Adresi Eksik', 'Wallet Address Missing'],
    runtimeInheritanceWalletMissingMessage: ['Miras protokolü için önce ana cüzdan adresini girin.', 'Enter the primary wallet address before creating an inheritance protocol.'],
    runtimeInheritanceBeneficiaryMissing: ['Lütfen geçerli bir varis cüzdan adresi girin.', 'Please enter a valid beneficiary wallet address.'],
    runtimeInvalidDurationTitle: ['Geçersiz Süre', 'Invalid Duration'],
    runtimeInvalidDurationMessage: ['Sinyal yokluğu süresi 1 ile 3650 gün arasında olmalıdır.', 'The inactivity period must be between 1 and 3650 days.'],
    runtimeInheritanceCreatedTitle: ['Miras Protokolü Oluşturuldu', 'Inheritance Protocol Created'],
    runtimeInheritanceErrorTitle: ['Miras Protokolü Hatası', 'Inheritance Protocol Error'],
    runtimeInheritanceCreateFailed: ['Miras protokolü oluşturulamadı.', 'The inheritance protocol could not be created.'],
    runtimeHeartbeatUpdatedTitle: ['Heartbeat Güncellendi', 'Heartbeat Updated'],
    runtimeHeartbeatUpdatedMessage: ['Miras protokolünün yaşam sinyali backend üzerinde güncellendi.', 'The inheritance protocol heartbeat was updated on the backend.'],
    runtimeHeartbeatErrorTitle: ['Heartbeat Hatası', 'Heartbeat Error'],
    runtimeHeartbeatFailed: ['Heartbeat güncellenemedi.', 'The heartbeat could not be updated.'],
    runtimeInheritanceCancelledTitle: ['Miras Protokolü İptal Edildi', 'Inheritance Protocol Cancelled'],
    runtimeInheritanceCancelledMessage: ['Protokol backend üzerinde iptal edildi.', 'The protocol was cancelled on the backend.'],
    runtimeCancelErrorTitle: ['İptal Hatası', 'Cancellation Error'],
    runtimeInheritanceCancelFailed: ['Miras protokolü iptal edilemedi.', 'The inheritance protocol could not be cancelled.'],
    runtimeVipRequiredTitle: ['VIP Gerekli', 'VIP Required'],
    runtimeVaultVipRequired: ['Vault cüzdanı eklemek için aktif VIP aboneliğiniz bulunmalıdır.', 'An active VIP subscription is required to add a Vault wallet.'],
    runtimeVaultLimitTitle: ['Vault Limiti', 'Vault Limit'],
    runtimeVaultLimitMessage: ['VIP hesabınızda en fazla 10 cüzdan izlenebilir.', 'A VIP account can monitor up to 10 wallets.'],
    runtimeVaultSyncErrorTitle: ['Vault Senkronizasyon Hatası', 'Vault Sync Error'],
    runtimeVaultSyncErrorMessage: ["Cüzdan backend'e kaydedilemedi.", 'The wallet could not be saved to the backend.'],
    runtimePortfolioNoData: ['Dışa aktarılacak gerçek blockchain verisi bulunamadı.', 'No live blockchain data is available to export.'],
    runtimeEnterValidWallet: ['Lütfen sorgulanacak geçerli bir cüzdan adresi girin!', 'Please enter a valid wallet address to scan.'],
    runtimeInvalidWalletFormat: ['Geçersiz Adres Formatı', 'Invalid Address Format'],
    runtimeFreeQueryLimit: ['Ücretsiz 1 sorgu hakkınız bitti. Standart kullanıcılar için sadece 1 kez bu test yapılabilir. Sonraki cüzdan sorguları için VIP üyeliğe geçmeniz gerekmektedir.', 'Your one free scan has been used. Upgrade to VIP for additional wallet scans.'],
    runtimeBlacklistWarning: ['⚠️ DİKKAT: Bu adres küresel scam havuzunda (Blacklist) kayıtlı tehlikeli bir cüzdandır!', '⚠️ WARNING: This address is listed as dangerous in the scam blacklist.'],
    runtimeBlockedRisk: ['İşlem Engellendi (Riskli Adres)', 'Scan Blocked (Risky Address)'],
    runtimeCriticalSecurityAlert: ['KRİTİK GÜVENLİK UYARISI', 'CRITICAL SECURITY ALERT'],
    runtimeScamWalletScanned: ['Scam cüzdan sorgulandı!', 'A scam-listed wallet was scanned.'],
    runtimeLoadingChain: ['Backend sunucusundan gerçek zincir verileri çekiliyor...', 'Loading live blockchain data from the backend...'],
    runtimeScamAddressWarning: ['⚠️ DİKKAT: Bu adres evrensel ağlar üzerinde dolandırıcılık faaliyetleriyle ilişkilendirilmiş!', '⚠️ WARNING: This address is associated with scam activity in available intelligence sources.'],
    runtimeDangerousScamAddress: ['Tehlikeli / Scam Adres', 'Dangerous / Scam Address'],
    runtimeScamWalletDetected: ['Evrensel scam cüzdan tespit edildi.', 'A scam-listed wallet was detected.'],
    runtimeRevokeNotNeededTitle: ['Revoke Gerekli Değil', 'Revoke Not Required'],
    runtimeRevokeNotNeededMessage: ['Bu token için belirtilen spender adresinin mevcut harcama yetkisi zaten sıfır.', 'The spender allowance for this token is already zero.'],
    runtimeConnectEvmWallet: ['Önce EVM cüzdanınızı bağlamanız gerekiyor.', 'Connect your EVM wallet first.'],
    runtimeRevokeUnsupportedNetwork: ['Bu ağ için revoke işlemi henüz desteklenmiyor.', 'Revoke is not supported on this network yet.'],
    runtimeInvalidConnectedEvmWallet: ['Bağlı EVM cüzdan adresi geçersiz.', 'The connected EVM wallet address is invalid.'],
    runtimeInvalidTokenContract: ['Token kontrat adresi geçersiz.', 'The token contract address is invalid.'],
    runtimeInvalidSpenderContract: ['Spender kontrat adresi geçersiz.', 'The spender contract address is invalid.'],
    runtimeRevokePrepareFailed: ['Revoke işlemi backend tarafından hazırlanamadı.', 'The backend could not prepare the revoke transaction.'],
    runtimeRevokeAllowanceMissing: ['Backend revoke hazırlığında allowance değeri bulunamadı.', 'The backend revoke preparation did not return an allowance value.'],
    runtimeRevokeSentTitle: ['Revoke İşlemi Gönderildi', 'Revoke Transaction Sent'],
    runtimeRevokeConfirmedTitle: ['Revoke Doğrulandı', 'Revoke Confirmed'],
    runtimeRevokePrepareErrorTitle: ['Revoke Hazırlama Hatası', 'Revoke Preparation Error'],
    runtimeInvalidAddressTitle: ['Geçersiz Adres', 'Invalid Address'],
    runtimeAnalysisFailedTitle: ['Analiz Başarısız', 'Analysis Failed'],
    runtimeBehaviorAnalysisFailedTitle: ['Davranış Analizi Başarısız', 'Behavior Analysis Failed'],
    runtimeInvalidUrlTitle: ['Geçersiz URL', 'Invalid URL'],
    runtimePhishingAnalysisFailedTitle: ['Phishing Analizi Başarısız', 'Phishing Analysis Failed'],
    runtimeTrc20PaymentTitle: ['TRC20 USDT Ödeme', 'TRC20 USDT Payment'],
    runtimeErrorTitle: ['Hata', 'Error'],
    runtimeInvalidTxidTitle: ['Geçersiz TXID', 'Invalid TXID'],
    runtimeVipActivatedTitle: ['VIP Aktivasyonu Başarılı', 'VIP Activation Successful'],
    runtimeVerificationCompleteTitle: ['Doğrulama Tamamlandı', 'Verification Complete'],
    runtimeVipVerificationFailedTitle: ['VIP Doğrulama Başarısız', 'VIP Verification Failed'],
    runtimeSecurityCommandCenter: ['SECURITY COMMAND CENTER', 'SECURITY COMMAND CENTER'],
    runtimeScamIntelligenceTitle: ['SCAM INTELLIGENCE', 'SCAM INTELLIGENCE'],
    runtimeBlockedAddressesTitle: ['Engellenen Adresler', 'Blocked Addresses']
  };

  const sourceToKey = new Map(
    Object.entries(runtimeTranslations).flatMap(([key, values]) =>
      values.map((value) => [value, key])
    )
  );

  const getPropertyKey = (property) => {
    if (!t.isObjectProperty(property)) return null;
    if (t.isIdentifier(property.key)) return property.key.name;
    if (t.isStringLiteral(property.key)) return property.key.value;
    return null;
  };

  const setTranslation = (languageObject, key, value) => {
    if (!t.isObjectExpression(languageObject)) return;
    const property = languageObject.properties.find((item) => getPropertyKey(item) === key);
    if (property && t.isObjectProperty(property)) {
      property.value = t.stringLiteral(value);
      return;
    }
    languageObject.properties.push(t.objectProperty(t.identifier(key), t.stringLiteral(value)));
  };

  const stateName = (node) => {
    if (!t.isArrayPattern(node) || node.elements.length === 0) return null;
    const first = node.elements[0];
    return t.isIdentifier(first) ? first.name : null;
  };

  const canUseRuntimeTranslator = (path) => path.scope.hasBinding('t');
  const translatedCall = (key) => t.callExpression(t.identifier('t'), [t.stringLiteral(key)]);

  return {
    name: 'safe-sentinel-production-ui-hardening',
    visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value !== 'react-native') return;
        const hasShare = path.node.specifiers.some(
          (specifier) => t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported, { name: 'Share' })
        );
        if (!hasShare) path.node.specifiers.push(t.importSpecifier(t.identifier('Share'), t.identifier('Share')));
      },

      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id, { name: 'V26_GLOBAL_I18N' }) && t.isObjectExpression(path.node.init)) {
          path.node.init.properties = path.node.init.properties.filter((property) => {
            const key = getPropertyKey(property);
            return key ? supported.has(key) : true;
          });
          return;
        }

        if (t.isIdentifier(path.node.id, { name: 'V26_TRANSLATIONS' }) && t.isObjectExpression(path.node.init)) {
          for (const languageProperty of path.node.init.properties) {
            const language = getPropertyKey(languageProperty);
            if (!t.isObjectProperty(languageProperty) || !t.isObjectExpression(languageProperty.value)) continue;
            if (language === 'tr' || language === 'en') {
              const valueIndex = language === 'tr' ? 0 : 1;
              for (const [key, values] of Object.entries(runtimeTranslations)) setTranslation(languageProperty.value, key, values[valueIndex]);
            }
            if (language === 'tr') {
              setTranslation(languageProperty.value, 'toolTitleAiMarket', 'Piyasa İstihbaratı');
              setTranslation(languageProperty.value, 'aiMarketDescription', 'Canlı piyasa verilerinden üretilen kural tabanlı duyarlılık ve risk göstergelerini görüntüleyin.');
              setTranslation(languageProperty.value, 'dashboardAiBehavior', 'Davranış Analizi');
              setTranslation(languageProperty.value, 'dashboardAnalyzeWalletBehavior', 'Cüzdan davranış sinyallerini analiz et');
            }
            if (language === 'en') {
              setTranslation(languageProperty.value, 'toolTitleAiMarket', 'Market Intelligence');
              setTranslation(languageProperty.value, 'aiMarketDescription', 'View rule-based sentiment and risk indicators generated from live market data.');
              setTranslation(languageProperty.value, 'dashboardAiBehavior', 'Behavior Analysis');
              setTranslation(languageProperty.value, 'dashboardAnalyzeWalletBehavior', 'Analyze wallet behavior signals');
            }
          }
          return;
        }

        const currentStateName = stateName(path.node.id);
        if (currentStateName === 'whaleWatchList' && t.isCallExpression(path.node.init) && t.isIdentifier(path.node.init.callee, { name: 'useState' })) {
          path.node.init.arguments = [t.arrayExpression([])];
          return;
        }
        if (currentStateName === 'networkGasFees' && t.isCallExpression(path.node.init) && t.isIdentifier(path.node.init.callee, { name: 'useState' }) && t.isObjectExpression(path.node.init.arguments[0])) {
          for (const property of path.node.init.arguments[0].properties) if (t.isObjectProperty(property)) property.value = t.stringLiteral('—');
          return;
        }
        if (t.isIdentifier(path.node.id, { name: 'priceAlertsMode' })) path.node.init = t.stringLiteral('SERVER_MONITORED');
      },

      StringLiteral(path) {
        const key = sourceToKey.get(path.node.value);
        if (!key || !canUseRuntimeTranslator(path)) return;

        const variableDeclarator = path.findParent((parent) => parent.isVariableDeclarator());
        if (variableDeclarator && t.isIdentifier(variableDeclarator.node.id, { name: 'V26_TRANSLATIONS' })) return;

        const useStateCall = path.findParent((parent) => parent.isCallExpression() && t.isIdentifier(parent.node.callee, { name: 'useState' }));
        if (useStateCall) return;

        if (path.parentPath && path.parentPath.isJSXAttribute() && path.parentPath.node.value === path.node) {
          path.parentPath.node.value = t.jsxExpressionContainer(translatedCall(key));
          path.skip();
          return;
        }

        path.replaceWith(translatedCall(key));
        path.skip();
      },

      JSXText(path) {
        const normalized = String(path.node.value || '').replace(/\s+/g, ' ').trim();
        const key = sourceToKey.get(normalized);
        if (!key || !canUseRuntimeTranslator(path)) return;
        path.replaceWith(t.jsxExpressionContainer(translatedCall(key)));
        path.skip();
      },

      ArrayExpression(path) {
        path.node.elements = path.node.elements.filter((element) => {
          if (t.isArrayExpression(element)) {
            return !element.elements.some(
              (item) => t.isStringLiteral(item) && hiddenProductionModules.has(item.value)
            );
          }
          if (t.isObjectExpression(element)) {
            const moduleProperty = element.properties.find(
              (property) => t.isObjectProperty(property) && getPropertyKey(property) === 'mod'
            );
            if (moduleProperty && t.isStringLiteral(moduleProperty.value)) {
              return !hiddenProductionModules.has(moduleProperty.value.value);
            }
          }
          return true;
        });
      }
    }
  };
};
