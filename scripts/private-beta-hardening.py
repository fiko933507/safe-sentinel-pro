from pathlib import Path

path = Path('frontend/App.js')
text = path.read_text(encoding='utf-8')

start_marker = '  const handleLogin = async () => {'
end_marker = '  const handleCompleteRegistration = async () => {'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('handleLogin markers not found')

new_login = """  const handleLogin = async () => {
    const cleanEmail = SecurityScannerMiddleware.sanitizeInput(email).trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert(
        t('runtimeMissingInfoTitle'),
        selectedLanguage === 'tr' ? 'Lütfen e-posta ve şifrenizi girin.' : 'Enter your email and password.'
      );
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        { email: cleanEmail, password: cleanPassword },
        {
          headers: { ...SecurityScannerMiddleware.auditHeaders },
          timeout: 15000
        }
      );

      const { token: sessionToken, user } = response.data || {};
      if (!sessionToken || !user) {
        throw new Error('INVALID_LOGIN_RESPONSE');
      }

      if (Platform.OS === 'web') {
        await AsyncStorage.setItem('user_secure_token', sessionToken);
      } else {
        await SecureStore.setItemAsync('user_secure_token', sessionToken);
      }

      setToken(sessionToken);
      setName(user.name || '');
      setEmail(user.email || cleanEmail);
      setUserStatus(user.status || 'free');
      setQueryCount(0);
      setApiOnline(true);
      setCurrentScreen('dashboard');
      setActiveModule('dashboard');
    } catch (error) {
      console.error('Login error:', error);
      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message;

      const message = status === 401
        ? (selectedLanguage === 'tr' ? 'E-posta veya şifre hatalı.' : 'Incorrect email or password.')
        : status === 403
        ? (selectedLanguage === 'tr' ? 'Bu özel test sürümüne erişim yetkiniz yok.' : 'You do not have access to this private test build.')
        : status === 429
        ? (selectedLanguage === 'tr' ? 'Çok fazla giriş denemesi yapıldı. Kısa bir süre sonra tekrar deneyin.' : 'Too many login attempts. Please try again shortly.')
        : selectedLanguage === 'tr'
        ? 'Sunucu yanıt vermedi. Lütfen birkaç saniye sonra tekrar deneyin.'
        : 'The server did not respond. Please try again in a few seconds.';

      Alert.alert(t('runtimeLoginFailedTitle'), serverMessage || message);
    } finally {
      setLoading(false);
    }
  };

"""
text = text[:start] + new_login + text[end:]

old_profile = "        <Text style={{ color: theme.primary, fontSize: 17, marginRight: 8 }}>◉</Text>"
new_profile = """        <View style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden', marginRight: 8, backgroundColor: '#0B1522', borderWidth: 1, borderColor: theme.borderCol }}>
          <Image
            source={require('./assets/yenilogo.png')}
            style={{ width: 46, height: 46, position: 'absolute', left: -6, top: -6 }}
            resizeMode=\"cover\" />
        </View>"""
if old_profile not in text:
    raise SystemExit('profile icon marker not found')
text = text.replace(old_profile, new_profile, 1)

old_register_press = "              onPress={() => setCurrentScreen('register')}>"
new_register_press = """              onPress={() => Alert.alert(
                selectedLanguage === 'tr' ? 'Özel Test Sürümü' : 'Private Test Build',
                selectedLanguage === 'tr' ? 'Yeni kayıtlar geçici olarak kapalıdır.' : 'New registrations are temporarily disabled.'
              )}>"""
if old_register_press not in text:
    raise SystemExit('register button marker not found')
text = text.replace(old_register_press, new_register_press, 1)

old_register_label = "              <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 15 }}>{t('createAccount')}</Text>"
new_register_label = """              <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 15 }}>
                {selectedLanguage === 'tr' ? 'Özel Test — Yeni Kayıt Kapalı' : 'Private Test — Registration Closed'}
              </Text>"""
if old_register_label not in text:
    raise SystemExit('register label marker not found')
text = text.replace(old_register_label, new_register_label, 1)

path.write_text(text, encoding='utf-8')
print('App.js patched successfully')
