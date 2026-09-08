from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected pattern: {label}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Reown/AppKit: align visible EVM networks with backend-supported EVM coverage.
# -----------------------------------------------------------------------------
cfg_path = Path('frontend/AppKitConfig.js')
cfg = cfg_path.read_text(encoding='utf-8-sig')

if 'const base = {' not in cfg:
    anchor = """const avalanche = {
  id: 43114,
  name: 'Avalanche',
  nativeCurrency: {
    name: 'Avalanche',
    symbol: 'AVAX',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://avalanche-c-chain-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SnowTrace',
      url: 'https://snowtrace.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:43114',
};
"""
    addition = anchor + """

const base = {
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://base-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://basescan.org',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:8453',
};

const optimism = {
  id: 10,
  name: 'Optimism',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://optimism-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Optimistic Etherscan',
      url: 'https://optimistic.etherscan.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:10',
};
"""
    cfg = replace_once(cfg, anchor, addition, 'AppKit Base/Optimism definitions')

cfg = replace_once(
    cfg,
    """const networks = [
  ethereum,
  polygon,
  arbitrum,
  bsc,
  avalanche,
];""",
    """const networks = [
  ethereum,
  polygon,
  arbitrum,
  bsc,
  avalanche,
  base,
  optimism,
];""",
    'AppKit network list',
)
cfg_path.write_text(cfg, encoding='utf-8')


# -----------------------------------------------------------------------------
# frontend/App.js final truthfulness + usability hardening.
# -----------------------------------------------------------------------------
app_path = Path('frontend/App.js')
s = app_path.read_text(encoding='utf-8')

# Faster central notification refresh so server-side security events appear promptly.
s = replace_once(
    s,
    """    const timer = setInterval(
      centralNotificationPolling,
      60000
    );""",
    """    const timer = setInterval(
      centralNotificationPolling,
      15000
    );""",
    'central notification polling interval',
)

# Guardian: never render missing engine results as fake 0/100 values.
old_guardian_components = """                {guardianEvaluationResult.components ?
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
"""
new_guardian_components = """                {guardianEvaluationResult.components ?
              <View style={{
                borderTopWidth: 1,
                borderTopColor: theme.borderCol,
                paddingTop: 8
              }}>

                    {[
                      ['Behavioral', guardianEvaluationResult.components.behavioral],
                      ['Scam DNA', guardianEvaluationResult.components.scamDna],
                      ['Security Graph', guardianEvaluationResult.components.securityGraph],
                      ['Early Warning', guardianEvaluationResult.components.earlyWarning]
                    ].map(([label, component]) => {
                      const score = Number(component?.score);
                      const hasMeasuredScore = Number.isFinite(score) && component?.measured !== false && component?.available !== false;
                      return (
                        <Text key={label} style={{ color: theme.text, marginBottom: 4 }}>
                          {label}: {hasMeasuredScore ? `${score}/100 · ${component?.level || 'UNKNOWN'}` : (selectedLanguage === 'tr' ? 'Veri yok' : 'Not available')}
                        </Text>
                      );
                    })}

                    <Text style={{ color: theme.subText, fontSize: 10, lineHeight: 14, marginTop: 4, marginBottom: 4 }}>
                      {selectedLanguage === 'tr'
                        ? 'Guardian yalnızca backend tarafından gerçekten ölçülen sinyalleri puan olarak gösterir; eksik sinyaller 0 risk olarak yorumlanmaz.'
                        : 'Guardian shows numeric scores only for signals actually measured by the backend; unavailable signals are not treated as zero risk.'}
                    </Text>
"""
s = replace_once(s, old_guardian_components, new_guardian_components, 'Guardian truthful component rendering')

# Inheritance: expose source wallet and make non-custodial limitation explicit.
inherit_anchor = """                {inheritEnabled &&
            <>
                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 2 }}>{t('inheritInactivityDays')}:</Text>"""
inherit_replacement = """                {inheritEnabled &&
            <>
                <View style={{ backgroundColor: theme.inputBg, borderColor: '#F59E0B', borderWidth: 1, borderRadius: 7, padding: 9, marginTop: 8, marginBottom: 10 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: 'bold' }}>
                    {selectedLanguage === 'tr' ? 'Non-custodial güvenlik planı' : 'Non-custodial security plan'}
                  </Text>
                  <Text style={{ color: theme.textSub, fontSize: 9, lineHeight: 14, marginTop: 4 }}>
                    {selectedLanguage === 'tr'
                      ? 'Safe Sentinel özel anahtar tutmaz ve bu ekran tek başına zincir üstü otomatik varlık transferi gerçekleştirmez. Protokol; kayıtlı cüzdan, varis ve hareketsizlik planını izler.'
                      : 'Safe Sentinel does not hold private keys and this screen alone does not perform automatic on-chain asset transfers. The protocol tracks a registered wallet, beneficiary and inactivity plan.'}
                  </Text>
                </View>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>
                  {selectedLanguage === 'tr' ? 'Kaynak Cüzdan Adresi' : 'Source Wallet Address'}:
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.inputTextColor, borderColor: theme.borderCol, marginBottom: 8, height: 36, fontSize: 11 }]}
                  placeholder={selectedLanguage === 'tr' ? 'Hesabınıza kayıtlı cüzdan adresi' : 'Wallet address registered to your account'}
                  placeholderTextColor="#888"
                  value={inheritSourceWallet}
                  onChangeText={setInheritSourceWallet} />

                <Text style={{ color: theme.textSub, fontSize: 9, marginBottom: 8 }}>
                  {(selectedLanguage === 'tr' ? 'Ağ' : 'Network')}: {NETWORKS[selectedNetwork]?.name || String(selectedNetwork).toUpperCase()}
                </Text>

                <Text style={{ color: theme.textMain, fontSize: 11, fontWeight: 'bold', marginTop: 6, marginBottom: 2 }}>{t('inheritInactivityDays')}:</Text>"""
s = replace_once(s, inherit_anchor, inherit_replacement, 'Inheritance source wallet UI')

# Revoke empty state: don't claim no approvals were found before a supported wallet is scanned.
s = s.replace(
    "{t('revokeNoAllowance')}</Text>\n                  <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center' }}>{t('revokeEmptyDescription')}</Text>",
    "{selectedLanguage === 'tr' ? 'Revoke taraması için cüzdan gerekli' : 'Wallet required for Revoke scan'}</Text>\n                  <Text style={{ color: theme.textSub, fontSize: 10, textAlign: 'center' }}>{selectedLanguage === 'tr' ? 'Desteklenen bir cüzdanı bağlayın veya Vault/Kasa içine ekleyin; ardından aktif token yetkilerini tarayın.' : 'Connect a supported wallet or add it to Vault, then scan its active token approvals.'}</Text>",
    1,
)

app_path.write_text(s, encoding='utf-8')

print('FINAL_PRODUCTION_HARDENING_APPLIED')
