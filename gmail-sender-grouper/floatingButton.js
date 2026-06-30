(function initFloatingWidget(global) {
  "use strict";

  if (global !== global.top) {
    return;
  }

  if (global.__SG_FLOATING_WIDGET_INITIALIZED__) {
    return;
  }
  global.__SG_FLOATING_WIDGET_INITIALIZED__ = true;

  const STORAGE_KEY = "senderGrouperData";
  const THEME_STORAGE_KEY = "theme";
  const UI_VISIBILITY_KEY = "sgWidgetVisible";
  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});
  const state = {
    dom: null,
    controller: null,
    mounted: false,
    mounting: false,
    watchdogId: null,
  };

  function applyThemeClass(theme) {
    const isDark = theme === "dark";
    global.document.body.classList.toggle("dark-mode", isDark);
    return isDark;
  }

  function initTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        const theme = chrome.runtime.lastError ? "light" : result[THEME_STORAGE_KEY] === "dark" ? "dark" : "light";
        applyThemeClass(theme);
        resolve(theme);
      });
    });
  }

  function getSavedTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve("light");
          return;
        }
        resolve(result[THEME_STORAGE_KEY] === "dark" ? "dark" : "light");
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const runtimeErrorMessage = chrome.runtime.lastError.message || "Runtime messaging failed";
          if (/extension context invalidated/i.test(runtimeErrorMessage)) {
            reject(new Error("Extension was reloaded. Click the extension icon once and try again."));
            return;
          }
          reject(new Error(runtimeErrorMessage));
          return;
        }
        resolve(response || null);
      });
    });
  }

  function persistWidgetVisibility(isVisible) {
    chrome.storage.local.set({ [UI_VISIBILITY_KEY]: Boolean(isVisible) });
  }

  function readWidgetVisibility() {
    return new Promise((resolve) => {
      chrome.storage.local.get([UI_VISIBILITY_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(result[UI_VISIBILITY_KEY]));
      });
    });
  }

  function buildWidgetDom() {
    const button = document.createElement("button");
    button.id = "sg-floating-button";
    button.className = "sg-floating-button";
    button.type = "button";
    button.setAttribute("aria-label", "Open Sender Grouper");
    button.title = "Sender Grouper";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 4h20v16H2V4zm2 2v.51L12 13l8-6.49V6H4zm16 12V9.04l-7.39 5.99a1 1 0 0 1-1.22 0L4 9.04V18h16z"></path></svg>';

    const panel = document.createElement("section");
    panel.id = "sg-main-ui";
    panel.className = "popup-container sg-floating-panel";
    panel.setAttribute("aria-hidden", "true");

    panel.innerHTML = [
      '<header class="sg-widget-header">',
      '  <div class="sg-widget-header-copy">',
      '    <h2 class="sg-widget-title">Sender Grouper</h2>',
      '    <p class="sg-widget-subtitle">Grouped Gmail Senders</p>',
      "  </div>",
      '  <div class="sg-widget-header-actions">',
      '    <button type="button" id="sg-widget-refresh" class="sg-widget-refresh" aria-label="Refresh sender scan">',
      '      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 12.65-5.65z"></path></svg>',
      "    </button>",
      '    <button type="button" id="theme-toggle" class="sg-widget-theme" aria-label="Enable dark mode" title="Enable dark mode">',
      '      <svg class="sg-theme-icon sg-theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a1 1 0 0 1 .58 1.81 7 7 0 1 0 8.61 8.61A1 1 0 0 1 22.81 14 9 9 0 1 1 12 3z"></path></svg>',
      '      <svg class="sg-theme-icon sg-theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm10-5a1 1 0 0 1-1 1h-2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zM5 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h2a1 1 0 0 1 1 1zm13.07-6.07a1 1 0 0 1 1.41 1.41l-1.41 1.41a1 1 0 0 1-1.41-1.41zM7.34 16.66a1 1 0 0 1 1.41 1.41l-1.41 1.41a1 1 0 0 1-1.41-1.41zm0-9.32L5.93 5.93A1 1 0 1 1 7.34 4.52l1.41 1.41A1 1 0 0 1 7.34 7.34zm11.73 11.73a1 1 0 0 1-1.41 0l-1.41-1.41a1 1 0 0 1 1.41-1.41l1.41 1.41a1 1 0 0 1 0 1.41z"></path></svg>',
      "    </button>",
      '    <button type="button" id="auth-profile-btn" class="sg-widget-profile" aria-label="Switch Gmail account and scan">',
      '      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"></path></svg>',
      "    </button>",
      '    <button type="button" class="sg-widget-close" aria-label="Close Sender Grouper">&times;</button>',
      "  </div>",
      "</header>",
      '<div id="sg-trial-banner" class="sg-trial-banner"></div>',
      '<section class="sg-widget-stats">',
      '  <article class="stat-card sg-widget-stat-card">',
      '    <div class="sg-widget-stat-label">Total Senders</div>',
      '    <div id="sg-widget-total-senders" class="sg-widget-stat-value">0</div>',
      "  </article>",
      '  <article class="stat-card sg-widget-stat-card">',
      '    <div class="sg-widget-stat-label">Total Emails</div>',
      '    <div id="sg-widget-total-emails" class="sg-widget-stat-value">0</div>',
      "  </article>",
      "</section>",
      '<div class="sg-widget-search-wrap">',
      '  <input id="sg-widget-search" class="sg-widget-search" type="search" placeholder="Search sender name or email" autocomplete="off" />',
      "</div>",
      '<section class="sg-widget-list-wrap">',
      '  <div id="sg-widget-loading" class="sg-widget-loading">Loading grouped senders...</div>',
      '  <div id="sg-widget-empty" class="sg-widget-empty" hidden>No sender data available yet.</div>',
      '  <div id="sg-widget-list" class="sg-widget-list"></div>',
      "</section>",
      '<footer id="sg-widget-updated-at" class="sg-widget-footer">Updated time unavailable</footer>',
    ].join("");

    return {
      button,
      panel,
      closeButton: panel.querySelector(".sg-widget-close"),
      refreshButton: panel.querySelector("#sg-widget-refresh"),
      themeToggleButton: panel.querySelector("#theme-toggle"),
      profileButton: panel.querySelector("#auth-profile-btn"),
      totalSendersNode: panel.querySelector("#sg-widget-total-senders"),
      totalEmailsNode: panel.querySelector("#sg-widget-total-emails"),
      searchInputNode: panel.querySelector("#sg-widget-search"),
      loadingNode: panel.querySelector("#sg-widget-loading"),
      emptyStateNode: panel.querySelector("#sg-widget-empty"),
      listNode: panel.querySelector("#sg-widget-list"),
      updatedAtNode: panel.querySelector("#sg-widget-updated-at"),
      trialBannerNode: panel.querySelector("#sg-trial-banner"),
    };
  }

  function createController(dom, renderer) {
    let isOpen = false;
    let authInFlight = false;
    let refreshInFlight = false;

    function saveTheme(theme) {
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
    }

    function setThemeIcon(isDark) {
      if (!dom.themeToggleButton) {
        return;
      }
      dom.themeToggleButton.setAttribute("aria-pressed", isDark ? "true" : "false");
      dom.themeToggleButton.setAttribute("aria-label", isDark ? "Enable light mode" : "Enable dark mode");
      dom.themeToggleButton.title = isDark ? "Enable light mode" : "Enable dark mode";
    }

    function applyTheme(theme) {
      const isDark = applyThemeClass(theme);
      setThemeIcon(isDark);
    }

    if (dom.themeToggleButton) {
      dom.themeToggleButton.addEventListener("click", () => {
        const isDark = global.document.body.classList.toggle("dark-mode");
        saveTheme(isDark ? "dark" : "light");
        setThemeIcon(isDark);
      });
    }

    applyTheme(global.document.body.classList.contains("dark-mode") ? "dark" : "light");

    function openPanel() {
      isOpen = true;
      dom.panel.classList.add("is-open");
      dom.panel.setAttribute("aria-hidden", "false");
      dom.button.classList.add("is-active");
      dom.button.setAttribute("aria-expanded", "true");
      global.setTimeout(() => {
        if (dom.searchInputNode) {
          dom.searchInputNode.focus({ preventScroll: true });
        }
      }, 40);
    }

    function closePanel() {
      isOpen = false;
      dom.panel.classList.remove("is-open");
      dom.panel.setAttribute("aria-hidden", "true");
      dom.button.classList.remove("is-active");
      dom.button.setAttribute("aria-expanded", "false");
    }

    function toggleMainUI() {
      if (isOpen) {
        closePanel();
        return;
      }
      openPanel();
    }

    dom.button.addEventListener("click", toggleMainUI);
    dom.closeButton.addEventListener("click", closePanel);

    async function checkAuth(options) {
      const settings = options || {};
      const interactiveFallback = Boolean(settings.interactiveFallback);
      const forceRefresh = Boolean(settings.forceRefresh);
      const forceAccountPicker = Boolean(settings.forceAccountPicker);

      // Profile login should force the account picker and skip silent token reuse.
      if (forceAccountPicker) {
        const interactiveResult = await sendRuntimeMessage({
          type: "GET_TOKEN",
          interactive: true,
          forceRefresh: true,
          forceAccountPicker: true,
        });

        if (interactiveResult && interactiveResult.ok && interactiveResult.token) {
          return {
            ok: true,
            token: interactiveResult.token,
            interactive: true,
          };
        }

        return {
          ok: false,
          code: (interactiveResult && interactiveResult.code) || "AUTH_FAILED",
          error: (interactiveResult && interactiveResult.error) || "Failed to sign in",
        };
      }

      const silentResult = await sendRuntimeMessage({
        type: "GET_TOKEN",
        interactive: false,
        forceRefresh,
        forceAccountPicker: false,
      });

      if (silentResult && silentResult.ok && silentResult.token) {
        return {
          ok: true,
          token: silentResult.token,
          interactive: false,
        };
      }

      if (!interactiveFallback) {
        return {
          ok: false,
          code: (silentResult && silentResult.code) || "AUTH_REQUIRED",
          error: (silentResult && silentResult.error) || "Session expired. Click Profile Login to continue.",
        };
      }

      const interactiveResult = await sendRuntimeMessage({
        type: "GET_TOKEN",
        interactive: true,
        forceRefresh,
        forceAccountPicker,
      });

      if (interactiveResult && interactiveResult.ok && interactiveResult.token) {
        return {
          ok: true,
          token: interactiveResult.token,
          interactive: true,
        };
      }

      return {
        ok: false,
        code: (interactiveResult && interactiveResult.code) || "AUTH_FAILED",
        error: (interactiveResult && interactiveResult.error) || "Failed to sign in",
      };
    }

    async function runScan(messageType, options) {
      const settings = options || {};
      const suppressAuthMessage = Boolean(settings.suppressAuthMessage);
      const returnDetails = Boolean(settings.returnDetails);
      const result = await sendRuntimeMessage({ type: messageType });
      if (result && result.code === "TRIAL_EXPIRED") {
        if (window.__showPaywall) {
          window.__showPaywall();
        }
        return returnDetails
          ? {
              ok: false,
              code: "TRIAL_EXPIRED",
              error: result.error || "Your 7-day free trial has ended. Subscribe to continue.",
            }
          : false;
      }
      if (result && result.code === "AUTH_REQUIRED") {
        if (!suppressAuthMessage && renderer && typeof renderer.showStatusMessage === "function") {
          renderer.showStatusMessage(result.error || "Session expired. Click Profile Login to continue.");
        }
        return returnDetails
          ? {
              ok: false,
              code: "AUTH_REQUIRED",
              error: result.error || "Session expired. Click Profile Login to continue.",
            }
          : false;
      }
      if (result && result.code === "ACCOUNT_MISMATCH") {
        if (renderer && typeof renderer.showAccountMismatch === "function") {
          renderer.showAccountMismatch(result.error, () => {
            handleProfileLoginClick();
          });
        } else if (renderer && typeof renderer.showStatusMessage === "function") {
          renderer.showStatusMessage(result.error);
        }
        return returnDetails
          ? {
              ok: false,
              code: "ACCOUNT_MISMATCH",
              error: result.error || "Account mismatch",
            }
          : false;
      }
      if (!result || !result.ok || !result.groupedData) {
        throw new Error((result && result.error) || "Email scan failed");
      }

      renderer.setData(result.groupedData);
      return returnDetails
        ? {
            ok: true,
            code: null,
            error: null,
          }
        : true;
    }

    async function handleRefreshClick() {
      if (refreshInFlight || authInFlight) {
        return;
      }

      refreshInFlight = true;
      if (renderer && typeof renderer.showLoadingState === "function") {
        renderer.showLoadingState();
      }
      if (dom.refreshButton) {
        dom.refreshButton.disabled = true;
      }

      try {
        let scanResult = await runScan("REFRESH_EMAILS", {
          suppressAuthMessage: true,
          returnDetails: true,
        });

        // Retry with an interactive auth only when Gmail reports auth is required.
        if (!scanResult.ok && scanResult.code === "AUTH_REQUIRED") {
          const authResult = await checkAuth({
            interactiveFallback: true,
            forceRefresh: false,
            forceAccountPicker: false,
          });

          if (!authResult.ok) {
            throw new Error(authResult.error || "Authentication failed during refresh");
          }

          if (renderer && typeof renderer.showLoadingState === "function") {
            renderer.showLoadingState();
          }

          scanResult = await runScan("REFRESH_EMAILS", { returnDetails: true });
          if (!scanResult.ok) {
            throw new Error("Unable to refresh emails. Please try Profile Login.");
          }
        }
      } catch (error) {
        if (renderer && typeof renderer.showStatusMessage === "function") {
          renderer.showStatusMessage(error && error.message ? error.message : "Refresh scan failed");
        }
        console.error("[SenderGrouper] Refresh failed", error && error.message ? error.message : error);
      } finally {
        if (dom.refreshButton) {
          dom.refreshButton.disabled = false;
        }
        refreshInFlight = false;
      }
    }

    if (dom.refreshButton) {
      dom.refreshButton.addEventListener("click", () => {
        handleRefreshClick();
      });
    }

    async function handleProfileLoginClick() {
      if (authInFlight) {
        return;
      }

      authInFlight = true;
      if (renderer && typeof renderer.showLoadingState === "function") {
        renderer.showLoadingState();
      }
      if (dom.profileButton) {
        dom.profileButton.disabled = true;
      }
      if (dom.refreshButton) {
        dom.refreshButton.disabled = true;
      }

      try {
        const authResult = await checkAuth({
          interactiveFallback: true,
          forceRefresh: true,
          forceAccountPicker: true,
        });
        if (!authResult.ok) {
          throw new Error(authResult.error || "Failed to sign in");
        }
        await runScan("FETCH_EMAILS");
      } catch (error) {
        if (renderer && typeof renderer.showStatusMessage === "function") {
          renderer.showStatusMessage(error && error.message ? error.message : "Failed to fetch latest 300 emails");
        }
        console.error("[SenderGrouper] Manual login/fetch failed", error && error.message ? error.message : error);
      } finally {
        if (dom.profileButton) {
          dom.profileButton.disabled = false;
        }
        if (dom.refreshButton) {
          dom.refreshButton.disabled = false;
        }
        authInFlight = false;
      }
    }

    if (dom.profileButton) {
      dom.profileButton.addEventListener("click", () => {
        handleProfileLoginClick();
      });
    }

    global.document.addEventListener("click", (event) => {
      if (!isOpen) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      // Modal overlay interactions should only affect the modal, not the sender panel.
      if (target.closest(".sg-overlay") || target.closest(".sg-modal")) {
        return;
      }

      if (dom.panel.contains(target) || dom.button.contains(target)) {
        return;
      }

      closePanel();
    });

    global.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) {
        closePanel();
      }
    });

    function loadStorageData() {
      renderer.setLoading(true);
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        renderer.setLoading(false);
        if (chrome.runtime.lastError) {
          renderer.setData(null);
          return;
        }
        renderer.setData(result[STORAGE_KEY] || null);
      });
    }

    async function initializeFromSilentAuth() {
      if (authInFlight || refreshInFlight) {
        return;
      }

      if (renderer && typeof renderer.showLoadingState === "function") {
        renderer.showLoadingState();
      }

      try {
        const authResult = await checkAuth({ interactiveFallback: false });
        if (!authResult.ok) {
          if (renderer && typeof renderer.showStatusMessage === "function") {
            renderer.showStatusMessage(authResult.error || "Session expired. Click Profile Login to continue.");
          }
          return;
        }

        await runScan("FETCH_EMAILS");
      } catch (error) {
        if (renderer && typeof renderer.showStatusMessage === "function") {
          renderer.showStatusMessage(error && error.message ? error.message : "Failed to fetch latest 300 emails");
        }
        console.error("[SenderGrouper] Silent init auth/scan failed", error && error.message ? error.message : error);
      }
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }
      renderer.setData(changes[STORAGE_KEY].newValue || null);
    });

    async function updateTrialStatus() {
      try {
        const trialResult = await sendRuntimeMessage({ type: "CHECK_TRIAL" });
        if (trialResult && trialResult.ok && trialResult.trial) {
          renderer.setTrialStatus(trialResult.trial);
        }
      } catch (err) {
        console.error("[SenderGrouper] Failed to check trial", err);
      }
    }

    loadStorageData();
    initializeFromSilentAuth();
    updateTrialStatus();

    return {
      openPanel,
      closePanel,
      toggleMainUI,
      checkAuth,
      isOpen() {
        return isOpen;
      },
    };
  }

  function createMainUI() {
    if (!global.document.body) {
      global.setTimeout(createMainUI, 120);
      return;
    }

    if (state.mounted || state.mounting || global.document.getElementById("sg-floating-button")) {
      state.mounted = true;
      return;
    }

    state.mounting = true;
    (async () => {
      try {
        const trial = await globalThis.SenderGrouper.Trial.checkTrial();
        if (!trial.active) {
          state.mounting = false;
          persistWidgetVisibility(false);
          return;
        }

        const theme = await initTheme();
        applyThemeClass(theme);

        const dom = buildWidgetDom();
        global.document.body.appendChild(dom.button);
        global.document.body.appendChild(dom.panel);

        const renderer = NAMESPACE.UiRenderer.create({
          totalSendersNode: dom.totalSendersNode,
          totalEmailsNode: dom.totalEmailsNode,
          searchInputNode: dom.searchInputNode,
          loadingNode: dom.loadingNode,
          emptyStateNode: dom.emptyStateNode,
          listNode: dom.listNode,
          updatedAtNode: dom.updatedAtNode,
          trialBannerNode: dom.trialBannerNode,
        });

        const controller = createController(dom, renderer);
        state.dom = dom;
        state.controller = controller;
        state.mounted = true;
        persistWidgetVisibility(true);
      } catch (err) {
        console.error("[SenderGrouper] Failed to initialize main UI", err);
      } finally {
        state.mounting = false;
      }
    })();
  }

  function removeMainUI() {
    const button = state.dom && state.dom.button ? state.dom.button : global.document.getElementById("sg-floating-button");
    const panel = state.dom && state.dom.panel ? state.dom.panel : global.document.getElementById("sg-main-ui");

    if (button && button.parentNode) {
      button.parentNode.removeChild(button);
    }
    if (panel && panel.parentNode) {
      panel.parentNode.removeChild(panel);
    }

    const overlay = global.document.querySelector(".sg-overlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    global.document.body.classList.remove("sg-no-scroll");

    state.dom = null;
    state.controller = null;
    state.mounted = false;
    persistWidgetVisibility(false);
  }

  function toggleFloatingButton() {
    if (state.mounted || global.document.getElementById("sg-floating-button")) {
      removeMainUI();
      return false;
    }

    createMainUI();
    return true;
  }

  function startWatchdog() {
    if (state.watchdogId) {
      return;
    }

    state.watchdogId = global.setInterval(() => {
      if (!state.mounted || state.mounting) {
        return;
      }

      const hasButton = Boolean(global.document.getElementById("sg-floating-button"));
      const hasPanel = Boolean(global.document.getElementById("sg-main-ui"));

      if (hasButton && hasPanel) {
        return;
      }

      state.dom = null;
      state.controller = null;
      state.mounted = false;
      createMainUI();
    }, 2000);
  }

  NAMESPACE.FloatingWidget = {
    createMainUI,
    removeMainUI,
    toggleFloatingButton,
    toggleMainUI() {
      if (!state.controller) {
        return;
      }
      state.controller.toggleMainUI();
    },
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => {
      initTheme();
      startWatchdog();
      readWidgetVisibility().then((isVisible) => {
        if (isVisible) {
          createMainUI();
        }
      });
    });
  } else {
    initTheme();
    startWatchdog();
    readWidgetVisibility().then((isVisible) => {
      if (isVisible) {
        createMainUI();
      }
    });
  }
})(window);
