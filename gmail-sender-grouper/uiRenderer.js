(function initUiRenderer(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  let modalRefs = null;

  function ensureModal() {
    if (modalRefs) {
      return modalRefs;
    }

    const overlay = document.createElement("div");
    overlay.className = "sg-overlay";
    overlay.hidden = true;

    overlay.innerHTML = [
      '<div class="sg-modal" role="dialog" aria-modal="true" aria-label="Sender Emails">',
      '  <div class="sg-modal-header">',
      '    <span id="sg-modal-title" class="sg-title">Sender Emails</span>',
      '    <button id="sg-modal-close" class="sg-close" type="button" aria-label="Close">X</button>',
      "  </div>",
      '  <div id="sg-modal-list" class="sg-email-list"></div>',
      "</div>",
    ].join("");

    document.body.appendChild(overlay);

    const closeButton = overlay.querySelector("#sg-modal-close");
    const titleNode = overlay.querySelector("#sg-modal-title");
    const listNode = overlay.querySelector("#sg-modal-list");

    const close = () => {
      overlay.remove();
      document.body.classList.remove("sg-no-scroll");
      modalRefs = null;
    };

    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) {
        close();
      }
    });

    modalRefs = {
      overlay,
      titleNode,
      listNode,
      close,
      open(sender) {
        titleNode.textContent = `${sender.name} Emails`;
        overlay.hidden = false;
        document.body.classList.add("sg-no-scroll");
      },
    };

    return modalRefs;
  }

  function create(options) {
    const refs = options || {};

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

    const state = {
      allSenders: [],
      filteredSenders: [],
      query: "",
      stats: {
        totalSenders: 0,
        totalEmails: 0,
      },
      updatedAt: null,
      isLoading: true,
      ownerEmail: "",
      ownerAccountIndex: 0,
    };

    function formatTime(timestamp) {
      if (!timestamp) {
        return "Updated time unavailable";
      }

      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return "Updated recently";
      }

      return `Updated at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }

    function normalizeSender(sender) {
      const name = sender && (sender.name || sender.senderName || "Unknown Sender");
      const email = sender && (sender.email || sender.senderEmail || "unknown@unknown");
      const count = sender ? Number(sender.count || 0) : 0;

      return {
        name,
        email,
        count: Number.isFinite(count) ? count : 0,
        emails: Array.isArray(sender && sender.emails) ? sender.emails : [],
      };
    }

    function extractEmailFromText(value) {
      const text = String(value || "");
      const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text);
      return match ? match[0].toLowerCase() : "";
    }

    function getCurrentTabEmail() {
      const titleEmail = extractEmailFromText(global.document && global.document.title);
      if (titleEmail) {
        return titleEmail;
      }

      const selectors = [
        'a[aria-label*="Google Account"]',
        'button[aria-label*="Google Account"]',
        'a[aria-label*="@"]',
        'button[aria-label*="@"]',
        '[data-email]',
      ];

      for (const selector of selectors) {
        const nodes = Array.from(global.document.querySelectorAll(selector));
        for (const node of nodes) {
          const candidates = [
            node.getAttribute && node.getAttribute("data-email"),
            node.getAttribute && node.getAttribute("aria-label"),
            node.getAttribute && node.getAttribute("title"),
            node.textContent,
          ];

          for (const value of candidates) {
            const email = extractEmailFromText(value);
            if (email) {
              return email;
            }
          }
        }
      }

      return "";
    }

    function openGmailMessage(messageId) {
      const id = String(messageId || "").trim();
      if (!id) {
        return;
      }

      global.location.hash = `#inbox/${encodeURIComponent(id)}`;
    }

    async function openEmailCorrectly(messageId) {
      const id = String(messageId || "").trim();
      if (!id) {
        return;
      }

      try {
        const response = await sendRuntimeMessage({
          type: "OPEN_EMAIL",
          messageId: id,
          ownerEmail: state.ownerEmail,
          ownerAccountIndex: state.ownerAccountIndex,
        });

        if (response && response.ok) {
          return;
        }
      } catch (_error) {
        // Fallback to same-tab navigation only if background routing is unavailable.
      }

      if (state.ownerEmail) {
        global.location.assign(
          `https://mail.google.com/mail/u/${encodeURIComponent(state.ownerEmail)}/#inbox/${encodeURIComponent(id)}`
        );
        return;
      }

      openGmailMessage(id);
    }

    function createModalEmailItem(email) {
      const row = document.createElement("button");
      row.className = "sg-email-row";
      row.type = "button";

      const subject = document.createElement("div");
      subject.className = "sg-email-subject";
      subject.textContent = email.subject || "(No subject)";

      const snippet = document.createElement("div");
      snippet.className = "sg-email-snippet";
      snippet.textContent = email.snippet || "No preview available";

      const time = document.createElement("div");
      time.className = "sg-email-time";
      time.textContent = email.time || "";

      row.appendChild(subject);
      row.appendChild(snippet);
      row.appendChild(time);

      async function handleRowClick() {
        const messageId = String(email && email.messageId ? email.messageId : "").trim();
        if (!messageId) {
          return;
        }

        const authEmail = String(state.ownerEmail || "").trim().toLowerCase();
        const tabEmail = getCurrentTabEmail();

        if (modalRefs) {
          modalRefs.close();
        }

        if (authEmail && tabEmail && authEmail === tabEmail) {
          global.location.hash = `#inbox/${encodeURIComponent(messageId)}`;
          return;
        }

        if (authEmail) {
          global.open(
            `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(authEmail)}#inbox/${encodeURIComponent(messageId)}`,
            "_blank"
          );
          return;
        }

        await openEmailCorrectly(messageId);
      }

      row.addEventListener("click", handleRowClick);

      return row;
    }

    function openSenderModal(sender) {
      const modal = ensureModal();
      modal.listNode.innerHTML = "";

      const emails = Array.isArray(sender.emails) ? sender.emails : [];
      if (!emails.length) {
        const empty = document.createElement("div");
        empty.className = "sg-email-empty";
        empty.textContent = "No emails found for this sender.";
        modal.listNode.appendChild(empty);
        modal.open(sender);
        return;
      }

      const fragment = document.createDocumentFragment();
      emails.forEach((email) => {
        fragment.appendChild(createModalEmailItem(email));
      });

      modal.listNode.appendChild(fragment);
      modal.open(sender);
    }

    function applyFilter() {
      const query = state.query.trim().toLowerCase();
      if (!query) {
        state.filteredSenders = state.allSenders.slice();
        return;
      }

      state.filteredSenders = state.allSenders.filter((sender) => {
        return sender.name.toLowerCase().includes(query) || sender.email.toLowerCase().includes(query);
      });
    }

    function renderStats() {
      if (refs.totalSendersNode) {
        refs.totalSendersNode.textContent = String(state.stats.totalSenders);
      }
      if (refs.totalEmailsNode) {
        refs.totalEmailsNode.textContent = String(state.stats.totalEmails);
      }
    }

    function renderFooter() {
      if (!refs.updatedAtNode) {
        return;
      }
      refs.updatedAtNode.textContent = formatTime(state.updatedAt);
    }

    function createSenderRow(sender) {
      const row = document.createElement("article");
      row.className = "sender-row sg-widget-row";
      row.tabIndex = 0;

      const identity = document.createElement("div");
      identity.className = "sg-widget-identity";

      const nameNode = document.createElement("div");
      nameNode.className = "sg-widget-name";
      nameNode.textContent = sender.name;
      nameNode.title = sender.name;

      const emailNode = document.createElement("div");
      emailNode.className = "sg-widget-email";
      emailNode.textContent = sender.email;
      emailNode.title = sender.email;

      const badge = document.createElement("span");
      badge.className = "sg-widget-badge";
      badge.textContent = String(sender.count);

      identity.appendChild(nameNode);
      identity.appendChild(emailNode);
      row.appendChild(identity);
      row.appendChild(badge);

      row.addEventListener("click", () => openSenderModal(sender));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSenderModal(sender);
        }
      });

      return row;
    }

    function renderList() {
      if (!refs.listNode || !refs.emptyStateNode || !refs.loadingNode) {
        return;
      }

      refs.listNode.hidden = false;
      refs.emptyStateNode.textContent = "No sender data available yet.";

      refs.loadingNode.hidden = !state.isLoading;

      if (state.isLoading) {
        refs.listNode.innerHTML = "";
        refs.listNode.hidden = true;
        refs.emptyStateNode.hidden = true;
        return;
      }

      refs.listNode.innerHTML = "";

      if (state.filteredSenders.length === 0) {
        refs.listNode.hidden = true;
        refs.emptyStateNode.hidden = false;
        return;
      }

      refs.listNode.hidden = false;
      refs.emptyStateNode.hidden = true;
      const fragment = document.createDocumentFragment();
      state.filteredSenders.forEach((sender) => {
        fragment.appendChild(createSenderRow(sender));
      });
      refs.listNode.appendChild(fragment);
    }

    function renderAll() {
      renderStats();
      renderList();
      renderFooter();
    }

    function bindSearch() {
      if (!refs.searchInputNode) {
        return;
      }

      refs.searchInputNode.addEventListener("input", (event) => {
        state.query = (event.target.value || "").trim();
        applyFilter();
        renderList();
      });
    }

    function setData(data) {
      state.isLoading = false;

      if (refs.listNode) {
        refs.listNode.hidden = false;
      }
      if (refs.emptyStateNode) {
        refs.emptyStateNode.textContent = "No sender data available yet.";
      }

      if (!data) {
        state.allSenders = [];
        state.filteredSenders = [];
        state.stats = {
          totalSenders: 0,
          totalEmails: 0,
        };
        state.updatedAt = null;
        renderAll();
        return;
      }

      const senders = Array.isArray(data.senders) ? data.senders : [];

      state.allSenders = senders.map(normalizeSender).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      state.stats = {
        totalSenders: Number(data.totalSenders || state.allSenders.length),
        totalEmails: Number(data.totalEmails || 0),
      };
      state.updatedAt = data.updatedAt || null;
      state.ownerEmail = String(data.ownerEmail || "").trim().toLowerCase();
      state.ownerAccountIndex = Number.isFinite(Number(data.ownerAccountIndex))
        ? Number.parseInt(String(data.ownerAccountIndex), 10)
        : 0;

      applyFilter();
      renderAll();
    }

    function setLoading(isLoading) {
      state.isLoading = Boolean(isLoading);
      renderList();
    }

    function showLoadingState() {
      state.isLoading = false;

      const scanningMarkup = [
        '<div class="sg-scanning-state" role="status" aria-live="polite">',
        '  <span class="sg-scanning-spinner" aria-hidden="true"></span>',
        '  <span class="sg-scanning-text">Scanning emails...</span>',
        "</div>",
      ].join("");

      if (refs.loadingNode) {
        refs.loadingNode.hidden = true;
      }

      state.stats = {
        totalSenders: 0,
        totalEmails: 0,
      };
      renderStats();

      if (refs.listNode) {
        refs.listNode.hidden = false;
        refs.listNode.innerHTML = scanningMarkup;
      }

      const senderListElement = global.document && global.document.getElementById("sender-list");
      if (senderListElement) {
        senderListElement.innerHTML = scanningMarkup;
      }

      if (refs.emptyStateNode) {
        refs.emptyStateNode.hidden = true;
      }
    }

    function showStatusMessage(message) {
      state.isLoading = false;

      if (refs.loadingNode) {
        refs.loadingNode.hidden = true;
      }

      if (refs.listNode) {
        refs.listNode.innerHTML = "";
        refs.listNode.hidden = true;
      }

      if (refs.emptyStateNode) {
        refs.emptyStateNode.hidden = false;
        refs.emptyStateNode.textContent = String(message || "No sender data available yet.");
      }
    }

    function showAccountMismatch(message, onRelogin) {
      state.isLoading = false;

      if (refs.loadingNode) {
        refs.loadingNode.hidden = true;
      }

      if (refs.listNode) {
        refs.listNode.innerHTML = "";
        refs.listNode.hidden = true;
      }

      if (refs.emptyStateNode) {
        refs.emptyStateNode.hidden = false;
        refs.emptyStateNode.innerHTML = [
          '<div class="sg-account-warning">',
          `  <div class="sg-account-warning-text">${String(message || "Account mismatch detected.")}</div>`,
          '  <button id="sg-warning-relogin" class="sg-account-warning-btn" type="button">Profile Login</button>',
          "</div>",
        ].join("");

        const reloginButton = refs.emptyStateNode.querySelector("#sg-warning-relogin");
        if (reloginButton && typeof onRelogin === "function") {
          reloginButton.addEventListener("click", () => {
            onRelogin();
          });
        }
      }
    }

    function setTrialStatus(trial) {
      if (!refs.trialBannerNode) {
        return;
      }

      const banner = refs.trialBannerNode;
      banner.className = "sg-trial-banner";

      if (!trial) {
        banner.style.display = "none";
        return;
      }

      banner.style.display = "block";
      if (trial.isPaid) {
        banner.innerHTML = "<span>Premium Version Active ✨</span>";
        banner.classList.add("premium-active");
      } else if (trial.active) {
        banner.innerHTML = `
          <div class="sg-banner-content">
            <span>Trial Version: ${trial.daysLeft} day${trial.daysLeft !== 1 ? "s" : ""} remaining</span>
            <button class="sg-banner-buy-btn" id="sg-banner-buy-btn" type="button">Buy License</button>
          </div>
        `;
        banner.classList.add("trial-active");

        const buyBtn = banner.querySelector("#sg-banner-buy-btn");
        if (buyBtn) {
          buyBtn.addEventListener("click", () => {
            if (global.window.__showPaywall) {
              global.window.__showPaywall();
            }
          });
        }
      } else {
        banner.innerHTML = `
          <div class="sg-banner-content">
            <span>Trial Version: Expired ❌</span>
            <button class="sg-banner-buy-btn" id="sg-banner-buy-btn" type="button">Buy License</button>
          </div>
        `;
        banner.classList.add("trial-expired");

        const buyBtn = banner.querySelector("#sg-banner-buy-btn");
        if (buyBtn) {
          buyBtn.addEventListener("click", () => {
            if (global.window.__showPaywall) {
              global.window.__showPaywall();
            }
          });
        }
      }
    }

    bindSearch();

    return {
      setData,
      setLoading,
      showLoadingState,
      showStatusMessage,
      showAccountMismatch,
      setTrialStatus,
    };
  }

  NAMESPACE.UiRenderer = {
    create,
  };
})(window);
