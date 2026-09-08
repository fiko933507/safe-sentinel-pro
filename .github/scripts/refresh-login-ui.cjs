const fs = require('fs');
const path = 'frontend/App.js';
let text = fs.readFileSync(path, 'utf8');

const loginStartMarker = "  if (currentScreen === 'login') {";
const registerStartMarker = "  if (currentScreen === 'register') {";
const loginStart = text.indexOf(loginStartMarker);
const registerStart = text.indexOf(registerStartMarker, loginStart);

if (loginStart === -1 || registerStart === -1 || registerStart <= loginStart) {
  throw new Error('Login block markers could not be located safely.');
}

const newLoginBlock = `  if (currentScreen === 'login') {
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
                    key={\`login-language-\${code}\`}
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

`;

text = text.slice(0, loginStart) + newLoginBlock + text.slice(registerStart);

// Production dashboard policy: hide tools that do not currently have a dependable real-data path.
// Source modules are intentionally retained so they can be re-enabled after their data integrations are production-ready.
const plannedStartMarker = '          {/* İSTİHBARAT */}';
const assetsStartMarker = '          {/* VARLIK VE FİNANS */}';
const plannedStart = text.indexOf(plannedStartMarker);
const assetsStart = text.indexOf(assetsStartMarker, plannedStart);

if (plannedStart !== -1 && assetsStart !== -1 && assetsStart > plannedStart) {
  text =
    text.slice(0, plannedStart) +
    '          {/* Production: planned/non-live intelligence cards are hidden until real data integrations are ready. */}\n\n' +
    text.slice(assetsStart);
} else {
  throw new Error('Dashboard intelligence section markers could not be located safely.');
}

// URLhaus feed is not currently present on the production backend, so do not advertise Phishing Shield as live.
const phishingDashboardRow = '            [t("dashboardPhishingShield"), t("dashboardScanSuspiciousLinks"), "phishingView", t("dashboardAvailable")],\n';
if (text.includes(phishingDashboardRow)) {
  text = text.replace(phishingDashboardRow, '');
}

fs.writeFileSync(path, text, 'utf8');
console.log('Login UI matched to the approved mobile mockup and non-live dashboard tools were hidden.');
