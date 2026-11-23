import test from "node:test";
import assert from "node:assert/strict";
import { sourceIndex, sourceMatch } from "./sourceAssertions";

test("Source assertions tolerate formatting without accepting changed calls or literals", () => {
  const formatted = 'save(\n  record,\n  "rent",\n);';
  sourceMatch(formatted, /save\(record, 'rent'\)/);
  assert.equal(sourceIndex(formatted, "save(record, 'rent')"), 0);
  assert.throws(() => sourceMatch(formatted, /save\(record, 'sale'\)/));
  assert.throws(() => sourceMatch(formatted, /remove\(record, 'rent'\)/));
  assert.throws(() => sourceMatch(formatted, /save\(other, 'rent'\)/));
});
