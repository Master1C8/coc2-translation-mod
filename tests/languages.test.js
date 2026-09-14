"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "languages.json"), "utf8"));
require("../.build/languages.js");

test("language catalog matches the canonical VN Revival site locales", () => {
  assert.deepEqual(globalThis.VNRevivalTranslatorLanguages, expected);
  assert.deepEqual(expected.map(([code]) => code), [
    "en", "zh", "ru", "es", "es-419", "pt-BR", "ja", "de", "ko", "fr",
    "tr", "pl", "zh-TW", "it", "th", "vi", "id", "uk", "ar", "cs",
    "hu", "nl", "fa", "ro", "hi", "fil", "el", "bg", "sr", "sw", "he"
  ]);
});
