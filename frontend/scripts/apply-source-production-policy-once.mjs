import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appPath = path.join(root, 'App.js');
const pluginPath = path.join(root, 'scripts', 'babel-supported-languages.cjs');

let pluginSource = fs.readFileSync(pluginPath, 'utf8');
const legacyHeader = `module.exports = function safeSentinelProductionUiPlugin({ types: t }) {\n  const supported = new Set(['tr', 'en']);\n  const hiddenProductionModules = new Set([\n    'whaleWatchView',\n    'emergencyLockView',\n    'taxReportView',\n    'dexOrdersView',\n    'gasTimeView',\n    'deepIntelView',\n    'autoPhishView'\n  ]);`;
const registryHeader = `const {\n  SUPPORTED_PRODUCTION_LANGUAGES,\n  HIDDEN_PRODUCTION_MODULES\n} = require('../production-feature-registry.cjs');\n\nmodule.exports = function safeSentinelProductionUiPlugin({ types: t }) {\n  const supported = new Set(SUPPORTED_PRODUCTION_LANGUAGES);\n  const hiddenProductionModules = new Set(HIDDEN_PRODUCTION_MODULES);`;

if (pluginSource.includes(legacyHeader)) {
  pluginSource = pluginSource.replace(legacyHeader, registryHeader);
  fs.writeFileSync(pluginPath, pluginSource);
} else if (!pluginSource.includes("require('../production-feature-registry.cjs')")) {
  throw new Error('Production UI plugin header could not be migrated safely.');
}

delete require.cache[require.resolve(pluginPath)];
const productionUiPlugin = require(pluginPath);
const { transformSync } = require('@babel/core');
const original = fs.readFileSync(appPath, 'utf8');
const result = transformSync(original, {
  babelrc: false,
  configFile: false,
  sourceType: 'module',
  parserOpts: { sourceType: 'module', plugins: ['jsx'] },
  generatorOpts: { comments: true, compact: false, retainLines: true },
  plugins: [productionUiPlugin]
});

if (!result?.code) throw new Error('Source-level production transform returned no code.');
fs.writeFileSync(appPath, `${result.code}\n`);
console.log('SOURCE PLAY STORE POLICY APPLIED');
