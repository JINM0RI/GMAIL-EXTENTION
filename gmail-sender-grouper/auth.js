(function initAuth(global) {
  "use strict";

  let cachedToken = null;

  function getChromeError(defaultMessage) {
    if (chrome.runtime && chrome.runtime.lastError) {
      return new Error(chrome.runtime.lastError.message || defaultMessage);
    }
    return new Error(defaultMessage);
  }

  async function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(getChromeError("Failed to get auth token"));
          return;
        }
        resolve(token);
      });
    });
  }

  async function getAuthToken(interactive = true, forceRefresh = false) {
    if (forceRefresh) {
      await clearAuthToken();
    }

    if (cachedToken) {
      return cachedToken;
    }

    try {
      cachedToken = await requestToken(false);
      return cachedToken;
    } catch (_nonInteractiveError) {
      if (!interactive) {
        throw new Error("Authentication requires user interaction");
      }
      cachedToken = await requestToken(true);
      return cachedToken;
    }
  }

  async function clearAuthToken() {
    const token = cachedToken;
    cachedToken = null;

    if (!token) {
      return;
    }

    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        resolve();
      });
    });
  }

  function withAuthorizationHeader(options, token) {
    const nextOptions = { ...(options || {}) };
    const headers = new Headers(nextOptions.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    nextOptions.headers = headers;
    return nextOptions;
  }

  async function fetchWithAuth(url, options) {
    let token = await getAuthToken(true, false);
    let response = await fetch(url, withAuthorizationHeader(options, token));

    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    // Token likely expired or revoked: clear cached token and retry once.
    await clearAuthToken();
    token = await getAuthToken(true, true);
    response = await fetch(url, withAuthorizationHeader(options, token));

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed after token refresh (${response.status})`);
    }

    return response;
  }

  global.Auth = {
    getAuthToken,
    clearAuthToken,
    fetchWithAuth,
  };
})(globalThis);
