"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../src/translation-core.js");

const gameId = process.env.VNREVIVAL_GAME;
assert.ok(gameId, "VNREVIVAL_GAME must select exactly one build target");
const gameDirectory = path.join(__dirname, "..", "src", "games", gameId);
const manifest = JSON.parse(fs.readFileSync(path.join(gameDirectory, "game.json"), "utf8"));
require(path.join(gameDirectory, "adapter.js"));
const adapter = globalThis.VNRevivalGameAdapter;
const runtimeSource = fs.readFileSync(path.join(__dirname, "..", "src", "translator-runtime.js"), "utf8");

test("selected game manifest supplies universal runtime identity", () => {
  assert.equal(manifest.id, gameId);
  assert.equal(manifest.sourceLanguage, "en");
  assert.equal(manifest.launchStrategy, "electron-cdp");
  assert.ok(manifest.translatorName);
  assert.ok(manifest.storageNamespace);
  assert.ok(manifest.windowsExecutable.toLowerCase().endsWith(".exe"));
  assert.ok(manifest.debugTargetTitleContains || manifest.debugTargetUrlContains);
});

test("selected DOM adapter satisfies contract version 2", () => {
  assert.equal(adapter.contractVersion, 2);
  assert.ok(Array.isArray(adapter.privateSelectors));
  assert.equal(typeof adapter.categorySelectors, "object");
  assert.ok(Array.isArray(adapter.contextSelectors));
  assert.equal(adapter.hasSourceText("Continue adventure", core), true);
  assert.equal(adapter.hasSourceText("12345", core), false);
  for (const duplicatedField of ["id", "title", "sourceLanguage", "storageNamespace", "supportedVersions"]) {
    assert.equal(Object.hasOwn(adapter, duplicatedField), false, duplicatedField);
  }
});

test("model suggestions avoid the Chromium datalist crash path", () => {
  assert.match(runtimeSource, /class="openAICompatibleModelSuggestion"/);
  assert.match(runtimeSource, /class="openAICompatibleModel" type="text"/);
  assert.doesNotMatch(runtimeSource, /<datalist\b|\blist="openAICompatibleModels"/);
});
