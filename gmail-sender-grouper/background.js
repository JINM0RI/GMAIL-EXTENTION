importScripts("auth.js", "emailFetcher.js");

function sendToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || "Failed to send tab message";
        // A listener may handle the message synchronously without sending a response.
        if (/message port closed before a response was received/i.test(message)) {
          resolve({ ok: true, warning: message });
          return;
        }
        resolve({ ok: false, error: message });
        return;
      }
      resolve({ ok: true });
    });
  });
}

async function ensureGmailUiInjected(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"],
    });
  } catch (_error) {
    // CSS may already be present; continue with script injection.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js", "uiRenderer.js", "floatingButton.js"],
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
  const response = await Auth.fetchWithAuth("https://www.googleapis.com/oauth2/v3/userinfo", {
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
  const visibleEmail = normalizeEmail((tabContext && tabContext.pageEmail) || (tabContext && tabContext.accountEmail));
  const accountIndex =
    tabContext && Number.isFinite(Number(tabContext.accountIndex)) ? Number.parseInt(String(tabContext.accountIndex), 10) : null;

  if (visibleEmail && authenticatedEmail && visibleEmail !== authenticatedEmail) {
    return {
      ok: false,
      authenticatedEmail,
      visibleEmail,
      accountIndex,
      message: `Account Mismatch! You are viewing ${visibleEmail}, but signed in as ${authenticatedEmail}. Please switch to the correct Gmail account to access the service.`,
    };
  }

  return {
    ok: true,
    authenticatedEmail,
    visibleEmail,
    accountIndex,
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
        groupedData.ownerEmail = accountCheck.authenticatedEmail;
        groupedData.ownerAccountIndex = Number.isFinite(accountCheck.accountIndex) ? accountCheck.accountIndex : 0;
        await chrome.storage.local.set({ senderGrouperData: groupedData });
        sendResponse({ ok: true, groupedData });
        return;
      }

      if (message.type === "REFRESH_EMAILS") {
        const authenticatedEmail = await fetchAuthenticatedEmail();
        const tabContext = await requestTabContext(sender && sender.tab ? sender.tab.id : null);
        const accountIndex = tabContext && Number.isFinite(Number(tabContext.accountIndex))
          ? Number.parseInt(String(tabContext.accountIndex), 10)
          : 0;
        const scanPromise = EmailFetcher.fetchAndGroupAllEmails();
        const groupedData = await scanPromise;
        groupedData.ownerEmail = authenticatedEmail;
        groupedData.ownerAccountIndex = accountIndex;
        await chrome.storage.local.set({ senderGrouperData: groupedData });
        sendResponse({ ok: true, groupedData });
        return;
      }

      if (message.type === "OPEN_EMAIL") {
        const messageId = String(message.messageId || "").trim();
        if (!messageId) {
          sendResponse({ ok: false, error: "Missing messageId" });
          return;
        }

        const ownerEmail = normalizeEmail(message.ownerEmail);
        const preferredIndex = Number.isFinite(Number(message.ownerAccountIndex))
          ? Number.parseInt(String(message.ownerAccountIndex), 10)
          : 0;

        const targetUrl = ownerEmail
          ? `https://mail.google.com/mail/u/${encodeURIComponent(ownerEmail)}/#inbox/${encodeURIComponent(messageId)}`
          : `https://mail.google.com/mail/u/${preferredIndex}/#inbox/${encodeURIComponent(messageId)}`;

        await chrome.tabs.create({ url: targetUrl, active: true });
        sendResponse({ ok: true, action: "created-tab", ownerEmail, accountIndex: preferredIndex });
        return;
      }

      if (message.type === "CLEAR_TOKEN") {
        await Auth.clearAuthToken();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unsupported message type" });
    } catch (error) {
      const messageText = error && error.message ? String(error.message) : "Unknown error";
      const isAuthRequired = /requires user interaction|authentication required|login required/i.test(messageText);
      sendResponse({
        ok: false,
        code: isAuthRequired ? "AUTH_REQUIRED" : undefined,
        error: messageText,
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
  const firstTry = await sendToTab(tab.id, { type: "TOGGLE_FLOATING_BUTTON" });
  if (firstTry.ok) {
    return;
  }

  // Common after extension reload/update: content script context is gone on existing Gmail tab.
  await ensureGmailUiInjected(tab.id);

  await new Promise((resolve) => setTimeout(resolve, 120));
  await sendToTab(tab.id, { type: "TOGGLE_FLOATING_BUTTON" });
});
