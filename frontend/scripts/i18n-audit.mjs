import fs from 'node:fs';

const source = fs.readFileSync(new URL('../App.js', import.meta.url), 'utf8');
const policy = JSON.parse(fs.readFileSync(new URL('../production-feature-registry.json', import.meta.url), 'utf8'));

const fail = (message) => {
  console.error(`I18N AUDIT FAILED: ${message}`);
  process.exit(1);
};

if (JSON.stringify(policy.supportedProductionLanguages) !== JSON.stringify(['tr', 'en'])) {
  fail('Production dil listesi yalnızca tr ve en olmalıdır.');
}

const globalStart = source.indexOf('const V26_GLOBAL_I18N = {');
const currencyStart = source.indexOf('const V26_CURRENCIES = {');
if (globalStart < 0 || currencyStart < 0 || currencyStart <= globalStart) fail('V26_GLOBAL_I18N bölümü bulunamadı.');
const globalChunk = source.slice(globalStart, currencyStart);
const productionLocaleMarkers = [...globalChunk.matchAll(/^\s{2}([a-z]{2}):\s*\{/gm)].map((match) => match[1]);
if (JSON.stringify(productionLocaleMarkers) !== JSON.stringify(['tr', 'en'])) {
  fail(`Production dil seçicisinde beklenmeyen locale var: ${productionLocaleMarkers.join(', ')}`);
}

const translationsStart = source.indexOf('const V26_TRANSLATIONS = {');
if (translationsStart < 0) fail('V26_TRANSLATIONS bulunamadı.');
const translationsSource = source.slice(translationsStart);

const extractKeys = (code, nextCode) => {
  const marker = `\n  ${code}: {`;
  const start = translationsSource.indexOf(marker);
  if (start < 0) fail(`${code} çeviri sözlüğü bulunamadı.`);
  const nextMarker = nextCode ? `\n  ${nextCode}: {` : null;
  const end = nextMarker ? translationsSource.indexOf(nextMarker, start + marker.length) : translationsSource.length;
  if (end < 0) fail(`${code} sözlüğünün bitiş sınırı bulunamadı.`);
  const chunk = translationsSource.slice(start, end);
  return new Set([...chunk.matchAll(/^\s{4}([A-Za-z0-9_]+)\s*:/gm)].map((match) => match[1]));
};

const trKeys = extractKeys('tr', 'en');
const enKeys = extractKeys('en', 'fr');
const missingInEn = [...trKeys].filter((key) => !enKeys.has(key));
const missingInTr = [...enKeys].filter((key) => !trKeys.has(key));
if (missingInEn.length || missingInTr.length) {
  fail(`TR/EN anahtar kümeleri eşit değil. EN eksik: ${missingInEn.join(', ') || '-'}; TR eksik: ${missingInTr.join(', ') || '-'}`);
}
if (trKeys.size < 100) fail(`TR/EN sözlükleri beklenenden küçük: ${trKeys.size} anahtar.`);

const mojibake = /(Ã.|Ä.|Å.|â€|â€™|â€œ|â€|ðŸ)/;
if (mojibake.test(source)) fail('App.js içinde mojibake/bozuk Unicode dizisi bulundu.');

const hardcoded = [];
const patterns = [
  /<Text(?:\s[^>]*)?>\s*([^<{][^<>{}]*?)\s*<\/Text>/g,
  /placeholder\s*=\s*["']([^"']+)["']/g,
  /Alert\.alert\(\s*["']([^"']+)["']/g
];
for (const pattern of patterns) {
  for (const match of source.matchAll(pattern)) {
    const value = String(match[1] || '').replace(/\s+/g, ' ').trim();
    if (value) hardcoded.push(value);
  }
}

const exactAllowlist = new Set([
  'SAFE SENTINEL PRO',
  'SAFE SENTINEL',
  'Safe Sentinel Guardian',
  'Safe Sentinel Pro VIP',
  'SECURITY COMMAND CENTER',
  'SCAM INTELLIGENCE',
  'Portfolio',
  'Guardian',
  'ornek@mail.com',
  '••••••••',
  'https://example-dapp.com...'
]);
const technicalPattern = /^(?:ETH|TRX|USDT|BTC|SOL|BNB|MATIC|ARB|AVAX|EVM|TRON|TRC20|ERC20|0x|T\.\.\.|[A-Z0-9_.:/\-]{2,})$/;
const turkishRuntimePattern = /[çğıöşüÇĞİÖŞÜ]|\b(?:Başarılı|Başarısız|Geçersiz|Hata|İşlem|Analiz|Doğrulama|Gerekli|Adres|Miras|Lütfen|Cüzdan|Şifre|Kayıt|Giriş|Ödeme|Gönderildi|Tamamlandı|Hazırlama|Engellenen)\b/;
const violations = [...new Set(hardcoded)].filter((value) => {
  if (exactAllowlist.has(value)) return false;
  if (technicalPattern.test(value)) return false;
  return turkishRuntimePattern.test(value);
});

if (violations.length) {
  fail(`Çeviri sistemine bağlı olmayan kullanıcı metni bulundu: ${violations.join(' | ')}`);
}

console.log('Safe Sentinel Pro i18n audit');
console.log(`Production languages: ${policy.supportedProductionLanguages.join(', ')}`);
console.log(`TR/EN shared keys: ${trKeys.size}`);
console.log(`Hard-coded Turkish runtime violations: ${violations.length}`);
console.log('I18N AUDIT PASSED');
