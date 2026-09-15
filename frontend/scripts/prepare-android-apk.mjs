import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'App.js');
let app = fs.readFileSync(appPath, 'utf8');

// Login: wake the production service before sending credentials. This avoids
// failing the auth request while Render is still cold-starting.
const loginMarker = `    try {\n      setLoading(true);\n\n      const response = await axios.post(\n        \`${'${API_BASE_URL}'}/api/auth/login\`,`;
const loginReplacement = `    try {\n      setLoading(true);\n\n      // Warm the production API first. A sleeping instance can take longer\n      // than the auth timeout to become ready. No credentials are sent here.\n      try {\n        await axios.get(\`${'${API_BASE_URL}'}/health\`, { timeout: 45000 });\n      } catch (warmupError) {\n        console.warn('[LOGIN WARMUP]', warmupError?.message || warmupError);\n      }\n\n      const response = await axios.post(\n        \`${'${API_BASE_URL}'}/api/auth/login\`,`;

if (app.includes(loginMarker)) {
  app = app.replace(loginMarker, loginReplacement);
} else if (!app.includes('[LOGIN WARMUP]')) {
  throw new Error('Login flow marker not found');
}

app = app.replace(
  `          timeout: 15000\n        }\n      );\n\n      const { token: sessionToken, user } = response.data || {};`,
  `          timeout: 30000\n        }\n      );\n\n      const { token: sessionToken, user } = response.data || {};`
);

// Registration: replace the temporary private-test lock with the real flow.
// Keep this patch independent from styling so UI refactors do not break npm ci.
const registrationClosedMarker = 'Private Test — Registration Closed';
if (app.includes(registrationClosedMarker)) {
  const markerIndex = app.indexOf(registrationClosedMarker);
  const controlStart = app.lastIndexOf('<TouchableOpacity', markerIndex);
  const closingTag = '</TouchableOpacity>';
  const controlEndStart = app.indexOf(closingTag, markerIndex);

  if (controlStart < 0 || controlEndStart < 0) {
    throw new Error('Closed registration control boundaries not found');
  }

  const controlEnd = controlEndStart + closingTag.length;
  const control = app.slice(controlStart, controlEnd);
  let updatedControl = control.replace(
    /onPress=\{\(\) => Alert\.alert\([\s\S]*?\)\}>/,
    `onPress={() => setCurrentScreen('register')}>`
  );
  updatedControl = updatedControl.replace(
    /\{selectedLanguage === 'tr' \? 'Özel Test — Yeni Kayıt Kapalı' : 'Private Test — Registration Closed'\}/,
    `{t('createAccount')}`
  );

  if (updatedControl === control || updatedControl.includes(registrationClosedMarker)) {
    throw new Error('Closed registration control could not be converted');
  }

  app = `${app.slice(0, controlStart)}${updatedControl}${app.slice(controlEnd)}`;
} else if (!app.includes("setCurrentScreen('register')")) {
  throw new Error('Registration flow marker not found');
}

fs.writeFileSync(appPath, app);

// Android launcher: use the actual Safe Sentinel artwork for both legacy and
// adaptive launchers. The old generated mipmaps were still the generic icon.
const logo = path.join(root, 'assets', 'yenilogo.png');
if (!fs.existsSync(logo)) throw new Error('assets/yenilogo.png not found');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const drawable = path.join(res, 'drawable-nodpi');
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(logo, path.join(drawable, 'safe_sentinel_logo.png'));

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const dir = path.join(res, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    for (const ext of ['webp', 'png']) {
      const old = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(old)) fs.rmSync(old);
    }
    fs.copyFileSync(logo, path.join(dir, `${name}.png`));
  }
}

const adaptiveDir = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(adaptiveDir, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/splashscreen_background" />\n  <foreground android:drawable="@drawable/safe_sentinel_logo" />\n</adaptive-icon>\n`;
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptive);

console.log('Safe Sentinel Android APK preparation: PASS');
