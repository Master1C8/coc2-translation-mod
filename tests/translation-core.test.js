"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/translation-core.js");

test("normalizes layout whitespace without flattening lines", () => {
  assert.equal(core.normalizeText("  Hello\u00a0 world \n next  "), "Hello world\nnext");
});

test("detects natural English and rejects paths, assets, hashes, and numbers", () => {
  assert.equal(core.hasEnglishText("Continue adventure"), true);
  assert.equal(core.hasEnglishText("123 + 45"), false);
  assert.equal(core.hasEnglishText("portrait.png"), false);
  assert.equal(core.hasEnglishText("https://example.com"), false);
  assert.equal(core.hasEnglishText("A04F99BB11"), false);
});

test("splits long Google text on Unicode-safe boundaries", () => {
  const text = "A long sentence with an emoji 😀. ".repeat(300);
  const chunks = core.splitLongText(text, 3500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 3500));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("splits MyMemory text by UTF-8 byte count", () => {
  const text = "English 😀 Кириллица. ".repeat(80);
  const chunks = core.splitUtf8Text(text, 480);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => core.utf8Length(chunk) <= 480));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("builds and parses Google requests", () => {
  const url = new URL(core.buildGoogleUrl("Hello & goodbye", "ru"));
  assert.equal(url.hostname, "translate.googleapis.com");
  assert.equal(url.searchParams.get("sl"), "en");
  assert.equal(url.searchParams.get("tl"), "ru");
  assert.equal(url.searchParams.get("q"), "Hello & goodbye");
  assert.equal(core.parseGoogleResponse([[['Привет ', 'Hello '], ['мир', 'world']]]), "Привет мир");
  assert.throws(() => core.parseGoogleResponse({ nope: true }));
});

test("builds and parses MyMemory requests", () => {
  const url = new URL(core.buildMyMemoryUrl("Hello world", "de"));
  assert.equal(url.hostname, "api.mymemory.translated.net");
  assert.equal(url.searchParams.get("langpair"), "en|de");
  assert.equal(url.searchParams.get("q"), "Hello world");
  assert.equal(core.parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: "Hallo Welt" } }), "Hallo Welt");
  assert.throws(() => core.parseMyMemoryResponse({ responseStatus: 403, responseDetails: "limit" }));
});

test("cache separates providers and languages while retaining legacy Google keys", () => {
  const googleRu = core.makeCacheKey("Hello", "ru", "google");
  const googleDe = core.makeCacheKey("Hello", "de", "google");
  const memoryRu = core.makeCacheKey("Hello", "ru", "mymemory");
  assert.notEqual(googleRu, googleDe);
  assert.notEqual(googleRu, memoryRu);
  assert.equal(core.cacheKeyLanguage(googleRu), "ru");
  assert.equal(core.cacheKeyProvider(googleRu), "google");
  assert.equal(core.cacheKeyLanguage(memoryRu), "ru");
  assert.equal(core.cacheKeyProvider(memoryRu), "mymemory");
  assert.equal(googleRu.split("\n")[0], "v1");
});
