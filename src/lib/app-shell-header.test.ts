import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const filename = new URL("../components/app-shell.tsx", import.meta.url);
const source = ts.createSourceFile(
  filename.pathname,
  readFileSync(filename, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

test("the application header does not duplicate page-level search controls", () => {
  const headerInputs: ts.JsxSelfClosingElement[] = [];

  function visit(node: ts.Node, insideHeader = false) {
    const isHeader = ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "header";
    const nextInsideHeader = insideHeader || isHeader;
    if (
      nextInsideHeader &&
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "input"
    ) {
      headerInputs.push(node);
    }
    ts.forEachChild(node, (child) => visit(child, nextInsideHeader));
  }

  visit(source);
  assert.equal(headerInputs.length, 0, "Header must not render a second search input above page filters");
});
