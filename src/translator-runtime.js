(function () {
  "use strict";
  if ((window.__vnRevivalTranslator && window.__vnRevivalTranslator.version)
      || window.__vnRevivalTranslatorPending) return;
  window.__vnRevivalTranslatorPending = true;

  function initializeTranslator() {
  delete window.__vnRevivalTranslatorPending;
  if (window.__vnRevivalTranslator && window.__vnRevivalTranslator.version) return;

  const core = window.VNRevivalTranslationCore;
  const game = window.VNRevivalGameConfig;
  const adapter = window.VNRevivalGameAdapter;
  const providerRegistry = window.VNRevivalTranslationProviders;
  const panelView = window.VNRevivalPanelView;
  if (!core) throw new Error("VN Revival translation core is missing");
  if (!game || !game.id || !game.translatorName || !game.storageNamespace
      || !/^[a-z0-9][a-z0-9-]*$/.test(String(game.siteSlug || "")) || game.sourceLanguage !== "en") {
    throw new Error("VN Revival game config is missing or incompatible");
  }
  if (!adapter || adapter.contractVersion !== 2) {
    throw new Error("VN Revival DOM adapter is missing or incompatible");
  }
  if (!providerRegistry || providerRegistry.contractVersion !== 1 || !Array.isArray(providerRegistry.list)) {
    throw new Error("VN Revival provider registry is missing or incompatible");
  }
  if (!panelView || typeof panelView.render !== "function") {
    throw new Error("VN Revival panel view is missing or incompatible");
  }

  const VERSION = "__VERSION__";
  const SUPPORTED_GAME_VERSIONS = Array.isArray(game.supportedVersions) ? game.supportedVersions : [];
  const PRODUCT_NAME = game.translatorName;
  const GAME_TITLE = game.title || game.id;
  const GAME_SHORT_TITLE = game.shortTitle || GAME_TITLE;
  const SOURCE_LANGUAGE = game.sourceLanguage || "en";
  const SITE_NAME = "VN Revival";
  const SITE_URL = "https://vnrevival.fun/";
  const OPENAI_CONFIG = window.VNRevivalOpenAICompatibleConfig;
  if (!OPENAI_CONFIG || !OPENAI_CONFIG.presets || !OPENAI_CONFIG.defaultSystemPrompt) {
    throw new Error("VN Revival OpenAI-compatible config is missing or incompatible");
  }
  const OPENAI_COMPATIBLE_PROMPT_VERSION = OPENAI_CONFIG.promptVersion;
  const OPENAI_COMPATIBLE_MAX_SYSTEM_PROMPT_CHARS = OPENAI_CONFIG.maxSystemPromptChars;
  const OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS = OPENAI_CONFIG.maxGlossaryChars;
  const OPENAI_COMPATIBLE_MIN_CONCURRENCY = OPENAI_CONFIG.minConcurrency;
  const OPENAI_COMPATIBLE_MAX_CONCURRENCY = OPENAI_CONFIG.maxConcurrency;
  const OPENAI_COMPATIBLE_REASONING_EFFORTS = OPENAI_CONFIG.reasoningEfforts;
  const OPENAI_COMPATIBLE_TRANSLATION_VERBOSITY = OPENAI_CONFIG.translationVerbosity;
  const OPENAI_COMPATIBLE_MANUAL_MODEL_VALUE = OPENAI_CONFIG.manualModelValue;
  const OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT = OPENAI_CONFIG.defaultSystemPrompt;
  const SITE_TRANSLATION_CONFIG_MAX_GLOSSARY_CHARS = 64000;
  const SITE_TRANSLATION_CONFIG_RETRY_MS = 60000;
  const OPENAI_COMPATIBLE_PRESETS = OPENAI_CONFIG.presets;
  const INTERFACE_PRESETS = window.VNRevivalInterfacePresets;
  if (!INTERFACE_PRESETS || !INTERFACE_PRESETS.en) {
    throw new Error("VN Revival interface presets are missing or incompatible");
  }
  const SETTINGS_KEY = `${game.storageNamespace}.settings.v2`;
  const LEGACY_SETTINGS_KEY = `${game.storageNamespace}.settings.v1`;
  const CACHE_META_KEY = `${game.storageNamespace}.cache-meta.v1`;
  const CACHE_DIRTY_KEY = `${game.storageNamespace}.cache-meta-dirty.v1`;
  const DB_NAME = game.cacheDatabase || `${game.storageNamespace}-cache`;
  const STORE_NAME = "translations";
  const legacyCompatibility = game.legacyCompatibility || {};
  const MEMORY_CACHE_LIMIT = 20000;
  const LANGUAGES = window.VNRevivalTranslatorLanguages;
  const PROVIDER_LIST = providerRegistry.list;
  const PROVIDERS = providerRegistry.byId;
  const injectedLocalBridge = window.__vnRevivalLocalBridge;
  const LOCAL_BRIDGE = injectedLocalBridge
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(String(injectedLocalBridge.baseURL || ""))
    && /^[A-Za-z0-9-]{16,}$/.test(String(injectedLocalBridge.token || ""))
    ? Object.freeze({ baseURL: injectedLocalBridge.baseURL, token: injectedLocalBridge.token })
    : null;
  const defaults = {
    language: "en",
    translateInterface: false,
    provider: "google",
    autoTranslate: true,
    mode: "translated",
    openAICompatiblePreset: "opencode-go",
    openAICompatibleBaseURL: OPENAI_COMPATIBLE_PRESETS["opencode-go"].baseURL,
    openAICompatibleModel: "",
    openAICompatibleSystemPrompt: OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT,
    openAICompatibleGlossary: "",
    openAICompatibleReasoningEffort: "",
    openAICompatibleConcurrency: 4,
    collapsed: false,
    x: null,
    y: null
  };
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function normalizedOpenAICompatibleChoice(value, allowed, fallback) {
    const selected = typeof value === "string" ? value : "";
    return allowed.includes(selected) ? selected : fallback;
  }

  function normalizedOpenAICompatibleConcurrency(value, fallback = defaults.openAICompatibleConcurrency) {
    const selected = Number(value);
    return Number.isInteger(selected)
      && selected >= OPENAI_COMPATIBLE_MIN_CONCURRENCY
      && selected <= OPENAI_COMPATIBLE_MAX_CONCURRENCY
      ? selected : fallback;
  }

  if (!Array.isArray(LANGUAGES) || LANGUAGES.length !== 31) throw new Error("VN Revival language catalog is missing");
  if (!PROVIDERS.google || !PROVIDER_LIST.every((provider) => provider && provider.id && provider.label
    && typeof provider.supportsLanguage === "function" && typeof provider.splitText === "function"
    && typeof provider.translateChunk === "function")) throw new Error("VN Revival provider contract is invalid");

  let settings = loadSettings();
  let running = false;
  let screenshotBatchRunning = false;
  let abortController = null;
  let selfMutation = false;
  let scanTimer = 0;
  let pendingAutoRun = false;
  let translationVisibilityObserver = null;
  let lastFailedJobs = [];
  let autoBlockedVariant = null;
  let translationStatus = null;
  let dbPromise = null;
  let cacheMetadata = loadCacheMetadata();
  let cacheMetadataPromise = null;
  let cacheMetadataVerified = false;
  let cacheMetadataSaveTimer = 0;
  let localLogBytes = null;
  let openAICompatibleStatus = null;
  let editingOpenAIKey = false;
  let openAICompatibleBusy = false;
  const siteTranslationConfigs = new Map();
  const siteTranslationConfigPromises = new Map();
  const siteTranslationConfigFailures = new Map();

  function randomHexId() {
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  let openAICompatibleModels = [];
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
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (_) {}
    if (!parsed) {
      try {
        parsed = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "null");
      } catch (_) {}
    }
    const source = parsed || {};
    const openAICompatiblePreset = hasOwn(OPENAI_COMPATIBLE_PRESETS, source.openAICompatiblePreset)
      ? source.openAICompatiblePreset : defaults.openAICompatiblePreset;
    const customBaseURL = typeof source.openAICompatibleBaseURL === "string"
      && source.openAICompatibleBaseURL.length <= 2048 ? source.openAICompatibleBaseURL.trim() : "";
    return {
      language: LANGUAGES.some(([code]) => code === source.language) ? source.language : defaults.language,
      translateInterface: typeof source.translateInterface === "boolean" ? source.translateInterface : defaults.translateInterface,
      provider: PROVIDERS[source.provider] ? source.provider : defaults.provider,
      autoTranslate: typeof source.autoTranslate === "boolean" ? source.autoTranslate : defaults.autoTranslate,
      mode: defaults.mode,
      openAICompatiblePreset,
      openAICompatibleBaseURL: openAICompatiblePreset === "custom"
        ? customBaseURL : OPENAI_COMPATIBLE_PRESETS[openAICompatiblePreset].baseURL,
      openAICompatibleModel: typeof source.openAICompatibleModel === "string"
        && source.openAICompatibleModel.length <= 512 ? source.openAICompatibleModel.trim() : "",
      openAICompatibleSystemPrompt: typeof source.openAICompatibleSystemPrompt === "string"
        && source.openAICompatibleSystemPrompt.trim()
        && source.openAICompatibleSystemPrompt.length <= OPENAI_COMPATIBLE_MAX_SYSTEM_PROMPT_CHARS
        ? source.openAICompatibleSystemPrompt.trim() : defaults.openAICompatibleSystemPrompt,
      openAICompatibleGlossary: typeof source.openAICompatibleGlossary === "string"
        && source.openAICompatibleGlossary.length <= OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS
        ? source.openAICompatibleGlossary.trim() : defaults.openAICompatibleGlossary,
      openAICompatibleReasoningEffort: normalizedOpenAICompatibleChoice(
        source.openAICompatibleReasoningEffort,
        OPENAI_COMPATIBLE_REASONING_EFFORTS,
        defaults.openAICompatibleReasoningEffort
      ),
      openAICompatibleConcurrency: normalizedOpenAICompatibleConcurrency(source.openAICompatibleConcurrency),
      collapsed: defaults.collapsed,
      x: Number.isFinite(source.x) ? source.x : null,
      y: Number.isFinite(source.y) ? source.y : null
    };
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  }

  function providerUsesOpenAICompatible(provider) {
    return !!(PROVIDERS[provider] && PROVIDERS[provider].modelManager === "openai-compatible");
  }

  function isFreeOpenAICompatibleModel(model) {
    const normalized = String(model || "").trim().toLowerCase();
    return normalized === "big-pickle" || /(?:^|[-._/:])free(?:$|[-._/:])/.test(normalized);
  }

  function sortedOpenAICompatibleModels(models) {
    const unique = [];
    for (const model of Array.isArray(models) ? models : []) {
      if (typeof model !== "string" || !model || unique.includes(model)) continue;
      unique.push(model);
    }
    return unique.sort((left, right) => {
      const freeOrder = Number(isFreeOpenAICompatibleModel(right)) - Number(isFreeOpenAICompatibleModel(left));
      return freeOrder || left.toLowerCase().localeCompare(right.toLowerCase()) || left.localeCompare(right);
    });
  }

  function siteTranslationConfig(language = settings.language) {
    return siteTranslationConfigs.get(language) || null;
  }

  function glossaryMappingKey(line) {
    if (!/^[^=\n]+=[^=\n]+$/.test(line)) return "";
    const source = line.split("=")[0].trim();
    return source ? core.normalizeText(source).normalize("NFKC").toLowerCase() : "";
  }

  function mergeGlossaryLayers(siteGlossary, userGlossary) {
    const siteLines = String(siteGlossary || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const userLines = String(userGlossary || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!userLines.length) return siteLines.join("\n");
    if (userLines.some((line) => !glossaryMappingKey(line))) {
      return [...siteLines, ...userLines].join("\n");
    }
    const merged = [];
    const positions = new Map();
    for (const line of [...siteLines, ...userLines]) {
      const key = glossaryMappingKey(line);
      if (!key) continue;
      if (positions.has(key)) merged[positions.get(key)] = line;
      else {
        positions.set(key, merged.length);
        merged.push(line);
      }
    }
    return merged.join("\n");
  }

  function siteDefaultSystemPrompt(language = settings.language) {
    return String(siteTranslationConfig(language)?.systemPrompt || OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT).trim();
  }

  function selectedSystemPrompt(language = settings.language) {
    const saved = String(settings.openAICompatibleSystemPrompt || "").trim();
    return saved && saved !== OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT
      ? saved : siteDefaultSystemPrompt(language);
  }

  function openAICompatibleConnection() {
    const preset = hasOwn(OPENAI_COMPATIBLE_PRESETS, settings.openAICompatiblePreset)
      ? settings.openAICompatiblePreset : defaults.openAICompatiblePreset;
    const model = String(settings.openAICompatibleModel || "").trim();
    const supportedEfforts = OPENAI_CONFIG.modelReasoningEfforts[preset]?.[model];
    const remoteConfig = siteTranslationConfig(settings.language);
    const systemPrompt = selectedSystemPrompt(settings.language);
    const siteGlossary = String(remoteConfig?.glossary || "").trim();
    const userGlossary = String(settings.openAICompatibleGlossary || "").trim();
    const glossary = mergeGlossaryLayers(siteGlossary, userGlossary);
    const requestSystemPrompt = glossary
      ? `${systemPrompt}\n\nTranslation glossary. Apply these mappings consistently whenever the source term occurs:\n${glossary}`
      : systemPrompt;
    return {
      preset,
      baseURL: preset === "custom"
        ? String(settings.openAICompatibleBaseURL || "").trim()
        : OPENAI_COMPATIBLE_PRESETS[preset].baseURL,
      model,
      promptVersion: remoteConfig?.promptVersion || OPENAI_COMPATIBLE_PROMPT_VERSION,
      systemPrompt,
      siteGlossary,
      userGlossary,
      glossary,
      requestSystemPrompt,
      concurrency: normalizedOpenAICompatibleConcurrency(settings.openAICompatibleConcurrency),
      modelParameters: {
        reasoningEffort: normalizedOpenAICompatibleChoice(
          settings.openAICompatibleReasoningEffort,
          supportedEfforts ? ["", ...supportedEfforts] : OPENAI_COMPATIBLE_REASONING_EFFORTS,
          supportedEfforts ? supportedEfforts[0] : defaults.openAICompatibleReasoningEffort
        ),
        verbosity: OPENAI_COMPATIBLE_TRANSLATION_VERBOSITY
      }
    };
  }

  function connectionForSource(source, connection = openAICompatibleConnection()) {
    const glossary = mergeGlossaryLayers(
      core.selectGlossary(source, connection.siteGlossary),
      core.selectGlossary(source, connection.userGlossary)
    );
    return { ...connection, glossary, requestSystemPrompt: glossary
      ? `${connection.systemPrompt}\n\nTranslation glossary. Apply these mappings consistently whenever the source term occurs:\n${glossary}`
      : connection.systemPrompt };
  }

  function batchOpenAIRequest(job, parts, baseConnection) {
    const fragments = parts.flatMap(core.jobTextParts);
    const source = core.buildContextSource(fragments);
    const connection = connectionForSource(source, baseConnection);
    let offset = 1;
    const boundaries = parts.map(part => {
      const start = offset;
      offset += core.jobTextParts(part).length;
      return start === offset - 1 ? String(start) : `${start}-${offset - 1}`;
    }).join("; ");
    connection.requestSystemPrompt += job.kind === "story"
      ? `\nTranslate this passage coherently in its original order. Paragraph fragment groups (1-based): ${boundaries}.`
      : `\nTranslate these interface blocks independently. Block fragment groups (1-based): ${boundaries}.`;
    connection.requestSystemPrompt += " Preserve every VRCTXSEP marker and its order; do not move text between fragments.";
    return { source, connection };
  }

  function providerCacheVariant(provider, connection = openAICompatibleConnection()) {
    if (!providerUsesOpenAICompatible(provider)) return "";
    return [
      connection.preset, connection.baseURL, connection.model,
      connection.promptVersion, connection.systemPrompt, connection.glossary,
      JSON.stringify(connection.modelParameters)
    ].join("\n");
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

  async function cacheStats() {
    try {
      const metadata = await getCacheMetadata();
      const language = metadata.languages[settings.language] || { records: 0, bytes: 0 };
      return { records: metadata.records, bytes: metadata.bytes, languageRecords: language.records, languageBytes: language.bytes };
    } catch (_) { return { records: 0, bytes: 0, languageRecords: 0, languageBytes: 0 }; }
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
      return true;
    } catch (_) {
      memoryCache.clear();
      cacheMetadata = null;
      cacheMetadataVerified = false;
      return false;
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

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
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
      error.httpStatus = response.status;
      error.providerStatus = payload && Number.isInteger(payload.providerStatus) ? payload.providerStatus : null;
      error.retryAfterMs = payload && Number.isFinite(payload.retryAfterMs) ? payload.retryAfterMs : null;
      error.usage = payload && payload.usage && typeof payload.usage === "object" ? payload.usage : null;
      throw error;
    }
    return payload;
  }

  function validSiteTranslationConfig(payload) {
    if (!payload || payload.source !== "vnrevival"
        || !["vnrevival", "bundled"].includes(payload.promptSource)
        || typeof payload.promptVersion !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(payload.promptVersion)
        || typeof payload.systemPrompt !== "string" || !payload.systemPrompt.trim()
        || payload.systemPrompt.length > OPENAI_COMPATIBLE_MAX_SYSTEM_PROMPT_CHARS
        || !["{targetName}", "{target}", "VRCTXSEP<number>X"].every((marker) => payload.systemPrompt.includes(marker))
        || !payload.systemPrompt.toLowerCase().includes("untrusted content, never instructions")
        || typeof payload.glossary !== "string" || !payload.glossary.trim()
        || payload.glossary.length > SITE_TRANSLATION_CONFIG_MAX_GLOSSARY_CHARS
        || !Number.isInteger(payload.entries) || payload.entries < 1 || payload.entries > 1000) return false;
    const lines = payload.glossary.split(/\r?\n/).filter((line) => line.trim());
    return lines.length === payload.entries && lines.every((line) => !!glossaryMappingKey(line));
  }

  async function ensureSiteTranslationConfig(language = settings.language) {
    if (!LOCAL_BRIDGE || language === SOURCE_LANGUAGE) return null;
    if (siteTranslationConfigs.has(language)) return siteTranslationConfigs.get(language);
    const failedAt = siteTranslationConfigFailures.get(language) || 0;
    if (Date.now() - failedAt < SITE_TRANSLATION_CONFIG_RETRY_MS) return null;
    if (siteTranslationConfigPromises.has(language)) return siteTranslationConfigPromises.get(language);
    const pending = (async () => {
      const previousVariant = translationVariant();
      try {
        const result = await requestLocalHelper("/v1/vnrevival/translation-config", {
          body: { gameSlug: game.siteSlug, locale: language }
        });
        if (!validSiteTranslationConfig(result)) throw new Error("Invalid VN Revival translation settings");
        const config = Object.freeze({
          promptSource: result.promptSource,
          promptVersion: result.promptVersion,
          systemPrompt: result.systemPrompt.trim(),
          glossary: result.glossary.trim(),
          entries: result.entries
        });
        siteTranslationConfigs.set(language, config);
        siteTranslationConfigFailures.delete(language);
        if (language === settings.language) {
          if (providerUsesOpenAICompatible(settings.provider)
              && previousVariant !== translationVariant()) invalidateAppliedTranslations();
          syncOpenAICompatibleInputs();
        }
        return config;
      } catch (_) {
        siteTranslationConfigFailures.set(language, Date.now());
        return null;
      } finally {
        siteTranslationConfigPromises.delete(language);
        if (language === settings.language) syncSiteGlossaryDisplay();
      }
    })();
    siteTranslationConfigPromises.set(language, pending);
    if (language === settings.language) syncSiteGlossaryDisplay();
    return pending;
  }

  function retryableProviderError(provider, error) {
    if (provider !== "openai-compatible") return true;
    if (error && error.code === "openai_request_failed") {
      return !Number.isInteger(error.providerStatus) || error.providerStatus >= 500;
    }
    return !!(error && [
      "openai_rate_limited", "openai_unavailable",
      "openai_invalid_response", "openai_empty_translation"
    ].includes(error.code));
  }

  function providerRetryDelay(error, attempt) {
    const requestedDelay = error && Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0;
    const fallbackDelay = (error && error.code === "openai_rate_limited" ? 3000 : 1000) * Math.pow(2, attempt);
    return Math.max(250, Math.min(60000, requestedDelay || fallbackDelay));
  }

  function providerRequestDelay(provider) {
    if (provider !== "openai-compatible") return PROVIDERS[provider].delay;
    const connection = openAICompatibleConnection();
    if (connection.preset === "opencode-zen" && isFreeOpenAICompatibleModel(connection.model)) return 2000;
    return PROVIDERS[provider].delay;
  }

  async function requestChunk(provider, text, language, signal, onRetry, context = {}) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    let lastError = null;
    const retries = Math.max(1, Number(selectedProvider.retries) || 1);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        throwIfAborted(signal);
        if (context.variant && context.variant !== translationVariant()) throw new DOMException("Configuration changed", "AbortError");
        if (context.metrics) {
          context.metrics.helper_requests += 1;
          if (context.batchSize > 1) context.metrics.batch_requests += 1;
        }
        return await selectedProvider.translateChunk({
          text, language, sourceLanguage: SOURCE_LANGUAGE, signal,
          metrics: context.metrics || null,
          openAICompatible: providerUsesOpenAICompatible(provider) ? (context.connection || connectionForSource(text)) : null,
          languageName: (LANGUAGES.find(([code]) => code === language) || [null, language])[1],
          fetch: (input, init) => fetch(input, init),
          localRequest: (path, options) => requestLocalHelper(path, {
            ...options, body: { ...options.body, diagnostics: context.metrics ? {
              screen_id: context.metrics.screen_id, batch_size: context.batchSize || 1,
              kind: context.kind || "ui"
            } : undefined }
          }),
          decodeHtmlEntities
        });
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        lastError = error;
        if (context.batchSize > 1 && batchFormatError(error)) break;
        if (attempt + 1 < retries && retryableProviderError(provider, error)) {
          const delay = providerRetryDelay(error, attempt);
          if (typeof onRetry === "function") onRetry(error, delay, attempt + 2, retries);
          await sleep(delay, signal);
        } else {
          break;
        }
      }
    }
    throw lastError || new Error("Translation failed");
  }

  function translationCacheKey(source, language, provider, connection) {
    return core.makeCacheKey(source, language, provider, game.id,
      providerCacheVariant(provider, connectionForSource(source, connection)));
  }

  async function translateText(source, language, provider, signal, onRetry, context = {}) {
    const connection = connectionForSource(source, context.connection);
    const key = translationCacheKey(source, language, provider, connection);
    let cached = await cacheGet(key);
    if (!cached && provider === "google") {
      const legacyKey = core.makeCacheKey(source, language, provider);
      cached = await cacheGet(legacyKey);
      if (cached) {
        if (await cachePut(key, cached)) await cacheDelete(legacyKey);
      }
    }
    if (cached) {
      if (context.metrics) context.metrics.cache_hits += 1;
      return { text: cached, cached: true };
    }
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) throw new Error("Unknown translation service");
    const chunks = selectedProvider.splitText(source);
    const parts = [];
    for (const chunk of chunks) {
      parts.push(await requestChunk(provider, chunk, language, signal, onRetry, { ...context, connection }));
      await sleep(providerRequestDelay(provider), signal);
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

  function visibilityElement(element) {
    if (!(element instanceof Element)) return element;
    if (element.matches("option,optgroup")) return element.closest("select") || element;
    return element;
  }

  function isElementOnScreen(element) {
    element = visibilityElement(element);
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
    const includeHiddenTooltips = !!(options && options.includeHiddenTooltips);
    const result = [];
    const roots = options && Array.isArray(options.roots) ? options.roots : null;
    for (const node of textNodesWithinRoots(roots)) {
      if (!node.parentElement) continue;
      const prefetchableTooltip = includeHiddenTooltips
        && !isPrivateOrTechnical(node.parentElement)
        && classifyNode(node) === "tooltip";
      if (!isVisible(node.parentElement) && !prefetchableTooltip) continue;
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
    if (element && element.matches("option,optgroup")) return element.closest("select") || element;
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
      if (classifyNode(node) === "tooltip"
          || (!translationVisibilityObserver && isElementOnScreen(container))) {
        queueTranslationContainer(container);
      }
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
      restoreElementPresentation(element);
    }
    formattedElements.clear();
  }

  function restoreElementPresentation(element) {
    const original = originalPresentation.get(element);
    if (!original) return;
    for (const [name, attribute] of Object.entries(original.attributes)) {
      if (attribute.present) element.setAttribute(name, attribute.value);
      else element.removeAttribute(name);
    }
    for (const [property, style] of Object.entries(original.styles)) {
      restoreStyleProperty(element, property, style.value, style.priority);
    }
    originalPresentation.delete(element);
  }

  function releaseRemovedSubtree(root) {
    if (root.isConnected) return; // A move within the live DOM retains its translation.
    const release = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        sourceForNode(node); // Preserve any newer text written by the game.
        const record = applied.get(node);
        if (record) node.nodeValue = preserveWhitespace(node.nodeValue, record.source);
        applied.delete(node);
        appliedNodes.delete(node);
      } else if (node instanceof Element) {
        if (translationVisibilityObserver) translationVisibilityObserver.unobserve(node);
        observedTranslationContainers.delete(node);
        visibleTranslationContainers.delete(node);
        pendingTranslationRoots.delete(node);
        restoreElementPresentation(node);
        formattedElements.delete(node);
      }
    };
    release(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) release(node);
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

  function rememberTranslation(node, source, translation, language, provider, context = {}, dependencySource = source) {
    if (!node || !node.isConnected || !translation || context.signal?.aborted
        || (context.variant && context.variant !== translationVariant())) return;
    if (sourceForNode(node) !== source) return;
    if (context.deferred) {
      context.deferred.push([node, source, translation, language, provider, context, dependencySource]);
      return;
    }
    applied.set(node, { source, translation, language, provider, dependencySource });
    appliedNodes.add(node);
    if (settings.mode === "translated") {
      writeNode(node, translation);
      applyLanguageFormatting(node, language);
      if (context.metrics) {
        const elapsed = Math.round(performance.now() - context.started);
        context.metrics.first_apply_ms ??= elapsed;
        if (context.kind === "story") context.metrics.first_story_ms ??= elapsed;
      }
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
    setStatus("Showing translation");
    scheduleAutoTranslation(50);
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

  function translationTargetsSourceLanguage() {
    return settings.language === SOURCE_LANGUAGE;
  }

  function clearSourceLanguageTranslationState() {
    if (!translationTargetsSourceLanguage()) return false;
    pendingAutoRun = false;
    lastFailedJobs = [];
    autoBlockedVariant = null;
    retryButton.disabled = true;
    setStatus("");
    return true;
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
    const order = new Map(nodes.map((node, index) => [node, index]));
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
        if (entry.kind === "story") {
          jobs.push({ source: entry.source, nodes: [entry.node], kind: entry.kind, contextual: false });
        } else {
          if (!simple.has(entry.source)) simple.set(entry.source, { source: entry.source, nodes: [], kind: entry.kind, contextual: false });
          simple.get(entry.source).nodes.push(entry.node);
        }
        offset += 1;
      }
    }
    jobs.push(...simple.values());
    const priority = { story: 0, control: 1, tooltip: 2, ui: 3 };
    for (const job of jobs) {
      job.batchRegion = job.kind === "control" ? null : contextContainerForNode(job.nodes[0])?.parentElement;
    }
    return jobs.sort((a, b) => priority[a.kind] - priority[b.kind] || order.get(a.nodes[0]) - order.get(b.nodes[0]));
  }

  function batchFormatError(error) {
    return ["openai_format_invalid", "openai_invalid_response", "openai_empty_translation"].includes(error?.code);
  }

  async function applyBatchTranslation(job, language, provider, signal, onRetry, context) {
    const missing = [];
    for (const part of job.batchParts) {
      throwIfAborted(signal);
      const key = translationCacheKey(part.source, language, provider, context.connection);
      const cached = await cacheGet(key);
      if (cached && (!part.contextual || core.parseContextTranslation(cached, part.parts.length))) {
        context.metrics.cache_hits += 1;
        applyResolvedTranslation(part, cached, language, provider, context);
      } else missing.push({ ...part, key });
    }
    if (!missing.length) return true;
    if (missing.length > 1) {
      const { source, connection } = batchOpenAIRequest(job, missing, context.connection);
      const fragments = missing.flatMap(core.jobTextParts);
      let parts;
      try {
        const translated = await requestChunk(provider, source, language, signal, onRetry,
          { ...context, connection, batchSize: missing.length });
        parts = core.parseContextTranslation(translated, fragments.length);
      } catch (error) {
        if (!batchFormatError(error)) {
          error.failedJobs = missing;
          throw error;
        }
      }
      if (parts) {
        let index = 0;
        for (const part of missing) {
          const count = core.jobTextParts(part).length;
          const translated = core.buildContextSource(parts.slice(index, index + count));
          index += count;
          await cachePut(part.key, translated);
          applyResolvedTranslation(part, translated, language, provider, context);
        }
        await sleep(providerRequestDelay(provider), signal);
        return false;
      }
      context.metrics.batch_fallbacks += 1;
    }
    // A malformed batch never enters the cache. Retry only its missing original blocks.
    for (let index = 0; index < missing.length; index += 1) {
      try {
        await applyJobTranslation(missing[index], language, provider, signal, onRetry, context);
      } catch (error) {
        error.failedJobs = missing.slice(index);
        throw error;
      }
    }
    return false;
  }

  function applyResolvedTranslation(job, translated, language, provider, context) {
    if (!job.contextual) {
      for (const node of job.nodes) rememberTranslation(node, job.source, translated, language, provider, context);
      return true;
    }
    const parts = core.parseContextTranslation(translated, job.parts.length);
    if (!parts) return false;
    for (let index = 0; index < job.parts.length; index += 1) {
      const part = job.parts[index];
      rememberTranslation(part.node, part.source, parts[index], language, provider, context, job.source);
    }
    return true;
  }

  async function applyJobTranslation(job, language, provider, signal, onRetry, context = {}) {
    context = { ...context, kind: job.kind };
    if (job.batchParts) {
      // Stage passage updates until every paragraph is ready, including cache hits.
      if (job.kind !== "control") context = { ...context, deferred: [] };
      try {
        const cached = await applyBatchTranslation(job, language, provider, signal, onRetry, context);
        if (context.deferred) {
          const current = job.batchParts.every(part => (part.contextual
            ? part.parts : part.nodes.map(node => ({ node, source: part.source })))
            .every(({ node, source }) => node.isConnected && sourceForNode(node) === source));
          const updates = context.deferred;
          context.deferred = null;
          if (current) for (const update of updates) {
            update[5] = { ...update[5], deferred: null };
            rememberTranslation(...update);
          }
        }
        return cached;
      } catch (error) {
        if (context.deferred) error.failedJobs = job.batchParts;
        throw error;
      }
    }
    const result = await translateText(job.source, language, provider, signal, onRetry, context);
    if (applyResolvedTranslation(job, result.text, language, provider, context)) return result.cached;
    let allCached = true;
    for (const part of job.parts) {
      const fallback = await translateText(part.source, language, provider, signal, onRetry, context);
      allCached = allCached && fallback.cached;
      if (part.node.isConnected && sourceForNode(part.node) === part.source) {
        rememberTranslation(part.node, part.source, fallback.text, language, provider, context);
      }
    }
    return allCached;
  }

  function translationVariant() {
    return [settings.provider, settings.language, providerCacheVariant(settings.provider)].join("\n");
  }

  async function runJobs(jobs, options) {
    const manual = !!(options && options.manual);
    if (clearSourceLanguageTranslationState()) return { outcome: "source", failedJobs: 0 };
    if (!manual && autoBlockedVariant === translationVariant()) return { outcome: "blocked", failedJobs: 0 };
    if (running) {
      if (manual && abortController) abortController.abort();
      else pendingAutoRun = true;
      return { outcome: "busy", failedJobs: 0 };
    }
    if (!jobs.length) {
      setTranslationStatus((text) => text.alreadyTranslated);
      return { outcome: "complete", failedJobs: 0 };
    }
    // Own the queue throughout every asynchronous preflight and worker.
    const runAbortController = new AbortController();
    running = true;
    abortController = runAbortController;
    setMainButton("Cancel");
    retryButton.disabled = true;
    let result = { outcome: "failed", failedJobs: jobs.length };
    try {
      result = await runReservedJobs(jobs, manual, runAbortController);
    } catch (error) {
      setTranslationStatus((text) => error?.name === "AbortError" ? text.translationCancelled : text.connectionFailed);
      result = { outcome: error?.name === "AbortError" ? "cancelled" : "failed", failedJobs: jobs.length };
    } finally {
      running = false;
      abortController = null;
      setMainButton("Translate");
      retryButton.disabled = !lastFailedJobs.length;
      clearSourceLanguageTranslationState();
      refreshCacheStats();
      if (pendingAutoRun) {
        pendingAutoRun = false;
        if (autoBlockedVariant !== translationVariant()) scheduleAutoTranslation(250);
      }
    }
    return result;
  }

  async function runReservedJobs(jobs, manual, runAbortController) {
    const needsSiteTranslationConfig = providerUsesOpenAICompatible(settings.provider)
      && settings.language !== SOURCE_LANGUAGE
      && !siteTranslationConfig(settings.language);
    if (needsSiteTranslationConfig) {
      await ensureSiteTranslationConfig(settings.language);
    }
    throwIfAborted(runAbortController.signal);
    if (clearSourceLanguageTranslationState()) return;
    if (providerUsesOpenAICompatible(settings.provider)) {
      const connection = openAICompatibleConnection();
      const status = openAICompatibleStatus && openAICompatibleStatus.preset === connection.preset
        && openAICompatibleStatus.baseURL === connection.baseURL
        ? openAICompatibleStatus : await refreshOpenAICompatibleStatus();
      throwIfAborted(runAbortController.signal);
      if (!status) {
        setStatus("Configure the OpenAI-compatible provider first");
        return { outcome: "failed", failedJobs: jobs.length };
      }
      if (status.requiresKey && !status.configured) {
        setStatus(interfacePreset().keyMissing);
        return { outcome: "failed", failedJobs: jobs.length };
      }
      if (!connection.model) {
        setStatus(interfacePreset().modelRequired);
        return { outcome: "failed", failedJobs: jobs.length };
      }
    }
    const originalJobCount = jobs.length;
    if (providerUsesOpenAICompatible(settings.provider)) jobs = core.batchScreenJobs(jobs, PROVIDERS[settings.provider].contextLimit);
    autoBlockedVariant = null;
    const runVariant = translationVariant();
    let queueStopped = false;
    const started = performance.now();
    const metrics = {
      screen_id: randomHexId(), mode: manual ? "manual" : "auto",
      jobs: originalJobCount, requests_planned: jobs.length, helper_requests: 0,
      batch_requests: 0, batch_fallbacks: 0, cache_hits: 0, max_queue_wait_ms: 0,
      usage_requests: 0, costed_requests: 0, input_tokens: 0, output_tokens: 0,
      total_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0,
      reported_cost_usd: null, first_apply_ms: null, first_story_ms: null
    };
    const context = { metrics, started, signal: runAbortController.signal,
      connection: openAICompatibleConnection(), variant: runVariant };
    const measureOpenAI = providerUsesOpenAICompatible(settings.provider);
    const report = (phase, extra = {}) => measureOpenAI
      && requestLocalHelper("/v1/translation-metrics", { body: { phase, ...metrics, ...extra } }).catch(() => {});
    let outcome = "complete";
    const language = settings.language;
    const provider = settings.provider;
    let nextIndex = 0;
    let done = 0;
    let lastErrorCode = "";
    let lastError = null;

    async function worker() {
      while (!queueStopped) {
        if (runVariant !== translationVariant()) return;
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        const job = jobs[index];
        metrics.max_queue_wait_ms = Math.max(metrics.max_queue_wait_ms, Math.round(performance.now() - started));
        try {
          await applyJobTranslation(job, language, provider, context.signal, (error, delay, nextAttempt, attempts) => {
            if (!queueStopped) setTranslationStatus((text) => formatMessage(text.retryWaiting, {
              reason: translationErrorText(error, text), seconds: Math.ceil(delay / 1000),
              attempt: nextAttempt, attempts
            }));
          }, context);
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
          lastErrorCode = error && error.code ? error.code : lastErrorCode;
          if (!queueStopped) lastError = error;
          lastFailedJobs.push(...(error.failedJobs || [job]));
          if (lastErrorCode === "openai_rate_limited"
              || lastErrorCode === "openai_key_invalid"
              || lastErrorCode === "openai_model_unavailable"
              || lastErrorCode === "unsafe_redirect" || lastErrorCode === "openai_incomplete_translation"
              || ["openai_billing_required", "openai_endpoint_mismatch", "openai_stream_required", "openai_message_format_rejected", "openai_reasoning_unsupported"].includes(lastErrorCode)
              || (lastErrorCode === "openai_request_failed" && Number.isInteger(error.providerStatus)
                && error.providerStatus < 500)) {
            queueStopped = true;
            autoBlockedVariant = runVariant;
            while (nextIndex < jobs.length) {
              lastFailedJobs.push(jobs[nextIndex]);
              nextIndex += 1;
            }
            return;
          }
        }
        done += 1;
        if (!queueStopped) setTranslationStatus((text) => formatMessage(text.progress, { done, total: jobs.length }));
      }
    }

    try {
      report("start");
      setMainButton("Cancel");
      retryButton.disabled = true;
      setTranslationStatus((text) => formatMessage(text.progress, { done: 0, total: jobs.length }));
      lastFailedJobs = [];
      const concurrency = providerUsesOpenAICompatible(provider)
        ? context.connection.concurrency
        : PROVIDERS[provider].concurrency;
      const count = Math.min(concurrency, jobs.length);
      const workers = await Promise.allSettled(Array.from({ length: count }, () => worker()));
      const rejected = workers.find(result => result.status === "rejected");
      if (rejected) throw rejected.reason;
      if (lastFailedJobs.length) {
        outcome = "failed";
        const failedCount = lastFailedJobs.reduce((count, job) => count + (job.batchParts?.length || 1), 0);
        setTranslationStatus((text) => formatMessage(text.translationFailed, {
          reason: translationErrorText(lastError, text), count: failedCount
        }) + (queueStopped ? " " + text.autoPaused : ""));
      } else {
        setStatus("");
      }
    } catch (error) {
      outcome = error?.name === "AbortError" ? "cancelled" : "failed";
      setTranslationStatus((text) => error && error.name === "AbortError" ? text.translationCancelled : text.connectionFailed);
    } finally {
      if (runVariant !== translationVariant()) outcome = "superseded";
      report("result", { outcome, duration_ms: Math.round(performance.now() - started),
        failed_jobs: lastFailedJobs.reduce((count, job) => count + (job.batchParts?.length || 1), 0) });
    }
    return {
      outcome,
      failedJobs: lastFailedJobs.reduce((count, job) => count + (job.batchParts?.length || 1), 0)
    };
  }

  function translateScreen(manual) {
    const isManual = manual !== false;
    if (clearSourceLanguageTranslationState()) return Promise.resolve({ outcome: "source", failedJobs: 0 });
    if (!isManual && autoBlockedVariant === translationVariant()) return Promise.resolve({ outcome: "blocked", failedJobs: 0 });
    if (running) {
      if (isManual && abortController) abortController.abort();
      else pendingAutoRun = true;
      return Promise.resolve({ outcome: "busy", failedJobs: 0 });
    }
    const roots = isManual ? null : takeAutoTranslationRoots();
    if (!isManual && !roots.length) return Promise.resolve({ outcome: "complete", failedJobs: 0 });
    const jobs = buildJobs(collectVisibleTextNodes({
      roots, includeHiddenTooltips: true
    }));
    if (!isManual && !jobs.length) return Promise.resolve({ outcome: "complete", failedJobs: 0 });
    return runJobs(jobs, { manual: isManual });
  }

  function waitForPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function captureTranslatedScreen(batchId, locale, screenshotNumber, sequence, total, gameVersion) {
    const badge = document.createElement("div");
    badge.className = "screenshotLocaleBadge";
    badge.textContent = locale;
    badge.style.cssText = [
      "position:fixed", "left:10px", "top:10px", "z-index:2147483647",
      "padding:5px 10px", "border:1px solid #d7ad54", "border-radius:7px",
      "background:#20131ce6", "color:#fff", "font:600 16px/1.2 Arial,sans-serif",
      "direction:ltr", "pointer-events:none"
    ].join(";");
    panel.hidden = true;
    shadow.appendChild(badge);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await waitForPaint();
      return await requestLocalHelper("/v1/screenshots/capture", {
        body: { batchId, locale, screenshotNumber, sequence, total, translatorVersion: VERSION, gameVersion }
      });
    } finally {
      badge.remove();
      panel.hidden = false;
      await waitForPaint();
    }
  }

  async function captureAllLanguages() {
    const text = interfacePreset();
    if (!LOCAL_BRIDGE || screenshotBatchRunning || running) {
      setStatus(text.screenshotBusy);
      return { outcome: "busy", captured: 0 };
    }
    const screenshotNumber = Number(screenshotNumberInput.value);
    if (!Number.isInteger(screenshotNumber) || screenshotNumber < 1 || screenshotNumber > 999) {
      setStatus(text.screenshotNumberInvalid);
      screenshotNumberInput.focus();
      return { outcome: "failed", captured: 0 };
    }
    screenshotNumberInput.value = String(screenshotNumber);
    const languages = languagesForProvider(settings.provider);
    if (!languages.length) {
      setStatus(text.screenshotFailed.replace("{locale}", settings.language));
      return { outcome: "failed", captured: 0 };
    }
    const batchId = randomHexId();
    const gameVersion = typeof adapter.getGameVersion === "function"
      ? String(adapter.getGameVersion(window) || "") : "";
    const original = {
      language: settings.language,
      mode: settings.mode,
      autoTranslate: settings.autoTranslate,
      languageValue: languageSelect.value,
      autoChecked: autoCheckbox.checked
    };
    const controls = Array.from(shadow.querySelectorAll("button,select,input,textarea"));
    const disabled = new Map(controls.map((control) => [control, control.disabled]));
    let captured = 0;
    let failedLocale = "";
    let outcome = "complete";
    screenshotBatchRunning = true;
    for (const control of controls) control.disabled = true;
    settings.autoTranslate = false;
    autoCheckbox.checked = false;
    pendingAutoRun = false;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = 0;
    }
    try {
      for (let index = 0; index < languages.length; index += 1) {
        const locale = languages[index][0];
        failedLocale = locale;
        setTranslationStatus((preset) => formatMessage(preset.screenshotProgress, {
          done: captured, total: languages.length, locale
        }));
        settings.language = locale;
        settings.mode = "translated";
        languageSelect.value = locale;
        invalidateAppliedTranslations();
        clearSourceLanguageTranslationState();
        applyInterfacePreset();
        const result = await translateScreen(true);
        if (!result || !["complete", "source"].includes(result.outcome) || result.failedJobs) {
          outcome = "failed";
          break;
        }
        await captureTranslatedScreen(batchId, locale, screenshotNumber, index + 1, languages.length, gameVersion);
        captured += 1;
      }
    } catch (_) {
      outcome = "failed";
    } finally {
      settings.language = original.language;
      settings.mode = original.mode;
      settings.autoTranslate = original.autoTranslate;
      languageSelect.value = original.languageValue;
      autoCheckbox.checked = original.autoChecked;
      invalidateAppliedTranslations();
      applyInterfacePreset();
      if (settings.mode === "translated") await translateScreen(true);
      saveSettings();
      screenshotBatchRunning = false;
      for (const [control, wasDisabled] of disabled) control.disabled = wasDisabled;
      screenshotBatchButton.disabled = !LOCAL_BRIDGE;
      syncTranslateTrigger();
      if (settings.autoTranslate) scheduleAutoTranslation(50);
    }
    if (captured > 0) {
      try {
        await requestLocalHelper("/v1/screenshots/finish", {
          body: {
            batchId, outcome, captured, expected: languages.length, settingsRestored: true
          }
        });
        await requestLocalHelper("/v1/screenshots/open", { body: { batchId } });
      } catch (_) {
        outcome = "failed";
      }
    }
    if (outcome === "complete") {
      setTranslationStatus((preset) => formatMessage(preset.screenshotComplete, { count: captured }));
    } else {
      setTranslationStatus((preset) => formatMessage(preset.screenshotFailed, { locale: failedLocale }));
    }
    return { outcome, captured, batchId, failedLocale, screenshotNumber };
  }

  function retryFailed() {
    if (clearSourceLanguageTranslationState()) return;
    if (running || !lastFailedJobs.length) return;
    // Rebuild from current nodes: a game screen may have changed after failure.
    const nodes = lastFailedJobs.flatMap((job) => job.nodes).filter((node) => node.isConnected);
    const jobs = buildJobs(Array.from(new Set(nodes)));
    if (!jobs.length) {
      lastFailedJobs = [];
      retryButton.disabled = true;
      setStatus("");
      return;
    }
    return runJobs(jobs, { manual: true });
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
      if (clearSourceLanguageTranslationState()) return;
      const loading = document.getElementById("loading");
      if (loading && isElementOnScreen(loading)) {
        scheduleAutoTranslation(1000);
        return;
      }
      const roots = takeAutoTranslationRoots();
      if (!roots.length) return;
      reapplyKnownTranslations(roots);
      for (const root of roots) pendingTranslationRoots.add(root);
      if (settings.autoTranslate && settings.mode === "translated") translateScreen(false);
    }, Number(delay) || 350);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }

  function renderStorageStats(cacheBytes) {
    const text = interfacePreset();
    const logSize = localLogBytes === null ? "—" : formatBytes(localLogBytes);
    cacheStatsElement.textContent = `${text.cache}: ${formatBytes(cacheBytes)} · ${text.log}: ${logSize}`;
    cacheCopyButton.disabled = !LOCAL_BRIDGE || !(localLogBytes > 0);
  }

  async function refreshCacheStats(refreshLog) {
    const logRequest = refreshLog !== false && LOCAL_BRIDGE
      ? requestLocalHelper("/v1/log/status", { body: {} })
      : null;
    const stats = await cacheStats();
    if (logRequest) {
      try {
        const log = await logRequest;
        localLogBytes = Number.isFinite(log.bytes) ? Math.max(0, log.bytes) : null;
      } catch (_) {
        localLogBytes = null;
      }
    }
    renderStorageStats(stats.bytes);
  }

  async function copyTextToClipboard(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.cssText = "position:fixed;left:-9999px;top:0";
    document.documentElement.appendChild(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) {}
    input.remove();
    return copied;
  }

  async function copyLocalLog() {
    const text = interfacePreset();
    if (!LOCAL_BRIDGE) {
      setStatus(text.logCopyFailed);
      return;
    }
    cacheCopyButton.disabled = true;
    try {
      const log = await requestLocalHelper("/v1/log/read", { body: {} });
      localLogBytes = Number.isFinite(log.bytes) ? Math.max(0, log.bytes) : localLogBytes;
      const copied = await copyTextToClipboard(String(log.content || ""));
      renderStorageStats((await cacheStats()).bytes);
      setStatus(copied ? (log.truncated ? text.logTailCopied : text.logCopied) : text.logCopyFailed);
    } catch (_) {
      setStatus(text.logCopyFailed);
    } finally {
      cacheCopyButton.disabled = !LOCAL_BRIDGE || !(localLogBytes > 0);
    }
  }

  async function deleteTranslationCache() {
    const text = interfacePreset();
    if (!confirm(text.deleteConfirm)) return;
    cacheDeleteButton.disabled = true;
    cacheCopyButton.disabled = true;
    try {
      const cacheDeleted = await clearAllCache();
      let logDeleted = !LOCAL_BRIDGE;
      if (LOCAL_BRIDGE) {
        try {
          await requestLocalHelper("/v1/log/clear", { body: { accepted: true } });
          localLogBytes = 0;
          logDeleted = true;
        } catch (_) {
          localLogBytes = null;
        }
      }
      await refreshCacheStats();
      setStatus(cacheDeleted && logDeleted ? text.cacheDeleted : text.cacheDeleteFailed);
    } finally {
      cacheDeleteButton.disabled = false;
      cacheCopyButton.disabled = !LOCAL_BRIDGE || !(localLogBytes > 0);
    }
  }

  const host = document.createElement("div");
  host.id = `vnrevival-translator-${game.id}`;
  host.style.cssText = "position:fixed;z-index:2147483647;top:14px;right:14px;pointer-events:auto";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = panelView.render({
    theme: game.theme,
    siteURL: SITE_URL,
    siteName: SITE_NAME,
    maxSystemPromptChars: OPENAI_COMPATIBLE_MAX_SYSTEM_PROMPT_CHARS,
    maxGlossaryChars: OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS
  });
  document.documentElement.appendChild(host);

  // Shadow DOM retargets panel events to the host, but does not stop them from
  // bubbling into document-level game handlers. Keep every panel interaction
  // inside the translator so a select or key press cannot activate the game UI.
  for (const eventType of [
    "pointerdown", "pointerup", "pointermove", "pointerover", "pointerout",
    "mousedown", "mouseup", "mousemove", "click", "dblclick", "contextmenu",
    "touchstart", "touchmove", "touchend", "touchcancel",
    "keydown", "keyup", "keypress", "beforeinput", "input", "change",
    "focusin", "focusout"
  ]) {
    host.addEventListener(eventType, (event) => event.stopPropagation());
  }

  const panel = shadow.querySelector(".panel");
  const collapseButton = shadow.querySelector(".collapseToggle");
  const mainButton = shadow.querySelector(".translate");
  const mainButtonAction = shadow.querySelector(".translateAction");
  const retryButton = shadow.querySelector(".retry");
  const screenshotBatchButton = shadow.querySelector(".screenshotBatch");
  const screenshotNumberInput = shadow.querySelector(".screenshotNumber");
  const statusElement = shadow.querySelector(".status");
  const languageSelect = shadow.querySelector(".language");
  const interfaceTranslationCheckbox = shadow.querySelector(".interfaceTranslation");
  const providerSelect = shadow.querySelector(".provider");
  const providerHint = shadow.querySelector(".providerHint");
  const openAICompatibleBox = shadow.querySelector(".openAICompatibleBox");
  const openAICompatiblePresetSelect = shadow.querySelector(".openAICompatiblePreset");
  const openAICompatibleBaseURLInput = shadow.querySelector(".openAICompatibleBaseURL");
  const openAICompatibleModelSelect = shadow.querySelector(".openAICompatibleModel");
  const modelHelpLink = shadow.querySelector(".modelHelpLink");
  const openAICompatibleReasoningEffortSelect = shadow.querySelector(".openAICompatibleReasoningEffort");
  const openAICompatibleConcurrencySelect = shadow.querySelector(".openAICompatibleConcurrency");
  const openAICompatibleAdvancedToggleButton = shadow.querySelector(".openAICompatibleAdvancedToggle");
  const openAICompatibleAdvanced = shadow.querySelector(".openAICompatibleAdvanced");
  const openAICompatiblePromptToggleButton = shadow.querySelector(".openAICompatiblePromptToggle");
  const openAICompatiblePromptEditor = shadow.querySelector(".openAICompatiblePromptEditor");
  const openAICompatiblePromptInput = shadow.querySelector(".openAICompatiblePrompt");
  const openAICompatiblePromptResetButton = shadow.querySelector(".openAICompatiblePromptReset");
  const openAICompatibleGlossaryToggleButton = shadow.querySelector(".openAICompatibleGlossaryToggle");
  const openAICompatibleGlossaryEditor = shadow.querySelector(".openAICompatibleGlossaryEditor");
  const openAICompatibleSiteGlossaryInput = shadow.querySelector(".openAICompatibleSiteGlossary");
  const siteGlossaryLabel = shadow.querySelector(".siteGlossaryLabel");
  const siteGlossaryStatus = shadow.querySelector(".siteGlossaryStatus");
  const localGlossaryLabel = shadow.querySelector(".localGlossaryLabel");
  const openAICompatibleGlossaryInput = shadow.querySelector(".openAICompatibleGlossary");
  const openAICompatibleKeyInput = shadow.querySelector(".openAICompatibleKey");
  const keyState = shadow.querySelector(".keyState");
  const keyEditButton = shadow.querySelector(".keyEdit");
  const endpointField = shadow.querySelector(".endpointField");
  const autoCheckbox = shadow.querySelector(".auto");
  const cacheStatsElement = shadow.querySelector(".cacheStats");
  const cacheCopyButton = shadow.querySelector(".cacheCopy");
  const cacheDeleteButton = shadow.querySelector(".cacheDelete");
  const compatibilityBox = shadow.querySelector(".compat");

  for (const provider of PROVIDER_LIST) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.appendChild(option);
  }
  providerSelect.value = settings.provider;
  populateLanguageOptions(settings.provider, settings.language);
  interfaceTranslationCheckbox.checked = settings.translateInterface;
  autoCheckbox.checked = settings.autoTranslate;
  syncTranslateTrigger();
  updateCollapsedState();

  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    host.style.left = Math.max(0, Math.min(innerWidth - panel.getBoundingClientRect().width, settings.x)) + "px";
    host.style.top = Math.max(0, Math.min(innerHeight - 44, settings.y)) + "px";
    host.style.right = "auto";
  }

  function interfacePreset() {
    if (!settings.translateInterface) return INTERFACE_PRESETS.en;
    return INTERFACE_PRESETS[settings.language] || INTERFACE_PRESETS.en;
  }
  function applyInterfacePreset() {
    const text = interfacePreset();
    const presetLocale = settings.translateInterface && INTERFACE_PRESETS[settings.language]
      ? settings.language : "en";
    panel.lang = presetLocale;
    panel.dir = ["ar", "fa", "he"].includes(presetLocale) ? "rtl" : "ltr";
    shadow.querySelector(".quickLanguageLabel").textContent = text.language;
    interfaceTranslationCheckbox.title = text.interfaceToggleTitle;
    setMainButton(running ? "Cancel" : "Translate");
    shadow.querySelector(".interfaceTranslationLabel").textContent = text.interfaceLabel;
    shadow.querySelector(".endpointLabel").textContent = text.endpoint;
    openAICompatibleKeyInput.placeholder = text.keyPlaceholder;
    keyEditButton.textContent = text.changeKey;
    syncKeyState();
    retryButton.textContent = text.retryFailed;
    retryButton.title = text.retryTitle;
    screenshotBatchButton.textContent = text.screenshotAll;
    screenshotBatchButton.title = text.screenshotTitle;
    screenshotNumberInput.title = text.screenshotNumberTitle;
    screenshotNumberInput.setAttribute("aria-label", text.screenshotNumberTitle);
    if (translationStatus) statusElement.textContent = translationStatus(text);
    shadow.querySelector(".translationServiceLabel").textContent = text.translationService;
    shadow.querySelector(".modelHelpQuestion").textContent = text.modelHelpQuestion;
    shadow.querySelector(".modelHelpLink").textContent = text.howItWorks;
    shadow.querySelector(".openAICompatibleParameterTitle").textContent = text.modelParameters;
    shadow.querySelector(".reasoningEffortLabel").textContent = text.reasoningEffort;
    shadow.querySelector(".parallelRequestsLabel").textContent = text.parallelRequests;
    const reasoningLabels = {
      "": text.providerDefault, none: text.none, minimal: text.minimal, low: text.low,
      medium: text.medium, high: text.high, xhigh: text.extraHigh, max: text.maximum
    };
    for (const option of openAICompatibleReasoningEffortSelect.options) {
      option.textContent = reasoningLabels[option.value] || option.textContent;
    }
    openAICompatibleAdvancedToggleButton.textContent = openAICompatibleAdvanced.hidden ? text.advanced : text.hideAdvanced;
    shadow.querySelector(".openAICompatibleAdvancedNotice").textContent = text.cacheNotice;
    openAICompatiblePromptToggleButton.textContent = openAICompatiblePromptEditor.hidden ? text.systemPrompt : text.hideSystemPrompt;
    shadow.querySelector(".systemPromptLabel").textContent = text.systemPrompt;
    openAICompatiblePromptResetButton.textContent = text.restoreDefault;
    openAICompatibleGlossaryToggleButton.textContent = openAICompatibleGlossaryEditor.hidden ? text.glossary : text.hideGlossary;
    siteGlossaryLabel.textContent = text.siteGlossary;
    localGlossaryLabel.textContent = text.localGlossary;
    openAICompatibleGlossaryInput.placeholder = text.glossaryPlaceholder;
    syncSiteGlossaryDisplay(text);
    shadow.querySelector(".autoTitle").textContent = text.autoTranslate;
    const autoState = shadow.querySelector(".autoState");
    autoState.dataset.on = text.on;
    autoState.dataset.off = text.off;
    cacheCopyButton.textContent = text.copyLog;
    cacheDeleteButton.textContent = text.delete;
    openAICompatiblePresetSelect.title = text.presetTitle;
    openAICompatibleBaseURLInput.title = text.baseURLTitle;
    openAICompatibleKeyInput.title = text.keyTitle;
    openAICompatibleModelSelect.title = text.modelTitle;
    syncReasoningEffortOptions();
    openAICompatibleConcurrencySelect.title = text.parallelTitle;
    openAICompatibleAdvancedToggleButton.title = text.advancedTitle;
    openAICompatiblePromptToggleButton.title = text.promptTitle;
    openAICompatiblePromptResetButton.title = text.resetTitle;
    openAICompatiblePromptInput.title = text.promptInputTitle;
    openAICompatibleGlossaryToggleButton.title = text.glossaryTitle;
    openAICompatibleSiteGlossaryInput.title = text.siteGlossaryTitle;
    openAICompatibleGlossaryInput.title = text.glossaryInputTitle;
    shadow.querySelector(".autoToggle").title = text.autoTitle;
    cacheCopyButton.title = text.copyLogTitle;
    cacheDeleteButton.title = text.cacheDeleteTitle;
    populateOpenAICompatibleModelOptions(openAICompatibleModels, openAICompatibleConnection().model);
    updateCollapsedState();
  }
  function setStatus(text) { translationStatus = null; statusElement.textContent = text; }
  function setTranslationStatus(render) {
    translationStatus = render;
    statusElement.textContent = render(interfacePreset());
  }
  function formatMessage(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => values[key] === undefined ? match : String(values[key]));
  }
  function translationErrorText(error, text) {
    const key = {
      openai_reasoning_unsupported: "reasoningUnsupported",
      openai_rate_limited: "rateLimited", openai_key_invalid: "keyRejected",
      openai_model_unavailable: "modelUnavailable", openai_billing_required: "billingRequired",
      openai_format_invalid: "formatInvalid", openai_invalid_response: "formatInvalid",
      openai_incomplete_translation: "formatInvalid",
      openai_empty_translation: "formatInvalid", openai_unavailable: "connectionFailed"
    }[error && error.code];
    if (key) return text[key];
    if (error && Number.isInteger(error.providerStatus)) {
      return formatMessage(text.requestRejected, { status: error.providerStatus });
    }
    return text.requestFailed;
  }
  function setMainButton(text) {
    const preset = interfacePreset();
    const localized = text === "Cancel" ? preset.cancel : preset.translate;
    mainButtonAction.textContent = localized;
    mainButton.setAttribute("aria-label", `${localized} (Ctrl+Shift+T)`);
    screenshotBatchButton.disabled = screenshotBatchRunning || running || !LOCAL_BRIDGE;
  }
  function syncTranslateTrigger() {
    mainButton.hidden = autoCheckbox.checked;
    mainButton.parentElement.hidden = autoCheckbox.checked;
  }
  function updateCollapsedState() {
    panel.classList.toggle("collapsed", settings.collapsed);
    collapseButton.textContent = settings.collapsed ? "+" : "−";
    const preset = interfacePreset();
    collapseButton.title = settings.collapsed ? preset.expand : preset.collapse;
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.setAttribute("aria-expanded", String(!settings.collapsed));
  }
  function languagesForProvider(provider) {
    const selectedProvider = PROVIDERS[provider];
    if (!selectedProvider) return [];
    return LANGUAGES.filter(([code]) => selectedProvider.supportsLanguage(code));
  }
  function populateLanguageOptions(provider, preferredLanguage) {
    const previous = preferredLanguage || languageSelect.value || settings.language;
    const available = languagesForProvider(provider);
    languageSelect.replaceChildren();
    for (const [code, name, nativeName] of available) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = nativeName && nativeName !== name ? `${name} (${nativeName})` : name;
      languageSelect.appendChild(option);
    }
    const fallback = available.some(([code]) => code === defaults.language) ? defaults.language : (available[0] && available[0][0]);
    languageSelect.value = available.some(([code]) => code === previous) ? previous : (fallback || "");
    languageSelect.disabled = openAICompatibleBusy || !available.length;
    return languageSelect.value !== previous;
  }
  function persistControlSettings() {
    const languageChanged = settings.language !== languageSelect.value;
    const providerChanged = settings.provider !== providerSelect.value;
    settings.language = languageSelect.value;
    settings.translateInterface = interfaceTranslationCheckbox.checked;
    settings.provider = providerSelect.value;
    if (settings.autoTranslate !== autoCheckbox.checked) autoBlockedVariant = null;
    settings.autoTranslate = autoCheckbox.checked;
    syncTranslateTrigger();
    if (languageChanged || providerChanged) invalidateAppliedTranslations();
    if (languageChanged && translationTargetsSourceLanguage() && abortController) abortController.abort();
    clearSourceLanguageTranslationState();
    saveSettings();
    if ((languageChanged || providerChanged) && providerUsesOpenAICompatible(settings.provider)
        && settings.language !== SOURCE_LANGUAGE) {
      void ensureSiteTranslationConfig(settings.language);
    }
    if (settings.autoTranslate) scheduleAutoTranslation(50);
  }
  function setOpenAICompatibleBusy(busy, keepModelPickerEnabled = false) {
    openAICompatibleBusy = busy;
    for (const control of [
      openAICompatiblePresetSelect, openAICompatibleBaseURLInput,
      openAICompatibleReasoningEffortSelect,
      openAICompatibleConcurrencySelect,
      openAICompatibleKeyInput
    ]) control.disabled = busy || !LOCAL_BRIDGE;
    const missingRequiredKey = !!(openAICompatibleStatus
      && openAICompatibleStatus.requiresKey && !openAICompatibleStatus.configured);
    openAICompatibleModelSelect.disabled = (busy && !keepModelPickerEnabled)
      || !LOCAL_BRIDGE || missingRequiredKey;
    if (!busy && LOCAL_BRIDGE && openAICompatiblePresetSelect.value !== "custom") {
      openAICompatibleBaseURLInput.disabled = true;
    }
    syncKeyState();
    languageSelect.disabled = busy || !languageSelect.options.length;
    providerSelect.disabled = busy;
  }
  function syncKeyState() {
    const text = interfacePreset();
    const configured = !!(openAICompatibleStatus && openAICompatibleStatus.configured);
    keyState.textContent = openAICompatibleBusy ? text.keyChecking : configured ? text.keySaved
      : openAICompatibleStatus ? (openAICompatibleStatus.requiresKey ? text.keyMissing : text.keyOptional)
      : text.keyUnknown;
    keyEditButton.hidden = !configured || editingOpenAIKey;
    keyEditButton.disabled = openAICompatibleBusy || !LOCAL_BRIDGE;
    openAICompatibleKeyInput.hidden = configured && !editingOpenAIKey;
  }
  function syncReasoningEffortOptions(connection = openAICompatibleConnection()) {
    const supported = OPENAI_CONFIG.modelReasoningEfforts[connection.preset]?.[connection.model];
    for (const option of openAICompatibleReasoningEffortSelect.options) {
      const unavailable = !!(supported && option.value && !supported.includes(option.value));
      option.hidden = unavailable;
      option.disabled = unavailable;
    }
    const effective = connection.modelParameters.reasoningEffort;
    openAICompatibleReasoningEffortSelect.value = effective;
    openAICompatibleReasoningEffortSelect.title = supported ? interfacePreset().reasoningRequiredTitle : interfacePreset().reasoningTitle;
    if (settings.openAICompatibleReasoningEffort !== effective) {
      settings.openAICompatibleReasoningEffort = effective;
      saveSettings();
    }
  }
  function syncSiteGlossaryDisplay(text = interfacePreset()) {
    const language = settings.language;
    const config = siteTranslationConfig(language);
    openAICompatibleSiteGlossaryInput.value = config?.glossary || "";
    const loading = siteTranslationConfigPromises.has(language);
    openAICompatibleSiteGlossaryInput.setAttribute("aria-busy", String(loading));
    if (language === SOURCE_LANGUAGE) siteGlossaryStatus.textContent = text.siteGlossarySourceLanguage;
    else if (config) siteGlossaryStatus.textContent = formatMessage(text.siteGlossaryLoaded, { count: config.entries });
    else if (loading) siteGlossaryStatus.textContent = text.siteGlossaryLoading;
    else if (siteTranslationConfigFailures.has(language)) siteGlossaryStatus.textContent = text.siteGlossaryUnavailable;
    else siteGlossaryStatus.textContent = text.siteGlossaryNotLoaded;
  }
  function syncOpenAICompatibleInputs() {
    const connection = openAICompatibleConnection();
    openAICompatiblePresetSelect.value = connection.preset;
    if (connection.preset === "custom") {
      openAICompatibleBox.insertBefore(endpointField, openAICompatibleModelSelect);
    } else {
      openAICompatibleAdvanced.insertBefore(endpointField, openAICompatibleAdvanced.firstChild);
    }
    syncKeyState();
    openAICompatibleBaseURLInput.value = connection.baseURL;
    openAICompatibleBaseURLInput.disabled = openAICompatibleBusy || !LOCAL_BRIDGE || connection.preset !== "custom";
    populateOpenAICompatibleModelOptions(openAICompatibleModels, connection.model);
    syncReasoningEffortOptions(connection);
    openAICompatibleConcurrencySelect.value = String(connection.concurrency);
    openAICompatiblePromptInput.value = connection.systemPrompt;
    syncSiteGlossaryDisplay();
    openAICompatibleGlossaryInput.value = connection.userGlossary;
  }
  function populateOpenAICompatibleModelOptions(models, selectedModel) {
    const selected = String(selectedModel || "").trim();
    const sortedModels = sortedOpenAICompatibleModels(models);
    openAICompatibleModelSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    const interfaceText = interfacePreset();
    placeholder.textContent = interfaceText.chooseModel;
    openAICompatibleModelSelect.appendChild(placeholder);
    for (const model of sortedModels) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = isFreeOpenAICompatibleModel(model) ? `${interfaceText.freeModel} · ${model}` : model;
      openAICompatibleModelSelect.appendChild(option);
    }
    if (selected && !sortedModels.includes(selected)) {
      const customOption = document.createElement("option");
      customOption.value = selected;
      customOption.textContent = selected;
      openAICompatibleModelSelect.appendChild(customOption);
    }
    const manualOption = document.createElement("option");
    manualOption.value = OPENAI_COMPATIBLE_MANUAL_MODEL_VALUE;
    manualOption.textContent = interfaceText.enterModel;
    openAICompatibleModelSelect.appendChild(manualOption);
    openAICompatibleModelSelect.value = selected || "";
  }
  function applyOpenAICompatibleSettings(next) {
    const preset = hasOwn(OPENAI_COMPATIBLE_PRESETS, next.preset)
      ? next.preset : defaults.openAICompatiblePreset;
    const baseURL = preset === "custom"
      ? String(next.baseURL || "").trim().slice(0, 2048)
      : OPENAI_COMPATIBLE_PRESETS[preset].baseURL;
    const model = String(next.model || "").trim().slice(0, 512);
    const enteredSystemPrompt = hasOwn(next, "systemPrompt")
      ? String(next.systemPrompt || "").trim().slice(0, OPENAI_COMPATIBLE_MAX_SYSTEM_PROMPT_CHARS)
      : settings.openAICompatibleSystemPrompt;
    const systemPrompt = enteredSystemPrompt === siteDefaultSystemPrompt()
      ? OPENAI_COMPATIBLE_DEFAULT_SYSTEM_PROMPT : enteredSystemPrompt;
    const connectionChanged = settings.openAICompatiblePreset !== preset
      || settings.openAICompatibleBaseURL !== baseURL;
    const endpointChanged = connectionChanged || settings.openAICompatibleModel !== model;
    const promptChanged = settings.openAICompatibleSystemPrompt !== systemPrompt;
    settings.openAICompatiblePreset = preset;
    settings.openAICompatibleBaseURL = baseURL;
    settings.openAICompatibleModel = model;
    settings.openAICompatibleSystemPrompt = systemPrompt || defaults.openAICompatibleSystemPrompt;
    if (endpointChanged || promptChanged) {
      if (connectionChanged) {
        openAICompatibleStatus = null;
        editingOpenAIKey = false;
        openAICompatibleKeyInput.value = "";
      }
      invalidateAppliedTranslations();
      saveSettings();
    }
    syncOpenAICompatibleInputs();
  }
  function applyOpenAICompatibleGlossary(value) {
    const glossary = String(value || "").trim().slice(0, OPENAI_COMPATIBLE_MAX_GLOSSARY_CHARS);
    if (settings.openAICompatibleGlossary === glossary) return;
    const siteGlossary = String(siteTranslationConfig()?.glossary || "").trim();
    const previous = mergeGlossaryLayers(siteGlossary, settings.openAICompatibleGlossary);
    settings.openAICompatibleGlossary = glossary;
    const effective = mergeGlossaryLayers(siteGlossary, glossary);
    pruneAppliedNodes();
    for (const node of appliedNodes) {
      sourceForNode(node); // Discard a record if the game has already changed this node.
      const record = applied.get(node);
      if (!record) continue;
      const source = record.dependencySource || record.source;
      if (providerUsesOpenAICompatible(record.provider)
          && core.selectGlossary(source, previous) !== core.selectGlossary(source, effective)) {
        writeNode(node, record.source);
        applied.delete(node);
        appliedNodes.delete(node);
      }
    }
    refreshLanguageFormatting();
    saveSettings();
    syncOpenAICompatibleInputs();
  }
  function applyOpenAICompatibleModelParameters(next) {
    const reasoningEffort = normalizedOpenAICompatibleChoice(
      next.reasoningEffort,
      OPENAI_COMPATIBLE_REASONING_EFFORTS,
      settings.openAICompatibleReasoningEffort
    );
    const changed = settings.openAICompatibleReasoningEffort !== reasoningEffort;
    settings.openAICompatibleReasoningEffort = reasoningEffort;
    if (changed) {
      invalidateAppliedTranslations();
      saveSettings();
    }
    syncOpenAICompatibleInputs();
  }
  function applyOpenAICompatibleConcurrency(value) {
    const concurrency = normalizedOpenAICompatibleConcurrency(value);
    if (settings.openAICompatibleConcurrency !== concurrency) {
      settings.openAICompatibleConcurrency = concurrency;
      saveSettings();
    }
    syncOpenAICompatibleInputs();
  }
  async function refreshOpenAICompatibleStatus({ fromModelPicker = false } = {}) {
    if (!providerUsesOpenAICompatible(providerSelect.value)) {
      openAICompatibleBox.hidden = true;
      return openAICompatibleStatus;
    }
    openAICompatibleBox.hidden = false;
    if (!fromModelPicker) {
      syncOpenAICompatibleInputs();
      openAICompatibleKeyInput.value = "";
      openAICompatibleModels = [];
      populateOpenAICompatibleModelOptions([], openAICompatibleConnection().model);
    }
    if (!LOCAL_BRIDGE) {
      openAICompatibleStatus = null;
      setStatus(`The local translation helper is not running. Restart the game through ${PRODUCT_NAME}.`);
      setOpenAICompatibleBusy(false);
      return null;
    }
    setOpenAICompatibleBusy(true, fromModelPicker);
    try {
      const connection = openAICompatibleConnection();
      openAICompatibleStatus = await requestLocalHelper("/v1/openai-compatible/status", {
        body: { preset: connection.preset, baseURL: connection.baseURL }
      });
      openAICompatibleModels = sortedOpenAICompatibleModels(openAICompatibleStatus.models);
      populateOpenAICompatibleModelOptions(openAICompatibleModels, connection.model);
      return openAICompatibleStatus;
    } catch (error) {
      openAICompatibleStatus = null;
      setStatus(error && error.message ? error.message : "Could not check the OpenAI-compatible provider");
      return null;
    } finally {
      setOpenAICompatibleBusy(false);
    }
  }
  function updateProviderHint() {
    const selectedProvider = PROVIDERS[providerSelect.value];
    populateLanguageOptions(providerSelect.value, languageSelect.value || settings.language);
    if (providerUsesOpenAICompatible(providerSelect.value)) {
      providerHint.textContent = selectedProvider.hint(languageSelect.options.length);
      refreshOpenAICompatibleStatus();
    } else {
      openAICompatibleBox.hidden = true;
      providerHint.textContent = selectedProvider ? selectedProvider.hint(languageSelect.options.length) : "";
    }
  }

  updateProviderHint();
  applyInterfacePreset();
  refreshCacheStats();

  mainButton.addEventListener("click", () => translateScreen(true));
  retryButton.addEventListener("click", retryFailed);
  screenshotBatchButton.addEventListener("click", () => { void captureAllLanguages(); });
  collapseButton.addEventListener("click", () => {
    settings.collapsed = !settings.collapsed;
    updateCollapsedState();
    saveSettings();
  });
  providerSelect.addEventListener("change", () => {
    updateProviderHint();
    persistControlSettings();
    applyInterfacePreset();
    refreshCacheStats();
  });
  languageSelect.addEventListener("change", () => {
    persistControlSettings();
    applyInterfacePreset();
    refreshCacheStats(false);
  });
  interfaceTranslationCheckbox.addEventListener("change", () => {
    settings.translateInterface = interfaceTranslationCheckbox.checked;
    saveSettings();
    applyInterfacePreset();
    refreshCacheStats(false);
  });
  autoCheckbox.addEventListener("change", () => {
    persistControlSettings();
  });
  cacheCopyButton.addEventListener("click", copyLocalLog);
  cacheDeleteButton.addEventListener("click", deleteTranslationCache);
  openAICompatiblePresetSelect.addEventListener("change", async () => {
    const preset = openAICompatiblePresetSelect.value;
    applyOpenAICompatibleSettings({
      preset,
      baseURL: OPENAI_COMPATIBLE_PRESETS[preset] ? OPENAI_COMPATIBLE_PRESETS[preset].baseURL : "",
      model: ""
    });
    await refreshOpenAICompatibleStatus();
  });
  openAICompatibleBaseURLInput.addEventListener("change", async () => {
    applyOpenAICompatibleSettings({
      preset: "custom", baseURL: openAICompatibleBaseURLInput.value, model: ""
    });
    await refreshOpenAICompatibleStatus();
  });
  openAICompatibleModelSelect.addEventListener("pointerdown", () => {
    if (!openAICompatibleBusy && !openAICompatibleModelSelect.disabled) {
      void refreshOpenAICompatibleStatus({ fromModelPicker: true });
    }
  });
  modelHelpLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void requestLocalHelper("/v1/vnrevival/open-game-page", {
      body: { gameSlug: game.siteSlug }
    }).catch(() => setStatus(interfacePreset().browserOpenFailed));
  });
  openAICompatibleModelSelect.addEventListener("change", () => {
    const connection = openAICompatibleConnection();
    if (openAICompatibleStatus && openAICompatibleStatus.requiresKey
        && !openAICompatibleStatus.configured) {
      populateOpenAICompatibleModelOptions(openAICompatibleModels, connection.model);
      setStatus(interfacePreset().keyMissing);
      return;
    }
    let model = openAICompatibleModelSelect.value;
    if (model === OPENAI_COMPATIBLE_MANUAL_MODEL_VALUE) {
      const entered = prompt("Enter the exact model ID", connection.model);
      if (entered === null || !entered.trim()) {
        populateOpenAICompatibleModelOptions(openAICompatibleModels, connection.model);
        return;
      }
      model = entered.trim();
    }
    if (!model) return;
    applyOpenAICompatibleSettings({
      preset: connection.preset,
      baseURL: connection.baseURL,
      model
    });
    setStatus("OpenAI-compatible model selected");
  });
  openAICompatiblePromptInput.addEventListener("change", () => {
    const connection = openAICompatibleConnection();
    applyOpenAICompatibleSettings({
      preset: connection.preset,
      baseURL: connection.baseURL,
      model: connection.model,
      systemPrompt: openAICompatiblePromptInput.value
    });
    setStatus("OpenAI-compatible system prompt saved");
  });
  openAICompatibleReasoningEffortSelect.addEventListener("change", () => {
    applyOpenAICompatibleModelParameters({
      reasoningEffort: openAICompatibleReasoningEffortSelect.value
    });
    setStatus("OpenAI-compatible model parameters saved");
  });
  openAICompatibleConcurrencySelect.addEventListener("change", () => {
    applyOpenAICompatibleConcurrency(openAICompatibleConcurrencySelect.value);
    setStatus("");
  });
  openAICompatibleAdvancedToggleButton.addEventListener("click", () => {
    const expanded = openAICompatibleAdvanced.hidden;
    openAICompatibleAdvanced.hidden = !expanded;
    const text = interfacePreset();
    openAICompatibleAdvancedToggleButton.textContent = expanded ? text.hideAdvanced : text.advanced;
    openAICompatibleAdvancedToggleButton.setAttribute("aria-expanded", String(expanded));
  });
  openAICompatiblePromptToggleButton.addEventListener("click", () => {
    const expanded = openAICompatiblePromptEditor.hidden;
    openAICompatiblePromptEditor.hidden = !expanded;
    const text = interfacePreset();
    openAICompatiblePromptToggleButton.textContent = expanded ? text.hideSystemPrompt : text.systemPrompt;
    openAICompatiblePromptToggleButton.setAttribute("aria-expanded", String(expanded));
  });
  openAICompatibleGlossaryToggleButton.addEventListener("click", () => {
    const expanded = openAICompatibleGlossaryEditor.hidden;
    openAICompatibleGlossaryEditor.hidden = !expanded;
    const text = interfacePreset();
    openAICompatibleGlossaryToggleButton.textContent = expanded ? text.hideGlossary : text.glossary;
    openAICompatibleGlossaryToggleButton.setAttribute("aria-expanded", String(expanded));
  });
  openAICompatibleGlossaryInput.addEventListener("change", () => {
    applyOpenAICompatibleGlossary(openAICompatibleGlossaryInput.value);
    setStatus("");
  });
  openAICompatiblePromptResetButton.addEventListener("click", () => {
    const connection = openAICompatibleConnection();
    applyOpenAICompatibleSettings({
      preset: connection.preset,
      baseURL: connection.baseURL,
      model: connection.model,
      systemPrompt: defaults.openAICompatibleSystemPrompt
    });
    setStatus("Default system prompt restored");
  });
  async function saveOpenAICompatibleKey() {
    if (openAICompatibleBusy) return;
    const apiKey = openAICompatibleKeyInput.value.trim();
    if (!apiKey) {
      setStatus("Enter an API key first.");
      return;
    }
    const connection = openAICompatibleConnection();
    setOpenAICompatibleBusy(true);
    try {
      await requestLocalHelper("/v1/openai-compatible/key", {
        body: { preset: connection.preset, baseURL: connection.baseURL, apiKey }
      });
      openAICompatibleKeyInput.value = "";
      editingOpenAIKey = false;
      autoBlockedVariant = null;
      await refreshOpenAICompatibleStatus();
      setStatus(`${OPENAI_COMPATIBLE_PRESETS[connection.preset].name} API key saved securely`);
    } catch (error) {
      openAICompatibleKeyInput.value = "";
      setStatus(error && error.message ? error.message : "Could not save the API key");
    } finally {
      setOpenAICompatibleBusy(false);
    }
  }
  keyEditButton.addEventListener("click", () => {
    editingOpenAIKey = true;
    syncKeyState();
    openAICompatibleKeyInput.focus();
  });
  openAICompatibleKeyInput.addEventListener("change", () => {
    if (openAICompatibleKeyInput.value.trim()) saveOpenAICompatibleKey();
  });
  openAICompatibleKeyInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveOpenAICompatibleKey();
  });
  let drag = null;
  const bar = shadow.querySelector(".bar");
  bar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, select, input, label")) return;
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
    for (const record of records) {
      for (const node of record.removedNodes || []) releaseRemovedSubtree(node);
    }
    if (selfMutation) return;
    let changed = false;
    for (const record of records) {
      if (record.type === "characterData" && record.target.parentElement) {
        registerTranslationContainers(record.target.parentElement);
        const container = presentationContainerForNode(record.target) || record.target.parentElement;
        if (isElementOnScreen(container)) queueTranslationContainer(container);
        changed = true;
      }
      if (record.type === "attributes" && record.target instanceof Element) {
        registerTranslationContainers(record.target);
        if (isElementOnScreen(record.target)) queueTranslationContainer(record.target);
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
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded"]
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
    if (!settings.autoTranslate || startupChecks > 180) {
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
    captureAllLanguages,
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
  }

  if (document.documentElement && document.body) initializeTranslator();
  else document.addEventListener("DOMContentLoaded", initializeTranslator, { once: true });
})();
