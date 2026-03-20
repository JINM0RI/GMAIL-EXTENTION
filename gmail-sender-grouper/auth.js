(function initAuth(global) {
  "use strict";

  const AUTH_CLIENT_ID = "282534969649-0vduuebhnud23oldrm3uhu21d2irv80s.apps.googleusercontent.com";

  let cachedToken = null;
  let cachedTokenExpiresAt = 0;

  function getChromeError(defaultMessage) {
    if (chrome.runtime && chrome.runtime.lastError) {
      return new Error(chrome.runtime.lastError.message || defaultMessage);
    }
    return new Error(defaultMessage);
  }

  function getOauthConfig() {
    const manifest = chrome.runtime.getManifest();
    const oauth2 = manifest.oauth2 || {};
    const clientId = oauth2.client_id;
    const scope = Array.isArray(oauth2.scopes) ? oauth2.scopes.join(" ") : "";

    if (!clientId || !scope) {
      throw new Error("Missing oauth2.client_id or oauth2.scopes in manifest");
    }

    if (clientId !== AUTH_CLIENT_ID) {
      throw new Error("OAuth client ID mismatch between auth.js and manifest.json");
    }

    return { clientId, scope };
  }

  function buildAuthUrl(forceAccountPicker = false) {
    const { clientId, scope } = getOauthConfig();
    const redirectURLFromApi = chrome.identity.getRedirectURL();
    const redirectURL = `https://${chrome.runtime.id}.chromiumapp.org/`;

    if (redirectURLFromApi !== redirectURL) {
      throw new Error(`Redirect URL mismatch: expected ${redirectURL}, got ${redirectURLFromApi}`);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "token",
      redirect_uri: redirectURL,
      scope,
    });

    if (forceAccountPicker) {
      params.set("prompt", "select_account");
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  function parseOAuthResponse(responseUrl) {
    if (!responseUrl) {
      throw new Error("No response URL returned from OAuth flow");
    }

    const hashIndex = responseUrl.indexOf("#");
    if (hashIndex < 0) {
      throw new Error("OAuth response did not include hash fragment");
    }

    const hashParams = new URLSearchParams(responseUrl.slice(hashIndex + 1));
    const accessToken = hashParams.get("access_token");
    const expiresInRaw = hashParams.get("expires_in");
    const expiresIn = Number.parseInt(expiresInRaw || "0", 10);

    if (!accessToken) {
      const error = hashParams.get("error") || "unknown_error";
      throw new Error(`OAuth failed: ${error}`);
    }

    return {
      accessToken,
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
    };
  }

  async function clearIdentityTokenCache() {
    cachedToken = null;
    cachedTokenExpiresAt = 0;

    if (typeof chrome.identity.clearAllCachedAuthTokens === "function") {
      await new Promise((resolve) => {
        chrome.identity.clearAllCachedAuthTokens(() => {
          resolve();
        });
      });
      return;
    }

    await clearAuthToken();
  }

  async function launchFlow(authUrl, interactive) {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(getChromeError("Failed to get auth token"));
          return;
        }

        try {
          const parsed = parseOAuthResponse(responseUrl);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async function requestToken(interactive, forceAccountPicker = false) {
    const authUrl = buildAuthUrl(forceAccountPicker);

    try {
      return await launchFlow(authUrl, interactive);
    } catch (firstError) {
      // If the previous flow failed, force-clear cached auth data before trying once more.
      await clearIdentityTokenCache();

      try {
        return await launchFlow(authUrl, interactive);
      } catch (_retryError) {
        throw firstError;
      }
    }
  }

  async function getAuthToken(interactive = true, forceRefresh = false, forceAccountPicker = false) {
    if (forceRefresh || forceAccountPicker) {
      await clearIdentityTokenCache();
    }

    if (!forceAccountPicker && cachedToken && (!cachedTokenExpiresAt || Date.now() < cachedTokenExpiresAt)) {
      return cachedToken;
    }

    if (forceAccountPicker) {
      if (!interactive) {
        throw new Error("Authentication requires user interaction");
      }
      const tokenResult = await requestToken(true, true);
      cachedToken = tokenResult.accessToken;
      cachedTokenExpiresAt = tokenResult.expiresAt;
      return cachedToken;
    }

    try {
      const tokenResult = await requestToken(false, false);
      cachedToken = tokenResult.accessToken;
      cachedTokenExpiresAt = tokenResult.expiresAt;
      return cachedToken;
    } catch (_nonInteractiveError) {
      if (!interactive) {
        throw new Error("Authentication requires user interaction");
      }
      const tokenResult = await requestToken(true, false);
      cachedToken = tokenResult.accessToken;
      cachedTokenExpiresAt = tokenResult.expiresAt;
      return cachedToken;
    }
  }

  async function clearAuthToken() {
    const token = cachedToken;
    cachedToken = null;
    cachedTokenExpiresAt = 0;

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
    let token = await getAuthToken(false, false);
    let response = await fetch(url, withAuthorizationHeader(options, token));

    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    // Token likely expired or revoked: clear cached token and retry once.
    await clearAuthToken();
    token = await getAuthToken(false, true);
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
