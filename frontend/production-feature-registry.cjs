'use strict';

const policy = require('./production-feature-registry.json');

const SUPPORTED_PRODUCTION_LANGUAGES = Object.freeze([...policy.supportedProductionLanguages]);
const HIDDEN_PRODUCTION_MODULES = Object.freeze([...policy.hiddenProductionModules]);
const BACKEND_READY_UI_DEFERRED = Object.freeze([...policy.backendReadyUiDeferred]);
const CORE_PLAY_STORE_FEATURES = Object.freeze([...policy.corePlayStoreFeatures]);

const isProductionModuleEnabled = (moduleName) =>
  !moduleName || !HIDDEN_PRODUCTION_MODULES.includes(moduleName);

module.exports = Object.freeze({
  SUPPORTED_PRODUCTION_LANGUAGES,
  HIDDEN_PRODUCTION_MODULES,
  BACKEND_READY_UI_DEFERRED,
  CORE_PLAY_STORE_FEATURES,
  isProductionModuleEnabled
});
