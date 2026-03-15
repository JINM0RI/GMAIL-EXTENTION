(function initGmailLoader(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function isGmailUiReady() {
    return Boolean(
      document.querySelector("div[role='main']") ||
        document.querySelector("div[gh='tl']") ||
        document.querySelector("div[role='banner']") ||
        document.querySelector("div[role='application']")
    );
  }

  async function waitForDocumentInteractive(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (document.readyState === "interactive" || document.readyState === "complete") {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

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
      if (isGmailUiReady()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  async function init() {
    await waitForDocumentInteractive(15000);
    const uiReady = await waitForGmailUi(35000);

    if (!global.Gmail) {
      throw new Error("Gmail.js library is not loaded. Ensure libs/gmail.js is included before gmailLoader.js.");
    }

    if (!uiReady) {
      console.warn("[SenderGrouper] Gmail UI readiness check timed out; continuing with deferred observers.");
    }

    return createGmailInstance();
  }

  NAMESPACE.GmailLoader = {
    init,
  };
})(window);
