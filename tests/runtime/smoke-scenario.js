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
  const autoModeHidesTranslate = mainButton.hidden
    && mainButton.parentElement.hidden
    && !shadow.querySelector(".autoTranslateHint");
  const languageOptions = Array.from(shadow.querySelector(".language").options)
    .map((option) => [option.value, option.textContent]);
  const languageIsTopLevel = !!shadow.querySelector(".panel > .bar > .language")
    && !shadow.querySelector(".settings .language")
    && !!shadow.querySelector(".bar > .collapseToggle")
    && getComputedStyle(shadow.querySelector(".quickLanguage")).display !== "none";
  const interfaceTranslationCheckbox = shadow.querySelector(".interfaceTranslation");
  const interfaceToggleIsClearlyLabelled = interfaceTranslationCheckbox.checked === false
    && shadow.querySelector(".interfaceTranslationLabel").textContent === "Translate panel interface"
    && shadow.querySelector(".interfaceTranslationToggle").nextElementSibling.classList.contains("autoToggle");
  const compactGooglePanel = shadow.querySelector(".openAICompatibleBox").hidden
    && host.getBoundingClientRect().height < 400;
  const gameThemeApplied = getComputedStyle(shadow.querySelector(".panel")).backgroundColor === "rgb(32, 19, 28)";
  // Exercise idle, progress, wrapped failures and retry in both provider layouts.
  // Check actual geometry, including the footer and controls, at a narrow width.
  const stableTranslationFeedback = (() => {
    const panel = shadow.querySelector(".panel");
    const status = shadow.querySelector(".status");
    const retry = shadow.querySelector(".retry");
    const aiBox = shadow.querySelector(".openAICompatibleBox");
    const saved = { status: status.textContent, retry: retry.disabled, label: retry.textContent, ai: aiBox.hidden, width: panel.style.width };
    const geometry = () => [panel, retry, shadow.querySelector(".settings"), shadow.querySelector(".site")]
      .flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return [bounds.x, bounds.y, bounds.width, bounds.height];
      }).join(",");
    let stable = true;
    try {
      for (const width of ["330px", "240px"]) {
        panel.style.width = width;
        for (const aiHidden of [true, false]) {
          aiBox.hidden = aiHidden;
          status.textContent = "";
          retry.disabled = true;
          const idle = geometry();
          for (const [message, failed] of [
            ["Translating 1/9999", false],
            ["Provider rate limit reached · retrying in 60s (4/4)", false],
            ["Провайдер отклонил запрос. ".repeat(30), true],
            ["", false],
          ]) {
            status.textContent = message;
            retry.disabled = !failed;
            retry.textContent = failed ? "Повторить перевод" : "Retry translation";
            stable = stable && geometry() === idle;
            if (failed) stable = stable && status.scrollHeight > status.clientHeight
              && getComputedStyle(status).overflowY === "auto" && status.tabIndex === 0
              && retry.getBoundingClientRect().height === 32 && retry.scrollWidth === retry.clientWidth;
          }
        }
      }
      return stable;
    } finally {
      status.textContent = saved.status;
      retry.disabled = saved.retry;
      retry.textContent = saved.label;
      aiBox.hidden = saved.ai;
      panel.style.width = saved.width;
    }
  })();
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
  const modelBeforeKey = shadow.querySelector(".openAICompatibleModel").nextElementSibling.classList.contains("keyRow");
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
    && openAIAdvanced.contains(shadow.querySelector(".openAICompatibleGlossaryToggle"))
    && openAIAdvanced.contains(shadow.querySelector(".endpointField"))
    && openAIAdvanced.contains(shadow.querySelector(".openAICompatibleParameters"));
  openAIAdvancedToggle.click();
  const openAIAdvancedOpenedByButton = !openAIAdvanced.hidden
    && getComputedStyle(openAIAdvanced).display !== "none"
    && openAIAdvancedToggle.textContent === "Hide advanced"
    && openAIAdvancedToggle.getAttribute("aria-expanded") === "true";
  const openAIAdvancedCacheNotice = openAIAdvanced.querySelector(".openAICompatibleAdvancedNotice")
    ?.textContent === "Changes apply on the next translation. Unaffected cached translations are kept."
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
  openAIAdvancedToggle.click();
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
  for (let attempt = 0; attempt < 50 && shadow.querySelector(".keyState").textContent !== "Key saved"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const openAIKeyAutoSaved = window.localHelperCalls.includes("/v1/openai-compatible/key")
    && openAIKeyInput.value === ""
    && openAIKeyInput.hidden
    && shadow.querySelector(".keyState").textContent === "Key saved";
  shadow.querySelector(".keyEdit").click();
  const keyEditDoesNotRevealSecret = !openAIKeyInput.hidden && openAIKeyInput.value === "";
  shadow.querySelector(".openAICompatiblePreset").value = "custom";
  shadow.querySelector(".openAICompatiblePreset").dispatchEvent(new Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const customEndpointVisible = shadow.querySelector(".endpointField").parentElement === shadow.querySelector(".openAICompatibleBox")
    && !shadow.querySelector(".openAICompatibleBaseURL").disabled;
  shadow.querySelector(".openAICompatiblePreset").value = "opencode-go";
  shadow.querySelector(".openAICompatiblePreset").dispatchEvent(new Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 30));
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
  const manualModeShowsTranslate = !mainButton.hidden && !mainButton.parentElement.hidden
    && getComputedStyle(mainButton).display === "flex";
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
  const restoredAutoModeHidesTranslate = mainButton.hidden && mainButton.parentElement.hidden;
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
    && getComputedStyle(shadow.querySelector(".panelBody")).display === "none";
  collapseButton.click();
  const expandedStateSaved = !panel.classList.contains("collapsed")
    && JSON.parse(localStorage.getItem("coc2-translator.settings.v2") || "null").collapsed === false
    && collapseButton.textContent === "−"
    && getComputedStyle(panel).width === "330px"
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
    && shadow.querySelector(".retry").disabled;

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

  for (let attempt = 0; attempt < 100 && shadow.querySelector(".translateAction").textContent === "Cancel"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const autoBeforeCapture = autoCheckbox.checked;
  autoCheckbox.checked = false;
  autoCheckbox.dispatchEvent(new Event("change"));
  const captureToggleButton = shadow.querySelector(".captureToggle");
  const captureCopyButton = shadow.querySelector(".captureCopy");
  captureToggleButton.click();
  for (let attempt = 0; attempt < 50 && !window.smokeCapture.active; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const captureSource = document.createElement("p");
  captureSource.style.cssText = "position:fixed;top:40px;left:0;width:200px;height:30px";
  captureSource.textContent = "Capture this source sentence.";
  document.body.append(captureSource);
  await window.__vnRevivalTranslator.translateScreen();
  for (let attempt = 0; attempt < 50 && window.smokeCapture.screens.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  captureToggleButton.click();
  for (let attempt = 0; attempt < 50 && window.smokeCapture.active; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  captureCopyButton.click();
  for (let attempt = 0; attempt < 50 && !window.smokeClipboard.includes("Capture this source sentence."); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const translationCaptureWorks = window.smokeCapture.screens.length === 1
    && window.smokeCapture.screens[0].items.some((item) => item.source === "Capture this source sentence."
      && item.translation === "ترجمة")
    && !window.smokeCapture.active
    && shadow.querySelector(".captureStats").textContent === "Translation capture: Off · Screens: 1"
    && window.smokeClipboard.includes("Capture this source sentence.");
  captureSource.remove();
  autoCheckbox.checked = autoBeforeCapture;
  autoCheckbox.dispatchEvent(new Event("change"));

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
    && cacheDeleteButton.textContent === "Clear cache and log";
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

  const reasoningModelCompatibility = await (async () => {
    const change = (element, value) => { element.value = value; element.dispatchEvent(new Event("change")); };
    autoCheckbox.checked = false;
    autoCheckbox.dispatchEvent(new Event("change"));
    change(shadow.querySelector(".provider"), "openai-compatible");
    change(shadow.querySelector(".openAICompatiblePreset"), "opencode-go");
    await new Promise((resolve) => setTimeout(resolve, 40));
    const model = shadow.querySelector(".openAICompatibleModel");
    const effort = shadow.querySelector(".openAICompatibleReasoningEffort");
    change(model, "model-b");
    change(effort, "minimal");
    model.add(new Option("glm-5.3-flash", "glm-5.3-flash"));
    change(model, "glm-5.3-flash");
    const migrated = effort.value === "low"
      && window.__vnRevivalTranslator.settings().openAICompatibleReasoningEffort === "low"
      && JSON.parse(localStorage.getItem("coc2-translator.settings.v2")).openAICompatibleReasoningEffort === "low";
    const supported = Array.from(effort.options).filter((option) => !option.hidden && !option.disabled).map((option) => option.value);
    const preserved = ["high", "max", ""].every((value) => {
      change(effort, value);
      return effort.value === value;
    });
    change(model, "model-b");
    change(effort, "minimal");
    const otherModelsUnchanged = effort.value === "minimal" && Array.from(effort.options).every((option) => !option.hidden && !option.disabled);
    return migrated && JSON.stringify(supported) === JSON.stringify(["", "low", "high", "max"])
      && preserved && otherModelsUnchanged;
  })();

  const retryLifecycle = await (async () => {
    const originalFetch = window.fetch;
    const retry = shadow.querySelector(".retry");
    const status = shadow.querySelector(".status");
    const provider = shadow.querySelector(".provider");
    const language = shadow.querySelector(".language");
    const change = (element, value) => { element.value = value; element.dispatchEvent(new Event("change")); };
    let reject = true;
    let requests = 0;
    window.fetch = async (url, options) => {
      if (!String(url).endsWith("/v1/openai-compatible/translate")) return originalFetch(url, options);
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return reject
        ? { ok: false, status: 502, json: async () => ({ ok: false, error: "openai_request_failed", providerStatus: 400, message: "Provider returned HTTP 400" }) }
        : { ok: true, json: async () => ({ ok: true, translatedText: JSON.parse(options.body).text }) };
    };
    try {
      autoCheckbox.checked = false;
      autoCheckbox.dispatchEvent(new Event("change"));
      change(provider, "openai-compatible");
      change(shadow.querySelector(".openAICompatiblePreset"), "opencode-go");
      await new Promise((resolve) => setTimeout(resolve, 40));
      change(shadow.querySelector(".openAICompatibleModel"), "model-b");
      change(language, "ru");
      interfaceTranslationCheckbox.checked = true;
      interfaceTranslationCheckbox.dispatchEvent(new Event("change"));
      window.__vnRevivalTranslator.showTranslations();
      autoCheckbox.checked = true;
      autoCheckbox.dispatchEvent(new Event("change"));
      await window.__vnRevivalTranslator.translateScreen();
      const rejectedCount = requests;
      const rejected = rejectedCount > 0 && !retry.disabled
        && retry.textContent === "Повторить перевод"
        && status.textContent.includes("Сервис отклонил запрос (HTTP 400)")
        && status.textContent.includes("Автоперевод приостановлен");
      const rect = () => {
        const bounds = retry.getBoundingClientRect();
        return [bounds.x, bounds.y, bounds.width, bounds.height].join(",");
      };
      const failedGeometry = rect();
      for (const observer of window.smokeIntersectionObservers) observer.trigger();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const autoStopped = requests === rejectedCount && !retry.disabled;
      interfaceTranslationCheckbox.checked = false;
      interfaceTranslationCheckbox.dispatchEvent(new Event("change"));
      const localized = retry.textContent === "Retry translation"
        && status.textContent.includes("Automatic translation is paused") && rect() === failedGeometry;
      reject = false;
      retry.click();
      const busy = retry.disabled && rect() === failedGeometry;
      retry.click(); // A double click cannot cancel the retry or start another batch.
      for (let attempt = 0; attempt < 100 && shadow.querySelector(".translateAction").textContent === "Cancel"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const recovered = requests > rejectedCount && retry.disabled && status.textContent === ""
        && rect() === failedGeometry;
      const completedCount = requests;
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { retryRejected: rejected, retryAutoStopped: autoStopped, retryLocalized: localized, retryBusy: busy, retryRecovered: recovered, retryNoDuplicate: requests === completedCount };
    } finally {
      autoCheckbox.checked = false;
      autoCheckbox.dispatchEvent(new Event("change"));
      window.fetch = originalFetch;
    }
  })();

  const optimization = await window.runOptimizationSmoke(shadow);
  const screenBlocks = await window.runScreenBlockSmoke(shadow);

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
    repairedMetadataRecords: repairedMetadata.records === 6,
    compactCacheRow,
    logCopied,
    cacheDeleted,
    translationCaptureWorks,
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
    interfaceToggleIsClearlyLabelled,
    compactGooglePanel,
    stableTranslationFeedback,
    ...retryLifecycle,
    ...optimization,
    ...screenBlocks,
    reasoningModelCompatibility,
    gameThemeApplied,
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
    modelBeforeKey,
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
    keyEditDoesNotRevealSecret,
    customEndpointVisible,
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
