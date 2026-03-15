(function initGmailLoader(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});
  const GMAIL_JS_CDN = "https://cdn.jsdelivr.net/gh/KartikTalwar/gmail.js/src/gmail.js";

  function loadExternalScript(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-sg-gmailjs="true"]');
      if (existing) {
        if (global.Gmail) {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Gmail.js script")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.sgGmailjs = "true";

      const timer = global.setTimeout(() => {
        script.remove();
        reject(new Error("Timed out while loading Gmail.js"));
      }, timeoutMs);

      script.addEventListener(
        "load",
        () => {
          global.clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => {
          global.clearTimeout(timer);
          reject(new Error("Failed to load Gmail.js script"));
        },
        { once: true }
      );

      (document.head || document.documentElement).appendChild(script);
    });
  }

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
      await loadExternalScript(GMAIL_JS_CDN, 12000);
    }

    return createGmailInstance();
  }

  NAMESPACE.GmailLoader = {
    init,
  };
})(window);
