(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CoC2TranslationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GOOGLE_MAX_CHARS = 3500;
  const MYMEMORY_MAX_BYTES = 480;

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  function hasEnglishText(value) {
    const text = normalizeText(value);
    if (text.length < 2 || !/[A-Za-z]/.test(text)) return false;
    if (/^(https?:|file:|www\.|[A-Z]:\\)/i.test(text)) return false;
    if (/^[A-Za-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|js|css|json)$/i.test(text)) return false;
    if (/^[A-F0-9]{8,}$/i.test(text)) return false;
    return true;
  }

  function fingerprint(value) {
    let hash = 0x811c9dc5;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function safeCut(text, proposed) {
    let cut = proposed;
    if (cut > 0 && cut < text.length && /[\uD800-\uDBFF]/.test(text.charAt(cut - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(cut))) cut -= 1;
    return Math.max(1, cut);
  }

  function preferredCut(text, limit) {
    const window = text.slice(0, limit + 1);
    const floor = Math.floor(limit * 0.45);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    if (sentence >= floor) return safeCut(text, sentence + 1);
    const space = window.lastIndexOf(" ");
    return safeCut(text, space >= floor ? space : limit);
  }

  function splitLongText(value, limit) {
    const text = String(value || "");
    const max = Math.max(64, Number(limit) || GOOGLE_MAX_CHARS);
    if (text.length <= max) return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > max) {
      const cut = preferredCut(rest, max);
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function utf8Length(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(value || "")).length;
    return unescape(encodeURIComponent(String(value || ""))).length;
  }

  function splitUtf8Text(value, maxBytes) {
    const text = String(value || "");
    const limit = Math.max(64, Number(maxBytes) || MYMEMORY_MAX_BYTES);
    if (utf8Length(text) <= limit) return [text];
    const chunks = [];
    let rest = text;
    while (rest && utf8Length(rest) > limit) {
      let low = 1;
      let high = Math.min(rest.length, limit);
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (utf8Length(rest.slice(0, safeCut(rest, mid))) <= limit) low = mid;
        else high = mid - 1;
      }
      const cut = preferredCut(rest, Math.max(1, low));
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function buildGoogleUrl(text, targetLanguage) {
    const params = new URLSearchParams({ client: "gtx", sl: "en", tl: targetLanguage, dt: "t", q: text });
    return "https://translate.googleapis.com/translate_a/single?" + params.toString();
  }

  function parseGoogleResponse(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("Unexpected Google response");
    return payload[0].map((part) => Array.isArray(part) ? String(part[0] || "") : "").join("");
  }

  function buildMyMemoryUrl(text, targetLanguage) {
    const params = new URLSearchParams({ q: text, langpair: "en|" + targetLanguage, mt: "1" });
    return "https://api.mymemory.translated.net/get?" + params.toString();
  }

  function parseMyMemoryResponse(payload) {
    const translated = payload && payload.responseData && payload.responseData.translatedText;
    if (typeof translated !== "string" || !translated.trim()) throw new Error("Unexpected MyMemory response");
    if (Number(payload.responseStatus || 200) >= 400) throw new Error(String(payload.responseDetails || "MyMemory error"));
    return translated;
  }

  function makeCacheKey(source, language, provider) {
    const normalized = normalizeText(source);
    const selected = provider || "google";
    if (selected === "google") return ["v1", language, fingerprint(""), normalized].join("\n");
    return ["v2", selected, language, normalized].join("\n");
  }

  function cacheKeyLanguage(key) {
    const parts = String(key || "").split("\n");
    if (parts[0] === "v1") return parts[1] || "";
    if (parts[0] === "v2") return parts[2] || "";
    return "";
  }

  function cacheKeyProvider(key) {
    const parts = String(key || "").split("\n");
    if (parts[0] === "v1") return "google";
    if (parts[0] === "v2") return parts[1] || "";
    return "";
  }

  return {
    GOOGLE_MAX_CHARS,
    MYMEMORY_MAX_BYTES,
    normalizeText,
    hasEnglishText,
    fingerprint,
    splitLongText,
    utf8Length,
    splitUtf8Text,
    buildGoogleUrl,
    parseGoogleResponse,
    buildMyMemoryUrl,
    parseMyMemoryResponse,
    makeCacheKey,
    cacheKeyLanguage,
    cacheKeyProvider
  };
});
