from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected pattern: {label}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# frontend/App.js
# -----------------------------------------------------------------------------
p = Path("frontend/App.js")
s = p.read_text(encoding="utf-8")

# Live FX rates: use backend data with current static values only as fallback.
s = replace_once(
    s,
    "const v26FormatCurrency = (usdValue, currencyCode = 'USD') => {",
    "const v26FormatCurrency = (usdValue, currencyCode = 'USD', exchangeRates = V26_EXCHANGE_RATES_FROM_USD) => {",
    "currency formatter signature",
)
s = replace_once(
    s,
    "Number(V26_EXCHANGE_RATES_FROM_USD[currency.code]) || 1;",
    "Number(exchangeRates?.[currency.code] ?? V26_EXCHANGE_RATES_FROM_USD[currency.code]) || 1;",
    "currency formatter rate source",
)
s = replace_once(
    s,
    "  const [selectedCurrency, setSelectedCurrency] = useState('TRY');",
    "  const [selectedCurrency, setSelectedCurrency] = useState('TRY');\n  const [liveExchangeRates, setLiveExchangeRates] = useState(V26_EXCHANGE_RATES_FROM_USD);\n  const [fxRateUpdatedAt, setFxRateUpdatedAt] = useState(null);",
    "FX state",
)
s = replace_once(
    s,
    "  const formatCurrency = (usdValue) =>\n  v26FormatCurrency(usdValue, selectedCurrency);",
    "  const formatCurrency = (usdValue) =>\n  v26FormatCurrency(usdValue, selectedCurrency, liveExchangeRates);",
    "live formatCurrency",
)

health_block = """  useEffect(() => {
    checkBackendHealth();
    const healthTimer = setInterval(checkBackendHealth, 60000);
    return () => clearInterval(healthTimer);
  }, [checkBackendHealth]);"""

if "const fetchLiveExchangeRates = useCallback" not in s:
    s = replace_once(
        s,
        health_block,
        health_block
        + """

  const fetchLiveExchangeRates = useCallback(async () => {
    try {
      const response = await api.get('/api/fx-rates', { timeout: 12000 });
      const rates = response?.data?.rates;
      if (response?.data?.success && rates && typeof rates === 'object') {
        setLiveExchangeRates((current) => ({ ...current, ...rates, USD: 1 }));
        setFxRateUpdatedAt(response?.data?.updatedAt || new Date().toISOString());
      }
    } catch (error) {
      console.warn('[FX] Live rates unavailable; keeping last known/fallback rates:', error?.message || error);
    }
  }, []);

  useEffect(() => {
    fetchLiveExchangeRates();
    const timer = setInterval(fetchLiveExchangeRates, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchLiveExchangeRates]);""",
        "live FX effect",
    )

# Explicit wallet-management wording. Keep only chains already configured and
# already supported end-to-end; do not invent new chain support here.
s = s.replace(
    "? (selectedLanguage === 'tr' ? 'YÖNET' : 'MANAGE')",
    "? (selectedLanguage === 'tr' ? 'CÜZDAN DEĞİŞTİR' : 'CHANGE WALLET')",
    1,
)

# Status bar / SafeArea spacing.
s = s.replace(
    "paddingTop: Math.max(8, insets.top + 4)",
    "paddingTop: Math.max(16, insets.top + 12)",
    1,
)
s = replace_once(
    s,
    '<ScrollView contentContainerStyle={styles.dashboardContainer} showsVerticalScrollIndicator={false}>',
    '<ScrollView contentContainerStyle={[styles.dashboardContainer, { paddingTop: Math.max(14, insets.top + 10) }]} showsVerticalScrollIndicator={false}>',
    "dashboard SafeArea spacing",
)

# Smart contract validation i18n.
s = replace_once(
    s,
    '      "Lütfen analiz edilecek geçerli bir akıllı sözleşme adresi girin."',
    "      selectedLanguage === 'tr' ? 'Lütfen analiz edilecek geçerli bir akıllı sözleşme adresi girin.' : 'Enter a valid smart contract address to analyze.'",
    "contract missing address i18n",
)
s = replace_once(
    s,
    '      "Akıllı sözleşme adresi 0x ile başlayan geçerli bir EVM adresi olmalıdır."',
    "      selectedLanguage === 'tr' ? 'Akıllı sözleşme adresi 0x ile başlayan geçerli bir EVM adresi olmalıdır.' : 'The smart contract address must be a valid EVM address beginning with 0x.'",
    "contract invalid address i18n",
)

# Guardian: validate against selected network and localize prompt.
guardian_old = """    if (!cleanAddr) {
      Alert.alert(
        'Guardian',
        'Guardian analizi için geçerli bir cüzdan adresi girin.'
      );
      return;
    }"""
guardian_new = """    if (!cleanAddr || !validateAddressFormat(selectedNetwork, cleanAddr)) {
      Alert.alert(
        'Guardian',
        selectedLanguage === 'tr'
          ? `Guardian analizi için ${NETWORKS[selectedNetwork]?.name || selectedNetwork} ağına uygun geçerli bir cüzdan adresi girin.`
          : `Enter a valid wallet address for ${NETWORKS[selectedNetwork]?.name || selectedNetwork} before running Guardian analysis.`
      );
      return;
    }"""
s = replace_once(s, guardian_old, guardian_new, "Guardian validation")

# Behavioral analysis: risk level, percentage, reasons, and network formatting.
level_old = """      const levelText =
      level === "critical" ?
      "Kritik" :
      level === "high" ?
      "Yüksek" :
      level === "medium" ?
      "Orta" :
      level === "low" ?
      "Düşük" :
      "Belirlenemedi";"""
level_new = """      const levelText =
      selectedLanguage === 'tr' ?
      (level === "critical" ? "Kritik" : level === "high" ? "Yüksek" : level === "medium" ? "Orta" : level === "low" ? "Düşük" : "Belirlenemedi") :
      (level === "critical" ? "Critical" : level === "high" ? "High" : level === "medium" ? "Medium" : level === "low" ? "Low" : "Unknown");"""
s = replace_once(s, level_old, level_new, "behavior risk level")

ratio_old = """      const failedRatioText =
      failedRatio === null ?
      "Belirlenemedi" :
      `%${(failedRatio * 100).toFixed(1)}`;"""
ratio_new = """      const failedRatioText =
      failedRatio === null ?
      (selectedLanguage === 'tr' ? "Belirlenemedi" : "Unknown") :
      (() => {
        const value = Number((failedRatio * 100).toFixed(1));
        return selectedLanguage === 'tr' ? `%${value}` : `${value}%`;
      })();"""
s = replace_once(s, ratio_old, ratio_new, "behavior percentage")

reasons_old = """      const reasons =
      Array.isArray(risk.reasons) ?
      risk.reasons.filter(Boolean) :
      [];"""
reasons_new = """      const behaviorReasonTranslations = {
        'Cüzdan 24 saatten daha yeni.': 'Wallet is less than 24 hours old.',
        'Cüzdan çok yeni oluşturulmuş.': 'Wallet was created very recently.',
        'Cüzdan son 7 gün içinde oluşturulmuş.': 'Wallet was created within the last 7 days.',
        'Cüzdan 30 günden daha yeni.': 'Wallet is less than 30 days old.',
        'İncelenen zaman penceresinde işlem geçmişi bulunamadı.': 'No transaction history was found in the analyzed time window.',
        'Cüzdanda başarısız işlemler bulundu.': 'Failed transactions were found in the wallet history.',
        'Fon girişlerinden sonra birden fazla adrese dağıtım davranışı gözlendi.': 'Funds were distributed to multiple addresses after incoming transfers.',
        'Birden fazla adresten yoğun fon toplama davranışı gözlendi.': 'A concentrated fund-collection pattern from multiple addresses was observed.',
        'Mevcut zincir verilerinde belirgin risk sinyali bulunmadı.': 'No significant risk signal was found in the available on-chain data.'
      };

      const reasons =
      Array.isArray(risk.reasons) ?
      risk.reasons.filter(Boolean).map((reason) =>
        selectedLanguage === 'tr' ? reason : (behaviorReasonTranslations[String(reason)] || String(reason))
      ) :
      [];"""
s = replace_once(s, reasons_old, reasons_new, "behavior reasons")

s = s.replace(
    '        "Bu endpoint kapsamında hesaplanmadı",',
    "        selectedLanguage === 'tr' ? 'Bu endpoint kapsamında hesaplanmadı' : 'Not calculated by this endpoint',",
    1,
)
s = s.replace(
    '        "Risk sinyali bulundu" :\n        "Açık mixer sinyali bulunmadı",',
    "        (selectedLanguage === 'tr' ? 'Risk sinyali bulundu' : 'Risk signal found') :\n        (selectedLanguage === 'tr' ? 'Açık mixer sinyali bulunmadı' : 'No explicit mixer signal found'),",
    1,
)
s = s.replace(
    '        "Risk sinyali bulundu" :\n        "Belirgin bot sinyali bulunmadı",',
    "        (selectedLanguage === 'tr' ? 'Risk sinyali bulundu' : 'Risk signal found') :\n        (selectedLanguage === 'tr' ? 'Belirgin bot sinyali bulunmadı' : 'No significant bot signal found'),",
    1,
)
s = s.replace(
    "        risk.network ||\n        data.network ||\n        backendNetwork,",
    "        String(risk.network || data.network || backendNetwork || '').toUpperCase(),",
    1,
)

# Transfer Shield runtime result i18n.
transfer_old = """      const inWhitelist = securityListContains(whitelist, cleanRecipient, selectedNetwork);
      const inBlacklist = securityListContains(blacklist, cleanRecipient, selectedNetwork);
      const riskLevel = inBlacklist ? "Çok Yüksek" : matched ? "Çok Yüksek" : inWhitelist ? "Liste Onaylı" : "Belirlenemedi";
      const actionTaken = inBlacklist ?
      "Bu adres kişisel Blacklist listenizde. Transferi göndermeden önce adresi yeniden doğrulayın." :
      matched ?
      "Bu adres scam istihbaratında eşleşti. Transferi göndermeden önce durdurun ve adresi tekrar doğrulayın." :
      inWhitelist ?
      "Bu adres kişisel Whitelist listenizde. Whitelist kaydı zincir üstü güvenlik garantisi değildir." :
      "Adres mevcut scam istihbaratıyla eşleşmedi. Bu sonuç adresin tamamen güvenli olduğu anlamına gelmez.";"""
transfer_new = """      const inWhitelist = securityListContains(whitelist, cleanRecipient, selectedNetwork);
      const inBlacklist = securityListContains(blacklist, cleanRecipient, selectedNetwork);
      const riskLevel = selectedLanguage === 'tr'
        ? (inBlacklist || matched ? 'Çok Yüksek' : inWhitelist ? 'Whitelist Kaydı' : 'Belirlenemedi')
        : (inBlacklist || matched ? 'Very High' : inWhitelist ? 'Whitelisted' : 'Unknown');
      const actionTaken = selectedLanguage === 'tr'
        ? (inBlacklist
            ? 'Bu adres kişisel Blacklist listenizde. Transferi göndermeden önce adresi yeniden doğrulayın.'
            : matched
            ? 'Bu adres scam istihbaratında eşleşti. Transferi göndermeden önce durdurun ve adresi tekrar doğrulayın.'
            : inWhitelist
            ? 'Bu adres kişisel Whitelist listenizde. Whitelist kaydı zincir üstü güvenlik garantisi değildir.'
            : 'Adres mevcut scam istihbaratıyla eşleşmedi. Bu sonuç adresin tamamen güvenli olduğu anlamına gelmez.')
        : (inBlacklist
            ? 'This address is in your personal Blacklist. Verify the destination again before sending.'
            : matched
            ? 'This address matched scam intelligence. Stop and verify the destination before sending.'
            : inWhitelist
            ? 'This address is in your personal Whitelist. A whitelist entry is not an on-chain security guarantee.'
            : 'No match was found in current scam intelligence. This does not guarantee that the address is safe.');"""
s = replace_once(s, transfer_old, transfer_new, "Transfer Shield i18n")

status_old = """        status: inBlacklist ? "⚠️ BLACKLIST UYARISI" : matched ?
        "⚠️ YÜKSEK RİSK" : inWhitelist ? "WHITELIST KAYDI" :
        "SCAM EŞLEŞMESİ YOK","""
status_new = """        status: selectedLanguage === 'tr'
          ? (inBlacklist ? '⚠️ BLACKLIST UYARISI' : matched ? '⚠️ YÜKSEK RİSK' : inWhitelist ? 'WHITELIST KAYDI' : 'SCAM EŞLEŞMESİ YOK')
          : (inBlacklist ? '⚠️ BLACKLIST WARNING' : matched ? '⚠️ HIGH RISK' : inWhitelist ? 'WHITELIST ENTRY' : 'NO SCAM MATCH'),"""
s = replace_once(s, status_old, status_new, "Transfer Shield status")
s = s.replace(
    '        "Belirtilmedi",',
    "        selectedLanguage === 'tr' ? 'Belirtilmedi' : 'Not specified',",
    1,
)

# Whitelist/Blacklist API failures must be visible instead of silently swallowed.
s = replace_once(
    s,
    """    } catch (e) { handleIsolatedError('Whitelist Ekleme', e); }
  };""",
    """    } catch (e) {
      handleIsolatedError('Whitelist Ekleme', e);
      const serverError = e?.response?.data?.error;
      Alert.alert(
        t('commonErrorTitle'),
        selectedLanguage === 'tr'
          ? (serverError === 'Invalid address' ? 'Adres biçimi seçili ağ için geçersiz.' : serverError === 'Network not supported' ? 'Bu ağ Whitelist tarafından desteklenmiyor.' : 'Whitelist kaydı sunucuya eklenemedi. Lütfen tekrar deneyin.')
          : (serverError === 'Invalid address' ? 'The address is invalid for the selected network.' : serverError === 'Network not supported' ? 'This network is not supported by Whitelist.' : 'The Whitelist entry could not be saved to the server. Please try again.')
      );
      await syncSecurityAddressLists();
    }
  };""",
    "Whitelist error feedback",
)
s = replace_once(
    s,
    """    } catch (e) { handleIsolatedError('Blacklist Ekleme', e); }
  };""",
    """    } catch (e) {
      handleIsolatedError('Blacklist Ekleme', e);
      const serverError = e?.response?.data?.error;
      Alert.alert(
        t('commonErrorTitle'),
        selectedLanguage === 'tr'
          ? (serverError === 'Invalid address' ? 'Adres biçimi seçili ağ için geçersiz.' : serverError === 'Network not supported' ? 'Bu ağ Blacklist tarafından desteklenmiyor.' : 'Blacklist kaydı sunucuya eklenemedi. Lütfen tekrar deneyin.')
          : (serverError === 'Invalid address' ? 'The address is invalid for the selected network.' : serverError === 'Network not supported' ? 'This network is not supported by Blacklist.' : 'The Blacklist entry could not be saved to the server. Please try again.')
      );
      await syncSecurityAddressLists();
    }
  };""",
    "Blacklist error feedback",
)

# Refresh notification center after list changes.
for old, new in [
    ("      await syncSecurityAddressLists();\n      Alert.alert(t('commonSuccessTitle'), t('whitelistAdded'));", "      await syncSecurityAddressLists();\n      await loadCentralNotifications();\n      Alert.alert(t('commonSuccessTitle'), t('whitelistAdded'));"),
    ("      await syncSecurityAddressLists();\n      Alert.alert(t('commonSuccessTitle'), t('blacklistRiskAdded'));", "      await syncSecurityAddressLists();\n      await loadCentralNotifications();\n      Alert.alert(t('commonSuccessTitle'), t('blacklistRiskAdded'));"),
    ("      await syncSecurityAddressLists();\n      Alert.alert(t('commonSuccessTitle'), t('whitelistRemoved'));", "      await syncSecurityAddressLists();\n      await loadCentralNotifications();\n      Alert.alert(t('commonSuccessTitle'), t('whitelistRemoved'));"),
    ("      await syncSecurityAddressLists();\n      Alert.alert(t('commonSuccessTitle'), t('blacklistRemoved'));", "      await syncSecurityAddressLists();\n      await loadCentralNotifications();\n      Alert.alert(t('commonSuccessTitle'), t('blacklistRemoved'));"),
]:
    s = s.replace(old, new, 1)

# Play Store builds cannot use direct crypto payment to unlock digital features.
payment_anchor = """  const handleOneClickVipPayment = async () => {
    try {"""
s = replace_once(
    s,
    payment_anchor,
    """  const handleOneClickVipPayment = async () => {
    if (IS_PLAY_STORE_BUILD) {
      Alert.alert(
        selectedLanguage === 'tr' ? 'VIP Satın Alma' : 'VIP Purchase',
        selectedLanguage === 'tr'
          ? 'Google Play sürümünde dijital üyelik için doğrudan kripto ödeme kullanılmaz. Uyumlu uygulama içi satın alma akışı etkinleştirildiğinde burada sunulacaktır.'
          : 'Direct crypto payment is not used for digital membership in the Google Play build. A compliant in-app purchase flow will be shown here when enabled.'
      );
      return;
    }
    try {""",
    "Play Store VIP crypto-payment guard",
)

# Price Alerts must not contain the unrelated gas recommendation panel.
price_start = s.find("activeModule === 'priceAlertsView'")
if price_start != -1:
    next_module = s.find("activeModule ===", price_start + 40)
    search_end = next_module if next_module != -1 else min(len(s), price_start + 30000)
    chunk = s[price_start:search_end]
    marker = "{t('gasRecommendedNetwork')}"
    marker_pos = chunk.find(marker)
    if marker_pos != -1:
        # Locate the enclosing resultBox View by walking backwards to the most
        # recent '<View' and forwards with a simple balanced View scan.
        start = chunk.rfind("<View", 0, marker_pos)
        if start != -1:
            pos = start
            depth = 0
            end = None
            token_re = re.compile(r"</?View\b[^>]*>")
            for m in token_re.finditer(chunk, start):
                token = m.group(0)
                if token.startswith("</View"):
                    depth -= 1
                    if depth == 0:
                        end = m.end()
                        break
                elif not token.rstrip().endswith("/>"):
                    depth += 1
            if end:
                chunk = chunk[:start] + chunk[end:]
                s = s[:price_start] + chunk + s[search_end:]

p.write_text(s, encoding="utf-8")


# -----------------------------------------------------------------------------
# backend/src/server.js
# -----------------------------------------------------------------------------
bp = Path("backend/src/server.js")
b = bp.read_text(encoding="utf-8")

# Live daily FX from ECB-backed Frankfurter with 15-minute app cache and stale
# server cache fallback. This replaces the hard-coded TRY conversion path.
if "app.get('/api/fx-rates'" not in b:
    live_gas_anchor = "app.get('/api/live-gas-fees',auth,async(_,res)=>{"
    fx_endpoint = r"""
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

"""
    b = replace_once(b, live_gas_anchor, fx_endpoint + live_gas_anchor, "backend FX endpoint anchor")

# Convert Whitelist/Blacklist mutations into central notifications in addition
# to SecurityEvent audit records.
if "const createAddressListNotification=" not in b:
    event_anchor = """  const createAddressListEvent=(req,userId,eventType,success,details={})=>
    securityEvent(req,{
      userId,
      eventType,
      severity:success?'INFO':'WARNING',
      success,
      details
    });"""
    helper = event_anchor + r"""

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
  };"""
    b = replace_once(b, event_anchor, helper, "address-list notification helper")

for old, new in [
    ("""      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',true,{
        id:row.id,
        network,
        address
      });""", """      await createAddressListEvent(req,req.user.id,'WHITELIST_ADD',true,{
        id:row.id,
        network,
        address
      });
      await createAddressListNotification({userId:req.user.id,type:'WHITELIST_ADD',network,address,resourceId:row.id});"""),
    ("""      await createAddressListEvent(req,req.user.id,'WHITELIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });""", """      await createAddressListEvent(req,req.user.id,'WHITELIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });
      await createAddressListNotification({userId:req.user.id,type:'WHITELIST_REMOVE',network:existing.network,address:existing.address,resourceId:existing.id});"""),
    ("""      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',true,{
        id:row.id,
        network,
        address
      });""", """      await createAddressListEvent(req,req.user.id,'BLACKLIST_ADD',true,{
        id:row.id,
        network,
        address
      });
      await createAddressListNotification({userId:req.user.id,type:'BLACKLIST_ADD',network,address,resourceId:row.id});"""),
    ("""      await createAddressListEvent(req,req.user.id,'BLACKLIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });""", """      await createAddressListEvent(req,req.user.id,'BLACKLIST_REMOVE',true,{
        id:existing.id,
        network:existing.network,
        address:existing.address
      });
      await createAddressListNotification({userId:req.user.id,type:'BLACKLIST_REMOVE',network:existing.network,address:existing.address,resourceId:existing.id});"""),
]:
    if new not in b:
        b = replace_once(b, old, new, "address-list notification call")

bp.write_text(b, encoding="utf-8")
