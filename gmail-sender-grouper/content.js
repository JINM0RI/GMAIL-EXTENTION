(function bootstrapSenderGrouper(global) {
  "use strict";

  if (global.__SG_EXTENSION_INITIALIZED__) {
    return;
  }
  global.__SG_EXTENSION_INITIALIZED__ = true;

  const NAMESPACE = global.SenderGrouper || {};

  let gmail = null;
  let searchQuery = "";
  let renderScheduled = false;
  let forceRefreshPending = false;
  let view = {
    panelRefs: null,
    ui: null,
    stats: null,
  };

  function openEmail(email) {
    if (!email || !email.row) {
      return;
    }

    email.row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function mountPanel() {
    const panelRefs = NAMESPACE.PanelController.ensureMounted({
      onSearchInput: (value) => {
        searchQuery = NAMESPACE.SearchModule.normalize(value);
        scheduleRender(true);
      },
      onToggle: () => {
        scheduleRender(true);
      },
    });

    if (!panelRefs) {
      return false;
    }

    if (!view.ui || !view.stats || view.panelRefs !== panelRefs) {
      view.panelRefs = panelRefs;
      view.ui = NAMESPACE.UiRenderer.create(panelRefs.groupsContainer, openEmail);
      panelRefs.statsContainer.innerHTML = "";
      view.stats = NAMESPACE.StatsModule.create(panelRefs.statsContainer);
    }

    return true;
  }

  function render(forceRefresh) {
    if (!mountPanel()) {
      return;
    }

    const emails = NAMESPACE.GroupEngine.collectVisibleEmails();
    const result = NAMESPACE.GroupEngine.update(emails);
    if (!result.changed && !forceRefresh) {
      return;
    }

    const filteredGroups = NAMESPACE.SearchModule.filterGroups(result.groups, searchQuery);
    const visibleKeys = new Set(filteredGroups.map((group) => group.senderKey));
    const filteredDiff = {
      changedSenderKeys: result.diff.changedSenderKeys.filter((key) => visibleKeys.has(key)),
      removedSenderKeys: result.diff.removedSenderKeys,
    };

    view.ui.render(filteredGroups, filteredDiff, Boolean(forceRefresh || !result.changed));
    view.stats.render(result.stats);
    NAMESPACE.PanelController.setEmptyStateVisible(filteredGroups.length === 0);
  }

  function scheduleRender(forceRefresh) {
    forceRefreshPending = forceRefreshPending || Boolean(forceRefresh);
    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    global.requestAnimationFrame(() => {
      renderScheduled = false;
      const doForceRefresh = forceRefreshPending;
      forceRefreshPending = false;
      render(doForceRefresh);
    });
  }

  function bindGmailObservers() {
    const events = ["load", "inbox", "emails_loaded", "new_email"];

    events.forEach((eventName) => {
      try {
        gmail.observe.on(eventName, () => {
          scheduleRender(false);
        });
      } catch (_error) {
        // Keep compatibility across Gmail.js versions.
      }
    });
  }

  function bindMutationFallback() {
    const mainNode = document.querySelector("div[role='main']");
    if (!mainNode) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const hasNewRows = mutations.some((mutation) => {
        if (mutation.type !== "childList") {
          return false;
        }

        return Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }

          return node.matches("tr.zA") || Boolean(node.querySelector("tr.zA"));
        });
      });

      if (hasNewRows) {
        scheduleRender(false);
      }
    });

    observer.observe(mainNode, {
      childList: true,
      subtree: true,
    });
  }

  async function start() {
    if (!/mail\.google\.com$/i.test(global.location.hostname)) {
      return;
    }

    try {
      gmail = await NAMESPACE.GmailLoader.init();
    } catch (error) {
      console.error("[SenderGrouper] Failed to initialize Gmail.js", error);
      return;
    }

    bindGmailObservers();
    bindMutationFallback();
    scheduleRender(true);
  }

  start();
})(window);
