# Local security patch for braces 3.0.3

Upstream: https://github.com/micromatch/braces, tag `3.0.3`, commit `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`. The original MIT licence is preserved. This fork is explicitly named `@fisemarco/braces`, version `3.0.3+fisemarco.1`, and installed under the compatible `braces` import name. The base upstream version remains recorded in package metadata. This directory is a maintained local patch, not an upstream security release.

Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). No patched upstream npm release was available on 21 October 2026. Recursive AST walkers could exhaust the JavaScript stack with valid-length deeply nested patterns.

Changes:
- The parser checks a non-configurable 128-level structural budget before pushing brace or parenthesis groups, including unmatched groups processed during cleanup.
- `compile`, `expand` and `stringify` iteratively validate incoming AST child edges before any recursive walk. A 128-level depth limit, 65,536-node budget, and repeated/cyclic child-node rejection also cover callers that bypass the parser.
- Parent/previous backreferences in legitimate parser trees are deliberately not traversed.
- Ordinary parsing, expansion, matching and regex compilation are otherwise unchanged. Excessively nested patterns now raise a controlled `SyntaxError`; callers cannot disable the bound via options. Applications must handle invalid-pattern errors as before.

The root `file:vendor/braces` dependency provides the patched package to all compatible micromatch consumers. The lockfile and installed resolution are tested to ensure no registry copy remains. `npm audit` does not independently assess this local patch: a zero advisory count is not its security proof. `tests/dependency-security.test.mjs`, upstream compatibility tests and actual application builds are required alongside the registry audit. Do not remove the local reference until an upstream fixed release has been verified and tested.

`test/` is copied from the upstream tag under the same MIT licence. Run the upstream suite with Mocha and bash-path from an isolated test-tool installation; these are not product runtime dependencies.
