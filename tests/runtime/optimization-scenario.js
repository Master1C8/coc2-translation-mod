"use strict";
window.runOptimizationSmoke = async function (shadow) {
  const core = window.VNRevivalTranslationCore;
  const api = window.__vnRevivalTranslator;
  const originalFetch = window.fetch;
  const change = (selector, value) => {
    const element = shadow.querySelector(selector);
    element.value = value;
    element.dispatchEvent(new Event("change"));
  };
  for (const element of [...document.body.children]) {
    if (!element.shadowRoot && element.tagName !== "SCRIPT" && element.id !== "result") element.remove();
  }
  const area = document.createElement("div");
  area.style.cssText = "position:fixed;top:0;left:0;width:220px";
  document.body.append(area);
  window.scrollTo(0, 0);
  const labels = Array.from({ length: 12 }, (_, index) => `Choice ${index}`);
  const translated = (source) => `Перевод ${source.match(/\d+/)?.[0] || "готов"}`;
  const show = (sources) => {
    area.replaceChildren(...sources.map(source => {
      const button = document.createElement("button");
      button.textContent = source;
      return button;
    }));
  };
  const requests = [];
  const metrics = [];
  let badBatch = false;
  let rejectRequests = false;
  let mutate = null;
  let failMetrics = false;
  window.fetch = async (url, options) => {
    if (String(url).endsWith("/v1/translation-metrics")) {
      metrics.push(JSON.parse(options.body));
      if (failMetrics) throw new Error("Simulated local log failure");
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (!String(url).endsWith("/v1/openai-compatible/translate")) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    requests.push(body);
    if (mutate) { const action = mutate; mutate = null; action(); }
    if (typeof rejectRequests === "function" ? rejectRequests(body) : rejectRequests) return { ok: false, status: 502, json: async () => ({ ok: false,
      error: "openai_request_failed", providerStatus: 400, message: "Provider returned HTTP 400" }) };
    if (badBatch === "helper" && body.diagnostics.batch_size > 1) return { ok: false, status: 422,
      json: async () => ({ ok: false, error: "openai_format_invalid", message: "Provider changed a context marker",
        usage: { usage_available: true, cost_available: true, input_tokens: 100, output_tokens: 20,
          total_tokens: 120, cached_input_tokens: 60, reasoning_tokens: 5, cost_usd: 0.0002 } }) };
    const count = (body.text.match(/VRCTXSEP\d+X/g) || []).length + 1;
    const parts = count > 1 ? core.parseContextTranslation(body.text, count) : [body.text];
    const text = badBatch && count > 1 ? "Повреждённый пакет" : core.buildContextSource(parts.map(translated));
    return { ok: true, json: async () => ({
      ok: true,
      translatedText: text,
      usage: {
        usage_available: true, cost_available: true, input_tokens: 100,
        output_tokens: 20, total_tokens: 120, cached_input_tokens: 60,
        reasoning_tokens: 5, cost_usd: 0.0002
      }
    }) };
  };
  const checks = {};
  try {
    change(".openAICompatibleGlossary", "Absent term = Отсутствует");
    change(".openAICompatiblePrompt", "Translate to {targetName}; preserve markers. Optimization fixture.");
    show(labels);
    const cacheBefore = window.smokeCache.size;
    await api.translateScreen();
    checks.batchTwelveLabelsOneRequest = requests.length === 1 && requests[0].diagnostics.batch_size === 12
      && [...area.children].every((element, index) => element.textContent === translated(labels[index]));
    checks.batchIndividualCache = window.smokeCache.size === cacheBefore + 12;
    checks.batchScopedPrompt = !requests[0].systemPrompt.includes("Absent term")
      && requests[0].systemPrompt.includes("Optimization fixture")
      && requests[0].modelParameters.reasoningEffort === "minimal";
    const first = metrics.find(event => event.phase === "result");
    checks.screenMetrics = first?.jobs === 12 && first.helper_requests === 1 && first.batch_requests === 1
      && first.first_apply_ms >= 0 && first.first_story_ms === null && first.outcome === "complete"
      && first.duration_ms >= first.first_apply_ms && first.screen_id === requests[0].diagnostics.screen_id
      && first.usage_requests === 1 && first.costed_requests === 1 && first.input_tokens === 100
      && first.output_tokens === 20 && first.total_tokens === 120 && first.cached_input_tokens === 60
      && first.reasoning_tokens === 5 && first.reported_cost_usd === 0.0002;
    show([labels[8], labels[2], labels[8], labels[0]]);
    await api.translateScreen();
    checks.batchReorderSubsetCache = requests.length === 1 && metrics.at(-1).cache_hits === 3
      && metrics.at(-1).helper_requests === 0;
    show([labels[8], "Choice 12", labels[2]]);
    await api.translateScreen();
    checks.batchOnlyMissingSent = requests.length === 2 && requests[1].text === "Choice 12";
    change(".openAICompatibleGlossary", "Other absent term = Другое");
    await api.translateScreen();
    checks.unrelatedGlossaryPreservesApplied = requests.length === 2;
    show(["Choice 12", labels[2]]);
    await api.translateScreen();
    checks.unrelatedGlossaryPreservesCache = requests.length === 2;
    change(".openAICompatibleGlossary", "Choice 12 = Двенадцать\nAbsent term = Другое");
    await api.translateScreen();
    checks.relevantGlossaryOnlyRetranslatesAffected = requests.length === 3 && requests[2].text === "Choice 12"
      && requests[2].systemPrompt.includes("Choice 12 = Двенадцать") && !requests[2].systemPrompt.includes("Absent term");
    change(".openAICompatibleGlossary", "Use formal address");
    await api.translateScreen();
    checks.freeformGlossaryPreserved = requests.length === 4 && requests[3].systemPrompt.includes("Use formal address");
    change(".openAICompatiblePrompt", "New instruction for {targetName}, preserve markers.");
    await api.translateScreen();
    checks.promptChangeInvalidatesAll = requests.length === 5 && requests[4].diagnostics.batch_size === 2;
    badBatch = true;
    show(["Fallback 20", "Fallback 21"]);
    const fallbackStart = requests.length;
    await api.translateScreen();
    checks.batchMalformedFallsBackOnce = requests.length === fallbackStart + 3
      && metrics.at(-1).batch_fallbacks === 1
      && [...area.children].every((element, index) => element.textContent === `Перевод ${20 + index}`)
      && ![...window.smokeCache.values()].includes("Повреждённый пакет");
    badBatch = false;
    rejectRequests = true;
    show(["Rejected 30", "Rejected 31"]);
    const rejectionStart = requests.length;
    await api.translateScreen();
    checks.batchHttp400DoesNotFanOut = requests.length === rejectionStart + 1
      && metrics.at(-1).outcome === "failed" && metrics.at(-1).failed_jobs === 2;
    rejectRequests = (body) => body.text === "Partial 61";
    badBatch = "helper";
    show(["Partial 60", "Partial 61", "Partial 62"]);
    const partialStart = requests.length;
    await api.translateScreen();
    checks.batchPartialFailureRetainsCompleted = requests.length === partialStart + 3
      && metrics.at(-1).failed_jobs === 2 && metrics.at(-1).usage_requests === 2
      && metrics.at(-1).costed_requests === 2 && metrics.at(-1).reported_cost_usd === 0.0004
      && area.firstChild.textContent === "Перевод 60";
    rejectRequests = false;
    badBatch = false;
    const resumeStart = requests.length;
    await api.translateScreen();
    checks.batchPartialRetryOnlyMissing = requests.length === resumeStart + 1
      && requests.at(-1).diagnostics.batch_size === 2 && !requests.at(-1).text.includes("Partial 60");
    show(["Stale 40", "Stale 41"]);
    const retainedNode = area.firstChild.firstChild;
    mutate = () => { retainedNode.nodeValue = "Changed during request"; area.lastChild.remove(); };
    await api.translateScreen();
    checks.batchDoesNotOverwriteNewGameText = retainedNode.nodeValue === "Changed during request";
    show(["Old configuration 50", "Old configuration 51"]);
    mutate = () => change(".openAICompatiblePrompt", "Latest instruction for {targetName}.");
    await api.translateScreen();
    checks.batchDoesNotApplyObsoleteConfiguration = area.firstChild.textContent === "Old configuration 50"
      && metrics.at(-1).outcome === "superseded";
    change(".openAICompatibleGlossary", "Named hero = Герой");
    const contextBlock = document.createElement("p");
    contextBlock.className = "scene";
    const emphasis = document.createElement("b");
    emphasis.textContent = "Named hero walks";
    const continuation = document.createTextNode(" through the town.");
    contextBlock.append(emphasis, continuation);
    area.replaceChildren(contextBlock);
    await api.translateScreen();
    change(".openAICompatibleGlossary", "Named hero = Путник");
    const wholeContextRestored = emphasis.textContent === "Named hero walks"
      && continuation.nodeValue.trim() === "through the town.";
    const contextStart = requests.length;
    await api.translateScreen();
    checks.glossaryInvalidatesWholeNarrativeContext = wholeContextRestored
      && requests.length === contextStart + 1 && requests.at(-1).text.includes("VRCTXSEP1X")
      && requests.at(-1).diagnostics.batch_size === 1 && requests.at(-1).diagnostics.kind === "story"
      && contextBlock.firstChild === emphasis && contextBlock.lastChild === continuation;
    const story = document.createElement("p");
    story.className = "scene";
    story.textContent = "A story fragment remains a separate request with its original narrative context.";
    area.replaceChildren(story);
    failMetrics = true;
    await api.translateScreen();
    checks.storyRemainsSeparateAndLogFailureNonfatal = requests.at(-1).diagnostics.kind === "story"
      && requests.at(-1).diagnostics.batch_size === 1 && Number.isInteger(metrics.at(-1).first_story_ms)
      && metrics.at(-1).outcome === "complete" && story.textContent === "Перевод готов";
  } finally {
    window.fetch = originalFetch;
    area.remove();
  }
  return checks;
};
