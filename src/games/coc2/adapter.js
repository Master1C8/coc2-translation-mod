(function (root) {
  "use strict";

  const adapter = Object.freeze({
    contractVersion: 2,
    privateSelectors: Object.freeze([
      ".saveSlot", ".hotkeyIndicator", ".gamepadCursorWrapper",
      "[class*='playerName' i]", "[class*='characterName' i]", "[data-coc2-private]"
    ]),
    categorySelectors: Object.freeze({
      story: ".scene,.story,.output,.eventText,.sceneText,.combatOutput,[class*='story' i]",
      control: "button,[role='button'],a,.button,select",
      tooltip: ".tooltip,[role='tooltip'],[class*='tooltip' i],[class*='hover' i]"
    }),
    contextSelectors: Object.freeze([
      "button", "[role='button']", "a", "[role='link']", "select", "p", "li", "blockquote",
      "h1", "h2", "h3", "h4", "h5", "h6", ".sceneText", ".eventText",
      ".combatOutput", ".tooltip", "[role='tooltip']", "[class*='tooltip' i]", "[class*='hover' i]"
    ]),
    getGameVersion(gameWindow) {
      return String(gameWindow && gameWindow.version || "");
    },
    hasSourceText(value, core) {
      return core.hasEnglishText(value);
    }
  });

  root.VNRevivalGameAdapter = adapter;
})(typeof globalThis !== "undefined" ? globalThis : this);
