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

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Runtime messaging failed"));
          return;
        }
        resolve(response || null);
      });
    });
  }

  async function requestTokenAndEmails() {
    const tokenResult = await sendRuntimeMessage({ type: "GET_TOKEN" });
    if (!tokenResult || !tokenResult.ok) {
      throw new Error((tokenResult && tokenResult.error) || "Failed to get auth token");
    }

    const fetchResult = await sendRuntimeMessage({ type: "FETCH_EMAILS" });
    if (!fetchResult || !fetchResult.ok) {
      throw new Error((fetchResult && fetchResult.error) || "Failed to fetch emails");
    }

    return fetchResult.groupedData;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) {
      return;
    }

    if (msg.type === "TOGGLE_FLOATING_BUTTON") {
      if (!NAMESPACE.FloatingWidget || typeof NAMESPACE.FloatingWidget.toggleFloatingButton !== "function") {
        return;
      }
      const visible = NAMESPACE.FloatingWidget.toggleFloatingButton();
      if (visible) {
        requestTokenAndEmails().catch((error) => {
          console.error("[SenderGrouper] Failed to sync Gmail data", error && error.message ? error.message : error);
        });
      }
      return true;
    }

    if (msg.type === "SG_DATA_UPDATED") {
      // UI listens to chrome.storage.onChanged; this is an optional sync hint.
      return true;
    }

    return undefined;
  });
})(window);
