"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../adapter.js");
const adapter = globalThis.VNRevivalGameAdapter;

test("CoC2 adapter exposes its game-specific DOM categories", () => {
  assert.match(adapter.categorySelectors.story, /scene|story/i);
  assert.match(adapter.categorySelectors.control, /button/i);
  assert.match(adapter.categorySelectors.control, /select/i);
  assert.match(adapter.categorySelectors.tooltip, /hover/i);
  assert.ok(adapter.contextSelectors.includes("select"));
  assert.ok(adapter.contextSelectors.includes("[role='tooltip']"));
  assert.ok(adapter.privateSelectors.includes("[data-coc2-private]"));
});
