(function () {
  "use strict";
  if (window.__coc2Translator && window.__coc2Translator.version) return;

  const core = window.CoC2TranslationCore;
  if (!core) throw new Error("CoC2 translation core is missing");

  const VERSION = "__VERSION__";
  const SETTINGS_KEY = "coc2-translator.settings.v1";
  const DB_NAME = "coc2-translator-cache";
  const STORE_NAME = "translations";
  const REQUEST_DELAY_MS = 90;
  const LANGUAGES = window.CoC2TranslatorLanguages;
  if (!Array.isArray(LANGUAGES) || LANGUAGES.length < 200) throw new Error("CoC2 language catalog is missing");

  const defaults = { language: "ru", glossary: "", x: null, y: null };
  let settings = loadSettings();
  let running = false;
  let abortController = null;
  let selfMutation = false;
  let scanTimer = 0;
  const applied = new WeakMap();
  const memoryCache = new Map();
  let dbPromise = null;

  function loadSettings() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
    catch (_) { return Object.assign({}, defaults); }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function cacheGet(key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    try {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (value) memoryCache.set(key, value);
      return value;
    } catch (_) { return null; }
  }

  async function cachePut(key, value) {
    memoryCache.set(key, value);
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (_) {}
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  }

  async function requestChunk(text, language, signal) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(core.buildTranslateUrl(text, language), { signal, cache: "no-store" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return core.parseGoogleResponse(await response.json());
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
        if (attempt < 2) await sleep(350 * Math.pow(2, attempt), signal);
      }
    }
    throw lastError || new Error("Translation failed");
  }

  async function translateText(source, language, glossaryText, signal) {
    const key = core.makeCacheKey(source, language, glossaryText);
    const cached = await cacheGet(key);
    if (cached) return cached;
    const prepared = core.applyGlossary(source, glossaryText);
    const parts = [];
    for (const chunk of core.splitLongText(prepared, core.MAX_CHUNK)) {
      parts.push(await requestChunk(chunk, language, signal));
      await sleep(REQUEST_DELAY_MS, signal);
    }
    const translated = parts.join(" ").replace(/ +\n/g, "\n").trim();
    if (translated) await cachePut(key, translated);
    return translated;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.closest("script,style,noscript,input,textarea,[contenteditable='true'],.saveSlot")) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  }

  function collectVisibleTextNodes() {
    const result = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || !isVisible(node.parentElement)) return NodeFilter.FILTER_REJECT;
        const prior = applied.get(node);
        const source = prior && node.nodeValue === prior.translation ? prior.source : core.normalizeText(node.nodeValue);
        return core.hasEnglishText(source) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) result.push(node);
    return result;
  }

  function setNodeText(node, source, translation) {
    if (!node.isConnected || !translation) return;
    selfMutation = true;
    node.nodeValue = preserveWhitespace(node.nodeValue, translation);
    applied.set(node, { source, translation: node.nodeValue });
    if (node.parentElement) node.parentElement.setAttribute("data-coc2-translated", "true");
    queueMicrotask(() => { selfMutation = false; });
  }

  function preserveWhitespace(original, translated) {
    const lead = String(original).match(/^\s*/)[0];
    const tail = String(original).match(/\s*$/)[0];
    return lead + translated + tail;
  }

  async function translateScreen() {
    if (running) { abortController.abort(); return; }
    const nodes = collectVisibleTextNodes();
    if (!nodes.length) { setStatus("Нет английского текста"); return; }
    running = true;
    abortController = new AbortController();
    setButton("Отмена");
    let done = 0;
    let failed = 0;
    const language = settings.language;
    const glossary = settings.glossary;
    try {
      for (const node of nodes) {
        const prior = applied.get(node);
        const source = prior && node.nodeValue === prior.translation ? prior.source : core.normalizeText(node.nodeValue);
        if (!core.hasEnglishText(source)) continue;
        setStatus(`Перевод ${done + failed + 1}/${nodes.length}`);
        try {
          const translated = await translateText(source, language, glossary, abortController.signal);
          setNodeText(node, source, translated);
          done += 1;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          failed += 1;
        }
      }
      setStatus(failed ? `Готово: ${done}, ошибок: ${failed}` : `Готово: ${done}`);
    } catch (error) {
      setStatus(error && error.name === "AbortError" ? "Отменено" : "Ошибка сети");
    } finally {
      running = false;
      abortController = null;
      setButton("Перевести");
    }
  }

  function scheduleCachedReapply() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
      const language = settings.language;
      const glossary = settings.glossary;
      for (const node of collectVisibleTextNodes()) {
        const current = core.normalizeText(node.nodeValue);
        const prior = applied.get(node);
        if (prior && current === core.normalizeText(prior.source)) {
          setNodeText(node, prior.source, core.normalizeText(prior.translation));
          continue;
        }
        if (!core.hasEnglishText(current)) continue;
        const cached = await cacheGet(core.makeCacheKey(current, language, glossary));
        if (cached) setNodeText(node, current, cached);
      }
    }, 120);
  }

  const host = document.createElement("div");
  host.id = "coc2-translator-host";
  host.style.cssText = "position:fixed;z-index:2147483647;top:14px;right:14px;pointer-events:auto";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial} *{box-sizing:border-box} .panel{width:252px;color:#fff;background:rgba(32,19,28,.96);border:1px solid #c69b55;border-radius:9px;box-shadow:0 5px 18px #0008;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow:hidden}.bar{cursor:move;padding:7px 9px;color:#f4d18f;background:#412436;font-weight:700;user-select:none}.row{display:flex;gap:6px;padding:7px}.go,.gear,.danger{border:1px solid #c69b55;border-radius:6px;background:#6b344f;color:#fff;padding:7px 10px;cursor:pointer}.go{flex:1;font-weight:700}.gear{width:38px}.status{min-height:25px;padding:0 9px 7px;color:#ddd;font-size:12px}.settings{display:none;padding:0 8px 8px}.settings.open{display:block}.settings label{display:block;margin:6px 0 3px}.settings select,.settings textarea{width:100%;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:5px}.settings textarea{height:92px;resize:vertical}.actions{display:flex;gap:6px;margin-top:7px}.actions button{flex:1}.hint{color:#bdaeb6;font-size:11px;margin-top:6px}
    </style>
    <div class="panel">
      <div class="bar">CoC2 Translator ${VERSION}</div>
      <div class="row"><button class="go">Перевести</button><button class="gear" title="Настройки">⚙</button></div>
      <div class="status">Готов</div>
      <div class="settings">
        <label>Язык</label><select class="language"></select>
        <label>Словарь (English=Перевод)</label><textarea class="glossary" spellcheck="false"></textarea>
        <div class="actions"><button class="go save">Сохранить</button><button class="danger reset">Сбросить данные</button></div>
        <div class="hint">Ctrl+Shift+T — перевод или отмена. Текст отправляется в Google Translate.</div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector(".go:not(.save)");
  const status = shadow.querySelector(".status");
  const settingsPanel = shadow.querySelector(".settings");
  const languageSelect = shadow.querySelector(".language");
  const glossaryInput = shadow.querySelector(".glossary");
  for (const [code, name] of LANGUAGES) {
    const option = document.createElement("option"); option.value = code; option.textContent = code === "ru" ? "Русский" : name; languageSelect.appendChild(option);
  }
  languageSelect.value = settings.language;
  glossaryInput.value = settings.glossary;
  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    host.style.left = Math.max(0, Math.min(innerWidth - 252, settings.x)) + "px";
    host.style.top = Math.max(0, Math.min(innerHeight - 44, settings.y)) + "px";
    host.style.right = "auto";
  }

  function setStatus(text) { status.textContent = text; }
  function setButton(text) { button.textContent = text; }

  button.addEventListener("click", translateScreen);
  shadow.querySelector(".gear").addEventListener("click", () => settingsPanel.classList.toggle("open"));
  shadow.querySelector(".save").addEventListener("click", () => {
    settings.language = languageSelect.value;
    settings.glossary = glossaryInput.value;
    saveSettings();
    settingsPanel.classList.remove("open");
    setStatus("Настройки сохранены");
  });
  shadow.querySelector(".reset").addEventListener("click", async () => {
    if (!confirm("Удалить настройки, словарь и кэш CoC2 Translator?")) return;
    localStorage.removeItem(SETTINGS_KEY);
    try { indexedDB.deleteDatabase(DB_NAME); } catch (_) {}
    memoryCache.clear(); settings = Object.assign({}, defaults); languageSelect.value = "ru"; glossaryInput.value = ""; setStatus("Данные удалены");
  });

  let drag = null;
  const bar = shadow.querySelector(".bar");
  bar.addEventListener("pointerdown", (event) => {
    const rect = host.getBoundingClientRect(); drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }; bar.setPointerCapture(event.pointerId);
  });
  bar.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const x = Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.dx));
    const y = Math.max(0, Math.min(innerHeight - 36, event.clientY - drag.dy));
    host.style.left = x + "px"; host.style.top = y + "px"; host.style.right = "auto";
  });
  bar.addEventListener("pointerup", () => {
    if (!drag) return; drag = null; const rect = host.getBoundingClientRect(); settings.x = Math.round(rect.left); settings.y = Math.round(rect.top); saveSettings();
  });

  addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === "KeyT") { event.preventDefault(); event.stopPropagation(); translateScreen(); }
  }, true);

  const observer = new MutationObserver(() => { if (!selfMutation) scheduleCachedReapply(); });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  window.__coc2Translator = { version: VERSION, translateScreen, collectVisibleTextNodes, settings: () => Object.assign({}, settings) };
  console.info(`[CoC2 Translator ${VERSION}] loaded`);
})();
