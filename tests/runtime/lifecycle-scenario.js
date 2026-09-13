"use strict";
window.runLifecycleSmoke = async function (shadow) {
  const api = window.__vnRevivalTranslator;
  const originalFetch = window.fetch;
  const area = document.createElement("div");
  area.style.cssText = "position:fixed;top:0;left:0;width:260px";
  const paragraph = document.createElement("p");
  const source = "A lifecycle audit traveler arrives.";
  paragraph.textContent = source;
  area.append(paragraph);
  document.body.append(area);
  const pause = () => new Promise(resolve => setTimeout(resolve, 10));
  const waitFor = async condition => {
    for (let i = 0; i < 100 && !condition(); i += 1) await pause();
    if (!condition()) throw new Error("Lifecycle fixture timeout");
  };
  let failStatus = true;
  let statusRequests = 0;
  let translations = 0;
  let incomplete = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  window.fetch = async (url, options) => {
    if (String(url).endsWith("/v1/openai-compatible/status")) {
      if (failStatus) return { ok: false, status: 503, json: async () => ({ ok: false }) };
      statusRequests += 1;
      await gate;
      return originalFetch(url, options);
    }
    if (String(url).endsWith("/v1/openai-compatible/translate")) {
      translations += 1;
      if (incomplete) return { ok: false, status: 422, json: async () => ({
        ok: false, error: "openai_incomplete_translation", message: "Incomplete translation"
      }) };
      return { ok: true, json: async () => ({ ok: true, translatedText: "Путник прибыл." }) };
    }
    return originalFetch(url, options);
  };
  const checks = {};
  try {
    // A failed model-list refresh leaves a saved model with no cached status.
    const model = shadow.querySelector(".openAICompatibleModel");
    model.dispatchEvent(new Event("pointerdown"));
    await pause();
    failStatus = false;
    const first = api.translateScreen();
    await waitFor(() => statusRequests === 1);
    api.translateScreen(); // The same action cancels the reserved preflight.
    release();
    await first;
    checks.statusPreflightSingleQueueAndCancellation = statusRequests === 1 && translations === 0
      && paragraph.textContent === source;

    incomplete = true;
    const beforeCache = window.smokeCache.size;
    await api.translateScreen();
    checks.incompleteTranslationNeverAppliedOrCached = translations === 1
      && paragraph.textContent === source && window.smokeCache.size === beforeCache;
    incomplete = false;
    await api.translateScreen();
    checks.preflightAndIncompleteFailureRecover = translations === 2 && paragraph.textContent === "Путник прибыл.";

    const visibility = window.smokeIntersectionObservers[0];
    await pause();
    const wasObserved = visibility.targets.has(paragraph);
    // A same-turn move must preserve the existing record and observer registration.
    const moved = document.createElement("div");
    area.append(moved);
    moved.append(paragraph);
    await pause();
    checks.movedTranslationRetained = paragraph.textContent === "Путник прибыл."
      && visibility.targets.has(paragraph);
    paragraph.remove();
    await pause();
    checks.removedTranslationReleased = wasObserved && !visibility.targets.has(paragraph)
      && [...visibility.targets].every(target => target.isConnected)
      && paragraph.textContent === source && !paragraph.hasAttribute("lang")
      && paragraph.style.fontFamily === "";
    area.append(paragraph);
    await pause();
    await api.translateScreen();
    checks.removedTranslationCanBeReinserted = visibility.targets.has(paragraph)
      && paragraph.textContent === "Путник прибыл." && translations === 2;
  } finally {
    release();
    window.fetch = originalFetch;
    area.remove();
  }
  return checks;
};
