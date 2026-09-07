const fs = require('fs');
const path = 'frontend/App.js';
let text = fs.readFileSync(path, 'utf8');

const replacements = [
  [
    "<View style={[styles.card, { backgroundColor: theme.cardBg, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, width: '100%', maxWidth: 360, alignSelf: 'center' }]}>\n",
    "<View style={[styles.card, { backgroundColor: theme.cardBg, alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18, width: '100%', maxWidth: 430, alignSelf: 'center', marginTop: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.borderCol }]}>\n"
  ],
  [
    "<View style={{ width: '100%', alignItems: 'center', marginBottom: 4 }}>",
    "<View style={{ width: '100%', alignItems: 'center', marginBottom: 12 }}>"
  ],
  [
    "style={{ width: 54, height: 54, borderRadius: 10 }}",
    "style={{ width: 150, height: 108, borderRadius: 18 }}"
  ],
  [
    "<Text style={{ color: theme.primary, fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 4, letterSpacing: 0.5 }}>SAFE SENTINEL PRO</Text>",
    "<Text style={{ color: theme.primary, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: 0.9 }}>SAFE SENTINEL PRO</Text>"
  ],
  [
    "<View style={{ width: '100%', marginBottom: 7 }}>",
    "<View style={{ width: '100%', marginBottom: 14 }}>"
  ],
  [
    "fontSize: 8,\n              fontWeight: '600',\n              marginBottom: 4,",
    "fontSize: 10,\n              fontWeight: '700',\n              marginBottom: 7,"
  ],
  [
    "borderRadius: 6,\n                      paddingHorizontal: 7,\n                      height: 24,",
    "borderRadius: 10,\n                      paddingHorizontal: 14,\n                      height: 38,"
  ],
  [
    "fontSize: 8,\n                      fontWeight: active ? '800' : '600'",
    "fontSize: 12,\n                      fontWeight: active ? '800' : '700'"
  ],
  [
    "<Text style={{ color: theme.textSub, fontSize: 8, textAlign: 'center', marginBottom: 7 }}>{t('loginDescription')}</Text>",
    "<Text style={{ color: theme.textSub, fontSize: 11, lineHeight: 17, textAlign: 'center', marginBottom: 18 }}>{t('loginDescription')}</Text>"
  ],
  [
    "<Text style={{ color: theme.textMain, fontSize: 9, fontWeight: '600', marginBottom: 3 }}>{t('emailAddress')}</Text>",
    "<Text style={{ color: theme.textMain, fontSize: 12, fontWeight: '800', marginBottom: 7 }}>{t('emailAddress')}</Text>"
  ],
  [
    "width: '100%', height: 28, fontSize: 9, paddingVertical: 0, textAlignVertical: 'center'",
    "width: '100%', height: 50, fontSize: 13, paddingHorizontal: 14, paddingVertical: 0, borderRadius: 12, textAlignVertical: 'center'"
  ],
  [
    "<Text style={{ color: theme.textMain, fontSize: 9, fontWeight: '600', marginBottom: 3 }}>{t('loginPassword')}</Text>",
    "<Text style={{ color: theme.textMain, fontSize: 12, fontWeight: '800', marginBottom: 7 }}>{t('loginPassword')}</Text>"
  ],
  [
    "width: '100%', height: 25, backgroundColor: theme.primary, marginBottom: 8, borderRadius: 6",
    "width: '100%', height: 48, backgroundColor: theme.primary, marginBottom: 11, borderRadius: 12"
  ],
  [
    "<Text style={[styles.buttonText, { fontSize: 8 }]}>{t('secureLogin')}</Text>",
    "<Text style={[styles.buttonText, { fontSize: 13, fontWeight: '900' }]}>{t('secureLogin')}</Text>"
  ],
  [
    "width: '100%', height: 25, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.borderCol, borderRadius: 6",
    "width: '100%', height: 46, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.borderCol, borderRadius: 12"
  ],
  [
    "<Text style={{ color: theme.primary, fontWeight: '700', fontSize: 9 }}>{t('createAccount')}</Text>",
    "<Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>{t('createAccount')}</Text>"
  ]
];

let applied = 0;
for (const [from, to] of replacements) {
  if (text.includes(from)) {
    text = text.replace(from, to);
    applied += 1;
  }
}

if (applied < 10) {
  throw new Error(`Login UI refresh aborted: only ${applied}/${replacements.length} expected replacements matched.`);
}

fs.writeFileSync(path, text, 'utf8');
console.log(`Login UI refreshed: ${applied}/${replacements.length} replacements applied.`);
