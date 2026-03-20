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
  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});
  const state = {
    dom: null,
    controller: null,
    mounted: false,
    mounting: false,
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
          reject(new Error(chrome.runtime.lastError.message || "Runtime messaging failed"));
          return;
        }
        resolve(response || null);
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

    function toggleTheme() {
      const isDark = global.document.body.classList.contains("dark-mode");
      const nextTheme = isDark ? "light" : "dark";
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    }

    if (dom.themeToggleButton) {
      dom.themeToggleButton.addEventListener("click", toggleTheme);
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
        const refreshResult = await sendRuntimeMessage({ type: "REFRESH_EMAILS" });
        if (refreshResult && refreshResult.code === "ACCOUNT_MISMATCH") {
          if (renderer && typeof renderer.showAccountMismatch === "function") {
            renderer.showAccountMismatch(refreshResult.error, () => {
              handleProfileLoginClick();
            });
          } else if (renderer && typeof renderer.showStatusMessage === "function") {
            renderer.showStatusMessage(refreshResult.error);
          }
          return;
        }
        if (!refreshResult || !refreshResult.ok || !refreshResult.groupedData) {
          throw new Error((refreshResult && refreshResult.error) || "Refresh scan failed");
        }
        renderer.setData(refreshResult.groupedData);
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
        const tokenResult = await sendRuntimeMessage({
          type: "GET_TOKEN",
          interactive: true,
          forceRefresh: true,
          forceAccountPicker: true,
        });

        if (!tokenResult || !tokenResult.ok || !tokenResult.token) {
          throw new Error((tokenResult && tokenResult.error) || "Failed to sign in");
        }

        const fetchResult = await sendRuntimeMessage({ type: "FETCH_EMAILS" });
        if (fetchResult && fetchResult.code === "ACCOUNT_MISMATCH") {
          if (renderer && typeof renderer.showAccountMismatch === "function") {
            renderer.showAccountMismatch(fetchResult.error, () => {
              handleProfileLoginClick();
            });
          } else if (renderer && typeof renderer.showStatusMessage === "function") {
            renderer.showStatusMessage(fetchResult.error);
          }
          return;
        }
        if (!fetchResult || !fetchResult.ok || !fetchResult.groupedData) {
          throw new Error((fetchResult && fetchResult.error) || "Failed to fetch latest 300 emails");
        }

        renderer.setData(fetchResult.groupedData);
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

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }
      renderer.setData(changes[STORAGE_KEY].newValue || null);
    });

    loadStorageData();

    return {
      openPanel,
      closePanel,
      toggleMainUI,
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
    initTheme()
      .then((theme) => {
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
        });

        const controller = createController(dom, renderer);
        state.dom = dom;
        state.controller = controller;
        state.mounted = true;
      })
      .finally(() => {
        state.mounting = false;
      });
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
  }

  function toggleFloatingButton() {
    if (state.mounted || global.document.getElementById("sg-floating-button")) {
      removeMainUI();
      return false;
    }

    createMainUI();
    return true;
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
    });
  } else {
    initTheme();
  }
})(window);
