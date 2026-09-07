import fs from 'node:fs';

const source = fs.readFileSync(new URL('../App.js', import.meta.url), 'utf8');
const languageCodes = ['tr', 'en', 'fr', 'it', 'de', 'es', 'pt', 'zh', 'ja', 'ko', 'ar'];
const fullLanguages = new Set(['tr', 'en']);

const translationsStart = source.indexOf('const V26_TRANSLATIONS = {');
if (translationsStart < 0) {
  console.error('I18N AUDIT FAILED: V26_TRANSLATIONS bulunamadı.');
  process.exit(1);
}

const translationsSource = source.slice(translationsStart);
const counts = {};

for (let i = 0; i < languageCodes.length; i += 1) {
  const code = languageCodes[i];
  const marker = `\n  ${code}: {`;
  const start = translationsSource.indexOf(marker);
  if (start < 0) {
    counts[code] = 0;
    continue;
  }

  let end = translationsSource.length;
  for (let j = i + 1; j < languageCodes.length; j += 1) {
    const next = translationsSource.indexOf(`\n  ${languageCodes[j]}: {`, start + marker.length);
    if (next >= 0) {
      end = next;
      break;
    }
  }

  const chunk = translationsSource.slice(start, end);
  const keys = new Set(
    [...chunk.matchAll(/^\s{4}([A-Za-z0-9_]+)\s*:/gm)].map((match) => match[1])
  );
  counts[code] = keys.size;
}

const baseline = Math.max(counts.tr || 0, counts.en || 0);
const incomplete = languageCodes.filter((code) => {
  if (fullLanguages.has(code)) return false;
  return (counts[code] || 0) < Math.floor(baseline * 0.9);
});

const userVisibleHardcoded = [];
const patterns = [
  /<Text(?:\s[^>]*)?>\s*([^<{][^<>{}]*?)\s*<\/Text>/g,
  /placeholder\s*=\s*["']([^"']+)["']/g,
  /Alert\.alert\(\s*["']([^"']+)["']/g
];

for (const pattern of patterns) {
  for (const match of source.matchAll(pattern)) {
    const value = String(match[1] || '').trim();
    if (!value) continue;
    if (/^[A-Z0-9_.:/\- ]+$/.test(value) && value.length < 4) continue;
    userVisibleHardcoded.push(value.replace(/\s+/g, ' '));
  }
}

const uniqueHardcoded = [...new Set(userVisibleHardcoded)];

console.log('Safe Sentinel Pro i18n audit');
console.table(counts);
console.log(`TR/EN baseline: ${baseline} anahtar`);

if (incomplete.length) {
  console.warn(`Eksik çeviri sözlüğü olan diller: ${incomplete.join(', ')}`);
}

console.log(`Muhtemel hard-coded kullanıcı metni: ${uniqueHardcoded.length}`);
uniqueHardcoded.slice(0, 80).forEach((value) => console.log(`- ${value}`));

if ((counts.tr || 0) < 100 || (counts.en || 0) < 100) {
  console.error('I18N AUDIT FAILED: Türkçe/İngilizce ana sözlük beklenenden küçük.');
  process.exit(1);
}

if (incomplete.length) {
  console.error('I18N AUDIT WARNING: Eksik diller production dil seçicisinde tam destekli olarak sunulmamalıdır.');
}
