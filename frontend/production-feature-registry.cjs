'use strict';

const SUPPORTED_PRODUCTION_LANGUAGES = Object.freeze(['tr', 'en']);

const HIDDEN_PRODUCTION_MODULES = Object.freeze([
  'whaleWatchView',
  'emergencyLockView',
  'taxReportView',
  'dexOrdersView',
  'gasTimeView',
  'deepIntelView',
  'autoPhishView'
]);

const BACKEND_READY_UI_DEFERRED = Object.freeze([
  'walletBehavioralFingerprint',
  'scamDna',
  'walletSecurityGraph',
  'earlyWarning',
  'whaleWatch'
]);

const CORE_PLAY_STORE_FEATURES = Object.freeze([
  'auth',
  'accountDeletion',
  'walletRiskScan',
  'manualPhishingScan',
  'transferRecipientRisk',
  'smartContractAnalysis',
  'revokeCenter',
  'portfolio',
  'liveGas',
  'priceAlerts',
  'vault',
  'whitelist',
  'blacklist',
  'guardian',
  'inheritance',
  'notifications'
]);

const isProductionModuleEnabled = (moduleName) =>
  !moduleName || !HIDDEN_PRODUCTION_MODULES.includes(moduleName);

module.exports = Object.freeze({
  SUPPORTED_PRODUCTION_LANGUAGES,
  HIDDEN_PRODUCTION_MODULES,
  BACKEND_READY_UI_DEFERRED,
  CORE_PLAY_STORE_FEATURES,
  isProductionModuleEnabled
});
