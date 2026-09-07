module.exports = function safeSentinelStructuralFixesPlugin({ types: t }) {
  return {
    name: 'safe-sentinel-structural-fixes',
    visitor: {
      VariableDeclarator(path) {
        if (!t.isIdentifier(path.node.id, { name: 'removeSecurityAddress' })) return;

        const declarationPath = path.parentPath;
        if (!declarationPath || !declarationPath.isVariableDeclaration()) return;

        const syncDeclarator = path.findParent(
          (parent) =>
            parent.isVariableDeclarator() &&
            t.isIdentifier(parent.node.id, { name: 'syncSecurityAddressLists' })
        );

        if (!syncDeclarator) return;

        const syncDeclarationPath = syncDeclarator.parentPath;
        if (!syncDeclarationPath || !syncDeclarationPath.isVariableDeclaration()) return;

        const fixedDeclaration = t.cloneNode(declarationPath.node, true);
        declarationPath.remove();
        syncDeclarationPath.insertAfter(fixedDeclaration);
      }
    }
  };
};
