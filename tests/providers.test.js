"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/translation-core.js");
require("../src/providers.js");
const registry = globalThis.VNRevivalTranslationProviders;

test("provider registry exposes a stable extension contract", () => {
  assert.equal(registry.contractVersion, 1);
  assert.deepEqual(registry.list.map(({ id }) => id), ["google", "openai-compatible"]);
  for (const provider of registry.list) {
    assert.equal(typeof provider.supportsLanguage, "function");
    assert.equal(typeof provider.splitText, "function");
    assert.equal(typeof provider.translateChunk, "function");
    assert.ok(provider.concurrency > 0);
  }
  assert.equal(registry.byId.google.hint(), "");
  assert.equal(registry.byId["openai-compatible"].hint(), "");
});

test("online providers own URL construction and response parsing", async () => {
  let requestedURL = "";
  const translated = await registry.byId.google.translateChunk({
    text: "Hello", language: "ru", sourceLanguage: "en", signal: undefined,
    decodeHtmlEntities: (value) => value,
    fetch: async (url) => {
      requestedURL = url;
      return { ok: true, json: async () => [[["Привет", "Hello"]]] };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(new URL(requestedURL).searchParams.get("tl"), "ru");
});

test("OpenAI-compatible delegates endpoint profile and model without exposing its API key", async () => {
  let request = null;
  const translated = await registry.byId["openai-compatible"].translateChunk({
    text: "Hello", language: "ru", languageName: "Russian", signal: undefined,
    openAICompatible: {
      preset: "openrouter", baseURL: "https://openrouter.ai/api/v1", model: "provider/model",
      systemPrompt: "Translate into {targetName} ({target}).",
      modelParameters: { reasoningEffort: "high", temperature: 0.2, maxTokens: 4096, verbosity: "low" }
    },
    localRequest: async (path, options) => {
      request = { path, options };
      return { translatedText: "Привет" };
    }
  });
  assert.equal(translated, "Привет");
  assert.equal(request.path, "/v1/openai-compatible/translate");
  assert.deepEqual(request.options.body, {
    text: "Hello", target: "ru", targetName: "Russian", model: "provider/model",
    preset: "openrouter", baseURL: "https://openrouter.ai/api/v1",
    systemPrompt: "Translate into {targetName} ({target}).",
    modelParameters: { reasoningEffort: "high", temperature: 0.2, maxTokens: 4096, verbosity: "low" }
  });
  assert.equal(registry.byId["openai-compatible"].credentialManager, "openai-compatible");
  assert.equal(registry.byId["openai-compatible"].concurrency, 1);
  assert.equal(registry.byId["openai-compatible"].retries, 1);
});
