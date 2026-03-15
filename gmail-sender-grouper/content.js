(function bootstrapSenderGrouper(global) {
  "use strict";

  if (global.__SG_EXTENSION_INITIALIZED__) {
    return;
  }
  global.__SG_EXTENSION_INITIALIZED__ = true;

  const NAMESPACE = global.SenderGrouper || {};

  let gmailInstance = null;
  let currentSearchQuery = "";
  let isRenderScheduled = false;
  let pendingForceRefresh = false;
  let renderReason = "initial";
  let mutationObserver = null;

  function openEmailFromGroup(email) {
    if (!email || !email.row) {
      return;
    }

    const targetRow = email.row;
    targetRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    targetRow.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }

  function renderGroupedInbox(forceRefresh) {
    const visibleEmails = NAMESPACE.GroupingEngine.collectVisibleEmails(gmailInstance);
    const updateResult = NAMESPACE.GroupingEngine.updateSenderMap(visibleEmails);

    if (!updateResult.changed && !forceRefresh) {
      return;
    }

    const filteredGroups = NAMESPACE.Search.filterGroups(updateResult.senderGroups, currentSearchQuery);

    const filteredKeys = new Set(filteredGroups.map((group) => group.senderKey));
    const diffForFilteredView = {
      changedSenderKeys: updateResult.diff.changedSenderKeys.filter((senderKey) => filteredKeys.has(senderKey)),
      removedSenderKeys: updateResult.diff.removedSenderKeys,
    };

    NAMESPACE.UiRenderer.render({
      groups: filteredGroups,
      diff: diffForFilteredView,
      forceRefresh: Boolean(forceRefresh || !updateResult.changed),
    });

    NAMESPACE.StatsPanel.render(updateResult.stats);
  }

  function scheduleRender(reason, forceRefresh) {
    renderReason = reason || "unknown";
    pendingForceRefresh = pendingForceRefresh || Boolean(forceRefresh);
    if (isRenderScheduled) {
      return;
    }

    isRenderScheduled = true;
    global.requestAnimationFrame(() => {
      isRenderScheduled = false;
      const shouldForceRefresh = pendingForceRefresh;
      pendingForceRefresh = false;
      renderGroupedInbox(shouldForceRefresh);
    });
  }

  function bindGmailObservers() {
    const observerEvents = ["load", "inbox", "emails_loaded", "new_email"];

    observerEvents.forEach((eventName) => {
      try {
        gmailInstance.observe.on(eventName, () => {
          scheduleRender(`gmail:${eventName}`, false);
        });
      } catch (_error) {
        // Keep listener setup resilient even if a specific Gmail.js event is unavailable.
      }
    });
  }

  function bindMutationObserver() {
    const mainNode = document.querySelector("div[role='main']");
    if (!mainNode) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some((mutation) => {
        if (mutation.type !== "childList") {
          return false;
        }

        return Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }

          return node.matches("tr.zA") || node.querySelector("tr.zA");
        });
      });

      if (hasRelevantChange) {
        scheduleRender("mutation", false);
      }
    });

    mutationObserver.observe(mainNode, {
      childList: true,
      subtree: true,
    });
  }

  async function start() {
    if (!/mail\.google\.com$/i.test(global.location.hostname)) {
      return;
    }

    try {
      gmailInstance = await NAMESPACE.GmailLoader.init();
    } catch (error) {
      console.error("[SenderGrouper] Failed to initialize Gmail.js", error);
      return;
    }

    NAMESPACE.UiRenderer.setCallbacks({
      onSearchChange: (query) => {
        currentSearchQuery = NAMESPACE.Search.normalize(query);
        scheduleRender("search", true);
      },
      onEmailOpen: (email) => {
        openEmailFromGroup(email);
      },
    });

    bindGmailObservers();
    bindMutationObserver();

    scheduleRender("startup", true);

    console.info("[SenderGrouper] Initialized and listening for inbox updates.", {
      reason: renderReason,
    });
  }

  start();
})(window);
