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
  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});
  const state = {
    dom: null,
    controller: null,
    mounted: false,
  };

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
    panel.className = "sg-floating-panel";
    panel.setAttribute("aria-hidden", "true");

    panel.innerHTML = [
      '<header class="sg-widget-header">',
      '  <div class="sg-widget-header-copy">',
      '    <h2 class="sg-widget-title">Sender Grouper</h2>',
      '    <p class="sg-widget-subtitle">Grouped Gmail Senders</p>',
      "  </div>",
      '  <button type="button" class="sg-widget-close" aria-label="Close Sender Grouper">&times;</button>',
      "</header>",
      '<section class="sg-widget-stats">',
      '  <article class="sg-widget-stat-card">',
      '    <div class="sg-widget-stat-label">Total Senders</div>',
      '    <div id="sg-widget-total-senders" class="sg-widget-stat-value">0</div>',
      "  </article>",
      '  <article class="sg-widget-stat-card">',
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

    if (state.mounted || global.document.getElementById("sg-floating-button")) {
      state.mounted = true;
      return;
    }

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
})(window);
