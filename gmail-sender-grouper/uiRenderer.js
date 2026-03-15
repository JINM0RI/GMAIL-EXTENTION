(function initUiRenderer(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function create(options) {
    const refs = options || {};

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
      };
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
      row.className = "sg-widget-row";

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

      return row;
    }

    function renderList() {
      if (!refs.listNode || !refs.emptyStateNode || !refs.loadingNode) {
        return;
      }

      refs.loadingNode.hidden = !state.isLoading;

      if (state.isLoading) {
        refs.listNode.innerHTML = "";
        refs.emptyStateNode.hidden = true;
        return;
      }

      refs.listNode.innerHTML = "";

      if (state.filteredSenders.length === 0) {
        refs.emptyStateNode.hidden = false;
        return;
      }

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

      applyFilter();
      renderAll();
    }

    function setLoading(isLoading) {
      state.isLoading = Boolean(isLoading);
      renderList();
    }

    bindSearch();

    return {
      setData,
      setLoading,
    };
  }

  NAMESPACE.UiRenderer = {
    create,
  };
})(window);
