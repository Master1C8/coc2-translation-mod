"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/translation-core.js");

test("normalizes layout whitespace without flattening lines", () => {
  assert.equal(core.normalizeText("  Hello\u00a0 world \n next  "), "Hello world\nnext");
});

test("recognizes right-to-left target languages and normalizes Hebrew for HTML", () => {
  for (const language of ["ar", "bal", "bm-Nkoo", "ckb", "dv", "fa", "fa-AF", "iw", "ms-Arab", "pa-Arab", "ps", "sd", "ug", "ur", "yi"]) {
    assert.equal(core.isRtlLanguage(language), true, language);
  }
  for (const language of ["en", "ru", "no", "ku", "zh-CN"]) {
    assert.equal(core.isRtlLanguage(language), false, language);
  }
  assert.equal(core.htmlLanguageCode("iw"), "he");
  assert.equal(core.htmlLanguageCode("jw"), "jv");
  assert.equal(core.htmlLanguageCode("zh"), "zh-Hans");
  assert.equal(core.htmlLanguageCode("zh-CN"), "zh-Hans");
  assert.equal(core.htmlLanguageCode("zh-TW"), "zh-Hant");
  assert.equal(core.htmlLanguageCode("fa-AF"), "fa-AF");
});

test("supports the two runtime providers across the language catalog", () => {
  assert.equal(core.providerLanguageCode("google", "iw"), "iw");
  assert.equal(core.providerLanguageCode("google", "zh"), "zh-CN");
  assert.equal(core.providerLanguageCode("google", "es-419"), "es");
  assert.equal(core.providerLanguageCode("google", "pt-BR"), "pt");
  assert.equal(core.providerLanguageCode("google", "fil"), "tl");
  assert.equal(core.providerLanguageCode("google", "he"), "iw");
  assert.equal(core.providerLanguageCode("openai-compatible", "fil"), "fil");
  assert.equal(core.providerLanguageCode("openai-compatible", "es-419"), "es-419");
  assert.equal(core.providerSupportsLanguage("google", "ab"), true);
  assert.equal(core.providerSupportsLanguage("openai-compatible", "zh-TW"), true);
  assert.equal(core.providerSupportsLanguage("google", "fil"), true);
  assert.equal(core.providerSupportsLanguage("removed-provider", "ru"), false);
});

test("selects script-aware font fallbacks without dropping universal fonts", () => {
  assert.ok(core.fontFallbacks("ar").includes("Noto Sans Arabic"));
  assert.ok(core.fontFallbacks("hi").includes("Noto Sans Devanagari"));
  assert.ok(core.fontFallbacks("zh-TW").includes("PingFang TC"));
  assert.ok(core.fontFallbacks("zh").includes("PingFang SC"));
  assert.ok(core.fontFallbacks("bm-Nkoo").includes("Noto Sans NKo"));
  assert.ok(core.fontFallbacks("no").includes("Noto Sans"));
  assert.equal(core.fontFallbacks("no").at(-1), "sans-serif");
});

test("keeps user-perceived characters intact when splitting", () => {
  const graphemes = ["कि", "e\u0301", "👩‍👩‍👧‍👦", "🇳🇴", "ก้"];
  assert.deepEqual(core.splitGraphemes(graphemes.join("")), graphemes);
  const text = graphemes.join("").repeat(40);
  const chunks = core.splitLongText(text, 64);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => graphemes.includes(core.splitGraphemes(chunk).at(-1))));
});

test("round-trips contextual translation markers and rejects damaged output", () => {
  const source = core.buildContextSource(["You see", "a beautiful woman", "near the door."]);
  assert.equal(source, "You see VRCTXSEP1X a beautiful woman VRCTXSEP2X near the door.");
  assert.deepEqual(
    core.parseContextTranslation("Вы видите VRCTXSEP1X красивую женщину VRCTXSEP2X возле двери.", 3),
    ["Вы видите", "красивую женщину", "возле двери."]
  );
  assert.equal(core.parseContextTranslation("Маркер был удалён", 3), null);
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

test("splits text by UTF-8 byte count for runtime limits", () => {
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
  assert.equal(new URL(core.buildGoogleUrl("Bonjour", "de", "fr")).searchParams.get("sl"), "fr");
  assert.equal(core.parseGoogleResponse([[['Привет ', 'Hello '], ['мир', 'world']]]), "Привет мир");
  assert.throws(() => core.parseGoogleResponse({ nope: true }));
});

test("cache separates providers and languages while retaining legacy Google keys", () => {
  const googleRu = core.makeCacheKey("Hello", "ru", "google");
  const googleDe = core.makeCacheKey("Hello", "de", "google");
  const openAIRu = core.makeCacheKey("Hello", "ru", "openai-compatible");
  assert.notEqual(googleRu, googleDe);
  assert.notEqual(googleRu, openAIRu);
  assert.equal(core.cacheKeyLanguage(googleRu), "ru");
  assert.equal(core.cacheKeyProvider(googleRu), "google");
  assert.equal(core.cacheKeyLanguage(openAIRu), "ru");
  assert.equal(core.cacheKeyProvider(openAIRu), "openai-compatible");
  assert.equal(googleRu.split("\n")[0], "v1");
});

test("v4 cache keys isolate OpenAI-compatible endpoint and model variants", () => {
  const left = core.makeCacheKey("Hello", "ru", "openai-compatible", "coc2", "one/model-a/prompt-v1");
  const right = core.makeCacheKey("Hello", "ru", "openai-compatible", "coc2", "two/model-b/prompt-v1");
  assert.notEqual(left, right);
  assert.equal(left.split("\n")[0], "v4");
  assert.equal(core.cacheKeyGame(left), "coc2");
  assert.equal(core.cacheKeyLanguage(left), "ru");
  assert.equal(core.cacheKeyProvider(left), "openai-compatible");
});

test("v3 cache keys isolate games and expose their owning adapter", () => {
  const coc2 = core.makeCacheKey("Hello", "ru", "google", "coc2");
  const other = core.makeCacheKey("Hello", "ru", "google", "other-game");
  assert.notEqual(coc2, other);
  assert.equal(coc2.split("\n")[0], "v3");
  assert.equal(core.cacheKeyGame(coc2), "coc2");
  assert.equal(core.cacheKeyLanguage(coc2), "ru");
  assert.equal(core.cacheKeyProvider(coc2), "google");
  assert.equal(core.cacheKeyGame(core.makeCacheKey("Hello", "ru", "google")), "");
});

test("selects relevant glossary mappings conservatively and preserves free-form instructions", () => {
  const glossary = "Sword = Меч\nInn = Таверна\nSilver coin = Серебряная монета";
  assert.equal(core.selectGlossary("A SWORD and a silver\u00a0coin", glossary), "Sword = Меч\nSilver coin = Серебряная монета");
  assert.equal(core.selectGlossary("Nothing relevant", glossary), "");
  assert.equal(core.selectGlossary("Ｓｗｏｒｄ", glossary), "Sword = Меч");
  for (const instructions of ["Use formal address", "Sword = Меч\nUse formal address", "Sword == Меч", " = Меч", "Sword = "]) {
    assert.equal(core.selectGlossary("Nothing relevant", instructions), instructions.trim());
  }
});

test("packs ordered screen blocks within request and fragment limits", () => {
  const story = (source, region = "scene") => ({ source, kind: "story", nodes: [source], batchRegion: region });
  const first = story("First paragraph.");
  const rich = { ...story(""), contextual: true, parts: [{ source: "A bold" }, { source: " continuation." }] };
  const last = story("Last paragraph.");
  const packed = core.batchScreenJobs([first, rich, last]);
  assert.deepEqual(packed[0].batchParts, [first, rich, last]);
  assert.deepEqual(packed[0].batchParts.flatMap(core.jobTextParts), ["First paragraph.", "A bold", " continuation.", "Last paragraph."]);
  const huge = story("Word ".repeat(2000));
  const other = story("Other scene", "other");
  const tooltip = { source: "Tooltip", kind: "tooltip", nodes: ["tip"] };
  assert.deepEqual(core.batchScreenJobs([first, huge, other, tooltip]), [first, huge, other, tooltip]);
  assert.equal(core.batchScreenJobs([story("é".repeat(1450)), story("é".repeat(1450)), story("é".repeat(1450))]).length, 2);
  const many = Array.from({ length: 25 }, (_, index) => story(`Paragraph ${index}`));
  assert.deepEqual(core.batchScreenJobs(many).map(job => job.batchParts?.length || 1), [12, 12, 1]);
  const manyRich = Array.from({ length: 5 }, () => ({ ...rich, parts: Array.from({ length: 12 }, () => ({ source: "Text" })) }));
  assert.deepEqual(core.batchScreenJobs(manyRich).map(job => job.batchParts?.length || 1), [4, 1]);
  const literalMarker = story("Literal VRCTXSEP1X marker");
  assert.deepEqual(core.batchScreenJobs([first, literalMarker, last]), [first, literalMarker, last]);
});
