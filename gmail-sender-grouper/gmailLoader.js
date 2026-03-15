(function initGmailLoader(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function createGmailInstance() {
    if (global.gmail && global.gmail.observe) {
      return global.gmail;
    }

    if (!global.Gmail) {
      throw new Error("Gmail.js constructor not found on window");
    }

    const jq = global.jQuery || global.$;
    if (!jq) {
      throw new Error("jQuery is not available for Gmail.js initialization");
    }

    const gmail = new global.Gmail(jq);
    if (!gmail || !gmail.observe) {
      throw new Error("Gmail.js initialized but observer API is unavailable");
    }

    // Silence noisy legacy warnings from Gmail.js internals while keeping functionality.
    gmail.DISABLE_OLD_GMAIL_API_DEPRECATION_WARNINGS = true;

    global.gmail = gmail;
    return gmail;
  }

  async function waitForGmailUi(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (document.querySelector("div[role='main']") && document.querySelector("div[role='banner']")) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("Gmail UI did not become ready in time");
  }

  async function init() {
    await waitForGmailUi(15000);

    if (!global.Gmail) {
      throw new Error("Gmail.js library is not loaded. Ensure libs/gmail.js is included before gmailLoader.js.");
    }

    return createGmailInstance();
  }

  NAMESPACE.GmailLoader = {
    init,
  };
})(window);
