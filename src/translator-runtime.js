(function () {
  "use strict";
  if (window.__coc2Translator && window.__coc2Translator.version) return;

  const core = window.CoC2TranslationCore;
  if (!core) throw new Error("CoC2 translation core is missing");

  const VERSION = "__VERSION__";
  const SUPPORTED_GAME_VERSION = "0.9.3";
  const SITE_NAME = "VN Revival";
  const SITE_URL = "https://vnrevival.fun/";
  const SETTINGS_KEY = "coc2-translator.settings.v2";
  const LEGACY_SETTINGS_KEY = "coc2-translator.settings.v1";
  const DB_NAME = "coc2-translator-cache";
  const STORE_NAME = "translations";
  const LANGUAGES = window.CoC2TranslatorLanguages;
  const PROVIDERS = {
    google: { label: "Google Translate", concurrency: 3, delay: 70 },
    mymemory: { label: "MyMemory", concurrency: 2, delay: 120 }
  };
  const defaults = {
    language: "ru",
    provider: "google",
    autoTranslate: true,
    privacyAccepted: false,
    mode: "translated",
    x: null,
    y: null
  };

  if (!Array.isArray(LANGUAGES) || LANGUAGES.length < 200) throw new Error("CoC2 language catalog is missing");

  let settings = loadSettings();
  let running = false;
  let abortController = null;
  let selfMutation = false;
  let scanTimer = 0;
  let pendingAutoRun = false;
  let lastFailedJobs = [];
  let dbPromise = null;
  const applied = new WeakMap();
  const appliedNodes = new Set();
  const memoryCache = new Map();

  function loadSettings() {
    let parsed = null;
    let migratedLegacy = false;
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (_) {}
    if (!parsed) {
      try {
        parsed = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "null");
        migratedLegacy = !!parsed;
      } catch (_) {}
    }
    const source = parsed || {};
    return {
      language: LANGUAGES.some(([code]) => code === source.language) ? source.language : defaults.language,
      provider: PROVIDERS[source.provider] ? source.provider : defaults.provider,
      autoTranslate: typeof source.autoTranslate === "boolean" ? source.autoTranslate : defaults.autoTranslate,
      privacyAccepted: typeof source.privacyAccepted === "boolean" ? source.privacyAccepted : migratedLegacy,
      mode: source.mode === "source" ? "source" : defaults.mode,
      x: Number.isFinite(source.x) ? source.x : null,
      y: Number.isFinite(source.y) ? source.y : null
    };
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  }

  // Persist the sanitized v2 shape immediately so obsolete v1-only fields are discarded.
  saveSettings();

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
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
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => reject(request.error);
      });
      if (value) memoryCache.set(key, value);
      return value;
    } catch (_) { return null; }
  }

  async function cachePut(key, value) {
    if (!key || !value) return;
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

  async function readAllCacheEntries() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const entries = [];
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(entries); return; }
        if (typeof cursor.key === "string" && typeof cursor.value === "string") entries.push([cursor.key, cursor.value]);
        cursor.continue();
      };
    });
  }

  async function cacheStats() {
    try {
      const entries = await readAllCacheEntries();
      let bytes = 0;
      let languageRecords = 0;
      let languageBytes = 0;
      for (const [key, value] of entries) {
        const size = new Blob([key, value]).size;
        bytes += size;
        if (core.cacheKeyLanguage(key) === settings.language) {
          languageRecords += 1;
          languageBytes += size;
        }
      }
      return { records: entries.length, bytes, languageRecords, languageBytes };
    } catch (_) { return { records: 0, bytes: 0, languageRecords: 0, languageBytes: 0 }; }
  }

  async function clearCacheForLanguage(language) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (core.cacheKeyLanguage(cursor.key) === language) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    memoryCache.clear();
  }

  async function clearAllCache() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (_) {}
    memoryCache.clear();
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }

  function decodeHtmlEntities(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  async function requestChunk(provider, text, language, signal) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const url = provider === "mymemory"
          ? core.buildMyMemoryUrl(text, language)
          : core.buildGoogleUrl(text, language);
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        const translated = provider === "mymemory"
          ? core.parseMyMemoryResponse(payload)
          : core.parseGoogleResponse(payload);
        return decodeHtmlEntities(translated);
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
        if (attempt < 2) await sleep(350 * Math.pow(2, attempt), signal);
      }
    }
    throw lastError || new Error("Translation failed");
  }

  async function translateText(source, language, provider, signal) {
    const key = core.makeCacheKey(source, language, provider);
    const cached = await cacheGet(key);
    if (cached) return { text: cached, cached: true };
    const chunks = provider === "mymemory"
      ? core.splitUtf8Text(source, core.MYMEMORY_MAX_BYTES)
      : core.splitLongText(source, core.GOOGLE_MAX_CHARS);
    const parts = [];
    for (const chunk of chunks) {
      parts.push(await requestChunk(provider, chunk, language, signal));
      await sleep(PROVIDERS[provider].delay, signal);
    }
    const translated = parts.join(" ").replace(/ +\n/g, "\n").trim();
    if (translated) await cachePut(key, translated);
    return { text: translated, cached: false };
  }

  function isPrivateOrTechnical(element) {
    return !!element.closest([
      "script", "style", "noscript", "input", "textarea", "[contenteditable='true']",
      "#loading", "#progressText", "progress",
      ".saveSlot", ".hotkeyIndicator", ".gamepadCursorWrapper",
      "[class*='playerName' i]", "[class*='characterName' i]", "[data-coc2-private]"
    ].join(","));
  }

  function isElementOnScreen(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  }

  function isVisible(element) {
    return isElementOnScreen(element) && !isPrivateOrTechnical(element);
  }

  function sourceForNode(node) {
    const current = core.normalizeText(node && node.nodeValue);
    const record = applied.get(node);
    if (!record) return current;
    if (current === core.normalizeText(record.source) || current === core.normalizeText(record.translation)) return record.source;
    applied.delete(node);
    appliedNodes.delete(node);
    return current;
  }

  function classifyNode(node) {
    const element = node.parentElement;
    if (element.closest(".scene,.story,.output,.eventText,.sceneText,.combatOutput,[class*='story' i]")) return "story";
    if (element.closest("button,[role='button'],a,.button")) return "control";
    if (element.closest(".tooltip,[role='tooltip']")) return "tooltip";
    return "ui";
  }

  function collectVisibleTextNodes(options) {
    const includeCompleted = !!(options && options.includeCompleted);
    const result = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || !isVisible(node.parentElement)) return NodeFilter.FILTER_REJECT;
        const source = sourceForNode(node);
        if (!core.hasEnglishText(source)) return NodeFilter.FILTER_REJECT;
        const record = applied.get(node);
        if (!includeCompleted && record && record.language === settings.language && record.provider === settings.provider && record.translation) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) result.push(node);
    return result;
  }

  function preserveWhitespace(original, translated) {
    const value = String(original || "");
    const lead = (value.match(/^\s*/) || [""])[0];
    const tail = (value.match(/\s*$/) || [""])[0];
    return lead + translated + tail;
  }

  function writeNode(node, value) {
    if (!node || !node.isConnected) return;
    selfMutation = true;
    node.nodeValue = preserveWhitespace(node.nodeValue, value);
    queueMicrotask(() => { selfMutation = false; });
  }

  function rememberTranslation(node, source, translation, language, provider) {
    if (!node || !node.isConnected || !translation) return;
    applied.set(node, { source, translation, language, provider });
    appliedNodes.add(node);
    if (settings.mode === "translated") writeNode(node, translation);
    if (node.parentElement) node.parentElement.setAttribute("data-coc2-translated", "true");
  }

  function pruneAppliedNodes() {
    for (const node of appliedNodes) {
      if (!node.isConnected) {
        applied.delete(node);
        appliedNodes.delete(node);
      }
    }
  }

  function showOriginal() {
    settings.mode = "source";
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.source);
    }
    saveSettings();
    updateModeButton();
    setStatus("Показан оригинал");
  }

  function showTranslations() {
    settings.mode = "translated";
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.translation);
    }
    saveSettings();
    updateModeButton();
    setStatus("Показан перевод");
    scheduleAutoTranslation(50);
  }

  function toggleMode() {
    if (settings.mode === "translated") showOriginal();
    else showTranslations();
  }

  function invalidateAppliedTranslations() {
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.source);
      applied.delete(node);
    }
    appliedNodes.clear();
  }

  function buildJobs(nodes) {
    const grouped = new Map();
    for (const node of nodes) {
      const source = sourceForNode(node);
      if (!core.hasEnglishText(source)) continue;
      if (!grouped.has(source)) grouped.set(source, { source, nodes: [], kind: classifyNode(node) });
      grouped.get(source).nodes.push(node);
    }
    const priority = { story: 0, control: 1, tooltip: 2, ui: 3 };
    return Array.from(grouped.values()).sort((a, b) => priority[a.kind] - priority[b.kind]);
  }

  async function runJobs(jobs, options) {
    const manual = !!(options && options.manual);
    if (!settings.privacyAccepted) {
      privacyBox.hidden = false;
      settingsPanel.classList.add("open");
      setStatus("Подтвердите сетевой перевод");
      return;
    }
    if (running) {
      if (manual && abortController) abortController.abort();
      else pendingAutoRun = true;
      return;
    }
    if (!jobs.length) {
      setStatus("Экран уже переведён");
      return;
    }

    running = true;
    abortController = new AbortController();
    setMainButton("Отмена");
    retryButton.hidden = true;
    lastFailedJobs = [];
    const language = settings.language;
    const provider = settings.provider;
    let nextIndex = 0;
    let done = 0;
    let cacheHits = 0;

    async function worker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        const job = jobs[index];
        try {
          const result = await translateText(job.source, language, provider, abortController.signal);
          for (const node of job.nodes) {
            if (node.isConnected && sourceForNode(node) === job.source) rememberTranslation(node, job.source, result.text, language, provider);
          }
          if (result.cached) cacheHits += 1;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          lastFailedJobs.push(job);
        }
        done += 1;
        setStatus(`Перевод ${done}/${jobs.length}`);
      }
    }

    try {
      const count = Math.min(PROVIDERS[provider].concurrency, jobs.length);
      await Promise.all(Array.from({ length: count }, () => worker()));
      if (lastFailedJobs.length) {
        setStatus(`Готово: ${jobs.length - lastFailedJobs.length}, ошибок: ${lastFailedJobs.length}`);
        retryButton.hidden = false;
      } else {
        setStatus(`Готово: ${jobs.length}` + (cacheHits ? `, из кэша: ${cacheHits}` : ""));
      }
    } catch (error) {
      setStatus(error && error.name === "AbortError" ? "Отменено" : "Ошибка сети");
    } finally {
      running = false;
      abortController = null;
      setMainButton("Перевести");
      refreshCacheStats();
      if (pendingAutoRun) {
        pendingAutoRun = false;
        scheduleAutoTranslation(250);
      }
    }
  }

  function translateScreen(manual) {
    if (running) {
      if (manual !== false && abortController) abortController.abort();
      else pendingAutoRun = true;
      return;
    }
    const jobs = buildJobs(collectVisibleTextNodes());
    return runJobs(jobs, { manual: manual !== false });
  }

  function retryFailed() {
    const jobs = lastFailedJobs.filter((job) => job.nodes.some((node) => node.isConnected));
    lastFailedJobs = [];
    return runJobs(jobs.length ? jobs : buildJobs(collectVisibleTextNodes()), { manual: true });
  }

  function reapplyKnownTranslations() {
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (!record) continue;
      const current = core.normalizeText(node.nodeValue);
      if (current !== core.normalizeText(record.source) && current !== core.normalizeText(record.translation)) {
        applied.delete(node);
        appliedNodes.delete(node);
        continue;
      }
      if (settings.mode === "translated" && current === core.normalizeText(record.source)) writeNode(node, record.translation);
      if (settings.mode === "source" && current === core.normalizeText(record.translation)) writeNode(node, record.source);
    }
  }

  function scheduleAutoTranslation(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      const loading = document.getElementById("loading");
      if (loading && isElementOnScreen(loading)) {
        scheduleAutoTranslation(1000);
        return;
      }
      reapplyKnownTranslations();
      if (settings.autoTranslate && settings.privacyAccepted && settings.mode === "translated") translateScreen(false);
    }, Number(delay) || 350);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + " Б";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " КБ";
    return (value / (1024 * 1024)).toFixed(1) + " МБ";
  }

  async function refreshCacheStats() {
    const stats = await cacheStats();
    cacheStatsElement.textContent = `Этот язык: ${stats.languageRecords} записей, ${formatBytes(stats.languageBytes)} · Всего: ${stats.records}, ${formatBytes(stats.bytes)}`;
  }

  async function exportCache() {
    try {
      const entries = await readAllCacheEntries();
      const payload = { format: "coc2-translator-cache", version: 1, exportedAt: new Date().toISOString(), entries };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `coc2-translator-cache-${new Date().toISOString().slice(0, 10)}.json`;
      document.documentElement.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Экспортировано: ${entries.length}`);
    } catch (_) { setStatus("Не удалось экспортировать кэш"); }
  }

  async function importCache(file) {
    try {
      if (!file || file.size > 25 * 1024 * 1024) throw new Error("File is too large");
      const payload = JSON.parse(await file.text());
      if (!payload || payload.format !== "coc2-translator-cache" || !Array.isArray(payload.entries)) throw new Error("Invalid format");
      const valid = payload.entries.filter((entry) => Array.isArray(entry)
        && typeof entry[0] === "string" && typeof entry[1] === "string"
        && core.cacheKeyLanguage(entry[0]) && core.cacheKeyProvider(entry[0])
        && entry[0].length < 120000 && entry[1].length < 120000).slice(0, 100000);
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        for (const [key, value] of valid) store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      memoryCache.clear();
      await refreshCacheStats();
      setStatus(`Импортировано: ${valid.length}`);
      scheduleAutoTranslation(50);
    } catch (_) { setStatus("Неверный файл кэша"); }
  }

  async function deleteAllTranslatorData() {
    invalidateAppliedTranslations();
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
    await clearAllCache();
    settings = Object.assign({}, defaults);
    languageSelect.value = settings.language;
    providerSelect.value = settings.provider;
    autoCheckbox.checked = settings.autoTranslate;
    privacyBox.hidden = false;
    updateProviderHint();
    updateModeButton();
    await refreshCacheStats();
    setStatus("Все данные переводчика удалены");
  }

  const host = document.createElement("div");
  host.id = "coc2-translator-host";
  host.style.cssText = "position:fixed;z-index:2147483647;top:14px;right:14px;pointer-events:auto";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial}*{box-sizing:border-box}.panel{width:306px;color:#fff;background:rgba(32,19,28,.97);border:1px solid #c69b55;border-radius:9px;box-shadow:0 5px 18px #0008;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow:hidden}.bar{cursor:move;padding:7px 9px;color:#f4d18f;background:#412436;font-weight:700;user-select:none}.row{display:flex;gap:6px;padding:7px}.primary,.secondary,.gear,.danger,.small{border:1px solid #c69b55;border-radius:6px;background:#6b344f;color:#fff;padding:7px 9px;cursor:pointer;font:inherit}.primary{flex:1;font-weight:700}.secondary{background:#442b39}.gear{width:38px}.status{min-height:23px;padding:0 9px 3px;color:#ddd;font-size:12px}.hotkey{padding:0 9px 7px;color:#f4d18f;font-size:11px}.retry{margin:0 8px 7px;width:calc(100% - 16px)}.settings{display:none;padding:0 8px 9px;border-top:1px solid #6e4d56}.settings.open{display:block}.settings label.title{display:block;margin:7px 0 3px}.settings select{width:100%;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:6px}.check{display:flex;gap:7px;align-items:center;margin:8px 0}.hint,.providerHint,.cacheStats{color:#bdaeb6;font-size:11px;line-height:1.3}.providerHint{margin-top:4px}.cacheBox{margin-top:8px;padding:7px;border:1px solid #6e4d56;border-radius:6px}.cacheActions,.settingsActions,.privacyActions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.cacheActions button,.settingsActions button,.privacyActions button{flex:1;min-width:82px}.danger{background:#71313a}.privacy{margin:0 8px 8px;padding:8px;border:1px solid #d19a44;border-radius:6px;background:#38291f;color:#f8e5bf;font-size:12px}.compat{margin:0 8px 7px;padding:6px;border-radius:5px;background:#71431f;color:#ffe6be;font-size:11px}.site{padding:7px 9px;border-top:1px solid #6e4d56;text-align:center;color:#bdaeb6;font-size:11px}.site a{color:#f4d18f;font-weight:700;text-decoration:none}.site a:hover{text-decoration:underline}.hidden{display:none!important}
    </style>
    <div class="panel">
      <div class="bar">CoC2 Translator ${VERSION}</div>
      <div class="row"><button class="primary translate">Перевести</button><button class="secondary mode">Оригинал</button><button class="gear" title="Настройки">...</button></div>
      <div class="status">Готов</div>
      <button class="secondary retry" hidden>Повторить ошибки</button>
      <div class="hotkey">Ctrl+Shift+T — перевод / отмена</div>
      <div class="compat" hidden></div>
      <div class="privacy" hidden>
        Видимый игровой текст отправляется выбранному сервису перевода. Слоты сохранения и поля ввода исключены.
        <div class="privacyActions"><button class="primary allowAuto">Разрешить автоперевод</button><button class="secondary manualOnly">Только вручную</button></div>
      </div>
      <div class="settings">
        <label class="title">Язык</label><select class="language"></select>
        <label class="title">Переводчик</label><select class="provider"><option value="google">Google Translate</option><option value="mymemory">MyMemory</option></select>
        <div class="providerHint"></div>
        <label class="check"><input type="checkbox" class="auto"> Автоматически переводить новые экраны</label>
        <div class="cacheBox">
          <div class="cacheStats">Подсчёт кэша…</div>
          <div class="cacheActions"><button class="small clearLanguage">Очистить язык</button><button class="small export">Экспорт</button><button class="small import">Импорт</button></div>
          <input class="importFile" type="file" accept="application/json" hidden>
        </div>
        <div class="settingsActions"><button class="primary save">Сохранить</button><button class="danger reset">Удалить все данные</button></div>
        <div class="hint">Комбинация Ctrl+Shift+T фиксирована. Имена внутри цельной сюжетной строки могут попасть в запрос.</div>
      </div>
      <div class="site">Сайт проекта: <a href="${SITE_URL}" target="_blank" rel="noopener noreferrer">${SITE_NAME}</a></div>
    </div>`;
  document.documentElement.appendChild(host);

  const mainButton = shadow.querySelector(".translate");
  const modeButton = shadow.querySelector(".mode");
  const retryButton = shadow.querySelector(".retry");
  const statusElement = shadow.querySelector(".status");
  const settingsPanel = shadow.querySelector(".settings");
  const languageSelect = shadow.querySelector(".language");
  const providerSelect = shadow.querySelector(".provider");
  const providerHint = shadow.querySelector(".providerHint");
  const autoCheckbox = shadow.querySelector(".auto");
  const cacheStatsElement = shadow.querySelector(".cacheStats");
  const importFile = shadow.querySelector(".importFile");
  const privacyBox = shadow.querySelector(".privacy");
  const compatibilityBox = shadow.querySelector(".compat");

  for (const [code, name] of LANGUAGES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code === "ru" ? "Русский" : name;
    languageSelect.appendChild(option);
  }
  languageSelect.value = settings.language;
  providerSelect.value = settings.provider;
  autoCheckbox.checked = settings.autoTranslate;
  privacyBox.hidden = settings.privacyAccepted;

  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    host.style.left = Math.max(0, Math.min(innerWidth - 306, settings.x)) + "px";
    host.style.top = Math.max(0, Math.min(innerHeight - 44, settings.y)) + "px";
    host.style.right = "auto";
  }

  function setStatus(text) { statusElement.textContent = text; }
  function setMainButton(text) { mainButton.textContent = text; }
  function updateModeButton() { modeButton.textContent = settings.mode === "translated" ? "Оригинал" : "Перевод"; }
  function updateProviderHint() {
    providerHint.textContent = providerSelect.value === "mymemory"
      ? "MyMemory: альтернативный сервис, короткие фрагменты до 500 байт."
      : "Google: основной быстрый переводчик без API-ключа.";
  }

  updateModeButton();
  updateProviderHint();

  mainButton.addEventListener("click", () => translateScreen(true));
  modeButton.addEventListener("click", toggleMode);
  retryButton.addEventListener("click", retryFailed);
  shadow.querySelector(".gear").addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
    refreshCacheStats();
  });
  providerSelect.addEventListener("change", updateProviderHint);
  shadow.querySelector(".save").addEventListener("click", () => {
    const languageChanged = settings.language !== languageSelect.value;
    const providerChanged = settings.provider !== providerSelect.value;
    settings.language = languageSelect.value;
    settings.provider = providerSelect.value;
    settings.autoTranslate = autoCheckbox.checked;
    settings.privacyAccepted = true;
    privacyBox.hidden = true;
    if (languageChanged || providerChanged) invalidateAppliedTranslations();
    saveSettings();
    settingsPanel.classList.remove("open");
    setStatus("Настройки сохранены");
    refreshCacheStats();
    if (settings.autoTranslate) scheduleAutoTranslation(50);
  });
  shadow.querySelector(".allowAuto").addEventListener("click", () => {
    settings.privacyAccepted = true;
    settings.autoTranslate = true;
    autoCheckbox.checked = true;
    privacyBox.hidden = true;
    saveSettings();
    scheduleAutoTranslation(50);
  });
  shadow.querySelector(".manualOnly").addEventListener("click", () => {
    settings.privacyAccepted = true;
    settings.autoTranslate = false;
    autoCheckbox.checked = false;
    privacyBox.hidden = true;
    saveSettings();
    setStatus("Ручной перевод включён");
  });
  shadow.querySelector(".clearLanguage").addEventListener("click", async () => {
    const name = languageSelect.options[languageSelect.selectedIndex].textContent;
    if (!confirm(`Удалить кэш языка «${name}»?`)) return;
    invalidateAppliedTranslations();
    await clearCacheForLanguage(languageSelect.value);
    await refreshCacheStats();
    setStatus("Кэш языка удалён");
  });
  shadow.querySelector(".export").addEventListener("click", exportCache);
  shadow.querySelector(".import").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    await importCache(importFile.files && importFile.files[0]);
    importFile.value = "";
  });
  shadow.querySelector(".reset").addEventListener("click", async () => {
    if (!confirm("Удалить настройки и весь кэш CoC2 Translator?")) return;
    await deleteAllTranslatorData();
  });

  let drag = null;
  const bar = shadow.querySelector(".bar");
  bar.addEventListener("pointerdown", (event) => {
    const rect = host.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    bar.setPointerCapture(event.pointerId);
  });
  bar.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const x = Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.dx));
    const y = Math.max(0, Math.min(innerHeight - 36, event.clientY - drag.dy));
    host.style.left = x + "px";
    host.style.top = y + "px";
    host.style.right = "auto";
  });
  bar.addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null;
    const rect = host.getBoundingClientRect();
    settings.x = Math.round(rect.left);
    settings.y = Math.round(rect.top);
    saveSettings();
  });

  addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === "KeyT") {
      event.preventDefault();
      event.stopPropagation();
      translateScreen(true);
    }
  }, true);

  const observer = new MutationObserver(() => {
    if (!selfMutation) scheduleAutoTranslation(350);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true
  });
  document.addEventListener("pointerover", () => scheduleAutoTranslation(180), true);

  let startupChecks = 0;
  const startupGuard = setInterval(() => {
    startupChecks += 1;
    if (!settings.autoTranslate || !settings.privacyAccepted || startupChecks > 180) {
      clearInterval(startupGuard);
      return;
    }
    const loading = document.getElementById("loading");
    if (loading && isElementOnScreen(loading)) return;
    if (collectVisibleTextNodes().length) {
      clearInterval(startupGuard);
      translateScreen(false);
    }
  }, 1000);

  setTimeout(() => {
    const gameVersion = String(window.version || "");
    if (gameVersion && gameVersion !== SUPPORTED_GAME_VERSION) {
      compatibilityBox.hidden = false;
      compatibilityBox.textContent = `Версия CoC2 ${gameVersion} не проверена с модом ${VERSION}. Перевод продолжит работу, но возможны ошибки.`;
    }
    scheduleAutoTranslation(50);
  }, 500);

  window.__coc2Translator = {
    version: VERSION,
    translateScreen: () => translateScreen(true),
    collectVisibleTextNodes,
    showOriginal,
    showTranslations,
    cacheStats,
    settings: () => Object.assign({}, settings)
  };
  console.info(`[CoC2 Translator ${VERSION}] loaded`);
})();
