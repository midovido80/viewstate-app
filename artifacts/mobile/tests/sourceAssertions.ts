import assert from "node:assert/strict";
import ts from "typescript";

/** Source contracts ignore formatting while retaining literals, operators and order. */
export function sourcePattern(pattern: RegExp): RegExp {
  let result = "";
  const source = pattern.source.replace(
    /\b([A-Za-z_]\w*) =>/g,
    "(?:\\(\\s*)?$1(?:\\s*\\))? =>",
  );
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "[") {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === "\\") end += 2;
        else if (source[end++] === "]") break;
      }
      result += source.slice(i, end);
      i = end - 1;
    } else if (char === "\\" && i + 1 < source.length) {
      const next = source[++i];
      if ("({[".includes(next)) result += "\\" + next + "\\s*";
      else if (")}]".includes(next)) result += ",?\\s*\\" + next;
      else if (next === ".") result += "\\s*\\.";
      else result += "\\" + next;
    } else if (char === "'" || char === '"') result += '["\']';
    else if (char === " ") result += "\\s*";
    else if (char === ">") result += "\\s*>\\s*";
    else result += char;
  }
  return new RegExp(result, pattern.flags);
}

export function sourceIfBlock(source: string, condition: RegExp): string {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let block: string | undefined;
  const visit = (node: ts.Node) => {
    if (block !== undefined) return;
    if (ts.isIfStatement(node) && sourcePattern(condition).test(node.expression.getText(file))) {
      block = node.thenStatement.getText(file);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.notEqual(block, undefined, `Missing conditional: ${condition}`);
  return block!;
}

export function sourceMatch(source: string, pattern: RegExp, message?: string) {
  assert.match(source, sourcePattern(pattern), message);
}

export function sourceDoesNotMatch(source: string, pattern: RegExp, message?: string) {
  assert.doesNotMatch(source, sourcePattern(pattern), message);
}

export function sourceIndex(source: string, literal: string, from = 0): number {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sourcePattern(new RegExp(escaped)).exec(source.slice(from));
  return match ? from + match.index : -1;
}
