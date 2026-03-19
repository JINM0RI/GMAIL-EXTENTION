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

function parseAccountIndexFromUrl(url) {
  const match = /\/mail\/u\/(\d+)\//i.exec(String(url || ""));
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
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
        groupedData.ownerEmail = accountCheck.authenticatedEmail;
        groupedData.ownerAccountIndex = Number.isFinite(accountCheck.accountIndex) ? accountCheck.accountIndex : 0;
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
