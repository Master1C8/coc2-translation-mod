"use strict";
window.runScreenBlockSmoke = async function (shadow) {
  const core = window.VNRevivalTranslationCore;
  const api = window.__vnRevivalTranslator;
  const originalFetch = window.fetch;
  const area = document.createElement("div");
  area.className = "scene";
  area.style.cssText = "position:fixed;top:0;left:0;width:260px";
  document.body.append(area);
  const paragraph = source => {
    const element = document.createElement("p");
    element.textContent = source;
    return element;
  };
  const changes = [];
  const observer = new MutationObserver(() => changes.push(area.textContent));
  const translations = new Map();
  const translated = source => {
    if (!translations.has(source)) translations.set(source, `Перевод ${translations.size}`);
    return translations.get(source);
  };
  const requests = [];
  const metrics = [];
  let gate = null;
  let malformed = false;
  let rejectSource = "";
  window.fetch = async (url, options) => {
    if (String(url).endsWith("/v1/translation-metrics")) {
      metrics.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (!String(url).endsWith("/v1/openai-compatible/translate")) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    requests.push(body);
    if (gate) await gate;
    if (body.text === rejectSource) return { ok: false, status: 502, json: async () => ({ ok: false,
      error: "openai_request_failed", providerStatus: 400, message: "Provider returned HTTP 400" }) };
    if (malformed && body.diagnostics.batch_size > 1) return { ok: false, status: 422,
      json: async () => ({ ok: false, error: "openai_format_invalid", message: "Invalid markers" }) };
    const count = (body.text.match(/VRCTXSEP\d+X/g) || []).length + 1;
    const parts = count > 1 ? core.parseContextTranslation(body.text, count) : [body.text];
    return { ok: true, json: async () => ({ ok: true, translatedText: core.buildContextSource(parts.map(translated)) }) };
  };
  const waitForRequest = async count => {
    for (let i = 0; i < 100 && requests.length < count; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    if (requests.length < count) throw new Error("Fixture request timeout");
  };
  const checks = {};
  try {
    const first = "A traveler arrives at the village.";
    const rich = paragraph("The guard offers ");
    const emphasis = document.createElement("b");
    emphasis.textContent = "a silver key";
    rich.append(emphasis, document.createTextNode(" before opening the gate."));
    const last = "At night the traveler returns.";
    area.replaceChildren(paragraph(first), rich, paragraph(last), paragraph(first));
    const originalNodes = [...area.childNodes];
    const fragments = [first, "The guard offers", "a silver key", "before opening the gate.", last, first];
    observer.observe(area, { subtree: true, characterData: true });
    await api.translateScreen();
    checks.screenPassageOneRequest = requests.length === 1 && requests[0].diagnostics.batch_size === 4
      && requests[0].diagnostics.kind === "story"
      && JSON.stringify(core.parseContextTranslation(requests[0].text, 6)) === JSON.stringify(fragments);
    checks.screenPassagePreservesStructure = originalNodes.every((node, index) => area.childNodes[index] === node)
      && rich.querySelector("b") === emphasis && emphasis.textContent.trim() === translated("a silver key");
    checks.screenPassageAppearsTogether = changes.length > 0 && changes.every(text => !/[A-Za-z]/.test(text))
      && metrics.at(-1).first_story_ms === metrics.at(-1).first_apply_ms;
    observer.disconnect();
    area.replaceChildren(paragraph(last), paragraph(first));
    await api.translateScreen();
    checks.screenPassageCachesParagraphs = requests.length === 1 && metrics.at(-1).cache_hits === 2;

    const fresh = "A newly arrived merchant greets you.";
    area.replaceChildren(paragraph(first), paragraph(fresh), paragraph(last));
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const mixedRun = api.translateScreen();
    await waitForRequest(2);
    const cachedStillStaged = area.firstChild.textContent === first && area.lastChild.textContent === last;
    gate = null;
    release();
    await mixedRun;
    checks.screenPassageOnlyMissingAndAtomicCache = cachedStillStaged && requests.length === 2
      && requests[1].text === fresh && [...area.children].every(element => !/[A-Za-z]/.test(element.textContent));

    const staleFirst = "A previous encounter is still being translated.";
    const staleLast = "The previous encounter ends here.";
    area.replaceChildren(paragraph(staleFirst), paragraph(staleLast));
    const retained = area.firstChild.firstChild;
    gate = new Promise(resolve => { release = resolve; });
    const staleRun = api.translateScreen();
    await waitForRequest(3);
    retained.nodeValue = "A different encounter has started.";
    gate = null;
    release();
    await staleRun;
    checks.screenPassageRejectsWholeStaleResult = retained.nodeValue === "A different encounter has started."
      && area.lastChild.textContent === staleLast && metrics.at(-1).first_apply_ms === null;

    const fallbackFirst = "A faulty passage starts.";
    const fallbackLast = "A faulty passage ends.";
    area.replaceChildren(paragraph(fallbackFirst), paragraph(fallbackLast));
    malformed = true;
    rejectSource = fallbackLast;
    const beforeFailure = requests.length;
    await api.translateScreen();
    checks.screenPassageFailedFallbackStaysWhole = requests.length === beforeFailure + 3
      && area.firstChild.textContent === fallbackFirst && area.lastChild.textContent === fallbackLast
      && metrics.at(-1).failed_jobs === 2;
    malformed = false;
    rejectSource = "";
    const beforeRetry = requests.length;
    shadow.querySelector(".retry").click();
    for (let i = 0; i < 150 && shadow.querySelector(".translateAction").textContent === "Cancel"; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    checks.screenPassageRetryReusesSuccessfulParagraph = requests.length === beforeRetry + 1
      && requests.at(-1).text === fallbackLast && area.firstChild.textContent === translated(fallbackFirst)
      && area.lastChild.textContent === translated(fallbackLast);
  } finally {
    observer.disconnect();
    window.fetch = originalFetch;
    area.remove();
  }
  return checks;
};
