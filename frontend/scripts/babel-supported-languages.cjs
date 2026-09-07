module.exports = function safeSentinelProductionUiPlugin({ types: t }) {
  const supported = new Set(['tr', 'en']);

  const getPropertyKey = (property) => {
    if (!t.isObjectProperty(property)) return null;
    if (t.isIdentifier(property.key)) return property.key.name;
    if (t.isStringLiteral(property.key)) return property.key.value;
    return null;
  };

  const setTranslation = (languageObject, key, value) => {
    if (!t.isObjectExpression(languageObject)) return;
    const property = languageObject.properties.find((item) => getPropertyKey(item) === key);
    if (property && t.isObjectProperty(property)) {
      property.value = t.stringLiteral(value);
    }
  };

  const stateName = (node) => {
    if (!t.isArrayPattern(node) || node.elements.length === 0) return null;
    const first = node.elements[0];
    return t.isIdentifier(first) ? first.name : null;
  };

  return {
    name: 'safe-sentinel-production-ui-hardening',
    visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value !== 'react-native') return;
        const hasShare = path.node.specifiers.some(
          (specifier) => t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported, { name: 'Share' })
        );
        if (!hasShare) {
          path.node.specifiers.push(t.importSpecifier(t.identifier('Share'), t.identifier('Share')));
        }
      },

      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id, { name: 'V26_GLOBAL_I18N' }) && t.isObjectExpression(path.node.init)) {
          path.node.init.properties = path.node.init.properties.filter((property) => {
            const key = getPropertyKey(property);
            return key ? supported.has(key) : true;
          });
          return;
        }

        if (t.isIdentifier(path.node.id, { name: 'V26_TRANSLATIONS' }) && t.isObjectExpression(path.node.init)) {
          for (const languageProperty of path.node.init.properties) {
            const language = getPropertyKey(languageProperty);
            if (!t.isObjectProperty(languageProperty) || !t.isObjectExpression(languageProperty.value)) continue;

            if (language === 'tr') {
              setTranslation(languageProperty.value, 'toolTitleAiMarket', 'Piyasa İstihbaratı');
              setTranslation(languageProperty.value, 'aiMarketDescription', 'Canlı piyasa verilerinden üretilen kural tabanlı duyarlılık ve risk göstergelerini görüntüleyin.');
              setTranslation(languageProperty.value, 'dashboardAiBehavior', 'Davranış Analizi');
              setTranslation(languageProperty.value, 'dashboardAnalyzeWalletBehavior', 'Cüzdan davranış sinyallerini analiz et');
            }

            if (language === 'en') {
              setTranslation(languageProperty.value, 'toolTitleAiMarket', 'Market Intelligence');
              setTranslation(languageProperty.value, 'aiMarketDescription', 'View rule-based sentiment and risk indicators generated from live market data.');
              setTranslation(languageProperty.value, 'dashboardAiBehavior', 'Behavior Analysis');
              setTranslation(languageProperty.value, 'dashboardAnalyzeWalletBehavior', 'Analyze wallet behavior signals');
            }
          }
          return;
        }

        const currentStateName = stateName(path.node.id);
        if (
          currentStateName === 'whaleWatchList' &&
          t.isCallExpression(path.node.init) &&
          t.isIdentifier(path.node.init.callee, { name: 'useState' })
        ) {
          path.node.init.arguments = [t.arrayExpression([])];
          return;
        }

        if (
          currentStateName === 'networkGasFees' &&
          t.isCallExpression(path.node.init) &&
          t.isIdentifier(path.node.init.callee, { name: 'useState' }) &&
          t.isObjectExpression(path.node.init.arguments[0])
        ) {
          for (const property of path.node.init.arguments[0].properties) {
            if (t.isObjectProperty(property)) property.value = t.stringLiteral('—');
          }
          return;
        }

        if (t.isIdentifier(path.node.id, { name: 'priceAlertsMode' })) {
          path.node.init = t.stringLiteral('SERVER_MONITORED');
        }
      },

      ArrayExpression(path) {
        path.node.elements = path.node.elements.filter((element) => {
          if (!t.isArrayExpression(element)) return true;
          return !element.elements.some(
            (item) => t.isStringLiteral(item, { value: 'whaleWatchView' })
          );
        });
      }
    }
  };
};
