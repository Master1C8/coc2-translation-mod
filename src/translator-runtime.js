(function () {
  "use strict";
  if (window.__vnRevivalTranslator && window.__vnRevivalTranslator.version) return;

  const core = window.VNRevivalTranslationCore;
  const game = window.VNRevivalGameConfig;
  const adapter = window.VNRevivalGameAdapter;
  const providerRegistry = window.VNRevivalTranslationProviders;
  if (!core) throw new Error("VN Revival translation core is missing");
  if (!game || !game.id || !game.translatorName || !game.storageNamespace || game.sourceLanguage !== "en") {
    throw new Error("VN Revival game config is missing or incompatible");
  }
  if (!adapter || adapter.contractVersion !== 2) {
    throw new Error("VN Revival DOM adapter is missing or incompatible");
  }
  if (!providerRegistry || providerRegistry.contractVersion !== 1 || !Array.isArray(providerRegistry.list)) {
    throw new Error("VN Revival provider registry is missing or incompatible");
  }

  const VERSION = "__VERSION__";
  const SUPPORTED_GAME_VERSIONS = Array.isArray(game.supportedVersions) ? game.supportedVersions : [];
  const PRODUCT_NAME = game.translatorName;
  const GAME_TITLE = game.title || game.id;
  const GAME_SHORT_TITLE = game.shortTitle || GAME_TITLE;
  const SOURCE_LANGUAGE = game.sourceLanguage || "en";
  const SITE_NAME = "VN Revival";
  const SITE_URL = "https://vnrevival.fun/";
  const SETTINGS_KEY = `${game.storageNamespace}.settings.v2`;
  const LEGACY_SETTINGS_KEY = `${game.storageNamespace}.settings.v1`;
  const CACHE_META_KEY = `${game.storageNamespace}.cache-meta.v1`;
  const CACHE_DIRTY_KEY = `${game.storageNamespace}.cache-meta-dirty.v1`;
  const DB_NAME = game.cacheDatabase || `${game.storageNamespace}-cache`;
  const STORE_NAME = "translations";
  const CACHE_FORMAT = "vnrevival-translator-cache";
  const legacyCompatibility = game.legacyCompatibility || {};
  const LEGACY_CACHE_FORMATS = Array.isArray(legacyCompatibility.cacheFormats)
    ? legacyCompatibility.cacheFormats.filter((value) => typeof value === "string" && value)
    : [];
  const MEMORY_CACHE_LIMIT = 20000;
  const CACHE_IO_BATCH_SIZE = 250;
  const CACHE_IMPORT_ENTRY_LIMIT = 500000;
  const LANGUAGES = window.VNRevivalTranslatorLanguages;
  const PROVIDER_LIST = providerRegistry.list;
  const PROVIDERS = providerRegistry.byId;
  const injectedLocalBridge = window.__vnRevivalLocalBridge || window.__vnRevivalArgosBridge
    || (legacyCompatibility.argosBridgeGlobal ? window[legacyCompatibility.argosBridgeGlobal] : null);
  const LOCAL_BRIDGE = injectedLocalBridge
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(String(injectedLocalBridge.baseURL || ""))
    && /^[A-Za-z0-9-]{16,}$/.test(String(injectedLocalBridge.token || ""))
    ? Object.freeze({ baseURL: injectedLocalBridge.baseURL, token: injectedLocalBridge.token })
    : null;
  const defaults = {
    language: "ru",
    provider: "google",
    autoTranslate: true,
    privacyAccepted: false,
    mode: "translated",
    collapsed: false,
    x: null,
    y: null
  };

  if (!Array.isArray(LANGUAGES) || LANGUAGES.length < 200) throw new Error("VN Revival language catalog is missing");
  if (!PROVIDERS.google || !PROVIDER_LIST.every((provider) => provider && provider.id && provider.label
    && typeof provider.supportsLanguage === "function" && typeof provider.splitText === "function"
    && typeof provider.translateChunk === "function")) throw new Error("VN Revival provider contract is invalid");

  let settings = loadSettings();
  let running = false;
  let abortController = null;
  let selfMutation = false;
  let scanTimer = 0;
  let pendingAutoRun = false;
  let translationVisibilityObserver = null;
  let lastFailedJobs = [];
  let dbPromise = null;
  let cacheMetadata = loadCacheMetadata();
  let cacheMetadataPromise = null;
  let cacheMetadataVerified = false;
  let cacheMetadataSaveTimer = 0;
  let argosStatus = null;
  let argosBusy = false;
  let argosSupportedLanguages = null;
  let geminiStatus = null;
  let geminiBusy = false;
  const applied = new WeakMap();
  const appliedNodes = new Set();
  const originalPresentation = new WeakMap();
  const formattedElements = new Set();
  const memoryCache = new Map();
  const observedTranslationContainers = new WeakSet();
  const visibleTranslationContainers = new Set();
  const pendingTranslationRoots = new Set();

  function emptyCacheMetadata() {
    return { version: 1, records: 0, bytes: 0, languages: {} };
  }

  function isValidCacheMetric(value) {
    return value && Number.isFinite(value.records) && value.records >= 0
      && Number.isFinite(value.bytes) && value.bytes >= 0;
  }

  function loadCacheMetadata() {
    try {
      if (localStorage.getItem(CACHE_DIRTY_KEY) === "1") return null;
      const value = JSON.parse(localStorage.getItem(CACHE_META_KEY) || "null");
      if (!value || value.version !== 1 || !isValidCacheMetric(value) || !value.languages || typeof value.languages !== "object") return null;
      if (!Object.values(value.languages).every(isValidCacheMetric)) return null;
      return value;
    } catch (_) { return null; }
  }

  function markCacheMetadataDirty() {
    try { localStorage.setItem(CACHE_DIRTY_KEY, "1"); } catch (_) {}
  }

  function saveCacheMetadata(metadata) {
    try {
      localStorage.setItem(CACHE_META_KEY, JSON.stringify(metadata));
      localStorage.removeItem(CACHE_DIRTY_KEY);
    } catch (_) {}
  }

  function scheduleCacheMetadataSave() {
    clearTimeout(cacheMetadataSaveTimer);
    cacheMetadataSaveTimer = setTimeout(() => saveCacheMetadata(cacheMetadata), 500);
  }

  function cacheEntryBytes(key, value) {
    return core.utf8Length(String(key || "")) + core.utf8Length(String(value || ""));
  }

  function adjustCacheMetadata(metadata, key, value, direction) {
    if (!metadata || typeof value !== "string") return;
    const amount = direction < 0 ? -1 : 1;
    const bytes = cacheEntryBytes(key, value) * amount;
    metadata.records = Math.max(0, metadata.records + amount);
    metadata.bytes = Math.max(0, metadata.bytes + bytes);
    const language = core.cacheKeyLanguage(key);
    if (!language) return;
    const current = metadata.languages[language] || { records: 0, bytes: 0 };
    current.records = Math.max(0, current.records + amount);
    current.bytes = Math.max(0, current.bytes + bytes);
    if (current.records === 0) delete metadata.languages[language];
    else metadata.languages[language] = current;
  }

  function memoryCacheSet(key, value) {
    if (memoryCache.has(key)) memoryCache.delete(key);
    memoryCache.set(key, value);
    while (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value);
  }

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
      collapsed: typeof source.collapsed === "boolean" ? source.collapsed : defaults.collapsed,
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
    if (memoryCache.has(key)) {
      const value = memoryCache.get(key);
      memoryCacheSet(key, value);
      return value;
    }
    try {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => reject(request.error);
      });
      if (value) memoryCacheSet(key, value);
      return value;
    } catch (_) { return null; }
  }

  async function cachePut(key, value) {
    if (!key || !value) return false;
    memoryCacheSet(key, value);
    try {
      const metadata = await getCacheMetadata();
      const db = await openDb();
      markCacheMetadataDirty();
      const previous = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const oldValue = typeof getRequest.result === "string" ? getRequest.result : null;
          const putRequest = store.put(value, key);
          putRequest.onsuccess = () => resolve(oldValue);
          putRequest.onerror = () => reject(putRequest.error);
        };
      });
      if (previous !== null) adjustCacheMetadata(metadata, key, previous, -1);
      adjustCacheMetadata(metadata, key, value, 1);
      scheduleCacheMetadataSave();
      return true;
    } catch (_) { return false; }
  }

  async function cacheDelete(key) {
    if (!key) return;
    memoryCache.delete(key);
    try {
      const metadata = await getCacheMetadata();
      const db = await openDb();
      markCacheMetadataDirty();
      const previous = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const oldValue = typeof getRequest.result === "string" ? getRequest.result : null;
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => resolve(oldValue);
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
      });
      if (previous !== null) adjustCacheMetadata(metadata, key, previous, -1);
      scheduleCacheMetadataSave();
    } catch (_) {}
  }

  async function rebuildCacheMetadata() {
    const metadata = emptyCacheMetadata();
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (typeof cursor.key === "string" && typeof cursor.value === "string") {
          adjustCacheMetadata(metadata, cursor.key, cursor.value, 1);
        }
        cursor.continue();
      };
    });
    cacheMetadata = metadata;
    cacheMetadataVerified = true;
    saveCacheMetadata(metadata);
    return metadata;
  }

  async function verifyCacheMetadata(metadata) {
    try {
      const db = await openDb();
      const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      if (typeof store.count !== "function") {
        cacheMetadataVerified = true;
        return metadata;
      }
      const records = await new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => reject(request.error);
      });
      if (records !== metadata.records) return rebuildCacheMetadata();
      cacheMetadataVerified = true;
      return metadata;
    } catch (_) {
      cacheMetadataVerified = true;
      return metadata;
    }
  }

  async function getCacheMetadata() {
    if (cacheMetadata && cacheMetadataVerified) return cacheMetadata;
    if (!cacheMetadataPromise) {
      cacheMetadataPromise = (cacheMetadata ? verifyCacheMetadata(cacheMetadata) : rebuildCacheMetadata())
        .finally(() => { cacheMetadataPromise = null; });
    }
    return cacheMetadataPromise;
  }

  async function readCacheBatch(afterKey, limit) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const range = afterKey == null ? undefined : IDBKeyRange.lowerBound(afterKey, true);
      const keysRequest = store.getAllKeys(range, limit);
      const valuesRequest = store.getAll(range, limit);
      let keys = null;
      let values = null;
      const finish = () => {
        if (!keys || !values) return;
        resolve(keys.map((key, index) => [key, values[index]])
          .filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string"));
      };
      keysRequest.onsuccess = () => { keys = keysRequest.result || []; finish(); };
      valuesRequest.onsuccess = () => { values = valuesRequest.result || []; finish(); };
      keysRequest.onerror = () => reject(keysRequest.error);
      valuesRequest.onerror = () => reject(valuesRequest.error);
    });
  }

  function createCacheExportStream(exportedAt, onProgress) {
    const encoder = new TextEncoder();
    let started = false;
    let afterKey = null;
    let exported = 0;
    return new ReadableStream({
      async pull(controller) {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(JSON.stringify({ format: CACHE_FORMAT, version: 2, gameId: game.id, exportedAt }) + "\n"));
          return;
        }
        const entries = await readCacheBatch(afterKey, CACHE_IO_BATCH_SIZE);
        if (!entries.length) {
          controller.close();
          return;
        }
        afterKey = entries[entries.length - 1][0];
        exported += entries.length;
        controller.enqueue(encoder.encode(entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"));
        if (onProgress) onProgress(exported);
      }
    });
  }

  async function cacheStats() {
    try {
      const metadata = await getCacheMetadata();
      const language = metadata.languages[settings.language] || { records: 0, bytes: 0 };
      return { records: metadata.records, bytes: metadata.bytes, languageRecords: language.records, languageBytes: language.bytes };
    } catch (_) { return { records: 0, bytes: 0, languageRecords: 0, languageBytes: 0 }; }
  }

  async function clearCacheForLanguage(language) {
    const metadata = await getCacheMetadata();
    const db = await openDb();
    markCacheMetadataDirty();
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
    const removed = metadata.languages[language];
    if (removed) {
      metadata.records = Math.max(0, metadata.records - removed.records);
      metadata.bytes = Math.max(0, metadata.bytes - removed.bytes);
      delete metadata.languages[language];
    }
    saveCacheMetadata(metadata);
  }

  async function clearAllCache() {
    try {
      const db = await openDb();
      markCacheMetadataDirty();
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      memoryCache.clear();
      cacheMetadata = emptyCacheMetadata();
      cacheMetadataVerified = true;
      saveCacheMetadata(cacheMetadata);
    } catch (_) {
      memoryCache.clear();
      cacheMetadata = null;
      cacheMetadataVerified = false;
    }
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

  async function requestLocalHelper(path, options) {
    if (!LOCAL_BRIDGE) throw new Error("The local translation helper is unavailable");
    const requestOptions = options || {};
    const headers = { "X-VNRevival-Token": LOCAL_BRIDGE.token };
    const init = { method: requestOptions.body ? "POST" : "GET", headers, cache: "no-store", signal: requestOptions.signal };
    if (requestOptions.body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(requestOptions.body);
    }
    const response = await fetch(LOCAL_BRIDGE.baseURL + path, init);
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || !payload || payload.ok === false) {
      const error = new Error(payload && payload.message ? payload.message : "Local translation helper error");
      error.code = payload && payload.error ? payload.error : "local_helper_error";
      throw error;
    }
    return payload;
  }

  async function requestChunk(provider, text, language, signal) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    let lastError = null;
    const retries = Math.max(1, Number(selectedProvider.retries) || 1);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await selectedProvider.translateChunk({
          text, language, sourceLanguage: SOURCE_LANGUAGE, signal,
          languageName: (LANGUAGES.find(([code]) => code === language) || [null, language])[1],
          fetch: (input, init) => fetch(input, init),
          localRequest: requestLocalHelper,
          decodeHtmlEntities
        });
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
        if (attempt + 1 < retries) await sleep(350 * Math.pow(2, attempt), signal);
      }
    }
    throw lastError || new Error("Translation failed");
  }

  async function translateText(source, language, provider, signal) {
    const key = core.makeCacheKey(source, language, provider, game.id);
    let cached = await cacheGet(key);
    if (!cached) {
      const legacyKey = core.makeCacheKey(source, language, provider);
      cached = await cacheGet(legacyKey);
      if (cached) {
        if (await cachePut(key, cached)) await cacheDelete(legacyKey);
      }
    }
    if (cached) return { text: cached, cached: true };
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    const chunks = selectedProvider.splitText(source);
    const parts = [];
    for (const chunk of chunks) {
      parts.push(await requestChunk(provider, chunk, language, signal));
      await sleep(PROVIDERS[provider].delay, signal);
    }
    const translated = parts.join(" ").replace(/ +\n/g, "\n").trim();
    if (translated) await cachePut(key, translated);
    return { text: translated, cached: false };
  }

  function hasSourceText(value) {
    if (typeof adapter.hasSourceText === "function") return !!adapter.hasSourceText(value, core);
    return core.hasEnglishText(value);
  }

  function isPrivateOrTechnical(element) {
    if (!element) return true;
    if (typeof adapter.isPrivateElement === "function" && adapter.isPrivateElement(element)) return true;
    const selectors = [
      "script", "style", "noscript", "input", "textarea", "[contenteditable='true']",
      "#loading", "#progressText", "progress", "[data-vnrevival-private]"
    ].concat(Array.isArray(adapter.privateSelectors) ? adapter.privateSelectors : []);
    return !!element.closest(selectors.join(","));
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
    if (typeof adapter.classifyNode === "function") {
      const category = adapter.classifyNode(node);
      if (category) return category;
    }
    const element = node.parentElement;
    const selectors = adapter.categorySelectors || {};
    if (selectors.story && element.closest(selectors.story)) return "story";
    if (selectors.control && element.closest(selectors.control)) return "control";
    if (selectors.tooltip && element.closest(selectors.tooltip)) return "tooltip";
    return "ui";
  }

  function normalizedScanRoots(roots) {
    if (!Array.isArray(roots)) return [document.body];
    const connected = Array.from(new Set(roots)).filter((root) => root instanceof Element && root.isConnected);
    return connected.filter((root, index) => !connected.some((other, otherIndex) => otherIndex !== index && other.contains(root)));
  }

  function textNodesWithinRoots(roots) {
    const result = [];
    const seen = new Set();
    for (const root of normalizedScanRoots(roots)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!seen.has(node)) {
          seen.add(node);
          result.push(node);
        }
      }
    }
    return result;
  }

  function collectVisibleTextNodes(options) {
    const includeCompleted = !!(options && options.includeCompleted);
    const result = [];
    const roots = options && Array.isArray(options.roots) ? options.roots : null;
    for (const node of textNodesWithinRoots(roots)) {
      if (!node.parentElement || !isVisible(node.parentElement)) continue;
      const source = sourceForNode(node);
      if (!hasSourceText(source)) continue;
      const record = applied.get(node);
      if (!includeCompleted && record && record.language === settings.language && record.provider === settings.provider && record.translation) {
        continue;
      }
      result.push(node);
    }
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

  function presentationContainerForNode(node) {
    let element = node && node.parentElement;
    const fallback = element;
    while (element && element !== document.body && element !== document.documentElement) {
      if (element.matches("button,a,[role='button'],[role='link'],li,p")) return element;
      const display = getComputedStyle(element).display;
      if (display !== "inline" && display !== "contents") return element;
      element = element.parentElement;
    }
    return fallback;
  }

  function queueTranslationContainer(element) {
    if (!(element instanceof Element) || !element.isConnected || element === document.body || element === document.documentElement) return;
    pendingTranslationRoots.add(element);
  }

  function registerTranslationContainers(root) {
    const roots = root instanceof Element ? [root] : (root && root.parentElement ? [root.parentElement] : []);
    for (const node of textNodesWithinRoots(roots)) {
      if (!node.parentElement || isPrivateOrTechnical(node.parentElement)) continue;
      if (!hasSourceText(sourceForNode(node))) continue;
      const container = presentationContainerForNode(node) || node.parentElement;
      if (!container || container === document.body || container === document.documentElement) continue;
      if (!observedTranslationContainers.has(container)) {
        observedTranslationContainers.add(container);
        if (translationVisibilityObserver) translationVisibilityObserver.observe(container);
      }
      if (!translationVisibilityObserver && isElementOnScreen(container)) queueTranslationContainer(container);
    }
  }

  function takeAutoTranslationRoots() {
    for (const element of visibleTranslationContainers) {
      if (element.isConnected) pendingTranslationRoots.add(element);
      else visibleTranslationContainers.delete(element);
    }
    const roots = normalizedScanRoots(Array.from(pendingTranslationRoots));
    pendingTranslationRoots.clear();
    return roots;
  }

  const TRANSLATION_STYLE_PROPERTIES = [
    "direction", "unicode-bidi", "text-align", "overflow-wrap", "word-break",
    "line-break", "line-height", "white-space", "height", "min-height", "font-family"
  ];

  function capturePresentation(element) {
    if (originalPresentation.has(element)) return originalPresentation.get(element);
    const attributes = {};
    for (const name of ["dir", "lang", "data-vnrevival-translated", "data-vnrevival-game", "data-vnrevival-language"]) {
      attributes[name] = { present: element.hasAttribute(name), value: element.getAttribute(name) };
    }
    const styles = {};
    for (const property of TRANSLATION_STYLE_PROPERTIES) {
      styles[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      };
    }
    const state = {
      attributes,
      styles,
      minimumHeight: Math.ceil(element.getBoundingClientRect().height || 0),
      computedFontFamily: getComputedStyle(element).fontFamily
    };
    originalPresentation.set(element, state);
    return state;
  }

  function restoreStyleProperty(element, property, value, priority) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }

  function restoreLanguageFormatting() {
    for (const element of formattedElements) {
      const original = originalPresentation.get(element);
      if (!original) continue;
      for (const [name, attribute] of Object.entries(original.attributes)) {
        if (attribute.present) element.setAttribute(name, attribute.value);
        else element.removeAttribute(name);
      }
      for (const [property, style] of Object.entries(original.styles)) {
        restoreStyleProperty(element, property, style.value, style.priority);
      }
      originalPresentation.delete(element);
    }
    formattedElements.clear();
  }

  function applyLanguageFormatting(node, language) {
    const element = presentationContainerForNode(node);
    if (!element) return;
    const original = capturePresentation(element);
    formattedElements.add(element);
    element.setAttribute("lang", core.htmlLanguageCode(language));
    element.setAttribute("data-vnrevival-translated", "true");
    element.setAttribute("data-vnrevival-game", game.id);
    element.setAttribute("data-vnrevival-language", language);
    const fallbackFonts = core.fontFallbacks(language).map((font) => font === "sans-serif" ? font : JSON.stringify(font));
    const fontStack = [original.computedFontFamily].concat(fallbackFonts).filter(Boolean).join(", ");
    element.style.setProperty("font-family", fontStack, "important");
    element.style.setProperty("overflow-wrap", "anywhere", "important");
    element.style.setProperty("word-break", "normal", "important");
    if (core.isCjkLanguage(language)) element.style.setProperty("line-break", "auto", "important");
    if (core.isTallScriptLanguage(language)) element.style.setProperty("line-height", "1.35", "important");
    if (classifyNode(node) === "control") {
      element.style.setProperty("white-space", "normal", "important");
      element.style.setProperty("height", "auto", "important");
      if (original.minimumHeight) element.style.setProperty("min-height", `${original.minimumHeight}px`, "important");
    }
    if (core.isRtlLanguage(language)) {
      element.setAttribute("dir", "rtl");
      element.style.setProperty("direction", "rtl", "important");
      element.style.setProperty("unicode-bidi", "plaintext", "important");
      element.style.setProperty("text-align", "start", "important");
    }
  }

  function refreshLanguageFormatting() {
    restoreLanguageFormatting();
    if (settings.mode !== "translated") return;
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record && node.isConnected) applyLanguageFormatting(node, record.language);
    }
  }

  function rememberTranslation(node, source, translation, language, provider) {
    if (!node || !node.isConnected || !translation) return;
    applied.set(node, { source, translation, language, provider });
    appliedNodes.add(node);
    if (settings.mode === "translated") {
      writeNode(node, translation);
      applyLanguageFormatting(node, language);
    }
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
    restoreLanguageFormatting();
    saveSettings();
    updateModeButton();
    setStatus("Showing original");
  }

  function showTranslations() {
    settings.mode = "translated";
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      const record = applied.get(node);
      if (record) writeNode(node, record.translation);
    }
    refreshLanguageFormatting();
    saveSettings();
    updateModeButton();
    setStatus("Showing translation");
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
    restoreLanguageFormatting();
  }

  function contextContainerForNode(node) {
    if (typeof adapter.findContextContainer === "function") {
      const container = adapter.findContextContainer(node);
      if (container) return container;
    }
    const element = node && node.parentElement;
    if (!element) return null;
    const selectors = Array.isArray(adapter.contextSelectors) ? adapter.contextSelectors : [];
    return (selectors.length ? element.closest(selectors.join(",")) : null) || element;
  }

  function buildJobs(nodes) {
    const blocks = new Map();
    for (const node of nodes) {
      const source = sourceForNode(node);
      if (!hasSourceText(source)) continue;
      const container = contextContainerForNode(node) || node.parentElement;
      if (!blocks.has(container)) blocks.set(container, []);
      blocks.get(container).push({ node, source, kind: classifyNode(node) });
    }
    const jobs = [];
    const simple = new Map();
    const contextLimit = Number(PROVIDERS[settings.provider] && PROVIDERS[settings.provider].contextLimit) || 3200;
    for (const entries of blocks.values()) {
      let offset = 0;
      while (offset < entries.length) {
        let size = Math.min(12, entries.length - offset);
        let slice = entries.slice(offset, offset + size);
        let contextSource = core.buildContextSource(slice.map((entry) => entry.source));
        while (size > 1 && (contextSource.length > contextLimit || core.utf8Length(contextSource) > contextLimit)) {
          size -= 1;
          slice = entries.slice(offset, offset + size);
          contextSource = core.buildContextSource(slice.map((entry) => entry.source));
        }
        if (size > 1) {
          jobs.push({
            source: contextSource,
            nodes: slice.map((entry) => entry.node),
            parts: slice,
            kind: slice[0].kind,
            contextual: true
          });
          offset += size;
          continue;
        }
        const entry = entries[offset];
        if (!simple.has(entry.source)) simple.set(entry.source, { source: entry.source, nodes: [], kind: entry.kind, contextual: false });
        simple.get(entry.source).nodes.push(entry.node);
        offset += 1;
      }
    }
    jobs.push(...simple.values());
    const priority = { story: 0, control: 1, tooltip: 2, ui: 3 };
    return jobs.sort((a, b) => priority[a.kind] - priority[b.kind]);
  }

  async function applyJobTranslation(job, language, provider, signal) {
    const result = await translateText(job.source, language, provider, signal);
    if (!job.contextual) {
      for (const node of job.nodes) {
        if (node.isConnected && sourceForNode(node) === job.source) rememberTranslation(node, job.source, result.text, language, provider);
      }
      return result.cached;
    }
    const contextualParts = core.parseContextTranslation(result.text, job.parts.length);
    if (contextualParts) {
      for (let index = 0; index < job.parts.length; index += 1) {
        const part = job.parts[index];
        if (part.node.isConnected && sourceForNode(part.node) === part.source) {
          rememberTranslation(part.node, part.source, contextualParts[index], language, provider);
        }
      }
      return result.cached;
    }
    let allCached = true;
    for (const part of job.parts) {
      const fallback = await translateText(part.source, language, provider, signal);
      allCached = allCached && fallback.cached;
      if (part.node.isConnected && sourceForNode(part.node) === part.source) {
        rememberTranslation(part.node, part.source, fallback.text, language, provider);
      }
    }
    return allCached;
  }

  async function runJobs(jobs, options) {
    const manual = !!(options && options.manual);
    if (providerUsesArgos(settings.provider)) {
      const status = await refreshArgosStatus();
      if (!status || !status.offlineReady) {
        settingsPanel.classList.add("open");
        setStatus(status && status.runtimeInstalled && status.sentenceModelInstalled ? "Download the Argos model first" : "Install Argos first");
        return;
      }
    } else if (providerUsesGemini(settings.provider)) {
      const status = await refreshGeminiStatus();
      if (!status || !status.configured) {
        settingsPanel.classList.add("open");
        setStatus("Add a Gemini API key first");
        return;
      }
    } else if (providerRequiresPrivacy(settings.provider) && !settings.privacyAccepted) {
      privacyBox.hidden = false;
      settingsPanel.classList.add("open");
      setStatus("Confirm online translation");
      return;
    }
    if (running) {
      if (manual && abortController) abortController.abort();
      else pendingAutoRun = true;
      return;
    }
    if (!jobs.length) {
      setStatus("Screen already translated");
      return;
    }

    running = true;
    abortController = new AbortController();
    setMainButton("Cancel");
    retryButton.hidden = true;
    lastFailedJobs = [];
    const language = settings.language;
    const provider = settings.provider;
    let nextIndex = 0;
    let done = 0;
    let cacheHits = 0;
    let lastErrorCode = "";

    async function worker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        const job = jobs[index];
        try {
          if (await applyJobTranslation(job, language, provider, abortController.signal)) cacheHits += 1;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          lastErrorCode = error && error.code ? error.code : lastErrorCode;
          lastFailedJobs.push(job);
        }
        done += 1;
        setStatus(`Translating ${done}/${jobs.length}`);
      }
    }

    try {
      const count = Math.min(PROVIDERS[provider].concurrency, jobs.length);
      await Promise.all(Array.from({ length: count }, () => worker()));
      if (lastFailedJobs.length) {
        if (lastErrorCode === "gemini_quota_exceeded") setStatus("Gemini quota reached · retry later");
        else if (lastErrorCode === "gemini_key_invalid") setStatus("Gemini API key was rejected");
        else if (lastErrorCode === "gemini_safety_block") setStatus(`Gemini blocked ${lastFailedJobs.length} text blocks`);
        else setStatus(`Done: ${jobs.length - lastFailedJobs.length}, errors: ${lastFailedJobs.length}`);
        retryButton.hidden = false;
      } else {
        setStatus(`Done: ${jobs.length}` + (cacheHits ? `, from cache: ${cacheHits}` : ""));
      }
    } catch (error) {
      setStatus(error && error.name === "AbortError" ? "Cancelled" : (providerUsesArgos(provider) ? "Argos error" : "Network error"));
    } finally {
      running = false;
      abortController = null;
      setMainButton("Translate");
      refreshCacheStats();
      if (pendingAutoRun) {
        pendingAutoRun = false;
        scheduleAutoTranslation(250);
      }
    }
  }

  function translateScreen(manual) {
    const isManual = manual !== false;
    if (running) {
      if (isManual && abortController) abortController.abort();
      else pendingAutoRun = true;
      return;
    }
    const roots = isManual ? null : takeAutoTranslationRoots();
    if (!isManual && !roots.length) return Promise.resolve();
    const jobs = buildJobs(collectVisibleTextNodes(roots ? { roots } : null));
    if (!isManual && !jobs.length) return Promise.resolve();
    return runJobs(jobs, { manual: isManual });
  }

  function retryFailed() {
    const jobs = lastFailedJobs.filter((job) => job.nodes.some((node) => node.isConnected));
    lastFailedJobs = [];
    return runJobs(jobs.length ? jobs : buildJobs(collectVisibleTextNodes()), { manual: true });
  }

  function reapplyKnownTranslations(roots) {
    for (const node of textNodesWithinRoots(roots)) {
      const record = applied.get(node);
      if (!record) continue;
      const current = core.normalizeText(node.nodeValue);
      if (current !== core.normalizeText(record.source) && current !== core.normalizeText(record.translation)) {
        applied.delete(node);
        appliedNodes.delete(node);
        continue;
      }
      if (settings.mode === "translated" && current === core.normalizeText(record.source)) {
        writeNode(node, record.translation);
        applyLanguageFormatting(node, record.language);
      }
      if (settings.mode === "source" && current === core.normalizeText(record.translation)) writeNode(node, record.source);
    }
  }

  function scheduleAutoTranslation(delay) {
    if (document.hidden || scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      if (document.hidden) return;
      const loading = document.getElementById("loading");
      if (loading && isElementOnScreen(loading)) {
        scheduleAutoTranslation(1000);
        return;
      }
      const roots = takeAutoTranslationRoots();
      if (!roots.length) return;
      reapplyKnownTranslations(roots);
      for (const root of roots) pendingTranslationRoots.add(root);
      if (settings.autoTranslate && (settings.privacyAccepted || !providerRequiresPrivacy(settings.provider)) && settings.mode === "translated") translateScreen(false);
    }, Number(delay) || 350);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function refreshCacheStats() {
    const stats = await cacheStats();
    cacheStatsElement.textContent = `This language: ${stats.languageRecords} entries, ${formatBytes(stats.languageBytes)} · Total: ${stats.records}, ${formatBytes(stats.bytes)}`;
  }

  async function exportCache() {
    try {
      const exportedAt = new Date().toISOString();
      const filename = `${game.id}-translator-cache-${exportedAt.slice(0, 10)}.jsonl`;
      let exported = 0;
      const makeStream = () => createCacheExportStream(exportedAt, (count) => {
        exported = count;
        setStatus(`Exporting: ${count}`);
      });
      let savedDirectly = false;
      if (typeof showSaveFilePicker === "function") {
        try {
          const handle = await showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: `${PRODUCT_NAME} cache`, accept: { "application/x-ndjson": [".jsonl"] } }]
          });
          const writable = await handle.createWritable();
          await makeStream().pipeTo(writable);
          savedDirectly = true;
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
        }
      }
      if (!savedDirectly) {
        exported = 0;
        const blob = await new Response(makeStream(), { headers: { "Content-Type": "application/x-ndjson" } }).blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatus(`Exported: ${exported}`);
    } catch (error) {
      if (error && error.name === "AbortError") setStatus("Export cancelled");
      else setStatus("Could not export cache");
    }
  }

  function isValidCacheEntry(entry) {
    if (!(Array.isArray(entry)
      && typeof entry[0] === "string" && typeof entry[1] === "string"
      && core.cacheKeyLanguage(entry[0]) && core.cacheKeyProvider(entry[0])
      && entry[0].length < 120000 && entry[1].length < 120000)) return false;
    const entryGame = core.cacheKeyGame(entry[0]);
    return !entryGame || entryGame === game.id;
  }

  function isAcceptedCacheFormat(format) {
    return format === CACHE_FORMAT || LEGACY_CACHE_FORMATS.includes(format);
  }

  async function writeCacheEntries(entries) {
    if (!entries.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const [key, value] of entries) store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Cache transaction aborted"));
    });
  }

  async function importJsonLinesCache(file) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let header = null;
    let imported = 0;
    let batch = [];
    async function consumeLine(line) {
      if (!line.trim()) return;
      if (line.length > 250000) throw new Error("Cache entry is too large");
      const value = JSON.parse(line);
      if (!header) {
        if (!value || !isAcceptedCacheFormat(value.format) || value.version !== 2
          || (value.gameId && value.gameId !== game.id)) throw new Error("Invalid format");
        header = value;
        return;
      }
      if (!isValidCacheEntry(value)) throw new Error("Invalid cache entry");
      imported += 1;
      if (imported > CACHE_IMPORT_ENTRY_LIMIT) throw new Error("Too many cache entries");
      batch.push(value);
      if (batch.length >= CACHE_IO_BATCH_SIZE) {
        await writeCacheEntries(batch);
        batch = [];
        setStatus(`Importing: ${imported}`);
      }
    }
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) await consumeLine(line);
      if (chunk.done) break;
    }
    if (pending) await consumeLine(pending);
    if (!header) throw new Error("Invalid format");
    await writeCacheEntries(batch);
    return imported;
  }

  async function importLegacyCache(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error("Legacy cache file is too large");
    const payload = JSON.parse(await file.text());
    if (!payload || !isAcceptedCacheFormat(payload.format) || payload.version !== 1
      || (payload.gameId && payload.gameId !== game.id) || !Array.isArray(payload.entries)) {
      throw new Error("Invalid format");
    }
    const valid = payload.entries.filter(isValidCacheEntry).slice(0, 100000);
    await writeCacheEntries(valid);
    return valid.length;
  }

  async function cacheFileVersion(file) {
    const prefix = await file.slice(0, 512).text();
    const firstLine = prefix.split("\n", 1)[0];
    try {
      const value = JSON.parse(firstLine);
      return value && isAcceptedCacheFormat(value.format) ? Number(value.version) : 0;
    } catch (_) {}
    const formatMatch = prefix.match(/"format"\s*:\s*"([^"]+)"/);
    if (formatMatch && isAcceptedCacheFormat(formatMatch[1])
      && /"version"\s*:\s*1(?:\D|$)/.test(prefix)) return 1;
    return 0;
  }

  async function importCache(file) {
    try {
      if (!file) throw new Error("Missing file");
      const version = await cacheFileVersion(file);
      if (version !== 1 && version !== 2) throw new Error("Invalid format");
      markCacheMetadataDirty();
      const imported = version === 2 ? await importJsonLinesCache(file) : await importLegacyCache(file);
      memoryCache.clear();
      cacheMetadata = null;
      cacheMetadataVerified = false;
      await getCacheMetadata();
      await refreshCacheStats();
      setStatus(`Imported: ${imported}`);
      scheduleAutoTranslation(50);
    } catch (_) { setStatus("Invalid cache file"); }
  }

  async function deleteAllTranslatorData() {
    invalidateAppliedTranslations();
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
    await clearAllCache();
    localStorage.removeItem(CACHE_META_KEY);
    localStorage.removeItem(CACHE_DIRTY_KEY);
    settings = Object.assign({}, defaults);
    languageSelect.value = settings.language;
    providerSelect.value = settings.provider;
    autoCheckbox.checked = settings.autoTranslate;
    privacyBox.hidden = false;
    updateProviderHint();
    updateModeButton();
    await refreshCacheStats();
    setStatus("All translator data deleted");
  }

  const host = document.createElement("div");
  host.id = `vnrevival-translator-${game.id}`;
  host.style.cssText = "position:fixed;z-index:2147483647;top:14px;right:14px;pointer-events:auto";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial}*{box-sizing:border-box}.panel{width:306px;color:#fff;background:rgba(32,19,28,.97);border:1px solid #c69b55;border-radius:9px;box-shadow:0 5px 18px #0008;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow:hidden}.bar{cursor:move;padding:7px 9px;color:#f4d18f;background:#412436;font-weight:700;user-select:none}.row{display:flex;gap:6px;padding:7px}.primary,.secondary,.gear,.danger{border:1px solid #c69b55;border-radius:6px;background:#6b344f;color:#fff;padding:7px 9px;cursor:pointer;font:inherit}.primary{flex:1;font-weight:700}.secondary{background:#442b39}.gear{width:38px}.status{min-height:23px;padding:0 9px 3px;color:#ddd;font-size:12px}.hotkey{padding:0 9px 7px;color:#f4d18f;font-size:11px}.retry{margin:0 8px 7px;width:calc(100% - 16px)}.settings{display:none;padding:0 8px 9px;border-top:1px solid #6e4d56}.settings.open{display:block}.settings label.title{display:block;margin:7px 0 3px}.settings select,.settings input[type=password]{width:100%;border:1px solid #927047;border-radius:4px;background:#20131c;color:#fff;padding:6px}.check{display:flex;gap:7px;align-items:center;margin:8px 0}.hint,.providerHint,.cacheStats,.argosStatus,.geminiStatus,.geminiNotice{color:#bdaeb6;font-size:11px;line-height:1.3}.providerHint{margin-top:4px}.argosBox,.geminiBox,.cacheBox{margin-top:8px;padding:7px;border:1px solid #6e4d56;border-radius:6px}.geminiKey{margin-top:6px}.argosActions,.geminiActions,.privacyActions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.argosActions button,.geminiActions button,.privacyActions button{flex:1;min-width:82px}.primary:disabled,.secondary:disabled,.danger:disabled{opacity:.55;cursor:default}.danger{background:#71313a}.privacy{margin:0 8px 8px;padding:8px;border:1px solid #d19a44;border-radius:6px;background:#38291f;color:#f8e5bf;font-size:12px}.compat{margin:0 8px 7px;padding:6px;border-radius:5px;background:#71431f;color:#ffe6be;font-size:11px}.site{padding:7px 9px;border-top:1px solid #6e4d56;text-align:center;color:#bdaeb6;font-size:11px}.site a,.geminiNotice a{color:#f4d18f;font-weight:700;text-decoration:none}.site a:hover,.geminiNotice a:hover{text-decoration:underline}.hidden{display:none!important}
      .bar{display:flex;align-items:center;gap:8px;min-height:34px}.barTitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.collapseToggle{width:24px;height:22px;padding:0;border:1px solid #c69b55;border-radius:5px;background:#6b344f;color:#fff;cursor:pointer;font:700 16px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.collapseToggle:hover{background:#7b405d}.panel.collapsed>:not(.bar){display:none!important}
    </style>
    <div class="panel">
      <div class="bar"><span class="barTitle">${PRODUCT_NAME} ${VERSION}</span><button class="collapseToggle" type="button" title="Collapse translator" aria-label="Collapse translator">−</button></div>
      <div class="row"><button class="primary translate">Translate</button><button class="secondary mode">Original</button><button class="gear" title="Settings">...</button></div>
      <div class="status">Ready</div>
      <button class="secondary retry" hidden>Retry failed</button>
      <div class="hotkey">Ctrl+Shift+T — translate / cancel</div>
      <div class="compat" hidden></div>
      <div class="privacy" hidden>
        Visible game text is sent to the selected translation service. Save slots and input fields are excluded.
        <div class="privacyActions"><button class="primary allowAuto">Allow auto-translate</button><button class="secondary manualOnly">Manual only</button></div>
      </div>
      <div class="settings">
        <label class="title">Translation service</label><select class="provider"></select>
        <div class="providerHint"></div>
        <label class="title">Language</label><select class="language"></select>
        <div class="argosBox" hidden>
          <div class="argosStatus">Checking Argos…</div>
          <div class="argosActions"><button class="primary argosAction">Install Argos</button><button class="danger argosRemove" hidden>Remove model</button></div>
        </div>
        <div class="geminiBox" hidden>
          <div class="geminiStatus">Checking Gemini…</div>
          <input class="geminiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Gemini API key">
          <div class="geminiActions"><button class="primary geminiSave">Save API key</button><button class="danger geminiRemove" hidden>Remove key</button></div>
          <div class="geminiNotice">Use your own key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Free-tier content may be used by Google to improve its products. Explicit text can still be blocked.</div>
        </div>
        <label class="check"><input type="checkbox" class="auto"> Automatically translate new screens</label>
        <div class="cacheBox">
          <div class="cacheStats">Calculating cache…</div>
        </div>
        <div class="hint">Ctrl+Shift+T is fixed. Names inside a complete story sentence may be included in a request.</div>
      </div>
      <div class="site">Project website: <a href="${SITE_URL}" target="_blank" rel="noopener noreferrer">${SITE_NAME}</a></div>
    </div>`;
  document.documentElement.appendChild(host);

  const panel = shadow.querySelector(".panel");
  const collapseButton = shadow.querySelector(".collapseToggle");
  const mainButton = shadow.querySelector(".translate");
  const modeButton = shadow.querySelector(".mode");
  const retryButton = shadow.querySelector(".retry");
  const statusElement = shadow.querySelector(".status");
  const settingsPanel = shadow.querySelector(".settings");
  const languageSelect = shadow.querySelector(".language");
  const providerSelect = shadow.querySelector(".provider");
  const providerHint = shadow.querySelector(".providerHint");
  const argosBox = shadow.querySelector(".argosBox");
  const argosStatusElement = shadow.querySelector(".argosStatus");
  const argosActionButton = shadow.querySelector(".argosAction");
  const argosRemoveButton = shadow.querySelector(".argosRemove");
  const geminiBox = shadow.querySelector(".geminiBox");
  const geminiStatusElement = shadow.querySelector(".geminiStatus");
  const geminiKeyInput = shadow.querySelector(".geminiKey");
  const geminiSaveButton = shadow.querySelector(".geminiSave");
  const geminiRemoveButton = shadow.querySelector(".geminiRemove");
  const autoCheckbox = shadow.querySelector(".auto");
  const cacheStatsElement = shadow.querySelector(".cacheStats");
  const privacyBox = shadow.querySelector(".privacy");
  const compatibilityBox = shadow.querySelector(".compat");

  for (const provider of PROVIDER_LIST) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.appendChild(option);
  }
  providerSelect.value = settings.provider;
  populateLanguageOptions(settings.provider, settings.language);
  autoCheckbox.checked = settings.autoTranslate;
  privacyBox.hidden = settings.privacyAccepted || !providerRequiresPrivacy(settings.provider);
  updateCollapsedState();

  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    host.style.left = Math.max(0, Math.min(innerWidth - 306, settings.x)) + "px";
    host.style.top = Math.max(0, Math.min(innerHeight - 44, settings.y)) + "px";
    host.style.right = "auto";
  }

  function setStatus(text) { statusElement.textContent = text; }
  function setMainButton(text) { mainButton.textContent = text; }
  function updateModeButton() { modeButton.textContent = settings.mode === "translated" ? "Original" : "Translation"; }
  function updateCollapsedState() {
    panel.classList.toggle("collapsed", settings.collapsed);
    collapseButton.textContent = settings.collapsed ? "+" : "−";
    collapseButton.title = settings.collapsed ? "Expand translator" : "Collapse translator";
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.setAttribute("aria-expanded", String(!settings.collapsed));
  }
  function providerUsesArgos(provider) { return !!(PROVIDERS[provider] && PROVIDERS[provider].modelManager === "argos"); }
  function providerUsesGemini(provider) { return !!(PROVIDERS[provider] && PROVIDERS[provider].credentialManager === "gemini"); }
  function providerRequiresPrivacy(provider) { return !!(PROVIDERS[provider] && PROVIDERS[provider].requiresPrivacy); }
  function languagesForProvider(provider) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) return [];
    if (providerUsesArgos(provider) && !Array.isArray(argosSupportedLanguages)) return LANGUAGES;
    return LANGUAGES.filter(([code]) => selectedProvider.supportsLanguage(code, { localLanguages: argosSupportedLanguages }));
  }
  function populateLanguageOptions(provider, preferredLanguage) {
    const previous = preferredLanguage || languageSelect.value || settings.language;
    const available = languagesForProvider(provider);
    languageSelect.replaceChildren();
    for (const [code, name] of available) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      languageSelect.appendChild(option);
    }
    const fallback = available.some(([code]) => code === defaults.language) ? defaults.language : (available[0] && available[0][0]);
    languageSelect.value = available.some(([code]) => code === previous) ? previous : (fallback || "");
    languageSelect.disabled = argosBusy || geminiBusy || !available.length;
    return languageSelect.value !== previous;
  }
  function selectedLanguageName() {
    return languageSelect.options[languageSelect.selectedIndex]
      ? languageSelect.options[languageSelect.selectedIndex].textContent
      : languageSelect.value;
  }
  function persistControlSettings() {
    const languageChanged = settings.language !== languageSelect.value;
    const providerChanged = settings.provider !== providerSelect.value;
    settings.language = languageSelect.value;
    settings.provider = providerSelect.value;
    settings.autoTranslate = autoCheckbox.checked;
    if (languageChanged || providerChanged) invalidateAppliedTranslations();
    saveSettings();
    if (settings.autoTranslate && (settings.privacyAccepted || !providerRequiresPrivacy(settings.provider))) {
      scheduleAutoTranslation(50);
    }
  }
  function setArgosBusy(busy) {
    argosBusy = busy;
    argosActionButton.disabled = busy;
    argosRemoveButton.disabled = busy;
    languageSelect.disabled = busy || !languageSelect.options.length;
    providerSelect.disabled = busy;
  }
  function setGeminiBusy(busy) {
    geminiBusy = busy;
    geminiKeyInput.disabled = busy || !LOCAL_BRIDGE;
    geminiSaveButton.disabled = busy || !LOCAL_BRIDGE;
    geminiRemoveButton.disabled = busy || !LOCAL_BRIDGE;
    languageSelect.disabled = busy || argosBusy || !languageSelect.options.length;
    providerSelect.disabled = busy || argosBusy;
  }
  async function refreshGeminiStatus() {
    if (!providerUsesGemini(providerSelect.value)) {
      geminiBox.hidden = true;
      return geminiStatus;
    }
    geminiBox.hidden = false;
    geminiKeyInput.value = "";
    if (!LOCAL_BRIDGE) {
      geminiStatus = null;
      geminiStatusElement.textContent = `The local translation helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      geminiKeyInput.disabled = true;
      geminiSaveButton.disabled = true;
      geminiRemoveButton.hidden = true;
      return null;
    }
    try {
      geminiStatus = await requestLocalHelper("/v1/gemini/status");
      geminiKeyInput.disabled = false;
      geminiSaveButton.disabled = false;
      geminiSaveButton.textContent = geminiStatus.configured ? "Replace API key" : "Save API key";
      geminiRemoveButton.hidden = !geminiStatus.configured;
      geminiStatusElement.textContent = geminiStatus.configured
        ? `Gemini is ready · ${geminiStatus.model} · key stored in ${geminiStatus.credentialStorage}`
        : `Add a Gemini API key. It will be stored in ${geminiStatus.credentialStorage}.`;
      return geminiStatus;
    } catch (error) {
      geminiStatus = null;
      geminiStatusElement.textContent = error && error.message ? error.message : "Could not check Gemini";
      geminiKeyInput.disabled = true;
      geminiSaveButton.disabled = true;
      geminiRemoveButton.hidden = true;
      return null;
    }
  }
  async function refreshArgosStatus() {
    if (!providerUsesArgos(providerSelect.value)) {
      argosBox.hidden = true;
      return argosStatus;
    }
    argosBox.hidden = false;
    if (!LOCAL_BRIDGE) {
      argosStatus = null;
      argosStatusElement.textContent = `The local Argos helper is not running. Restart the game through ${PRODUCT_NAME}.`;
      argosActionButton.hidden = true;
      argosRemoveButton.hidden = true;
      return null;
    }
    try {
      const target = languageSelect.value;
      argosStatus = await requestLocalHelper("/v1/status?target=" + encodeURIComponent(target));
      if (Array.isArray(argosStatus.supportedLanguages)) {
        argosSupportedLanguages = argosStatus.supportedLanguages;
        if (populateLanguageOptions(providerSelect.value, target)) {
          if (providerUsesArgos(settings.provider)) persistControlSettings();
          return refreshArgosStatus();
        }
      }
      if (!argosStatus.supported) {
        argosStatusElement.textContent = `Argos has no offline model for ${selectedLanguageName()}. Choose Google or another language.`;
        argosActionButton.hidden = true;
        argosRemoveButton.hidden = true;
      } else if (!argosStatus.runtimeInstalled || !argosStatus.sentenceModelInstalled) {
        argosStatusElement.textContent = "Argos is not fully installed. The engine uses about 150 MB; internet is only required for installation.";
        argosActionButton.textContent = "Install Argos and model";
        argosActionButton.hidden = false;
        argosRemoveButton.hidden = true;
      } else if (!argosStatus.modelInstalled) {
        argosStatusElement.textContent = `The English → ${selectedLanguageName()} model has not been downloaded.`;
        argosActionButton.textContent = "Download model";
        argosActionButton.hidden = false;
        argosRemoveButton.hidden = true;
      } else {
        argosStatusElement.textContent = `Ready for offline translation · model ${formatBytes(argosStatus.modelBytes)} · engine ${formatBytes(argosStatus.runtimeBytes)}`;
        argosActionButton.hidden = true;
        argosRemoveButton.hidden = false;
      }
      return argosStatus;
    } catch (error) {
      argosStatus = null;
      argosStatusElement.textContent = error && error.message ? error.message : "Could not check Argos";
      argosActionButton.hidden = true;
      argosRemoveButton.hidden = true;
      return null;
    }
  }
  function updateProviderHint() {
    const selectedProvider = PROVIDERS[providerSelect.value];
    if (providerUsesArgos(providerSelect.value)) {
      geminiBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      privacyBox.hidden = true;
      refreshArgosStatus();
    } else if (providerUsesGemini(providerSelect.value)) {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      privacyBox.hidden = settings.privacyAccepted;
      refreshGeminiStatus();
    } else {
      populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
      argosBox.hidden = true;
      geminiBox.hidden = true;
      providerHint.textContent = selectedProvider ? selectedProvider.hint(languageSelect.options.length) : "";
      privacyBox.hidden = settings.privacyAccepted || !providerRequiresPrivacy(providerSelect.value);
    }
  }

  updateModeButton();
  updateProviderHint();

  mainButton.addEventListener("click", () => translateScreen(true));
  modeButton.addEventListener("click", toggleMode);
  retryButton.addEventListener("click", retryFailed);
  collapseButton.addEventListener("click", () => {
    settings.collapsed = !settings.collapsed;
    updateCollapsedState();
    saveSettings();
  });
  shadow.querySelector(".gear").addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
    refreshCacheStats();
  });
  providerSelect.addEventListener("change", () => {
    updateProviderHint();
    persistControlSettings();
  });
  languageSelect.addEventListener("change", () => {
    persistControlSettings();
    if (providerUsesArgos(providerSelect.value)) refreshArgosStatus();
  });
  autoCheckbox.addEventListener("change", () => {
    persistControlSettings();
    privacyBox.hidden = settings.privacyAccepted || !providerRequiresPrivacy(settings.provider);
  });
  geminiSaveButton.addEventListener("click", async () => {
    const apiKey = geminiKeyInput.value.trim();
    if (!apiKey) {
      geminiStatusElement.textContent = "Enter a Gemini API key first.";
      return;
    }
    setGeminiBusy(true);
    try {
      await requestLocalHelper("/v1/gemini/key", { body: { apiKey } });
      geminiKeyInput.value = "";
      await refreshGeminiStatus();
      setStatus("Gemini API key saved securely");
    } catch (error) {
      geminiKeyInput.value = "";
      geminiStatusElement.textContent = error && error.message ? error.message : "Could not save the Gemini API key";
      setStatus("Gemini setup failed");
    } finally {
      setGeminiBusy(false);
    }
  });
  geminiRemoveButton.addEventListener("click", async () => {
    if (!confirm("Remove the saved Gemini API key?")) return;
    setGeminiBusy(true);
    try {
      await requestLocalHelper("/v1/gemini/key/remove", { body: { accepted: true } });
      if (settings.provider === "gemini") settings.autoTranslate = false;
      autoCheckbox.checked = settings.autoTranslate;
      saveSettings();
      await refreshGeminiStatus();
      setStatus("Gemini API key removed");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove the Gemini API key");
    } finally {
      setGeminiBusy(false);
    }
  });
  argosActionButton.addEventListener("click", async () => {
    if (argosBusy || !LOCAL_BRIDGE) return;
    setArgosBusy(true);
    try {
      const status = await refreshArgosStatus();
      if (!status || !status.supported) return;
      if (!status.runtimeInstalled || !status.sentenceModelInstalled) {
        argosStatusElement.textContent = "Installing the Argos engine… This may take several minutes.";
        await requestLocalHelper("/v1/runtime/install", { body: { accepted: true } });
      }
      argosStatusElement.textContent = `Downloading the English → ${selectedLanguageName()} model…`;
      await requestLocalHelper("/v1/models/install", { body: { target: languageSelect.value } });
      await refreshArgosStatus();
      setStatus("Argos is ready for offline translation");
    } catch (error) {
      argosStatusElement.textContent = error && error.message ? error.message : "Could not install Argos";
      setStatus("Argos installation failed");
    } finally {
      setArgosBusy(false);
    }
  });
  argosRemoveButton.addEventListener("click", async () => {
    if (argosBusy || !confirm(`Remove the offline model for ${selectedLanguageName()}?`)) return;
    setArgosBusy(true);
    try {
      await requestLocalHelper("/v1/models/uninstall", { body: { target: languageSelect.value } });
      invalidateAppliedTranslations();
      await refreshArgosStatus();
      setStatus("Argos model removed");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not remove model");
    } finally {
      setArgosBusy(false);
    }
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
    setStatus("Manual translation enabled");
  });
  let drag = null;
  const bar = shadow.querySelector(".bar");
  bar.addEventListener("pointerdown", (event) => {
    if (event.target === collapseButton) return;
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

  if (typeof IntersectionObserver === "function") {
    translationVisibilityObserver = new IntersectionObserver((entries) => {
      let added = false;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target.isConnected) {
          visibleTranslationContainers.add(entry.target);
          queueTranslationContainer(entry.target);
          added = true;
        } else {
          visibleTranslationContainers.delete(entry.target);
        }
      }
      if (added) scheduleAutoTranslation(120);
    }, { root: null, rootMargin: "120px 0px", threshold: 0 });
  }

  const observer = new MutationObserver((records) => {
    if (selfMutation) return;
    let changed = false;
    for (const record of records) {
      if (record.type === "characterData" && record.target.parentElement) {
        registerTranslationContainers(record.target.parentElement);
        const container = presentationContainerForNode(record.target) || record.target.parentElement;
        if (isElementOnScreen(container)) queueTranslationContainer(container);
        changed = true;
      }
      for (const node of record.addedNodes || []) {
        registerTranslationContainers(node);
        changed = true;
      }
    }
    if (changed && pendingTranslationRoots.size) scheduleAutoTranslation(220);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true
  });
  document.addEventListener("pointerover", (event) => {
    if (event.target instanceof Element) {
      registerTranslationContainers(event.target);
    }
    scheduleAutoTranslation(180);
  }, true);
  if (!translationVisibilityObserver) {
    addEventListener("scroll", () => {
      registerTranslationContainers(document.body);
      scheduleAutoTranslation(180);
    }, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(scanTimer);
      scanTimer = 0;
      if (abortController) abortController.abort();
      return;
    }
    for (const element of visibleTranslationContainers) queueTranslationContainer(element);
    scheduleAutoTranslation(80);
  });

  registerTranslationContainers(document.body);

  let startupChecks = 0;
  const startupGuard = setInterval(() => {
    startupChecks += 1;
    if (!settings.autoTranslate || (!settings.privacyAccepted && providerRequiresPrivacy(settings.provider)) || startupChecks > 180) {
      clearInterval(startupGuard);
      return;
    }
    const loading = document.getElementById("loading");
    if (loading && isElementOnScreen(loading)) return;
    const roots = takeAutoTranslationRoots();
    if (roots.length) {
      for (const root of roots) pendingTranslationRoots.add(root);
      clearInterval(startupGuard);
      translateScreen(false);
    }
  }, 1000);

  setTimeout(() => {
    const gameVersion = typeof adapter.getGameVersion === "function" ? String(adapter.getGameVersion(window) || "") : "";
    if (gameVersion && SUPPORTED_GAME_VERSIONS.length && !SUPPORTED_GAME_VERSIONS.includes(gameVersion)) {
      compatibilityBox.hidden = false;
      compatibilityBox.textContent = `${GAME_SHORT_TITLE} ${gameVersion} has not been tested with mod ${VERSION}. Translation will continue, but errors are possible.`;
    }
    scheduleAutoTranslation(50);
  }, 500);

  window.__vnRevivalTranslator = {
    version: VERSION,
    gameId: game.id,
    translateScreen: () => translateScreen(true),
    collectVisibleTextNodes,
    showOriginal,
    showTranslations,
    cacheStats,
    settings: () => Object.assign({}, settings)
  };
  if (legacyCompatibility.coreGlobal) window[legacyCompatibility.coreGlobal] = core;
  if (legacyCompatibility.languagesGlobal) window[legacyCompatibility.languagesGlobal] = LANGUAGES;
  if (legacyCompatibility.translatorGlobal) {
    window[legacyCompatibility.translatorGlobal] = window.__vnRevivalTranslator;
  }
  console.info(`[${PRODUCT_NAME} ${VERSION}] loaded for ${GAME_TITLE}`);
})();
