import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const roots = [
  join(process.cwd(), "src"),
  join(process.cwd(), "netlify", "functions"),
  join(process.cwd(), "scripts"),
];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs"]);

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "test-support" ? [] : productionFiles(path);
    }
    if (
      !sourceExtensions.has(extname(entry.name)) ||
      entry.name.includes(".test.") ||
      entry.name.includes(".spec.")
    ) {
      return [];
    }
    return [path];
  });
}

function propertyName(
  property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment,
): string | null {
  const name = property.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function hasBoundedSignal(options: ts.ObjectLiteralExpression): boolean {
  return options.properties.some(
    (property) =>
      (ts.isShorthandPropertyAssignment(property) &&
        propertyName(property) === "signal") ||
      (ts.isPropertyAssignment(property) &&
        propertyName(property) === "signal" &&
        property.initializer.kind !== ts.SyntaxKind.NullKeyword &&
        !(
          ts.isIdentifier(property.initializer) &&
          property.initializer.text === "undefined"
        )) ||
      (ts.isSpreadAssignment(property) &&
        ts.isIdentifier(property.expression) &&
        property.expression.text === "init"),
  );
}

describe("outbound request boundaries", () => {
  it("gives every production fetch a deadline or a caller-owned signal", () => {
    const violations = roots.flatMap((root) =>
      productionFiles(root).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const parsed = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        const fileViolations: string[] = [];

        function visit(node: ts.Node): void {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            (node.expression.text === "fetch" ||
              node.expression.text === "fetchImpl")
          ) {
            const options = node.arguments[1];
            if (
              !options ||
              !ts.isObjectLiteralExpression(options) ||
              !hasBoundedSignal(options)
            ) {
              const position = parsed.getLineAndCharacterOfPosition(
                node.getStart(parsed),
              );
              fileViolations.push(
                `${relative(process.cwd(), file)}:${position.line + 1}`,
              );
            }
          }
          ts.forEachChild(node, visit);
        }

        visit(parsed);
        return fileViolations;
      }),
    );

    expect(
      violations,
      "Production fetches need an explicit signal; use AbortSignal.timeout/any or forward the caller's init signal.",
    ).toEqual([]);
  }, 60_000);
});
