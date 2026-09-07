module.exports = function safeSentinelPlayStorePolicyPlugin({ types: t }) {
  const playStoreBuild = String(process.env.EXPO_PUBLIC_PLAY_STORE_BUILD || '').toLowerCase() === 'true';

  if (!playStoreBuild) {
    return { name: 'safe-sentinel-play-store-policy-disabled', visitor: {} };
  }

  const containsIdentifier = (node, name) => {
    if (!node || typeof node !== 'object') return false;
    if (t.isIdentifier(node, { name })) return true;
    return Object.keys(node).some((key) => {
      if (['loc', 'start', 'end', 'extra'].includes(key)) return false;
      const value = node[key];
      if (Array.isArray(value)) return value.some((item) => containsIdentifier(item, name));
      return containsIdentifier(value, name);
    });
  };

  const containsVipLiteral = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (t.isStringLiteral(node, { value: 'vip' }) || t.isStringLiteral(node, { value: 'vipView' })) return true;
    return Object.keys(node).some((key) => {
      if (['loc', 'start', 'end', 'extra'].includes(key)) return false;
      const value = node[key];
      if (Array.isArray(value)) return value.some(containsVipLiteral);
      return containsVipLiteral(value);
    });
  };

  const isFreeScanPaywall = (node) =>
    containsIdentifier(node, 'userStatus') &&
    containsIdentifier(node, 'queryCount') &&
    containsVipLiteral(node);

  const isVipRouteElement = (element) => {
    if (!element) return false;
    if (t.isArrayExpression(element)) {
      return element.elements.some((item) => t.isStringLiteral(item, { value: 'vipView' }));
    }
    if (t.isObjectExpression(element)) {
      return element.properties.some((property) =>
        t.isObjectProperty(property) && t.isStringLiteral(property.value, { value: 'vipView' })
      );
    }
    return false;
  };

  return {
    name: 'safe-sentinel-play-store-policy',
    visitor: {
      VariableDeclarator(path) {
        if (!t.isIdentifier(path.node.id)) return;

        if (path.node.id.name === 'VIP_PAYMENT_USDT_ADDRESS') {
          path.node.init = t.stringLiteral('');
        }
        if (path.node.id.name === 'VIP_MONTHLY_USDT' || path.node.id.name === 'VIP_YEARLY_USDT') {
          path.node.init = t.numericLiteral(0);
        }
      },

      IfStatement(path) {
        if (isFreeScanPaywall(path.node.test)) {
          path.node.test = t.booleanLiteral(false);
        }
      },

      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee, { name: 'setActiveModule' }) &&
          path.node.arguments.length > 0 &&
          t.isStringLiteral(path.node.arguments[0], { value: 'vipView' })
        ) {
          path.replaceWith(
            t.callExpression(
              t.memberExpression(t.identifier('Alert'), t.identifier('alert')),
              [
                t.stringLiteral('Safe Sentinel Pro'),
                t.stringLiteral('Play Store sürümünde doğrudan kripto abonelik satın alma kapalıdır. Premium satın alma Google Play Billing entegrasyonu tamamlandıktan sonra sunulacaktır.')
              ]
            )
          );
          path.skip();
        }
      },

      ArrayExpression(path) {
        path.node.elements = path.node.elements.filter((element) => !isVipRouteElement(element));
      }
    }
  };
};
