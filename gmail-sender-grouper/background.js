importScripts("auth.js", "emailFetcher.js");

function sendToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  (async () => {
    try {
      if (message.type === "GET_TOKEN") {
        const token = await Auth.getAuthToken(true);
        sendResponse({ ok: true, token });
        return;
      }

      if (message.type === "FETCH_EMAILS") {
        const groupedData = await EmailFetcher.fetchAndGroupAllEmails();
        await chrome.storage.local.set({ senderGrouperData: groupedData });
        sendResponse({ ok: true, groupedData });
        return;
      }

      if (message.type === "CLEAR_TOKEN") {
        await Auth.clearAuthToken();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unsupported message type" });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "Unknown error",
        status: error && error.status ? error.status : null,
      });
    }
  })();

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url || !tab.url.includes("mail.google.com")) {
    return;
  }

  // UI toggle remains content-side; data sync is executed directly in worker.
  await sendToTab(tab.id, { type: "TOGGLE_FLOATING_BUTTON" });

  try {
    await Auth.getAuthToken(true);
    const groupedData = await EmailFetcher.fetchAndGroupAllEmails();
    await chrome.storage.local.set({ senderGrouperData: groupedData });
    await sendToTab(tab.id, { type: "SG_DATA_UPDATED" });
  } catch (error) {
    console.error("[SenderGrouper] Fetch failed", error && error.message ? error.message : error);
  }
});
