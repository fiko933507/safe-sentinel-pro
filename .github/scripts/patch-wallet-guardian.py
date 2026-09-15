from pathlib import Path

path = Path('frontend/App.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


# 1) Faster perceived/actual login: warm Render before tap, bound retry cost,
# and make progress visible to the user.
replace_once(
    "  const [apiOnline, setApiOnline] = useState(false);\n",
    "  const [apiOnline, setApiOnline] = useState(false);\n"
    "  const loginWarmupStartedRef = useRef(false);\n\n"
    "  useEffect(() => {\n"
    "    if (loginWarmupStartedRef.current || !API_BASE_URL) return;\n"
    "    loginWarmupStartedRef.current = true;\n"
    "    axios.get(`${API_BASE_URL}/health`, { timeout: 4500 })\n"
    "      .then(() => setApiOnline(true))\n"
    "      .catch(() => {});\n"
    "  }, []);\n",
    'login prewarm',
)
replace_once(
    "  const requestWithBackendRecovery = async (requestFactory, { attempts = 3 } = {}) => {",
    "  const requestWithBackendRecovery = async (requestFactory, { attempts = 2 } = {}) => {",
    'bounded login retries',
)
replace_once(
    "          await axios.get(`${API_BASE_URL}/health`, { timeout: 12000 });",
    "          await axios.get(`${API_BASE_URL}/health`, { timeout: 4500 });",
    'recovery health timeout',
)
replace_once(
    "        const delayMs = Math.min(900 * (2 ** (attempt - 1)), 3000);",
    "        const delayMs = Math.min(400 * (2 ** (attempt - 1)), 1200);",
    'recovery delay',
)
replace_once(
    "              activeOpacity={0.86}\n              onPress={handleLogin}>",
    "              activeOpacity={0.86}\n              disabled={loading}\n              onPress={handleLogin}>",
    'login disabled while loading',
)
replace_once(
    "              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>{t('secureLogin')}</Text>",
    "              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>{loading ? (selectedLanguage === 'tr' ? 'Giriş yapılıyor...' : 'Signing in...') : t('secureLogin')}</Text>",
    'login progress label',
)

# 2) Guardian reflects backend truth instead of showing a fake ON state before
# profile load, owns its own wallet selection, and auto-loads its profile.
replace_once(
    "  const [guardianEnabled, setGuardianEnabled] = useState(true);",
    "  const [guardianEnabled, setGuardianEnabled] = useState(false);",
    'guardian default state',
)
replace_once(
    "  const [guardianEvaluationAmount, setGuardianEvaluationAmount] = useState('');\n\n  const [revokeList, setRevokeList] = useState([]);",
    "  const [guardianEvaluationAmount, setGuardianEvaluationAmount] = useState('');\n"
    "  const [guardianWalletAddress, setGuardianWalletAddress] = useState('');\n\n"
    "  useEffect(() => {\n"
    "    if (activeModule !== 'guardianView' || guardianWalletAddress) return;\n"
    "    const candidate = String(address || vault[0] || '').trim();\n"
    "    if (candidate) setGuardianWalletAddress(candidate);\n"
    "  }, [activeModule, guardianWalletAddress, address, vault]);\n\n"
    "  useEffect(() => {\n"
    "    if (activeModule !== 'guardianView' || guardianProfileLoaded) return;\n"
    "    let cancelled = false;\n"
    "    (async () => {\n"
    "      try {\n"
    "        setGuardianLoading(true);\n"
    "        const response = await api.get('/api/guardian/profile');\n"
    "        const profile = response.data?.profile;\n"
    "        if (!cancelled && profile) {\n"
    "          setGuardianEnabled(Boolean(profile.enabled));\n"
    "          setGuardianAlertThreshold(String(profile.alertThresholdUsd ?? 500));\n"
    "          setGuardianProfileLoaded(true);\n"
    "        }\n"
    "      } catch (error) {\n"
    "        if (!cancelled) {\n"
    "          console.warn('[GUARDIAN] automatic profile load failed:', error?.response?.status || error?.message || error);\n"
    "        }\n"
    "      } finally {\n"
    "        if (!cancelled) setGuardianLoading(false);\n"
    "      }\n"
    "    })();\n"
    "    return () => { cancelled = true; };\n"
    "  }, [activeModule, guardianProfileLoaded]);\n\n"
    "  const [revokeList, setRevokeList] = useState([]);",
    'guardian state and auto profile load',
)
replace_once(
    "  const handleGuardianEvaluate = async () => {\n    const cleanAddr = address ?\n    SecurityScannerMiddleware.sanitizeInput(address).trim() :\n    '';",
    "  const handleGuardianEvaluate = async () => {\n"
    "    const guardianCandidate = String(guardianWalletAddress || address || vault[0] || '').trim();\n"
    "    const cleanAddr = guardianCandidate ?\n"
    "    SecurityScannerMiddleware.sanitizeInput(guardianCandidate).trim() :\n"
    "    '';\n"
    "    if (cleanAddr && cleanAddr !== guardianWalletAddress) setGuardianWalletAddress(cleanAddr);",
    'guardian selected wallet source',
)
replace_once(
    "          network: selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork,\n          address: cleanAddr,",
    "          network: selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork === 'arb' ? 'arbitrum' : selectedNetwork === 'avax' ? 'avalanche' : selectedNetwork,\n          address: cleanAddr,",
    'guardian backend network aliases',
)
replace_once(
    "        activeModule === 'guardianView' ?\n        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>\n              <Text style={styles.prefDescription}>\n                {t('guardianDescription')}\n              </Text>\n\n              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>",
    "        activeModule === 'guardianView' ?\n"
    "        <ScrollView contentContainerStyle={styles.prefScrollContainer} showsVerticalScrollIndicator={false}>\n"
    "              <Text style={styles.prefDescription}>\n"
    "                {t('guardianDescription')}\n"
    "              </Text>\n\n"
    "              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.borderCol, marginBottom: 10 }]}>\n"
    "                <Text style={{ color: theme.textMain, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>\n"
    "                  {selectedLanguage === 'tr' ? 'Guardian Cüzdanı' : 'Guardian Wallet'}\n"
    "                </Text>\n"
    "                <TextInput\n"
    "                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 38, fontSize: 10, marginBottom: 8 }]}\n"
    "                  value={guardianWalletAddress}\n"
    "                  onChangeText={setGuardianWalletAddress}\n"
    "                  autoCapitalize=\"none\"\n"
    "                  autoCorrect={false}\n"
    "                  placeholder={selectedLanguage === 'tr' ? 'Analiz edilecek cüzdan adresi' : 'Wallet address to analyze'}\n"
    "                  placeholderTextColor=\"#888\" />\n"
    "                <Text style={{ color: theme.textSub, fontSize: 8, marginBottom: 5 }}>\n"
    "                  {selectedLanguage === 'tr' ? 'Ağ seçimi' : 'Network'}\n"
    "                </Text>\n"
    "                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 7 }}>\n"
    "                  {['tron','sol','btc','avax','arb','polygon','eth','bsc','base','optimism'].map((networkKey) =>\n"
    "                    <TouchableOpacity key={`guardian-net-${networkKey}`} onPress={() => setSelectedNetwork(networkKey)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: selectedNetwork === networkKey ? theme.primary : theme.borderCol, backgroundColor: selectedNetwork === networkKey ? theme.primary : theme.inputBg }}>\n"
    "                      <Text style={{ color: selectedNetwork === networkKey ? '#FFF' : theme.textMain, fontSize: 8, fontWeight: '900' }}>{NETWORKS[networkKey]?.symbol || networkKey.toUpperCase()}</Text>\n"
    "                    </TouchableOpacity>\n"
    "                  )}\n"
    "                </ScrollView>\n"
    "                {vault.length > 0 ?\n"
    "                  <>\n"
    "                    <Text style={{ color: theme.textSub, fontSize: 8, marginBottom: 5 }}>{selectedLanguage === 'tr' ? 'Kasadan hızlı seç' : 'Quick select from Vault'}</Text>\n"
    "                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>\n"
    "                      {vault.map((wallet, index) =>\n"
    "                        <TouchableOpacity key={`guardian-vault-${index}`} onPress={() => {\n"
    "                          const walletText = String(wallet || '').trim();\n"
    "                          setGuardianWalletAddress(walletText);\n"
    "                          const detected = detectUniversalTarget(walletText);\n"
    "                          if (detected?.network) setSelectedNetwork(detected.network);\n"
    "                        }} style={{ maxWidth: 230, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: theme.primary, backgroundColor: theme.cardBg }}>\n"
    "                          <Text numberOfLines={1} style={{ color: theme.primary, fontSize: 8, fontWeight: '800' }}>{String(wallet)}</Text>\n"
    "                        </TouchableOpacity>\n"
    "                      )}\n"
    "                    </ScrollView>\n"
    "                  </> :\n"
    "                  <Text style={{ color: '#F59E0B', fontSize: 8, lineHeight: 12 }}>\n"
    "                    {selectedLanguage === 'tr' ? 'Sürekli Guardian izlemesi için cüzdanı Kasaya ekleyin. Tek seferlik analiz için adresi yukarıya girebilirsiniz.' : 'Add the wallet to Vault for continuous Guardian monitoring. You can still enter an address above for a one-time analysis.'}\n"
    "                  </Text>}\n"
    "              </View>\n\n"
    "              <View style={[styles.prefCard, { backgroundColor: theme.itemBg, borderColor: theme.primary }]}>",
    'guardian wallet and network UI',
)

# 3) Inheritance offers Vault selection and auto-adds a valid source wallet.
replace_once(
    "  const [inheritBeneficiary, setInheritBeneficiary] = useState('');\n  const [inheritSourceWallet, setInheritSourceWallet] = useState('');\n\n  const loadInheritanceProtocols = useCallback(async () => {",
    "  const [inheritBeneficiary, setInheritBeneficiary] = useState('');\n"
    "  const [inheritSourceWallet, setInheritSourceWallet] = useState('');\n\n"
    "  useEffect(() => {\n"
    "    if (activeModule !== 'inheritView' || inheritSourceWallet) return;\n"
    "    const candidate = String(address || vault[0] || '').trim();\n"
    "    if (candidate) setInheritSourceWallet(candidate);\n"
    "  }, [activeModule, inheritSourceWallet, address, vault]);\n\n"
    "  const loadInheritanceProtocols = useCallback(async () => {",
    'inheritance source prefill',
)
replace_once(
    "    let backendNetwork = selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork;",
    "    let backendNetwork = selectedNetwork === 'eth' ? 'ethereum' : selectedNetwork === 'arb' ? 'arbitrum' : selectedNetwork === 'avax' ? 'avalanche' : selectedNetwork;",
    'inheritance backend network aliases',
)

old_owned = '''      const ownedWallet = ownedWallets.find((wallet) =>
        String(wallet?.address || '').trim().toLowerCase() === cleanWalletAddress.toLowerCase()
      );

      if (!ownedWallet) {
        Alert.alert(
          selectedLanguage === 'tr' ? 'Kaynak Cüzdan Gerekli' : 'Source Wallet Required',
          selectedLanguage === 'tr'
            ? 'Miras protokolü için önce hesabınıza ait bir cüzdanı Kasa/Vault bölümüne ekleyin ve bu ekrandan seçin.'
            : 'Add a wallet owned by your account to Vault first, then select it here for the inheritance protocol.'
        );
        return false;
      }
'''
new_owned = '''      let ownedWallet = ownedWallets.find((wallet) =>
        String(wallet?.address || '').trim().toLowerCase() === cleanWalletAddress.toLowerCase()
      );

      if (!ownedWallet) {
        if (!validateAddressFormat(selectedNetwork, cleanWalletAddress)) {
          Alert.alert(
            selectedLanguage === 'tr' ? 'Geçersiz Kaynak Cüzdan' : 'Invalid Source Wallet',
            selectedLanguage === 'tr'
              ? `${NETWORKS[selectedNetwork]?.name || selectedNetwork} ağına uygun geçerli bir cüzdan adresi girin.`
              : `Enter a valid wallet address for ${NETWORKS[selectedNetwork]?.name || selectedNetwork}.`
          );
          return false;
        }

        try {
          await api.post('/api/wallets', {
            network: backendNetwork,
            address: cleanWalletAddress,
            label: 'Safe Sentinel Inheritance Source'
          });
        } catch (walletAddError) {
          if (walletAddError?.response?.status !== 409) {
            Alert.alert(
              selectedLanguage === 'tr' ? 'Kasaya Eklenemedi' : 'Could Not Add to Vault',
              selectedLanguage === 'tr'
                ? 'Kaynak cüzdan Kasaya eklenemedi. Kasa limitinizi ve ağ/adres bilgisini kontrol edin.'
                : 'The source wallet could not be added to Vault. Check your Vault limit and network/address.'
            );
            return false;
          }
        }

        const refreshedWalletResponse = await api.get('/api/wallets');
        const refreshedWallets = Array.isArray(refreshedWalletResponse.data?.wallets) ? refreshedWalletResponse.data.wallets : [];
        ownedWallet = refreshedWallets.find((wallet) =>
          String(wallet?.address || '').trim().toLowerCase() === cleanWalletAddress.toLowerCase() &&
          String(wallet?.network || '').trim().toLowerCase() === String(backendNetwork).trim().toLowerCase()
        );

        if (!ownedWallet) {
          Alert.alert(
            selectedLanguage === 'tr' ? 'Kasaya Eklenemedi' : 'Could Not Add to Vault',
            selectedLanguage === 'tr' ? 'Kaynak cüzdan Kasa kaydında doğrulanamadı.' : 'The source wallet could not be verified in Vault.'
          );
          return false;
        }

        const refreshedAddresses = refreshedWallets.map((wallet) => String(wallet.address || '').trim()).filter(Boolean);
        setVault(refreshedAddresses);
        await AsyncStorage.setItem('@vault', JSON.stringify(refreshedAddresses));
        await AutoBackupManager.performBackup('vault', refreshedAddresses);
        updateDynamicRevokeAndVaultData(refreshedAddresses);
      }
'''
replace_once(old_owned, new_owned, 'inheritance auto Vault add')

replace_once(
    "                  placeholder={selectedLanguage === 'tr' ? 'Hesabınıza kayıtlı cüzdan adresi' : 'Wallet address registered to your account'}\n                  placeholderTextColor=\"#888\"\n                  value={inheritSourceWallet}\n                  onChangeText={setInheritSourceWallet} />\n\n                <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 8 }}>",
    "                  placeholder={selectedLanguage === 'tr' ? 'Kaynak cüzdan adresi (kasada değilse otomatik eklenir)' : 'Source wallet address (auto-added if not in Vault)'}\n"
    "                  placeholderTextColor=\"#888\"\n"
    "                  value={inheritSourceWallet}\n"
    "                  onChangeText={setInheritSourceWallet} />\n\n"
    "                {vault.length > 0 ?\n"
    "                  <>\n"
    "                    <Text style={{ color: theme.textSub, fontSize: 8, marginBottom: 5 }}>{selectedLanguage === 'tr' ? 'Kasadan seç' : 'Select from Vault'}</Text>\n"
    "                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 7 }}>\n"
    "                      {vault.map((wallet, index) =>\n"
    "                        <TouchableOpacity key={`inherit-vault-${index}`} onPress={() => {\n"
    "                          const walletText = String(wallet || '').trim();\n"
    "                          setInheritSourceWallet(walletText);\n"
    "                          const detected = detectUniversalTarget(walletText);\n"
    "                          if (detected?.network) setSelectedNetwork(detected.network);\n"
    "                        }} style={{ maxWidth: 230, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: inheritSourceWallet === String(wallet) ? theme.primary : theme.borderCol, backgroundColor: theme.cardBg }}>\n"
    "                          <Text numberOfLines={1} style={{ color: inheritSourceWallet === String(wallet) ? theme.primary : theme.textMain, fontSize: 8, fontWeight: '800' }}>{String(wallet)}</Text>\n"
    "                        </TouchableOpacity>\n"
    "                      )}\n"
    "                    </ScrollView>\n"
    "                  </> :\n"
    "                  <Text style={{ color: '#F59E0B', fontSize: 8, lineHeight: 12, marginBottom: 7 }}>\n"
    "                    {selectedLanguage === 'tr' ? 'Kasada cüzdan yok. Geçerli kaynak adresini girin; protokol oluşturulurken Kasaya otomatik eklenecek.' : 'Vault is empty. Enter a valid source address; it will be added to Vault automatically when the protocol is created.'}\n"
    "                  </Text>}\n\n"
    "                <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 8 }}>",
    'inheritance Vault selector UI',
)

# 4) Universal Safe Scan gets the missing Vault action while keeping report,
# whitelist, blacklist, Safe Send and detailed analysis actions.
replace_once(
    "  const addUniversalResultToBlacklist = () => {\n    if (!universalScanResult?.target || universalScanResult.type === 'URL / DApp') return;\n    addToBlacklist(universalScanResult.target, universalResultNetwork());\n  };\n\n",
    "  const addUniversalResultToBlacklist = () => {\n"
    "    if (!universalScanResult?.target || universalScanResult.type === 'URL / DApp') return;\n"
    "    addToBlacklist(universalScanResult.target, universalResultNetwork());\n"
    "  };\n\n"
    "  const addUniversalResultToVault = async () => {\n"
    "    const target = String(universalScanResult?.target || '').trim();\n"
    "    if (!target || universalScanResult?.type === 'URL / DApp') return;\n"
    "    const detectedNetwork = String(universalResultNetwork() || selectedNetwork || 'tron').trim().toLowerCase();\n"
    "    const backendNetwork = detectedNetwork === 'eth' ? 'ethereum' : detectedNetwork === 'arb' ? 'arbitrum' : detectedNetwork === 'avax' ? 'avalanche' : detectedNetwork;\n\n"
    "    try {\n"
    "      const currentResponse = await api.get('/api/wallets');\n"
    "      const currentWallets = Array.isArray(currentResponse.data?.wallets) ? currentResponse.data.wallets : [];\n"
    "      const existing = currentWallets.find((wallet) =>\n"
    "        String(wallet?.address || '').trim().toLowerCase() === target.toLowerCase() &&\n"
    "        String(wallet?.network || '').trim().toLowerCase() === backendNetwork\n"
    "      );\n\n"
    "      if (!existing) {\n"
    "        try {\n"
    "          await api.post('/api/wallets', { network: backendNetwork, address: target, label: 'Safe Sentinel Vault' });\n"
    "        } catch (walletAddError) {\n"
    "          if (walletAddError?.response?.status !== 409) throw walletAddError;\n"
    "        }\n"
    "      }\n\n"
    "      const finalResponse = await api.get('/api/wallets');\n"
    "      const finalWallets = Array.isArray(finalResponse.data?.wallets) ? finalResponse.data.wallets : [];\n"
    "      const finalAddresses = finalWallets.map((wallet) => String(wallet.address || '').trim()).filter(Boolean);\n"
    "      setVault(finalAddresses);\n"
    "      await AsyncStorage.setItem('@vault', JSON.stringify(finalAddresses));\n"
    "      await AutoBackupManager.performBackup('vault', finalAddresses);\n"
    "      updateDynamicRevokeAndVaultData(finalAddresses);\n"
    "      Alert.alert(\n"
    "        selectedLanguage === 'tr' ? 'Kasa Güncellendi' : 'Vault Updated',\n"
    "        existing\n"
    "          ? (selectedLanguage === 'tr' ? 'Bu cüzdan zaten Kasada izleniyor.' : 'This wallet is already monitored in Vault.')\n"
    "          : (selectedLanguage === 'tr' ? 'Cüzdan Kasaya eklendi ve Guardian izlemesine hazır.' : 'Wallet added to Vault and ready for Guardian monitoring.')\n"
    "      );\n"
    "    } catch (error) {\n"
    "      const status = error?.response?.status;\n"
    "      const message = status === 403\n"
    "        ? (selectedLanguage === 'tr' ? 'Bu Kasa işlemi için hesabınızın erişim yetkisini kontrol edin.' : 'Check your account access for this Vault action.')\n"
    "        : (selectedLanguage === 'tr' ? 'Cüzdan Kasaya eklenemedi. Bağlantınızı ve Kasa limitinizi kontrol edin.' : 'Wallet could not be added to Vault. Check your connection and Vault limit.');\n"
    "      Alert.alert(selectedLanguage === 'tr' ? 'Kasaya Eklenemedi' : 'Could Not Add to Vault', message);\n"
    "    }\n"
    "  };\n\n",
    'universal Vault action',
)
replace_once(
    "                {universalScanResult.type !== 'URL / DApp' && universalScanResult.score !== null ?\n                <TouchableOpacity onPress={openUniversalSafeSend}",
    "                {universalScanResult.type !== 'URL / DApp' && universalScanResult.score !== null ?\n"
    "                <TouchableOpacity onPress={addUniversalResultToVault} style={{ flex: 1, minWidth: 125, backgroundColor: theme.cardBg, borderColor: '#8B5CF6', borderWidth: 1, borderRadius: 7, paddingVertical: 8, alignItems: 'center' }}>\n"
    "                  <Text style={{ color: '#8B5CF6', fontSize: 8, fontWeight: '900' }}>{selectedLanguage === 'tr' ? '+ KASAYA EKLE' : '+ ADD TO VAULT'}</Text>\n"
    "                </TouchableOpacity> : null}\n"
    "                {universalScanResult.type !== 'URL / DApp' && universalScanResult.score !== null ?\n"
    "                <TouchableOpacity onPress={openUniversalSafeSend}",
    'universal Vault button',
)

required = [
    'loginWarmupStartedRef',
    'attempts = 2',
    'Giriş yapılıyor...',
    'guardianWalletAddress',
    'automatic profile load failed',
    "selectedNetwork === 'arb' ? 'arbitrum'",
    '+ KASAYA EKLE',
    'Safe Sentinel Inheritance Source',
    'Kasadan hızlı seç',
    'Kasadan seç',
]
missing = [marker for marker in required if marker not in text]
if missing:
    raise SystemExit(f'Missing post-patch markers: {missing}')

path.write_text(text, encoding='utf-8')
print('Wallet / Guardian / Inheritance / Login patch applied successfully.')
