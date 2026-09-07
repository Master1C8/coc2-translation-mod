(function () {
  "use strict";
  let failed = false;
  window.smokeReport = function (checks) {
    const failures = Object.keys(checks).filter((name) => checks[name] !== true);
    failed = failed || failures.length > 0;
    // Never expose settings, request payloads, error messages or stack traces.
    const names = failures.map((name) => /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "invalidCheckName");
    if (names.length) {
      document.title = `FAIL: ${names.slice(0, 12).join(", ")}`.slice(0, 500);
      document.getElementById("result").textContent = JSON.stringify({ failures: names });
    } else if (!failed) {
      document.title = "PASS";
      document.getElementById("result").textContent = "PASS";
    }
  };
  function reportException(error) {
    const types = ["TypeError", "ReferenceError", "SyntaxError", "RangeError"];
    const type = error && types.includes(error.name) ? error.name : "Error";
    window.smokeReport({ [`uncaught${type}`]: false });
  }
  window.addEventListener("error", (event) => reportException(event.error));
  window.addEventListener("unhandledrejection", (event) => reportException(event.reason));
})();
