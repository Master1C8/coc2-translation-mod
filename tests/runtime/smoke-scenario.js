(async function () {
  window.scrollTo(0, 0);
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const host = document.getElementById("vnrevival-translator-coc2");
  const shadow = host.shadowRoot;
  const defaultLanguage = shadow.querySelector(".language").value;
  const autoCheckbox = shadow.querySelector(".auto");
  const defaultAutoTranslate = autoCheckbox.checked === true
    && window.__vnRevivalTranslator.settings().autoTranslate === true;
  const mainButton = shadow.querySelector(".translate");
  const autoTranslateHint = shadow.querySelector(".autoTranslateHint");
  const autoModeHidesTranslate = mainButton.hidden
    && !autoTranslateHint.hidden
    && getComputedStyle(mainButton).display === "none"
    && getComputedStyle(autoTranslateHint).display !== "none"
    && autoTranslateHint.textContent === "If translation glitches, turn off Auto translate below.";
  const languageOptions = Array.from(shadow.querySelector(".language").options)
    .map((option) => [option.value, option.textContent]);
  const languageIsTopLevel = !!shadow.querySelector(".panel > .quickLanguage > .language")
    && !shadow.querySelector(".settings .language")
    && shadow.querySelector(".quickLanguage").nextElementSibling?.classList.contains("row")
    && getComputedStyle(shadow.querySelector(".quickLanguage")).display !== "none";
  const interfaceTranslationCheckbox = shadow.querySelector(".interfaceTranslation");
  const interfaceToggleIsRightOfLanguage = interfaceTranslationCheckbox.checked === false
    && interfaceTranslationCheckbox.closest(".interfaceTranslationToggle")
      === shadow.querySelector(".language").nextElementSibling
    && interfaceTranslationCheckbox.closest(".quickLanguage") === shadow.querySelector(".quickLanguage");
  const requestsBeforeInterfacePreset = window.fetchCalls.length + window.localHelperCalls.length;
  shadow.querySelector(".language").value = "ru";
  shadow.querySelector(".language").dispatchEvent(new Event("change"));
  interfaceTranslationCheckbox.checked = true;
  interfaceTranslationCheckbox.dispatchEvent(new Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const russianInterfacePresetTextApplied = shadow.querySelector(".quickLanguageLabel").textContent === "Язык"
    && shadow.querySelector(".translationServiceLabel").textContent === "Сервис перевода"
    && shadow.querySelector(".autoTitle").textContent === "Автоперевод"
    && shadow.querySelector(".cacheStats").textContent.startsWith("Кэш:")
    && shadow.querySelector(".translateAction").textContent === "Перевести"
    && window.__vnRevivalTranslator.settings().translateInterface === true;
  const interfacePresetMadeNoRequests = window.fetchCalls.length + window.localHelperCalls.length === requestsBeforeInterfacePreset;
  const russianInterfacePresetApplied = russianInterfacePresetTextApplied && interfacePresetMadeNoRequests;
  interfaceTranslationCheckbox.checked = false;
  interfaceTranslationCheckbox.dispatchEvent(new Event("change"));
  shadow.querySelector(".language").value = "en";
  shadow.querySelector(".language").dispatchEvent(new Event("change"));
  const englishInterfaceRestored = shadow.querySelector(".quickLanguageLabel").textContent === "Language"
    && shadow.querySelector(".translationServiceLabel").textContent === "Translation service"
    && window.__vnRevivalTranslator.settings().translateInterface === false;
  const providerOptions = Array.from(shadow.querySelector(".provider").options)
    .map((option) => [option.value, option.textContent]);
  const shortcutInsideMainButton = shadow.querySelector(".translate .translateShortcut")?.textContent === "Ctrl+Shift+T"
    && shadow.querySelector(".translate .translateAction")?.textContent === "Translate"
    && shadow.querySelector(".translate")?.getAttribute("aria-label") === "Translate (Ctrl+Shift+T)"
    && !shadow.querySelector(".hotkey");
  const openAIKeyIsPasswordOnly = shadow.querySelector(".openAICompatibleKey").type === "password"
    && !Object.keys(localStorage).some((key) => /api.*key/i.test(key));
  const openAIKeyBeforeModel = shadow.querySelector(".openAICompatibleKey").nextElementSibling
    === shadow.querySelector(".openAICompatibleModel");
  shadow.querySelector(".provider").value = "openai-compatible";
  shadow.querySelector(".provider").dispatchEvent(new Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const openAISetupVisible = !shadow.querySelector(".openAICompatibleBox").hidden
    && !shadow.querySelector(".openAICompatibleStatus")
    && !shadow.querySelector(".openAICompatibleParametersHint")
    && shadow.querySelector(".openAICompatiblePreset").options.length === 6;
  const streamlinedOpenAIControls = !shadow.querySelector(
    ".openAICompatibleSave,.openAICompatibleRefresh,.openAICompatibleRemove,"
      + ".openAICompatiblePromptHint,.openAICompatibleNotice"
  );
  const openAIModelSelect = shadow.querySelector(".openAICompatibleModel");
  const modelOptionValues = Array.from(openAIModelSelect.options).map((option) => option.value);
  const safeOpenAIModelPicker = openAIModelSelect instanceof HTMLSelectElement
    && shadow.querySelectorAll(".openAICompatibleModel").length === 1
    && JSON.stringify(modelOptionValues.slice(1, 5)) === JSON.stringify([
      "big-pickle", "mimo-v2.5-free", "model-a", "model-b"
    ])
    && openAIModelSelect.options[1].textContent.startsWith("Free · ")
    && openAIModelSelect.options[2].textContent.startsWith("Free · ")
    && !openAIModelSelect.hasAttribute("list")
    && !shadow.querySelector("datalist");
  const statusCallsBeforeModelOpen = window.localHelperCalls
    .filter((path) => path === "/v1/openai-compatible/status").length;
  openAIModelSelect.dispatchEvent(new Event("pointerdown"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const modelListRefreshesOnOpen = window.localHelperCalls
    .filter((path) => path === "/v1/openai-compatible/status").length
    === statusCallsBeforeModelOpen + 1;
  openAIModelSelect.value = "model-b";
  openAIModelSelect.dispatchEvent(new Event("change"));
  const openAIModelSelectionSaved = openAIModelSelect.value === "model-b"
    && JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null")
      ?.openAICompatibleModel === "model-b";
  const complexControlTooltips = [
    ".openAICompatiblePreset", ".openAICompatibleBaseURL", ".openAICompatibleKey",
    ".openAICompatibleModel", ".openAICompatibleReasoningEffort",
    ".openAICompatibleConcurrency", ".openAICompatibleAdvancedToggle",
    ".openAICompatiblePromptToggle", ".openAICompatiblePromptReset",
    ".openAICompatibleGlossaryToggle", ".openAICompatibleGlossary", ".autoToggle", ".cacheDelete"
  ].every((selector) => (shadow.querySelector(selector)?.title || "").length >= 20);
  const openAIAdvancedToggle = shadow.querySelector(".openAICompatibleAdvancedToggle");
  const openAIAdvanced = shadow.querySelector(".openAICompatibleAdvanced");
  const openAIAdvancedInitiallyCollapsed = openAIAdvanced.hidden
    && getComputedStyle(openAIAdvanced).display === "none"
    && openAIAdvancedToggle.textContent === "Advanced"
    && openAIAdvancedToggle.getAttribute("aria-expanded") === "false"
    && openAIAdvanced.contains(shadow.querySelector(".openAICompatiblePromptToggle"))
    && openAIAdvanced.contains(shadow.querySelector(".openAICompatibleGlossaryToggle"));
  openAIAdvancedToggle.click();
  const openAIAdvancedOpenedByButton = !openAIAdvanced.hidden
    && getComputedStyle(openAIAdvanced).display !== "none"
    && openAIAdvancedToggle.textContent === "Hide advanced"
    && openAIAdvancedToggle.getAttribute("aria-expanded") === "true";
  const openAIAdvancedCacheNotice = openAIAdvanced.querySelector(".openAICompatibleAdvancedNotice")
    ?.textContent === "After making changes, delete the cache below to retranslate text that was already translated."
    && getComputedStyle(openAIAdvanced.querySelector(".openAICompatibleAdvancedNotice")).display !== "none";
  const openAIPromptToggle = shadow.querySelector(".openAICompatiblePromptToggle");
  const openAIPromptEditor = shadow.querySelector(".openAICompatiblePromptEditor");
  const openAIPromptInitiallyCollapsed = openAIPromptEditor.hidden
    && getComputedStyle(openAIPromptEditor).display === "none"
    && openAIPromptToggle.textContent === "System prompt"
    && openAIPromptToggle.getAttribute("aria-expanded") === "false";
  openAIPromptToggle.click();
  const openAIPromptOpenedByButton = !openAIPromptEditor.hidden
    && getComputedStyle(openAIPromptEditor).display !== "none"
    && openAIPromptToggle.textContent === "Hide system prompt"
    && openAIPromptToggle.getAttribute("aria-expanded") === "true";
  const openAIPromptInput = shadow.querySelector(".openAICompatiblePrompt");
  const openAIPromptEditable = openAIPromptInput.value.includes("{targetName}")
    && openAIPromptInput.value.includes("VRCTXSEP<number>X")
    && !!shadow.querySelector(".openAICompatiblePromptReset");
  openAIPromptInput.value = "Translate into {targetName} ({target}) and preserve markers.";
  openAIPromptInput.dispatchEvent(new Event("change"));
  const openAIPromptSaved = JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null")
    ?.openAICompatibleSystemPrompt === openAIPromptInput.value;
  openAIPromptToggle.click();
  const openAIPromptClosedByButton = openAIPromptEditor.hidden
    && getComputedStyle(openAIPromptEditor).display === "none"
    && openAIPromptToggle.textContent === "System prompt"
    && openAIPromptToggle.getAttribute("aria-expanded") === "false";
  const openAIGlossaryToggle = shadow.querySelector(".openAICompatibleGlossaryToggle");
  const openAIGlossaryEditor = shadow.querySelector(".openAICompatibleGlossaryEditor");
  const openAIGlossaryInput = shadow.querySelector(".openAICompatibleGlossary");
  const openAIGlossaryInitiallyCollapsed = openAIGlossaryEditor.hidden
    && getComputedStyle(openAIGlossaryEditor).display === "none"
    && openAIGlossaryToggle.textContent === "Glossary"
    && openAIGlossaryToggle.getAttribute("aria-expanded") === "false"
    && openAIGlossaryInput.value === ""
    && openAIGlossaryInput.maxLength === 8000
    && openAIGlossaryInput.placeholder.includes("source = translation");
  openAIGlossaryToggle.click();
  const openAIGlossaryOpenedByButton = !openAIGlossaryEditor.hidden
    && getComputedStyle(openAIGlossaryEditor).display !== "none"
    && openAIGlossaryToggle.textContent === "Hide glossary"
    && openAIGlossaryToggle.getAttribute("aria-expanded") === "true";
  openAIGlossaryInput.value = "Minstrel = Менестрель";
  openAIGlossaryInput.dispatchEvent(new Event("change"));
  const openAIGlossarySaved = JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null")
    ?.openAICompatibleGlossary === openAIGlossaryInput.value;
  openAIGlossaryToggle.click();
  const openAIGlossaryClosedByButton = openAIGlossaryEditor.hidden
    && getComputedStyle(openAIGlossaryEditor).display === "none"
    && openAIGlossaryToggle.textContent === "Glossary"
    && openAIGlossaryToggle.getAttribute("aria-expanded") === "false";
  openAIAdvancedToggle.click();
  const openAIAdvancedClosedByButton = openAIAdvanced.hidden
    && getComputedStyle(openAIAdvanced).display === "none"
    && openAIAdvancedToggle.textContent === "Advanced"
    && openAIAdvancedToggle.getAttribute("aria-expanded") === "false";
  const reasoningEffortInput = shadow.querySelector(".openAICompatibleReasoningEffort");
  const concurrencyInput = shadow.querySelector(".openAICompatibleConcurrency");
  const openAIModelParametersVisible = reasoningEffortInput.options.length === 8
    && reasoningEffortInput.value === ""
    && concurrencyInput.options.length === 8
    && concurrencyInput.value === "4"
    && !shadow.querySelector(".openAICompatibleVerbosity")
    && !shadow.querySelector(".openAICompatibleTemperature")
    && !shadow.querySelector(".openAICompatibleMaxTokens");
  reasoningEffortInput.value = "high";
  reasoningEffortInput.dispatchEvent(new Event("change"));
  concurrencyInput.value = "6";
  concurrencyInput.dispatchEvent(new Event("change"));
  const savedModelParameters = JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null");
  const openAIModelParametersSaved = savedModelParameters?.openAICompatibleReasoningEffort === "high"
    && !("openAICompatibleVerbosity" in savedModelParameters)
    && savedModelParameters?.openAICompatibleConcurrency === 6
    && !("openAICompatibleTemperature" in savedModelParameters)
    && !("openAICompatibleMaxTokens" in savedModelParameters);
  const openAIHintRemoved = shadow.querySelector(".providerHint").textContent === ""
    && getComputedStyle(shadow.querySelector(".providerHint")).display === "none";
  const openAIKeyInput = shadow.querySelector(".openAICompatibleKey");
  openAIKeyInput.value = "smoke-test-api-key";
  openAIKeyInput.dispatchEvent(new Event("change"));
  for (let attempt = 0; attempt < 50 && openAIKeyInput.value; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const openAIKeyAutoSaved = window.localHelperCalls.includes("/v1/openai-compatible/key")
    && openAIKeyInput.value === "";
  shadow.querySelector(".language").value = "ar";
  shadow.querySelector(".language").dispatchEvent(new Event("change"));
  shadow.querySelector(".provider").value = "google";
  shadow.querySelector(".provider").dispatchEvent(new Event("change"));
  const googleHintRemoved = shadow.querySelector(".providerHint").textContent === ""
    && getComputedStyle(shadow.querySelector(".providerHint")).display === "none";
  const organicAutoToggle = autoCheckbox.closest(".autoToggle")
    && autoCheckbox.getAttribute("aria-label") === "Automatically translate new screens"
    && !!shadow.querySelector(".autoCopy .autoTitle")
    && !!shadow.querySelector(".autoTrack .autoThumb");
  autoCheckbox.closest(".autoToggle").click();
  const savedAfterAutoChange = JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null");
  const autoChangeSaved = savedAfterAutoChange && savedAfterAutoChange.autoTranslate === false;
  const manualModeShowsTranslate = !mainButton.hidden && autoTranslateHint.hidden
    && getComputedStyle(mainButton).display === "flex"
    && getComputedStyle(autoTranslateHint).display === "none";
  shadow.querySelector(".allowAuto").click();
  for (let attempt = 0; attempt < 100
      && document.getElementById("prefetched-tooltip").textContent.trim() !== "ترجمة"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  for (let attempt = 0; attempt < 100
      && shadow.querySelector(".translateAction").textContent === "Cancel"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const restoredAutoModeHidesTranslate = mainButton.hidden && !autoTranslateHint.hidden
    && getComputedStyle(mainButton).display === "none"
    && getComputedStyle(autoTranslateHint).display !== "none";
  const autosavedSettings = JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null");
  const removedSettingsButtons = !shadow.querySelector(
    ".cacheActions,.launcherActions,.settingsActions,.save,.reset,.clearLanguage,.export,.import,.changeExecutable"
  );
  const removedBottomHint = !shadow.querySelector(".hint");
  const collapseButton = shadow.querySelector(".collapseToggle");
  const panel = shadow.querySelector(".panel");
  const settingsPanel = shadow.querySelector(".settings");
  const fullyExpandedPanel = !shadow.querySelector(".gear")
    && !shadow.querySelector(".barTitle")
    && getComputedStyle(settingsPanel).display === "block";
  collapseButton.click();
  const compactCollapsedHeader = getComputedStyle(panel).width === "36px";
  const collapsedStateSaved = panel.classList.contains("collapsed")
    && JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null").collapsed === true
    && collapseButton.textContent === "+"
    && compactCollapsedHeader
    && getComputedStyle(settingsPanel).display === "none";
  collapseButton.click();
  const expandedStateSaved = !panel.classList.contains("collapsed")
    && JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null").collapsed === false
    && collapseButton.textContent === "−"
    && getComputedStyle(panel).width === "306px"
    && getComputedStyle(settingsPanel).display === "block";
  const contactLinksPresent = shadow.querySelector('.contactIcon.discord')?.href === "https://discord.gg/QgyeWW3Jg"
    && shadow.querySelector('.contactIcon.telegram')?.href === "https://t.me/VnRevival"
    && shadow.querySelector('.contactIcon.email')?.getAttribute("href") === "mailto:master1c8@proton.me";
  autoCheckbox.closest(".autoToggle").click();
  for (let attempt = 0; attempt < 100
      && shadow.querySelector(".translateAction").textContent === "Cancel"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  window.__vnRevivalTranslator.showTranslations();
  const translationPromise = Promise.resolve(window.__vnRevivalTranslator.translateScreen());
  const cancelStateKeepsShortcut = shadow.querySelector(".translate .translateAction")?.textContent === "Cancel"
    && shadow.querySelector(".translate .translateShortcut")?.textContent === "Ctrl+Shift+T"
    && shadow.querySelector(".translate")?.getAttribute("aria-label") === "Cancel (Ctrl+Shift+T)";
  const outcome = await Promise.race([
    translationPromise.then(() => "completed"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 1500))
  ]);
  const routineSuccessStatusHidden = shadow.querySelector(".status").textContent === ""
    && getComputedStyle(shadow.querySelector(".status")).display === "none";

  const rich = document.getElementById("rich");
  const button = document.getElementById("button");
  const legacy = document.getElementById("legacy");
  const prefetchedTooltip = document.getElementById("prefetched-tooltip");
  const translated = {
    text: rich.textContent.replace(/\s+/g, " ").trim(),
    direction: rich.getAttribute("dir"),
    language: rich.getAttribute("lang"),
    bidi: rich.style.getPropertyValue("unicode-bidi"),
    lineHeight: rich.style.getPropertyValue("line-height"),
    fontFamily: rich.style.getPropertyValue("font-family"),
    buttonHeight: button.style.getPropertyValue("height"),
    buttonWrap: button.style.getPropertyValue("white-space")
  };
  const legacyMigrated = legacy.textContent.trim() === "سطر قديم"
    && !window.fetchCalls.includes("Legacy line")
    && !window.smokeCache.has("v1\nar\n811c9dc5\nLegacy line")
    && window.smokeCache.get("v3\ncoc2\ngoogle\nar\nLegacy line") === "سطر قديم";
  const hiddenTooltipPrefetched = prefetchedTooltip.textContent.trim() === "ترجمة"
    && getComputedStyle(prefetchedTooltip.closest(".tooltip")).display === "none";

  autoCheckbox.closest(".autoToggle").click();
  const later = document.getElementById("later");
  later.scrollIntoView();
  window.smokeIntersectionObservers.forEach((observer) => observer.trigger());
  for (let attempt = 0; attempt < 100 && later.textContent.trim() !== "ترجمة"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const scrolledTranslation = later.textContent.trim();

  await new Promise((resolve) => setTimeout(resolve, 700));
  const repairedMetadata = JSON.parse(localStorage.getItem("coc2-translator.cache-meta.v1") || "null");
  const metadataDirty = localStorage.getItem("coc2-translator.cache-meta-dirty.v1");
  const cacheBox = shadow.querySelector(".cacheBox");
  const cacheCopyButton = shadow.querySelector(".cacheCopy");
  const cacheDeleteButton = shadow.querySelector(".cacheDelete");
  const compactCacheRow = getComputedStyle(cacheBox).display === "grid"
    && cacheBox.children.length === 3
    && /^Cache: \d+(?:\.\d+)? (?:B|KB|MB) · Log: 2\.0 KB$/.test(shadow.querySelector(".cacheStats").textContent)
    && cacheCopyButton.textContent === "Copy log"
    && cacheDeleteButton.textContent === "Delete";
  cacheCopyButton.click();
  for (let attempt = 0; attempt < 50 && window.smokeClipboard !== "smoke log\n"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const logCopied = window.smokeClipboard === "smoke log\n";
  cacheDeleteButton.click();
  for (let attempt = 0; attempt < 50 && shadow.querySelector(".cacheStats").textContent !== "Cache: 0 B · Log: 0 B"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const cacheDeleted = window.smokeCache.size === 0
    && window.smokeLogBytes === 0
    && shadow.querySelector(".cacheStats").textContent === "Cache: 0 B · Log: 0 B"
    && cacheCopyButton.disabled === true
    && cacheDeleteButton.disabled === false;
  const originalButtonRemoved = !shadow.querySelector(".mode");

  const legacyGlobalsScopedToCoC2 = window.CoC2TranslationCore === window.VNRevivalTranslationCore
    && window.CoC2TranslatorLanguages === window.VNRevivalTranslatorLanguages
    && window.__coc2Translator === window.__vnRevivalTranslator;

  window.__vnRevivalTranslator.showOriginal();
  const restored = {
    text: rich.textContent.replace(/\s+/g, " ").trim(),
    direction: rich.hasAttribute("dir"),
    language: rich.hasAttribute("lang"),
    textAlign: rich.style.getPropertyValue("text-align"),
    fontFamily: rich.style.getPropertyValue("font-family"),
    buttonHeight: button.style.getPropertyValue("height"),
    buttonWrap: button.style.getPropertyValue("white-space")
  };

  // Keep each expectation once; the reporter lists failed names only.
  window.smokeReport({
    translatedText: translated.text === "ترى امرأة جميلة بالقرب من الباب.",
    translatedDirection: translated.direction === "rtl",
    translatedLanguage: translated.language === "ar",
    translatedBidi: translated.bidi === "plaintext",
    translatedLineHeight: translated.lineHeight === "1.35",
    translatedFontFamilyIncludes: translated.fontFamily.includes("Noto Sans Arabic"),
    translatedButtonHeight: translated.buttonHeight === "auto",
    translatedButtonWrap: translated.buttonWrap === "normal",
    scrolledTranslation: scrolledTranslation === "ترجمة",
    repairedMetadataRecords: repairedMetadata.records === 5,
    compactCacheRow,
    logCopied,
    cacheDeleted,
    originalButtonRemoved,
    metadataDirty: metadataDirty === null,
    legacyMigrated,
    hiddenTooltipPrefetched,
    legacyGlobalsScopedToCoC2,
    shortcutInsideMainButton,
    cancelStateKeepsShortcut,
    routineSuccessStatusHidden,
    defaultLanguage: defaultLanguage === "en",
    defaultAutoTranslate,
    autoModeHidesTranslate,
    languageIsTopLevel,
    interfaceToggleIsRightOfLanguage,
    russianInterfacePresetApplied,
    englishInterfaceRestored,
    languageOptionsLength: languageOptions.length === 30,
    languageOrderStart: JSON.stringify(languageOptions.slice(0, 2)) === JSON.stringify([
      ["zh", "Chinese (Simplified) (中文（简体）)"],
      ["en", "English"]
    ]),
    languageOrderEnd: JSON.stringify(languageOptions.at(-1)) === JSON.stringify(["he", "Hebrew (עברית)"]),
    providerOrder: JSON.stringify(providerOptions) === JSON.stringify([["google", "Google Translate"], ["openai-compatible", "OpenAI-compatible"]]),
    openAIKeyIsPasswordOnly,
    openAIKeyBeforeModel,
    openAISetupVisible,
    streamlinedOpenAIControls,
    safeOpenAIModelPicker,
    modelListRefreshesOnOpen,
    openAIModelSelectionSaved,
    complexControlTooltips,
    openAIAdvancedInitiallyCollapsed,
    openAIAdvancedOpenedByButton,
    openAIAdvancedCacheNotice,
    openAIAdvancedClosedByButton,
    openAIPromptInitiallyCollapsed,
    openAIPromptOpenedByButton,
    openAIPromptEditable,
    openAIPromptSaved,
    openAIPromptClosedByButton,
    openAIGlossaryInitiallyCollapsed,
    openAIGlossaryOpenedByButton,
    openAIGlossarySaved,
    openAIGlossaryClosedByButton,
    openAIModelParametersVisible,
    openAIModelParametersSaved,
    openAIHintRemoved,
    openAIKeyAutoSaved,
    googleHintRemoved,
    organicAutoToggle,
    autoChangeSaved,
    manualModeShowsTranslate,
    restoredAutoModeHidesTranslate,
    autosavedSettingsLanguage: autosavedSettings.language === "ar",
    autosavedSettingsProvider: autosavedSettings.provider === "google",
    autosavedSettingsAutoTranslate: autosavedSettings.autoTranslate === true,
    removedSettingsButtons,
    removedBottomHint,
    fullyExpandedPanel,
    collapsedStateSaved,
    expandedStateSaved,
    contactLinksPresent,
    restoredText: restored.text === "You see a beautiful woman near the door.",
    restoredDirection: restored.direction === false,
    restoredLanguage: restored.language === false,
    restoredTextAlign: restored.textAlign === "",
    restoredFontFamily: restored.fontFamily === "",
    restoredButtonHeight: restored.buttonHeight === "",
    restoredButtonWrap: restored.buttonWrap === "",
  });
})();
