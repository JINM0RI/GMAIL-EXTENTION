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

  function verifyIdentity() {
    return {
      pageEmail: getVisibleGmailAccountEmail(),
      accountIndex: getGmailAccountIndex(),
      href: String(global.location.href || ""),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) {
      return false;
    }

    (async () => {
      const trial = await globalThis.SenderGrouper.Trial.checkTrial();

      if (msg.type === "SHOW_FLOATING_BUTTON") {
        if (!trial.active) {
          window.__showPaywall && window.__showPaywall();
          sendResponse({ ok: false, code: "TRIAL_EXPIRED", error: "Trial expired" });
          return;
        }
        if (!NAMESPACE.FloatingWidget || typeof NAMESPACE.FloatingWidget.createMainUI !== "function") {
          return;
        }
        NAMESPACE.FloatingWidget.createMainUI();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "TOGGLE_FLOATING_BUTTON") {
        if (!trial.active) {
          window.__showPaywall && window.__showPaywall();
          sendResponse({ ok: false, code: "TRIAL_EXPIRED", error: "Trial expired" });
          return;
        }
        if (!NAMESPACE.FloatingWidget || typeof NAMESPACE.FloatingWidget.toggleFloatingButton !== "function") {
          return;
        }
        NAMESPACE.FloatingWidget.toggleFloatingButton();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "GET_GMAIL_CONTEXT") {
        const identity = verifyIdentity();
        sendResponse({
          ok: true,
          accountEmail: identity.pageEmail,
          pageEmail: identity.pageEmail,
          accountIndex: identity.accountIndex,
          href: identity.href,
        });
        return;
      }

      if (msg.type === "SG_DATA_UPDATED") {
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unsupported message type" });
    })().catch((error) => {
      sendResponse({ ok: false, error: error && error.message ? error.message : "Failed" });
    });

    return true;
  });
})(window);
