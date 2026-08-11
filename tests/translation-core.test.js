"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/translation-core.js");

test("normalizes layout whitespace without flattening lines", () => {
  assert.equal(core.normalizeText("  Hello\u00a0 world \n next  "), "Hello world\nnext");
});

test("detects natural English and rejects paths/assets", () => {
  assert.equal(core.hasEnglishText("Continue adventure"), true);
  assert.equal(core.hasEnglishText("123 + 45"), false);
  assert.equal(core.hasEnglishText("portrait.png"), false);
  assert.equal(core.hasEnglishText("https://example.com"), false);
});

test("parses and applies a glossary case-insensitively", () => {
  const glossary = core.parseGlossary("# comment\nResolve=Решимость\nWinter City=Зимний город");
  assert.deepEqual(glossary, [["Resolve", "Решимость"], ["Winter City", "Зимний город"]]);
  assert.equal(core.applyGlossary("Resolve in the Winter City", glossary), "Решимость in the Зимний город");
});

test("splits long text on safe boundaries", () => {
  const text = "A long sentence with an emoji 😀. ".repeat(300);
  const chunks = core.splitLongText(text, 3500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("builds the expected Google request", () => {
  const url = new URL(core.buildTranslateUrl("Hello & goodbye", "ru"));
  assert.equal(url.hostname, "translate.googleapis.com");
  assert.equal(url.searchParams.get("sl"), "en");
  assert.equal(url.searchParams.get("tl"), "ru");
  assert.equal(url.searchParams.get("q"), "Hello & goodbye");
});

test("parses multi-part Google responses", () => {
  assert.equal(core.parseGoogleResponse([[['Привет ', 'Hello '], ['мир', 'world']]]), "Привет мир");
  assert.throws(() => core.parseGoogleResponse({ nope: true }));
});

test("cache key changes with language, glossary, or source", () => {
  const base = core.makeCacheKey("Hello", "ru", "");
  assert.notEqual(base, core.makeCacheKey("Hello", "de", ""));
  assert.notEqual(base, core.makeCacheKey("Hello", "ru", "Hello=Привет"));
  assert.notEqual(base, core.makeCacheKey("Goodbye", "ru", ""));
});
