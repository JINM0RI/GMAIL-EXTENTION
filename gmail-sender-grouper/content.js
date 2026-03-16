(function bootstrapSenderGrouper(global) {
  "use strict";

  if (global !== global.top) {
    return;
  }

  if (global.__SG_EXTENSION_INITIALIZED__) {
    return;
  }
  global.__SG_EXTENSION_INITIALIZED__ = true;

  const NAMESPACE = global.SenderGrouper || {};

  let gmail = null;
  let renderScheduled = false;
  let fullScanCompleted = false;
  let scanInProgress = false;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractSnippetFromRow(row) {
    if (!(row instanceof HTMLElement)) {
      return "";
    }

    const snippetNode = row.querySelector("span.y2, .y2, .xY.a4W, .bog + span");
    const rawSnippet = snippetNode ? snippetNode.textContent || snippetNode.innerText : "";
    return normalizeText(rawSnippet).replace(/^[-\u2013\u2014\s]+/, "");
  }

  function extractTimeFromRow(row) {
    if (!(row instanceof HTMLElement)) {
      return "";
    }

    const timeNode = row.querySelector("td.xW span[title], td.xW span");
    const titleText = normalizeText(timeNode ? timeNode.getAttribute("title") : "");
    const visibleText = normalizeText(timeNode ? timeNode.textContent || timeNode.innerText : "");
    return titleText || visibleText;
  }

  function persistGroupedData(result) {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const senders = result.groups.map((group) => ({
      name: group.senderName,
      email: group.senderEmail,
      count: group.emails.length,
      emails: group.emails.map((email) => ({
        subject: email.subject || "(No subject)",
        snippet: extractSnippetFromRow(email.row),
        time: extractTimeFromRow(email.row),
        threadId: email.threadId,
      })),
    }));

    chrome.storage.local.set({
      senderGrouperData: {
        totalSenders: result.stats.totalSenders,
        totalEmails: result.stats.totalEmails,
        senders,
        updatedAt: Date.now(),
      },
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getInboxScrollContainer() {
    const mainNode = document.querySelector("div[role='main']");
    const candidates = [
      mainNode,
      mainNode ? mainNode.parentElement : null,
      mainNode ? mainNode.closest(".nH") : null,
      document.scrollingElement,
    ].filter(Boolean);

    let best = document.scrollingElement || document.documentElement;
    let bestScrollable = -1;

    candidates.forEach((node) => {
      if (!(node instanceof HTMLElement) && node !== document.scrollingElement) {
        return;
      }

      const element = node === document.scrollingElement ? document.documentElement : node;
      const scrollable = Math.max(0, element.scrollHeight - element.clientHeight);
      if (scrollable > bestScrollable) {
        bestScrollable = scrollable;
        best = node;
      }
    });

    return best;
  }

  function getScrollTop(container) {
    if (container === document.scrollingElement || container === document.documentElement) {
      return global.scrollY || document.documentElement.scrollTop || 0;
    }
    return container.scrollTop || 0;
  }

  function setScrollTop(container, value) {
    if (container === document.scrollingElement || container === document.documentElement) {
      global.scrollTo(0, Math.max(0, value));
      return;
    }
    container.scrollTop = Math.max(0, value);
  }

  function getScrollHeight(container) {
    if (container === document.scrollingElement || container === document.documentElement) {
      return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    }
    return container.scrollHeight || 0;
  }

  function getClientHeight(container) {
    if (container === document.scrollingElement || container === document.documentElement) {
      return global.innerHeight || document.documentElement.clientHeight || 0;
    }
    return container.clientHeight || 0;
  }

  function scrollDown(container, delta) {
    const nextTop = getScrollTop(container) + delta;
    setScrollTop(container, nextTop);
  }

  async function scanAllEmails() {
    const collectedByThread = new Map();
    const container = getInboxScrollContainer();
    const originalTop = getScrollTop(container);
    const stepSize = Math.max(520, Math.floor(getClientHeight(container) * 0.9));

    let lastHeight = -1;
    let stableRounds = 0;

    for (let step = 0; step < 80; step += 1) {
      const visible = NAMESPACE.GroupEngine.collectVisibleEmails();
      visible.forEach((email) => {
        if (!email || !email.threadId) {
          return;
        }
        collectedByThread.set(email.threadId, email);
      });

      const currentHeight = getScrollHeight(container);
      const currentTop = getScrollTop(container);
      const maxTop = Math.max(0, currentHeight - getClientHeight(container));
      const reachedBottom = currentTop >= maxTop - 4;

      if (currentHeight <= lastHeight && reachedBottom) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= 2) {
        break;
      }

      lastHeight = currentHeight;
      scrollDown(container, stepSize);
      await delay(900);
    }

    setScrollTop(container, originalTop);

    return Array.from(collectedByThread.values());
  }

  async function collectAndStore() {
    if (scanInProgress) {
      return;
    }

    scanInProgress = true;

    try {
      const emails = fullScanCompleted ? NAMESPACE.GroupEngine.collectVisibleEmails() : await scanAllEmails();
      const result = NAMESPACE.GroupEngine.update(emails);

      fullScanCompleted = true;

      if (!result.changed) {
        return;
      }

      persistGroupedData(result);
    } finally {
      scanInProgress = false;
    }
  }

  function scheduleCollection() {
    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    global.requestAnimationFrame(async () => {
      renderScheduled = false;
      await collectAndStore();
    });
  }

  function bindGmailObservers() {
    const events = ["load", "inbox", "emails_loaded", "new_email"];

    events.forEach((eventName) => {
      try {
        gmail.observe.on(eventName, () => {
          scheduleCollection();
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
        scheduleCollection();
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
      console.warn("[SenderGrouper] Initial Gmail.js boot failed, retrying once...", error);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      try {
        gmail = await NAMESPACE.GmailLoader.init();
      } catch (retryError) {
        console.error("[SenderGrouper] Failed to initialize Gmail.js", retryError);
        return;
      }
    }

    bindGmailObservers();
    bindMutationFallback();
    scheduleCollection();
  }

  start();
})(window);
