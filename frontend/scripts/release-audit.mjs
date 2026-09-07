import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
const gradle = read('android/app/build.gradle');
const source = read('App.js');
const babelConfig = read('babel.config.js');
const productionUiPlugin = read('scripts/babel-supported-languages.cjs');
const playStorePlugin = read('scripts/babel-play-store-policy.cjs');
const structuralPlugin = read('scripts/babel-structural-fixes.cjs');
const failures = [];

const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(app.android?.package === 'com.fiko93.safesentinel', 'Android package kimliği beklenen değer değil.');
check(Number.isInteger(app.android?.versionCode), 'android.versionCode eksik.');
check(eas.build?.production?.android?.buildType === 'app-bundle', 'Production build AAB üretmiyor.');
check(eas.build?.production?.android?.credentialsSource === 'remote', 'Production imzalama kaynağı EAS remote değil.');
check(eas.build?.production?.env?.EXPO_PUBLIC_PLAY_STORE_BUILD === 'true', 'Production EAS profili Play Store policy build olarak işaretlenmemiş.');
check(!manifest.includes('SYSTEM_ALERT_WINDOW'), 'SYSTEM_ALERT_WINDOW izni kaldırılmamış.');
check(!manifest.includes('READ_EXTERNAL_STORAGE'), 'READ_EXTERNAL_STORAGE izni kaldırılmamış.');
check(!manifest.includes('WRITE_EXTERNAL_STORAGE'), 'WRITE_EXTERNAL_STORAGE izni kaldırılmamış.');
check(manifest.includes('android:allowBackup="false"'), 'Android yedekleme kapatılmamış.');
check(manifest.includes('android:usesCleartextTraffic="false"'), 'Cleartext HTTP kapatılmamış.');
check(!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(gradle), 'Release hâlâ debug anahtarıyla imzalanıyor.');
check(gradle.includes('targetSdkVersion 36'), 'targetSdkVersion 36 değil.');
check(!/https?:\/\/(localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01]))/.test(source), 'App.js içinde yerel/LAN API adresi var.');
check(source.includes('EXPO_PUBLIC_BACKEND_URL'), 'Production backend ortam değişkeni kullanılmıyor.');

check(
  babelConfig.includes('./scripts/babel-structural-fixes.cjs') &&
    babelConfig.includes('./scripts/babel-supported-languages.cjs') &&
    babelConfig.includes('./scripts/babel-play-store-policy.cjs'),
  'Production Babel hardening zinciri tam etkin değil.'
);
check(
  structuralPlugin.includes("name: 'removeSecurityAddress'") &&
    structuralPlugin.includes("name: 'syncSecurityAddressLists'"),
  'Security address delete handler için structural hoist düzeltmesi eksik.'
);
check(
  productionUiPlugin.includes("new Set(['tr', 'en'])"),
  'Eksik locale filtrelemesi TR/EN ile sınırlandırılmamış.'
);
check(
  productionUiPlugin.includes("currentStateName === 'whaleWatchList'") &&
    productionUiPlugin.includes("value: 'whaleWatchView'"),
  'Whale Watch placeholder frontend production görünümünden izole edilmemiş.'
);
check(
  productionUiPlugin.includes("currentStateName === 'networkGasFees'") &&
    productionUiPlugin.includes("t.stringLiteral('—')"),
  'Gas ekranı canlı veri öncesi sabit ücretlerden arındırılmamış.'
);
check(
  !source.includes('Share.share') || productionUiPlugin.includes("name: 'Share'"),
  'Mobil portfolio export Share import koruması eksik.'
);
check(
  playStorePlugin.includes('EXPO_PUBLIC_PLAY_STORE_BUILD') &&
    playStorePlugin.includes("name === 'VIP_PAYMENT_USDT_ADDRESS'") &&
    playStorePlugin.includes("value: 'vipView'") &&
    playStorePlugin.includes("path.node.test = t.booleanLiteral(false)"),
  'Play Store build doğrudan crypto VIP satın alma/paywall akışını yeterince izole etmiyor.'
);

if (failures.length) {
  console.error('RELEASE AUDIT FAILED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('RELEASE AUDIT PASSED');
