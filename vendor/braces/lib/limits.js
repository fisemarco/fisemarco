'use strict';

// Local fix for GHSA-vfj7-8cjw-p6xm. This bound cannot be disabled by options.
const MAX_DEPTH = 128;
const MAX_NODES = 65536;
const checkDepth = depth => {
  if (depth > MAX_DEPTH) {
    throw new SyntaxError('Brace pattern exceeds maximum nesting depth (128)');
  }
};

// Public compile/expand/stringify also accept caller-provided ASTs. Validate
// iteratively before recursive walkers; parent/prev links are not child edges.
const checkAst = ast => {
  const pending = [[ast, 0]];
  const seen = new Set();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    checkDepth(depth);
    if (!node || typeof node !== 'object') continue;
    if (seen.has(node)) throw new SyntaxError('Brace AST contains repeated or cyclic child nodes');
    seen.add(node);
    if (++count > MAX_NODES) throw new SyntaxError('Brace AST exceeds maximum node count');
    if (Array.isArray(node.nodes)) {
      if (node.nodes.length + count + pending.length > MAX_NODES) {
        throw new SyntaxError('Brace AST exceeds maximum node count');
      }
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
module.exports = { checkDepth, checkAst };
