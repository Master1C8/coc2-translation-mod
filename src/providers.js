(function (root) {
  "use strict";

  const core = root.VNRevivalTranslationCore;
  if (!core) throw new Error("VN Revival translation core is missing before providers");

  function recordUsage(metrics, usage) {
    if (!metrics || !usage || typeof usage !== "object") return;
    if (usage.usage_available === true) {
      metrics.usage_requests += 1;
      for (const field of ["input_tokens", "output_tokens", "total_tokens", "cached_input_tokens", "reasoning_tokens"]) {
        if (Number.isInteger(usage[field]) && usage[field] >= 0) metrics[field] += usage[field];
      }
    }
    if (usage.cost_available === true && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
      metrics.costed_requests += 1;
      metrics.reported_cost_usd = Number(((metrics.reported_cost_usd || 0) + usage.cost_usd).toFixed(12));
    }
  }

  const providers = [
    {
      id: "google",
      label: "Google Translate",
      concurrency: 3,
      delay: 70,
      retries: 3,
      contextLimit: 3200,
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
      concurrency: 4,
      delay: 100,
      retries: 4,
      contextLimit: 6000,
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
        let payload;
        try {
          payload = await context.localRequest("/v1/openai-compatible/translate", {
            body: {
              text: context.text,
              target: context.language,
              targetName: context.languageName || context.language,
              model: connection.model,
              preset: connection.preset,
              baseURL: connection.baseURL,
              systemPrompt: connection.requestSystemPrompt || connection.systemPrompt,
              modelParameters: connection.modelParameters
            },
            signal: context.signal
          });
        } catch (error) {
          recordUsage(context.metrics, error?.usage);
          throw error;
        }
        if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
          const error = new Error("The OpenAI-compatible provider returned an empty translation");
          error.code = "openai_empty_translation";
          throw error;
        }
        recordUsage(context.metrics, payload.usage);
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
