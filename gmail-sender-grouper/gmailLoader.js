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

    const gmail = new global.Gmail();
    if (!gmail || !gmail.observe) {
      throw new Error("Gmail.js initialized but observer API is unavailable");
    }

    global.gmail = gmail;
    return gmail;
  }

  async function waitForGmailUi(maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (document.querySelector("div[role='main']")) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("Gmail UI did not become ready in time");
  }

  async function init() {
    await waitForGmailUi(15000);

    if (!global.Gmail) {
      throw new Error("Gmail.js library is not loaded. Ensure gmail.js is included before gmailLoader.js.");
    }

    return createGmailInstance();
  }

  NAMESPACE.GmailLoader = {
    init,
  };
})(window);
