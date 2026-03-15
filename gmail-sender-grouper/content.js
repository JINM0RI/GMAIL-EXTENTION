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

  function collectAndStore() {
    const emails = NAMESPACE.GroupEngine.collectVisibleEmails();
    const result = NAMESPACE.GroupEngine.update(emails);

    if (!result.changed) {
      return;
    }

    persistGroupedData(result);
  }

  function scheduleCollection() {
    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    global.requestAnimationFrame(() => {
      renderScheduled = false;
      collectAndStore();
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
