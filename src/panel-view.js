(function (root) {
  "use strict";

  const DEFAULT_THEME = Object.freeze({
    background: "#1e2229", surface: "#292f39", field: "#171b21",
    text: "#f1f3f5", muted: "#b3bdca", border: "#495564",
    accent: "#91baff", onAccent: "#172336", danger: "#ffacb3", warning: "#f4d398"
  });
  function themeStyle(theme) {
    return Object.keys(DEFAULT_THEME).map((key) => {
      const value = theme && typeof theme[key] === "string" && /^#[0-9a-f]{6}$/i.test(theme[key])
        ? theme[key] : DEFAULT_THEME[key];
      return `--${key}:${value}`;
    }).join(";");
  }

  function render(options) {
    const siteURL = options.siteURL;
    const siteName = options.siteName;
    const maxSystemPromptChars = options.maxSystemPromptChars;
    const maxGlossaryChars = options.maxGlossaryChars;
    return `
      <style>
        :host{all:initial}
        *{box-sizing:border-box}
        [hidden],.hidden{display:none!important}
        .panel{width:330px;max-width:calc(100vw - 16px);max-height:calc(100vh - 28px);display:flex;flex-direction:column;color:var(--text);background:var(--background);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 28px #0008;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow:hidden;color-scheme:dark;user-select:none;-webkit-user-select:none}
        .bar{display:flex;align-items:center;gap:10px;padding:12px 12px 8px;cursor:move;user-select:none;flex-shrink:0}
        .quickLanguageLabel{font-size:12px;color:var(--muted)}
        .language{flex:1;min-width:0}
        .panelBody{padding:0 12px 10px;overflow-y:auto;min-height:0;scrollbar-width:thin}
        select,input:not([type="checkbox"]),textarea{width:100%;min-width:0;border:1px solid var(--border);border-radius:6px;background:var(--field);color:var(--text);padding:7px 8px;font:inherit}
        input:not([type="checkbox"]),textarea{user-select:text;-webkit-user-select:text}
        button{font:inherit;cursor:pointer}
        button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        input[type="checkbox"]{accent-color:var(--accent)}
        .interfaceTranslationToggle{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;cursor:pointer}
        .interfaceTranslationToggle input{margin:0}
        .primary,.secondary,.danger{border:1px solid transparent;border-radius:6px;padding:6px 8px;color:var(--text);background:var(--surface)}
        .primary{background:var(--accent);color:var(--onAccent);font-weight:600}
        .secondary:hover,.danger:hover{border-color:var(--border)}
        .danger{color:var(--danger);background:transparent}
        button:disabled{opacity:.5;cursor:default}
        .collapseToggle{flex:0 0 24px;width:24px;height:28px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:20px;line-height:1;padding:0}
        .collapseToggle:hover{color:var(--text);background:var(--surface)}
        .panel.collapsed{width:36px}
        .panel.collapsed .panelBody,.panel.collapsed .site,.panel.collapsed .bar>:not(.collapseToggle){display:none!important}
        .panel.collapsed .bar{padding:4px 5px}
        .autoToggle{position:relative;display:flex;align-items:center;gap:10px;margin:12px 0;padding:10px;border-radius:8px;background:var(--surface);cursor:pointer;user-select:none}
        .autoCopy{display:flex;flex:1;align-items:center;justify-content:space-between;gap:8px;min-width:0}
        .autoTitle{font-size:14px;font-weight:600}
        .autoState{font-size:11px;color:var(--muted)}
        .autoState::after{content:attr(data-off)}
        .autoTrack{position:relative;flex:0 0 34px;height:20px;border:1px solid var(--border);border-radius:12px;background:var(--field)}
        .autoThumb{position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:var(--muted);transition:left .15s}
        .auto{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;margin:0}
        .auto:checked~.autoTrack{background:var(--accent);border-color:var(--accent)}
        .auto:checked~.autoTrack .autoThumb{left:17px;background:var(--onAccent)}
        .auto:checked~.autoCopy .autoState::after{content:attr(data-on)}
        .auto:focus-visible~.autoTrack{outline:2px solid var(--accent);outline-offset:3px}
        .row{margin-bottom:10px}
        .translate{display:flex;align-items:center;justify-content:center;gap:8px;width:100%}
        .translateShortcut{font-size:10px;font-weight:400;opacity:.8}
        .translationFeedback{height:70px;margin:8px 0;display:grid;grid-template-rows:32px 32px;gap:6px}
        .status{min-width:0;min-height:0;overflow:auto;color:var(--warning);font-size:12px;overflow-wrap:anywhere}
        .providerHint:empty{display:none}
        .retry{width:100%;height:32px;min-height:32px;max-height:32px;padding:0 8px;white-space:nowrap;overflow:hidden}
        .screenshotBatchRow{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:8px;margin:0 0 10px}
        .screenshotBatch{width:100%}
        .screenshotBatchRow .screenshotNumber{width:58px;min-width:0;padding-left:4px;padding-right:4px;text-align:center}
        .compat{padding:8px;margin:8px 0;border:1px solid var(--border);border-radius:6px;color:var(--warning);font-size:12px}
        .settings label.title{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px}
        .providerHint,.cacheStats{color:var(--muted);font-size:11px}
        .openAICompatibleBox{margin-top:10px;padding-top:2px}
        .openAICompatiblePreset{margin-bottom:8px}
        .openAICompatibleModel{margin-bottom:4px}
        .modelHelp{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 5px;margin:0 0 8px;color:var(--muted);font-size:11px}
        .modelHelpLink{border:0;background:transparent;color:var(--accent);padding:0;font:inherit;text-decoration:underline;text-underline-offset:2px}
        .modelHelpLink:hover{color:var(--text)}
        .endpointField{display:block;margin:7px 0;color:var(--muted);font-size:11px}
        .endpointField span{display:block;margin-bottom:4px}
        .openAICompatibleBaseURL{font-size:11px}
        .keyRow{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted)}
        .keyEdit{padding:4px 6px;font-size:11px}
        .openAICompatibleKey{margin:6px 0}
        .openAICompatibleAdvancedToggle,.openAICompatiblePromptToggle,.openAICompatibleGlossaryToggle{width:100%;margin-top:8px;text-align:start;background:transparent;color:var(--muted);padding:6px 0}
        .openAICompatibleAdvancedToggle::before,.openAICompatiblePromptToggle::before,.openAICompatibleGlossaryToggle::before{content:"›";display:inline-block;width:14px;color:var(--accent)}
        [aria-expanded="true"].openAICompatibleAdvancedToggle::before,[aria-expanded="true"].openAICompatiblePromptToggle::before,[aria-expanded="true"].openAICompatibleGlossaryToggle::before{content:"⌄"}
        .openAICompatibleAdvanced{padding-top:4px}
        .openAICompatibleParameterTitle{margin:8px 0 5px;color:var(--muted);font-size:11px}
        .openAICompatibleParameters{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .openAICompatibleParameters label{min-width:0;color:var(--muted);font-size:11px}
        .openAICompatibleParameters label span{display:block;margin-bottom:4px}
        .openAICompatiblePromptLabel,.openAICompatibleGlossaryLabel{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:5px 0;color:var(--muted);font-size:11px}
        .localGlossaryLabel{display:block;margin:8px 0 4px;color:var(--muted);font-size:11px}
        .openAICompatiblePromptReset{font-size:10px}
        .openAICompatiblePrompt,.openAICompatibleGlossary{min-height:100px;resize:vertical;font-size:12px}
        .openAICompatibleSiteGlossary{min-height:140px;resize:vertical;font-size:12px;color:var(--muted);background:var(--background)}
        .openAICompatibleAdvancedNotice{margin:8px 0;color:var(--muted);font-size:11px}
        .cacheBox{display:grid;grid-template-columns:auto auto;justify-content:space-between;gap:6px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)}
        .cacheStats{grid-column:1/-1;color:var(--muted);font-size:11px}
        .cacheCopy,.cacheDelete{padding:4px 0;font-size:10px;background:transparent}
        .site{display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0}
        .site a{color:var(--text);text-decoration:none;font-size:14px}
        .siteLabel a{display:flex;align-items:baseline;justify-content:center;flex-wrap:wrap;gap:4px 8px;text-align:center}
        .siteName{font-size:16px;font-weight:600;color:var(--accent)}
        .site a:hover{color:var(--accent)}
        .contacts{display:flex;gap:18px}
        .contactIcon{display:flex;align-items:center;justify-content:center;width:34px;height:34px}
        .contactIcon svg{width:24px;height:24px;fill:currentColor}
      </style>
      <div class="panel" style="${themeStyle(options.theme)}">
        <div class="bar quickLanguage"><span class="quickLanguageLabel">Language</span><select class="language" aria-label="Translation language"></select><button class="collapseToggle" type="button" title="Collapse translator" aria-label="Collapse translator">−</button></div>
        <div class="panelBody">
          <label class="interfaceTranslationToggle"><input type="checkbox" class="interfaceTranslation" aria-label="Translate translator interface"><span class="interfaceTranslationLabel">Translate panel interface</span></label>
          <label class="autoToggle" title="Translate newly visible or changed game text automatically.">
            <input type="checkbox" class="auto" aria-label="Automatically translate new screens">
            <span class="autoCopy"><span class="autoTitle">Auto translate</span><span class="autoState" data-off="Off" data-on="On" aria-hidden="true"></span></span>
            <span class="autoTrack" aria-hidden="true"><span class="autoThumb"></span></span>
          </label>
          <div class="row" hidden><button class="primary translate" aria-label="Translate (Ctrl+Shift+T)"><span class="translateAction">Translate</span><span class="translateShortcut" aria-hidden="true">Ctrl+Shift+T</span></button></div>
        <div class="translationFeedback">
          <div class="status" role="status" aria-live="polite" tabindex="0"></div>
          <button class="secondary retry" type="button" disabled>Retry translation</button>
        </div>
        <div class="screenshotBatchRow"><button class="secondary screenshotBatch" type="button">Capture all languages</button><input class="screenshotNumber" type="number" min="1" max="999" step="1" value="1" aria-label="Screenshot number" title="Number used in every screenshot filename."></div>
        <div class="compat" hidden></div>
        <div class="settings">
          <label class="title translationServiceLabel">Translation service</label><select class="provider"></select>
          <div class="providerHint"></div>
          <div class="openAICompatibleBox" hidden>
            <select class="openAICompatiblePreset" aria-label="OpenAI-compatible preset" title="Select a provider profile, or Custom for your own endpoint.">
              <option value="opencode-go">OpenCode Go</option><option value="opencode-zen">OpenCode Zen</option><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option><option value="lmstudio">LM Studio</option><option value="custom">Custom</option>
            </select>
            <label class="endpointField"><span class="endpointLabel">API address</span><input class="openAICompatibleBaseURL" type="url" autocomplete="off" spellcheck="false" placeholder="https://provider.example/v1" title="API endpoint used to list models and send translation requests."></label>
            <select class="openAICompatibleModel" aria-label="OpenAI-compatible model" title="Open the list to refresh available models, or choose manual entry."><option value="">Choose a listed model…</option></select>
            <div class="modelHelp"><span class="modelHelpQuestion">Don't know which model to choose?</span><button class="modelHelpLink" type="button">How it works</button></div>
            <div class="keyRow"><span class="keyState" role="status"></span><button class="secondary keyEdit" type="button" hidden>Change</button></div>
            <input class="openAICompatibleKey" type="password" autocomplete="off" spellcheck="false" placeholder="API key (stored securely)" title="Saved securely for this Base URL and never stored in the game.">
            <button class="secondary openAICompatibleAdvancedToggle" type="button" aria-expanded="false" aria-controls="openAICompatibleAdvanced" title="Show system prompt and glossary settings.">Advanced</button>
            <div id="openAICompatibleAdvanced" class="openAICompatibleAdvanced" hidden>
            <div class="openAICompatibleParameterTitle">Model parameters</div>
            <div class="openAICompatibleParameters">
              <label><span class="reasoningEffortLabel">Reasoning effort</span><select class="openAICompatibleReasoningEffort" aria-label="Reasoning effort" title="Controls how much reasoning the model may use. Higher values can be slower."><option value="">Provider default</option><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select></label>
              <label><span class="parallelRequestsLabel">Parallel requests</span><select class="openAICompatibleConcurrency" aria-label="Parallel requests" title="Number of translation requests sent at once. Higher is faster but may hit rate limits."><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select></label>
            </div>

              <div class="openAICompatibleAdvancedNotice">After making changes, delete the cache below to retranslate text that was already translated.</div>
              <button class="secondary openAICompatiblePromptToggle" type="button" aria-expanded="false" aria-controls="openAICompatiblePromptEditor" title="Edit the instructions sent to the AI before each text fragment.">System prompt</button>
              <div id="openAICompatiblePromptEditor" class="openAICompatiblePromptEditor" hidden>
                <div class="openAICompatiblePromptLabel"><label class="systemPromptLabel" for="openAICompatiblePrompt">System prompt</label><button class="secondary openAICompatiblePromptReset" type="button" title="Replace the custom prompt with the current VN Revival default.">Restore default</button></div>
                <textarea id="openAICompatiblePrompt" class="openAICompatiblePrompt" maxlength="${maxSystemPromptChars}" spellcheck="false" aria-label="OpenAI-compatible system prompt" title="Instructions sent to the AI before each text fragment."></textarea>
              </div>
              <button class="secondary openAICompatibleGlossaryToggle" type="button" aria-expanded="false" aria-controls="openAICompatibleGlossaryEditor" title="Show the VN Revival glossary and optional local overrides.">Glossary</button>
              <div id="openAICompatibleGlossaryEditor" class="openAICompatibleGlossaryEditor" hidden>
                <div class="openAICompatibleGlossaryLabel"><label class="siteGlossaryLabel" for="openAICompatibleSiteGlossary">VN Revival glossary</label><span class="siteGlossaryStatus">Not loaded</span></div>
                <textarea id="openAICompatibleSiteGlossary" class="openAICompatibleSiteGlossary" readonly spellcheck="false" aria-label="VN Revival translation glossary" title="Exact glossary entries loaded from VN Revival for the selected language."></textarea>
                <label class="localGlossaryLabel" for="openAICompatibleGlossary">Local overrides</label>
                <textarea class="openAICompatibleGlossary" maxlength="${maxGlossaryChars}" spellcheck="false" aria-label="Additional translation glossary" placeholder="Optional overrides: source = translation" title="Add optional source-to-translation overrides; the site glossary loads automatically."></textarea>
              </div>
            </div>
          </div>
          <div class="cacheBox"><div class="cacheStats">Cache: … · Log: …</div><button class="secondary cacheCopy" type="button" title="Copy the local service log to the clipboard." disabled>Copy log</button><button class="danger cacheDelete" type="button" title="Delete all cached translations and the local service log. Other settings stay unchanged.">Clear cache and log</button></div>
        </div>
        </div>
        <div class="site">
          <span class="siteLabel"><a href="${siteURL}" target="_blank" rel="noopener noreferrer"><span class="siteName">${siteName}</span><span>more games here</span></a></span>
          <span class="contacts" aria-label="VN Revival contacts">
            <a class="contactIcon discord" href="https://discord.gg/QgyeWW3Jg" target="_blank" rel="noopener noreferrer" title="Discord" aria-label="VN Revival on Discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 6.2A15 15 0 0 1 10 5.3l.4.8a10 10 0 0 1 3.2 0l.4-.8a15 15 0 0 1 2.9.9c1.8 2.5 2.3 4.9 2 7.2a12 12 0 0 1-3.6 1.8l-.9-1.2c.7-.3 1.3-.6 1.8-1.1-3.4 1.6-7.2 1.6-10.5 0 .5.5 1.1.8 1.8 1.1l-.9 1.2A12 12 0 0 1 3 13.4c-.3-2.3.2-4.7 2-7.2.7-.3 1.4-.6 2.1-.8v.8Zm2.1 6.1c.8 0 1.4-.8 1.4-1.8S10 8.7 9.2 8.7s-1.4.8-1.4 1.8.6 1.8 1.4 1.8Zm5.6 0c.8 0 1.4-.8 1.4-1.8s-.6-1.8-1.4-1.8-1.4.8-1.4 1.8.6 1.8 1.4 1.8Z"/></svg></a>
            <a class="contactIcon telegram" href="https://t.me/VnRevival" target="_blank" rel="noopener noreferrer" title="Telegram" aria-label="VN Revival on Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.4 18.3 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8.9 11.3c-1.1-.3-1.1-1 .2-1.5L20 2.5c.9-.3 1.7.2 1.5.9Z"/></svg></a>
            <a class="contactIcon email" href="mailto:master1c8@proton.me" target="_blank" rel="noopener noreferrer" title="master1c8@proton.me" aria-label="Email master1c8@proton.me"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.1L20.2 7H3.8l8.2 5.1Zm0 2.3L3 8.8V17h18V8.8l-9 5.6Z"/></svg></a>
          </span>
        </div>
      </div>`;
  }

  root.VNRevivalPanelView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
