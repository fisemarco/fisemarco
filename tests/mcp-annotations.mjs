import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const hints = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
];
let count = 0;
for (const file of [
  "app/mcp/route.ts",
  "lib/intelligence-mcp.ts",
  "lib/protocol-tools.ts",
  "app/passport-app.tsx",
]) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map((p) => [
            p.name.getText(source).replace(/['"]/g, ""),
            p.initializer,
          ]),
      );
      const name = props.get("name");
      if (
        name &&
        ts.isStringLiteral(name) &&
        /^(ftai_|search_passports$|start_passport_registration$)/.test(
          name.text,
        ) &&
        props.has("inputSchema")
      ) {
        const annotation = props.get("annotations");
        assert.ok(
          annotation && ts.isObjectLiteralExpression(annotation),
          file + ": " + name.text + " must declare literal annotations",
        );
        const values = Object.fromEntries(
          annotation.properties
            .filter(ts.isPropertyAssignment)
            .map((p) => [p.name.getText(source), p.initializer.kind]),
        );
        for (const hint of hints)
          assert.ok(
            [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
              values[hint],
            ),
            name.text + ": explicit boolean " + hint,
          );
        assert.equal(values.openWorldHint, ts.SyntaxKind.FalseKeyword);
        if (
          [
            "ftai_issue_certificate",
            "ftai_register_intelligence_capability",
            "ftai_review_intelligence_capability",
            "ftai_set_intelligence_policy",
          ].includes(name.text)
        )
          assert.equal(values.idempotentHint, ts.SyntaxKind.FalseKeyword);
        if (
          [
            "ftai_revoke_certificate",
            "ftai_assign_agent",
            "ftai_set_intelligence_policy",
            "ftai_review_intelligence_capability",
          ].includes(name.text)
        )
          assert.equal(values.destructiveHint, ts.SyntaxKind.TrueKeyword);
        count++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
assert.equal(
  count,
  25,
  "21 builder + 2 runtime + 2 browser definitions, including the shared registry tool",
);
console.log(
  "PASS explicit four-boolean annotation contract for all " +
    count +
    " declarations",
);
