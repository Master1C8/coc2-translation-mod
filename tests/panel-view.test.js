const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/panel-view.js");
const render = (theme) => globalThis.VNRevivalPanelView.render({
  theme, siteURL: "https://example.test", siteName: "Example",
  maxSystemPromptChars: 12000, maxGlossaryChars: 8000
});

test("game palettes override semantic colors independently of game identity", () => {
  const first = render({ accent: "#d1aa66", background: "#20131c" });
  const second = render({ accent: "#55aaff", background: "#112233" });
  assert.match(first, /--accent:#d1aa66/);
  assert.match(second, /--accent:#55aaff/);
  assert.match(second, /--background:#112233/);
  assert.match(second, /background:var\(--accent\)/);
  assert.match(render(), /--background:#1e2229/);
});

test("malformed theme values cannot inject HTML or CSS", () => {
  for (const value of ['red;display:none', '</style><script>bad()</script>', 'url(https://example.test)', null, 123]) {
    const html = render({ accent: value, injected: "unexpected-token" });
    assert.match(html, /--accent:#91baff/);
    assert.doesNotMatch(html, /bad\(\)|unexpected-token|--injected/);
  }
});

test("glossary editor exposes site entries separately from local overrides", () => {
  const html = render();
  assert.match(html, /class="openAICompatibleSiteGlossary" readonly/);
  assert.match(html, /class="siteGlossaryStatus">Not loaded</);
  assert.match(html, /class="localGlossaryLabel"[^>]*>Local overrides</);
  assert.match(html, /class="openAICompatibleGlossary" maxlength="8000"/);
});

test("model help cannot navigate the game window", () => {
  const html = render();
  assert.match(html, /class="modelHelpQuestion">Don't know which model to choose\?</);
  assert.match(html, /<button class="modelHelpLink" type="button">How it works<\/button>/);
  assert.doesNotMatch(html, /class="modelHelpLink"[^>]*(?:href|target)=/);
});
