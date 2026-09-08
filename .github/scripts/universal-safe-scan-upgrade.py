from pathlib import Path

p = Path('frontend/App.js')
s = p.read_text(encoding='utf-8')

state_anchor = "  const [whaleWatchList, setWhaleWatchList] = useState([]);\n"
state_insert = """  const [universalScanInput, setUniversalScanInput] = useState('');
  const [universalScanLoading, setUniversalScanLoading] = useState(false);
  const [universalScanResult, setUniversalScanResult] = useState(null);
"""
if state_insert not in s:
    assert state_anchor in s
    s = s.replace(state_anchor, state_anchor + state_insert, 1)

func_anchor = "  const handleAddressCheck = async () => {\n"
func_insert = r'''  const getSentinelVerdict = (score) => {
    const n = Number(score);
    if (n >= 85) return selectedLanguage === 'tr' ? 'Düşük gözlenen risk' : 'Low observed risk';
    if (n >= 65) return selectedLanguage === 'tr' ? 'Dikkat' : 'Caution';
    if (n >= 40) return selectedLanguage === 'tr' ? 'Yüksek risk' : 'High risk';
    return selectedLanguage === 'tr' ? 'Kritik risk' : 'Critical risk';
  };

  const detectUniversalTarget = (raw) => {
    const value = String(raw || '').trim();
    if (/^https?:\/\//i.test(value) || /^(www\.)/i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
      return { type: 'url', value: /^https?:\/\//i.test(value) ? value : `https://${value}` };
    }
    if (/^T[1-9A-HJ-NP-Za-km-z]{30,44}$/.test(value)) return { type: 'wallet', network: 'tron', value };
    if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,61}$/i.test(value)) return { type: 'wallet', network: 'btc', value };
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) return { type: 'evm', network: ['eth','bsc','polygon','arb','avax'].includes(selectedNetwork) ? selectedNetwork : 'eth', value };
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return { type: 'wallet', network: 'sol', value };
    return { type: 'unknown', value };
  };

  const runUniversalSafeScan = async () => {
    const target = detectUniversalTarget(SecurityScannerMiddleware.sanitizeInput(universalScanInput));
    if (!target.value || target.type === 'unknown') {
      Alert.alert(
        selectedLanguage === 'tr' ? 'Girdi Tanınamadı' : 'Unrecognized Input',
        selectedLanguage === 'tr'
          ? 'Bir cüzdan adresi, EVM adresi veya web/DApp bağlantısı girin.'
          : 'Enter a wallet address, EVM address, or web/DApp URL.'
      );
      return;
    }

    setUniversalScanLoading(true);
    setUniversalScanResult(null);
    try {
      if (target.type === 'url') {
        const response = await api.post('/api/check-phishing', { url: target.value }, { timeout: 20000 });
        const data = response.data || {};
        const dangerous = Boolean(data.matched && (data.phishing || data.malicious || String(data.riskLevel).toUpperCase() === 'HIGH'));
        const score = dangerous ? 5 : 78;
        setUniversalScanResult({
          type: 'URL / DApp',
          target: target.value,
          score,
          verdict: getSentinelVerdict(score),
          network: data.source || 'Threat Intelligence',
          reasons: dangerous
            ? [selectedLanguage === 'tr' ? 'Tehdit istihbaratı eşleşmesi bulundu.' : 'A threat-intelligence match was found.', data.summary].filter(Boolean)
            : [selectedLanguage === 'tr' ? 'Mevcut phishing istihbaratında eşleşme bulunmadı.' : 'No match was found in current phishing intelligence.', selectedLanguage === 'tr' ? 'Bu sonuç sitenin güvenli olduğunu garanti etmez.' : 'This result does not guarantee that the site is safe.'],
          action: 'phishingView'
        });
        return;
      }

      const frontendNetwork = target.network || selectedNetwork;
      const backendNetwork = frontendNetwork === 'eth' ? 'ethereum' : frontendNetwork;
      const walletResponse = await requestWithBackendRecovery(() => api.post('/api/check-wallet', {
        network: backendNetwork,
        address: target.value
      }, { timeout: 30000 }));
      const data = walletResponse.data || {};
      const riskScore = Number(data.risk?.score);
      const scamMatched = Boolean(data.isScam || data.scamIntelligence?.matched || data.risk?.scamMatched);
      let score = scamMatched ? 5 : Number.isFinite(riskScore) ? Math.max(5, Math.min(95, 100 - riskScore)) : 72;
      let isContract = false;
      let contractNote = null;

      if (target.type === 'evm') {
        try {
          const contractResponse = await api.post('/api/analyze-contract', {
            network: backendNetwork,
            address: target.value
          }, { timeout: 15000 });
          isContract = Boolean(contractResponse.data?.isContract);
          if (isContract) {
            const checks = contractResponse.data?.checks || {};
            const basicMetadataReady = Boolean(checks.name && checks.symbol && checks.decimals);
            score = scamMatched ? 5 : Math.min(score, basicMetadataReady ? 78 : 62);
            contractNote = selectedLanguage === 'tr'
              ? (basicMetadataReady ? 'Adres bir akıllı sözleşme; temel kontrat metadata kontrolleri doğrulandı.' : 'Adres bir akıllı sözleşme; temel metadata kontrolleri eksik veya sınırlı.')
              : (basicMetadataReady ? 'The address is a smart contract and basic contract metadata checks passed.' : 'The address is a smart contract; basic metadata checks are incomplete or limited.');
          }
        } catch (_) {}
      }

      const reasons = [];
      if (scamMatched) reasons.push(selectedLanguage === 'tr' ? 'Scam/tehdit istihbaratı eşleşmesi bulundu.' : 'A scam/threat-intelligence match was found.');
      if (Array.isArray(data.risk?.reasons)) reasons.push(...data.risk.reasons.slice(0, 3));
      if (contractNote) reasons.push(contractNote);
      if (!reasons.length) reasons.push(selectedLanguage === 'tr' ? 'Mevcut zincir ve tehdit verilerinde belirgin yüksek risk sinyali bulunmadı.' : 'No clear high-risk signal was found in the available chain and threat data.');
      reasons.push(selectedLanguage === 'tr' ? 'Sentinel Score bir güvenlik garantisi değildir; işlem imzalamadan önce ayrıntıları doğrulayın.' : 'Sentinel Score is not a security guarantee; verify details before signing a transaction.');

      setSelectedNetwork(frontendNetwork);
      setAddress(target.value);
      setUniversalScanResult({
        type: isContract ? (selectedLanguage === 'tr' ? 'Akıllı Sözleşme' : 'Smart Contract') : (selectedLanguage === 'tr' ? 'Cüzdan' : 'Wallet'),
        target: target.value,
        score,
        verdict: getSentinelVerdict(score),
        network: String(backendNetwork).toUpperCase(),
        reasons,
        action: isContract ? 'smartContractView' : 'behavioralView',
        isContract
      });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || (selectedLanguage === 'tr' ? 'Universal tarama tamamlanamadı.' : 'Universal scan could not be completed.');
      setUniversalScanResult({
        type: selectedLanguage === 'tr' ? 'Tarama' : 'Scan',
        target: target.value,
        score: null,
        verdict: selectedLanguage === 'tr' ? 'Veri alınamadı' : 'Data unavailable',
        network: target.network ? String(target.network).toUpperCase() : '—',
        reasons: [message],
        action: null
      });
    } finally {
      setUniversalScanLoading(false);
    }
  };

  const shareSentinelReport = async () => {
    if (!universalScanResult) return;
    const scoreText = universalScanResult.score === null ? 'N/A' : `${universalScanResult.score}/100`;
    const report = [
      'Safe Sentinel — Sentinel Security Report',
      `${universalScanResult.type} • ${universalScanResult.network}`,
      `${universalScanResult.target}`,
      `Sentinel Score: ${scoreText} • ${universalScanResult.verdict}`,
      '',
      ...(universalScanResult.reasons || []).map((item) => `• ${item}`),
      '',
      selectedLanguage === 'tr' ? 'Bilgilendirme amaçlı güvenlik taramasıdır; güvenlik garantisi değildir.' : 'Informational security scan; not a security guarantee.'
    ].join('\n');
    await Share.share({ message: report, title: 'Safe Sentinel Security Report' });
  };

  const openUniversalSafeSend = () => {
    if (!universalScanResult?.target || universalScanResult.type === 'URL / DApp') return;
    setOutboundRecipient(universalScanResult.target);
    setActiveModule('outboundShieldView');
  };

'''
if func_insert not in s:
    assert func_anchor in s
    s = s.replace(func_anchor, func_insert + func_anchor, 1)

hero_anchor = "          {/* HIZLI CÜZDAN GÜVENLİK TARAMASI */}\n"
hero = r'''          {/* UNIVERSAL SAFE SCAN — primary product entry point */}
          <View style={{ backgroundColor: theme.cardBg, borderColor: theme.primary, borderWidth: 1.5, borderRadius: 16, padding: 15, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: theme.textMain, fontSize: 16, fontWeight: '900' }}>🛡️ Universal Safe Scan</Text>
                <Text style={{ color: theme.textSub, fontSize: 9, lineHeight: 14, marginTop: 4 }}>
                  {selectedLanguage === 'tr' ? 'Cüzdan, EVM kontratı veya DApp/URL gir. Safe Sentinel türü otomatik algılar ve tek bir Sentinel Score üretir.' : 'Paste a wallet, EVM contract, or DApp/URL. Safe Sentinel detects the target type and produces one Sentinel Score.'}
                </Text>
              </View>
              <View style={{ backgroundColor: theme.inputBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ color: theme.primary, fontSize: 8, fontWeight: '900' }}>LIVE</Text>
              </View>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, height: 44, fontSize: 11, marginBottom: 8 }]}
              placeholder={selectedLanguage === 'tr' ? 'Cüzdan adresi, 0x kontrat veya https://...' : 'Wallet address, 0x contract, or https://...'}
              placeholderTextColor="#777"
              value={universalScanInput}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setUniversalScanInput}
            />

            <TouchableOpacity
              onPress={runUniversalSafeScan}
              disabled={universalScanLoading}
              style={{ height: 40, backgroundColor: theme.primary, borderRadius: 8, justifyContent: 'center', alignItems: 'center', opacity: universalScanLoading ? 0.65 : 1 }}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900' }}>
                {universalScanLoading ? (selectedLanguage === 'tr' ? 'Sentinel motorları tarıyor...' : 'Sentinel engines are scanning...') : (selectedLanguage === 'tr' ? 'Tek Dokunuşla Güvenlik Taraması' : 'One-Tap Security Scan')}
              </Text>
            </TouchableOpacity>

            {universalScanResult ?
            <View style={{ marginTop: 11, backgroundColor: theme.inputBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.borderCol }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.textSub, fontSize: 8 }}>{universalScanResult.type} • {universalScanResult.network}</Text>
                  <Text numberOfLines={1} style={{ color: theme.textMain, fontSize: 9, marginTop: 3 }}>{universalScanResult.target}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: universalScanResult.score !== null && universalScanResult.score >= 65 ? '#10B981' : '#EF4444', fontSize: 20, fontWeight: '900' }}>
                    {universalScanResult.score === null ? '—' : universalScanResult.score}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 7 }}>SENTINEL SCORE / 100</Text>
                </View>
              </View>
              <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '900', marginTop: 8 }}>{universalScanResult.verdict}</Text>
              {(universalScanResult.reasons || []).map((reason, index) =>
                <Text key={`universal-reason-${index}`} style={{ color: theme.textSub, fontSize: 8, lineHeight: 13, marginTop: 4 }}>• {reason}</Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                <TouchableOpacity onPress={shareSentinelReport} style={{ flex: 1, minWidth: 125, backgroundColor: theme.cardBg, borderColor: theme.primary, borderWidth: 1, borderRadius: 7, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: theme.primary, fontSize: 8, fontWeight: '900' }}>{selectedLanguage === 'tr' ? 'Raporu Paylaş' : 'Share Report'}</Text>
                </TouchableOpacity>
                {universalScanResult.type !== 'URL / DApp' && universalScanResult.score !== null ?
                <TouchableOpacity onPress={openUniversalSafeSend} style={{ flex: 1, minWidth: 125, backgroundColor: '#10B981', borderRadius: 7, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '900' }}>{selectedLanguage === 'tr' ? 'Safe Send ile Kontrol Et' : 'Check with Safe Send'}</Text>
                </TouchableOpacity> : null}
                {universalScanResult.action ?
                <TouchableOpacity onPress={() => {
                  if (universalScanResult.isContract) setContractAddress(universalScanResult.target);
                  if (universalScanResult.type === 'URL / DApp') setPhishingUrl(universalScanResult.target);
                  setActiveModule(universalScanResult.action);
                }} style={{ flex: 1, minWidth: 125, backgroundColor: theme.cardBg, borderColor: theme.borderCol, borderWidth: 1, borderRadius: 7, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: theme.textMain, fontSize: 8, fontWeight: '900' }}>{selectedLanguage === 'tr' ? 'Detaylı Analiz' : 'Detailed Analysis'}</Text>
                </TouchableOpacity> : null}
              </View>
            </View> : null}
          </View>

'''
if hero not in s:
    assert hero_anchor in s
    s = s.replace(hero_anchor, hero + hero_anchor, 1)

# Keep connected-wallet network mapping aligned with AppKit supported networks.
s = s.replace("      43114: 'avax'\n    };", "      43114: 'avax',\n      8453: 'base',\n      10: 'optimism'\n    };", 1)

p.write_text(s, encoding='utf-8')
print('Universal Safe Scan + Sentinel Score + shareable report + Safe Send bridge applied')
