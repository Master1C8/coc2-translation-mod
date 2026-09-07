const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const listeners = {};
  const result = {};
  const document = { title: "PENDING", getElementById: () => result };
  const window = { addEventListener: (name, handler) => { listeners[name] = handler; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "runtime/smoke-report.js"), "utf8"), { window, document });
  return { window, document, result, listeners };
}

test("smoke reports all failed names and cannot turn a failure into PASS", () => {
  const { window, document, result } = fixture();
  window.smokeReport({ cache: true, rtl: false, marker: undefined });
  assert.equal(document.title, "FAIL: rtl, marker");
  assert.deepEqual(JSON.parse(result.textContent).failures, ["rtl", "marker"]);
  window.smokeReport({ cache: true });
  assert.match(document.title, /^FAIL:/);
});

test("smoke exceptions expose only a known error type", () => {
  for (const event of ["error", "unhandledrejection"]) {
    const { listeners, document, result } = fixture();
    const error = { name: "TypeError", message: "private payload", stack: "private path" };
    listeners[event]({ error, reason: error });
    assert.equal(document.title, "FAIL: uncaughtTypeError");
    assert.doesNotMatch(result.textContent, /private/);
  }
});

test("smoke bounds title length and reports PASS for successful checks", () => {
  const { window, document } = fixture();
  window.smokeReport({ cache: true });
  assert.equal(document.title, "PASS");
  window.smokeReport(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`check${i}`, false])));
  assert.ok(document.title.length <= 500);
  assert.match(document.title, /check11/);
  assert.doesNotMatch(document.title, /check12/);
});
