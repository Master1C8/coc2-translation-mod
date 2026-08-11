(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CoC2TranslationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_CHUNK = 3500;

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
    return true;
  }

  function parseGlossary(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const at = line.indexOf("=");
        return at > 0 ? [line.slice(0, at).trim(), line.slice(at + 1).trim()] : null;
      })
      .filter((pair) => pair && pair[0] && pair[1]);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyGlossary(value, glossary) {
    let result = String(value || "");
    const pairs = Array.isArray(glossary) ? glossary : parseGlossary(glossary);
    for (const [source, replacement] of pairs) {
      result = result.replace(new RegExp(escapeRegExp(source), "gi"), replacement);
    }
    return result;
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

  function splitLongText(value, limit) {
    const text = String(value || "");
    const max = Math.max(64, Number(limit) || MAX_CHUNK);
    if (text.length <= max) return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > max) {
      let cut = max;
      const window = rest.slice(0, max + 1);
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
      if (sentence >= Math.floor(max * 0.45)) cut = sentence + 1;
      else {
        const space = window.lastIndexOf(" ");
        if (space >= Math.floor(max * 0.45)) cut = space;
      }
      if (cut > 0 && cut < rest.length && /[\uD800-\uDBFF]/.test(rest.charAt(cut - 1)) && /[\uDC00-\uDFFF]/.test(rest.charAt(cut))) cut -= 1;
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function buildTranslateUrl(text, targetLanguage) {
    const params = new URLSearchParams({ client: "gtx", sl: "en", tl: targetLanguage, dt: "t", q: text });
    return "https://translate.googleapis.com/translate_a/single?" + params.toString();
  }

  function parseGoogleResponse(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("Unexpected translation response");
    return payload[0].map((part) => Array.isArray(part) ? String(part[0] || "") : "").join("");
  }

  function makeCacheKey(source, language, glossaryText) {
    return ["v1", language, fingerprint(glossaryText), normalizeText(source)].join("\n");
  }

  return {
    MAX_CHUNK,
    normalizeText,
    hasEnglishText,
    parseGlossary,
    applyGlossary,
    fingerprint,
    splitLongText,
    buildTranslateUrl,
    parseGoogleResponse,
    makeCacheKey
  };
});
