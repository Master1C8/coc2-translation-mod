(function (root) {
  "use strict";

  const core = root.VNRevivalTranslationCore;
  if (!core) throw new Error("VN Revival translation core is missing before providers");

  const providers = [
    {
      id: "google",
      label: "Google Translate",
      concurrency: 3,
      delay: 70,
      retries: 3,
      contextLimit: 3200,
      requiresPrivacy: true,
      supportsLanguage(code) {
        return core.providerSupportsLanguage("google", code);
      },
      splitText(text) {
        return core.splitLongText(text, core.GOOGLE_MAX_CHARS);
      },
      hint() {
        return "";
      },
      async translateChunk(context) {
        const target = core.providerLanguageCode("google", context.language);
        if (!target) throw new Error("The selected language is not supported by this service");
        const response = await context.fetch(core.buildGoogleUrl(context.text, target, context.sourceLanguage), {
          signal: context.signal, cache: "no-store"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return context.decodeHtmlEntities(core.parseGoogleResponse(await response.json()));
      }
    },
    {
      id: "openai-compatible",
      label: "OpenAI-compatible",
      concurrency: 1,
      delay: 100,
      retries: 4,
      contextLimit: 6000,
      requiresPrivacy: true,
      credentialManager: "openai-compatible",
      modelManager: "openai-compatible",
      supportsLanguage(code) {
        return core.providerSupportsLanguage("openai-compatible", code);
      },
      splitText(text) {
        return core.splitLongText(text, 6000);
      },
      hint() {
        return "";
      },
      async translateChunk(context) {
        const connection = context.openAICompatible || {};
        const payload = await context.localRequest("/v1/openai-compatible/translate", {
          body: {
            text: context.text,
            target: context.language,
            targetName: context.languageName || context.language,
            model: connection.model,
            preset: connection.preset,
            baseURL: connection.baseURL,
            systemPrompt: connection.systemPrompt,
            modelParameters: connection.modelParameters
          },
          signal: context.signal
        });
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          throw new Error("The OpenAI-compatible provider returned an empty translation");
        }
        return payload.translatedText;
      }
    }
  ].map((provider) => Object.freeze(provider));

  root.VNRevivalTranslationProviders = Object.freeze({
    contractVersion: 1,
    list: Object.freeze(providers),
    byId: Object.freeze(Object.fromEntries(providers.map((provider) => [provider.id, provider])))
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
