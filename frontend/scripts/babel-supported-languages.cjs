module.exports = function safeSentinelSupportedLanguagesPlugin({ types: t }) {
  const supported = new Set(['tr', 'en']);

  return {
    name: 'safe-sentinel-supported-languages',
    visitor: {
      VariableDeclarator(path) {
        if (!t.isIdentifier(path.node.id, { name: 'V26_GLOBAL_I18N' })) return;
        if (!t.isObjectExpression(path.node.init)) return;

        path.node.init.properties = path.node.init.properties.filter((property) => {
          if (!t.isObjectProperty(property)) return true;

          const key = t.isIdentifier(property.key)
            ? property.key.name
            : t.isStringLiteral(property.key)
              ? property.key.value
              : null;

          return key ? supported.has(key) : true;
        });
      }
    }
  };
};
