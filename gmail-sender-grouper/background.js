importScripts("auth.js", "emailFetcher.js");

function sendToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function requestTabContext(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(null);
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: "GET_GMAIL_CONTEXT" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchAuthenticatedEmail() {
  const response = await Auth.fetchWithAuth("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get token identity (${response.status}): ${body}`);
  }

  const profile = await response.json();
  return normalizeEmail(profile && profile.email);
}

async function verifyAccountMatch(tabId) {
  const authenticatedEmail = await fetchAuthenticatedEmail();
  const tabContext = await requestTabContext(tabId);
  const visibleEmail = normalizeEmail(tabContext && tabContext.accountEmail);

  if (visibleEmail && authenticatedEmail && visibleEmail !== authenticatedEmail) {
    return {
      ok: false,
      authenticatedEmail,
      visibleEmail,
      message: `Wrong Account! You are signed in as ${authenticatedEmail}. Please switch accounts or Re-login.`,
    };
  }

  return {
    ok: true,
    authenticatedEmail,
    visibleEmail,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  (async () => {
    try {
      if (message.type === "GET_TOKEN") {
        const token = await Auth.getAuthToken(
          message.interactive !== false,
          Boolean(message.forceRefresh),
          Boolean(message.forceAccountPicker)
        );
        sendResponse({ ok: true, token });
        return;
      }

      if (message.type === "FETCH_EMAILS") {
        const accountCheck = await verifyAccountMatch(sender && sender.tab ? sender.tab.id : null);
        if (!accountCheck.ok) {
          sendResponse({
            ok: false,
            code: "ACCOUNT_MISMATCH",
            error: accountCheck.message,
            authenticatedEmail: accountCheck.authenticatedEmail,
            visibleEmail: accountCheck.visibleEmail,
          });
          return;
        }

        const groupedData = await EmailFetcher.fetchAndGroupAllEmails();
        await chrome.storage.local.set({ senderGrouperData: groupedData });
        sendResponse({ ok: true, groupedData });
        return;
      }

      if (message.type === "REFRESH_EMAILS") {
        const accountCheck = await verifyAccountMatch(sender && sender.tab ? sender.tab.id : null);
        if (!accountCheck.ok) {
          sendResponse({
            ok: false,
            code: "ACCOUNT_MISMATCH",
            error: accountCheck.message,
            authenticatedEmail: accountCheck.authenticatedEmail,
            visibleEmail: accountCheck.visibleEmail,
          });
          return;
        }

        const scanPromise = EmailFetcher.fetchAndGroupAllEmails();
        await chrome.storage.local.clear();
        const groupedData = await scanPromise;
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

  // Only open/close the floating UI. Auth now starts only from the profile icon in the injected panel.
  await sendToTab(tab.id, { type: "TOGGLE_FLOATING_BUTTON" });
});
