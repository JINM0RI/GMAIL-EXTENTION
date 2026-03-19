(function bootstrapSenderGrouper(global) {
  "use strict";

  if (global !== global.top) {
    return;
  }

  if (global.__SG_EXTENSION_INITIALIZED__) {
    return;
  }
  global.__SG_EXTENSION_INITIALIZED__ = true;

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function extractEmailFromText(value) {
    const text = String(value || "");
    const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text);
    return match ? match[0].toLowerCase() : "";
  }

  function getVisibleGmailAccountEmail() {
    const titleEmail = extractEmailFromText(document && document.title);
    if (titleEmail) {
      return titleEmail;
    }

    const selectors = [
      'a[aria-label*="Google Account"]',
      'a[aria-label*="Google Account"][href*="accounts.google.com"]',
      'div[aria-label*="Google Account"]',
      'button[aria-label*="Google Account"]',
      'a[aria-label*="Google Account"]',
      'a[aria-label*="@"]',
      'div[aria-label*="@"]',
      'button[aria-label*="@"]',
      'img[aria-label*="@"]',
      '[data-email]',
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const values = [
          node.getAttribute && node.getAttribute("data-email"),
          node.getAttribute && node.getAttribute("aria-label"),
          node.getAttribute && node.getAttribute("title"),
          node.textContent,
        ];
        for (const value of values) {
          const email = extractEmailFromText(value);
          if (email) {
            return email;
          }
        }
      }
    }

    return "";
  }

  function getGmailAccountIndex() {
    const match = /\/mail\/u\/(\d+)\//i.exec(global.location.pathname || "");
    return match ? Number.parseInt(match[1], 10) : null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) {
      return;
    }

    if (msg.type === "TOGGLE_FLOATING_BUTTON") {
      if (!NAMESPACE.FloatingWidget || typeof NAMESPACE.FloatingWidget.toggleFloatingButton !== "function") {
        return;
      }
      NAMESPACE.FloatingWidget.toggleFloatingButton();
      return true;
    }

    if (msg.type === "SG_DATA_UPDATED") {
      // UI listens to chrome.storage.onChanged; this is an optional sync hint.
      return true;
    }

    if (msg.type === "GET_GMAIL_CONTEXT") {
      return {
        ok: true,
        accountEmail: getVisibleGmailAccountEmail(),
        accountIndex: getGmailAccountIndex(),
        href: String(global.location.href || ""),
      };
    }

    return undefined;
  });
})(window);
