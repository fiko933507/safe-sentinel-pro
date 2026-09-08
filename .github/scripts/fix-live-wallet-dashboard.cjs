const fs = require('fs');
const path = 'frontend/App.js';
let text = fs.readFileSync(path, 'utf8');

const mustReplace = (from, to, label) => {
  if (!text.includes(from)) throw new Error(`Missing expected block: ${label}`);
  text = text.replace(from, to);
  console.log(`patched: ${label}`);
};

// BSC native asset is BNB, not BSC.
mustReplace(
  '      bsc: "BSC",',
  '      bsc: "BNB",',
  'native symbol BNB'
);
mustReplace(
  '    BSC: null,',
  '    BNB: null,',
  'live price state BNB'
);
mustReplace(
  "          BSC: response.data.binancecoin?.usd ? String(response.data.binancecoin.usd) : null,",
  "          BNB: response.data.binancecoin?.usd ? String(response.data.binancecoin.usd) : null,",
  'CoinGecko BNB price'
);
mustReplace(
  '    bsc: { name: "Binance Smart Chain", symbol: "BSC", badgeColor: theme.primary, badgeText: "BSC" },',
  '    bsc: { name: "BNB Smart Chain", symbol: "BNB", badgeColor: theme.primary, badgeText: "BSC" },',
  'BSC display symbol'
);

// Any successful authenticated blockchain response proves the production backend is reachable.
mustReplace(
  '      if (response.data && response.data.success) {\n        setWalletNativeBalance(response.data.balance ?? null);',
  '      if (response.data && response.data.success) {\n        setApiOnline(true);\n        setWalletNativeBalance(response.data.balance ?? null);',
  'wallet scan online state'
);

mustReplace(
  "    } catch (error) {\n      console.error('[PORTFOLIO] Gerçek veri alınamadı:', error);",
  "    } catch (error) {\n      setApiOnline(Boolean(error?.response));\n      console.error('[PORTFOLIO] Gerçek veri alınamadı:', error);",
  'portfolio failure online state'
);

mustReplace(
  "      if (!data?.success) {\n        throw new Error(data?.error || 'Portfolio verisi alınamadı');\n      }\n\n      setWalletNativeBalance(",
  "      if (!data?.success) {\n        throw new Error(data?.error || 'Portfolio verisi alınamadı');\n      }\n\n      setApiOnline(true);\n      setWalletNativeBalance(",
  'portfolio success online state'
);

// Re-check health periodically so a Render cold start cannot leave a stale OFFLINE badge forever.
mustReplace(
  "  const [activeModule, setActiveModule] = useState('dashboard');",
  "  useEffect(() => {\n    checkBackendHealth();\n    const healthTimer = setInterval(checkBackendHealth, 60000);\n    return () => clearInterval(healthTimer);\n  }, [checkBackendHealth]);\n\n  const [activeModule, setActiveModule] = useState('dashboard');",
  'periodic backend health'
);

const oldPortfolio = `              <View>\n                <Text style={{ color: theme.textSub, fontSize: 8 }}>\n                    {t(\"dashboardTotalPortfolio\")}\n                </Text>\n                <Text\n                style={{\n                  color: theme.textMain,\n                  fontSize: 17,\n                  fontWeight: \"900\",\n                  marginTop: 3\n                }}>\n\n                  \${portfolioUsdValue > 0 ? portfolioUsdValue.toLocaleString(\"en-US\", {\n                  minimumFractionDigits: 2,\n                  maximumFractionDigits: 2\n                }) : \"--\"}\n                </Text>\n              </View>`;

const newPortfolio = `              <View style={{ flex: 1, paddingRight: 10 }}>\n                <Text style={{ color: theme.textSub, fontSize: 8 }}>\n                    {t(\"dashboardTotalPortfolio\")}\n                </Text>\n                <Text\n                style={{\n                  color: theme.textMain,\n                  fontSize: 17,\n                  fontWeight: \"900\",\n                  marginTop: 3\n                }}>\n\n                  \${portfolioUsdValue > 0 ? portfolioUsdValue.toLocaleString(\"en-US\", {\n                  minimumFractionDigits: 2,\n                  maximumFractionDigits: 2\n                }) : \"--\"}\n                </Text>\n                {walletNativeBalance !== null && walletNativeBalance !== undefined ?\n                <Text style={{ color: theme.primary, fontSize: 11, fontWeight: \"900\", marginTop: 4 }}>\n                  {Number(walletNativeBalance).toLocaleString(\"en-US\", { maximumFractionDigits: 8 })} {NETWORKS[selectedNetwork]?.symbol || \"\"}\n                </Text> : null}\n                {walletTokens.filter((token) => Number(token?.balance || 0) > 0).slice(0, 3).map((token, index) =>\n                <Text key={\`dashboard-token-\${token?.symbol || token?.name || index}\`} style={{ color: theme.textSub, fontSize: 8, marginTop: 2 }}>\n                  {token?.symbol || token?.name || \"TOKEN\"}: {Number(token?.balance || 0).toLocaleString(\"en-US\", { maximumFractionDigits: 8 })}\n                </Text>)}\n              </View>`;

mustReplace(oldPortfolio, newPortfolio, 'dashboard native/token balances');

fs.writeFileSync(path, text, 'utf8');
console.log('Wallet dashboard live-data patch completed.');
