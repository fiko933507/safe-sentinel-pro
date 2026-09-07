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
} else if (!pluginSource.includes("require('../production-feature-registry.cjs')")) {
  throw new Error('Production UI plugin header could not be migrated safely.');
}

const legacyArrayVisitor = `      ArrayExpression(path) {\n        path.node.elements = path.node.elements.filter((element) => {\n          if (!t.isArrayExpression(element)) return true;\n          return !element.elements.some(\n            (item) => t.isStringLiteral(item) && hiddenProductionModules.has(item.value)\n          );\n        });\n      }`;
const hardenedArrayVisitor = `      ArrayExpression(path) {\n        path.node.elements = path.node.elements.filter((element) => {\n          if (t.isArrayExpression(element)) {\n            return !element.elements.some(\n              (item) => t.isStringLiteral(item) && hiddenProductionModules.has(item.value)\n            );\n          }\n          if (t.isObjectExpression(element)) {\n            const moduleProperty = element.properties.find(\n              (property) => t.isObjectProperty(property) && getPropertyKey(property) === 'mod'\n            );\n            if (moduleProperty && t.isStringLiteral(moduleProperty.value)) {\n              return !hiddenProductionModules.has(moduleProperty.value.value);\n            }\n          }\n          return true;\n        });\n      }`;

if (pluginSource.includes(legacyArrayVisitor)) {
  pluginSource = pluginSource.replace(legacyArrayVisitor, hardenedArrayVisitor);
} else if (!pluginSource.includes("getPropertyKey(property) === 'mod'")) {
  throw new Error('Production menu object filter could not be migrated safely.');
}

fs.writeFileSync(pluginPath, pluginSource);
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
