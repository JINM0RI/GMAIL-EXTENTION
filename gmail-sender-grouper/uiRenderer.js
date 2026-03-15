(function initUiRenderer(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const uiState = {
    root: null,
    groupsContainer: null,
    searchInput: null,
    emptyState: null,
    groupElements: new Map(),
    collapsedSenderKeys: new Set(),
    callbacks: {
      onSearchChange: null,
      onEmailOpen: null,
    },
  };

  function ensureMounted() {
    if (uiState.root && document.body.contains(uiState.root)) {
      return;
    }

    const mainPane = document.querySelector("div[role='main']");
    if (!mainPane) {
      return;
    }

    const root = document.createElement("section");
    root.id = "sg-root";

    const toolbar = document.createElement("div");
    toolbar.className = "sg-toolbar";

    const title = document.createElement("h2");
    title.className = "sg-title";
    title.textContent = "Grouped by Sender";

    const searchWrap = document.createElement("div");
    searchWrap.className = "sg-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.className = "sg-search";
    searchInput.type = "search";
    searchInput.placeholder = "Search sender name or email";
    searchInput.autocomplete = "off";

    searchInput.addEventListener("input", (event) => {
      if (typeof uiState.callbacks.onSearchChange === "function") {
        uiState.callbacks.onSearchChange(event.target.value || "");
      }
    });

    searchWrap.appendChild(searchInput);
    toolbar.appendChild(title);
    toolbar.appendChild(searchWrap);

    const groupsContainer = document.createElement("div");
    groupsContainer.className = "sg-groups";

    const emptyState = document.createElement("div");
    emptyState.className = "sg-empty";
    emptyState.textContent = "No matching senders in the current inbox view.";
    emptyState.hidden = true;

    root.appendChild(toolbar);
    root.appendChild(groupsContainer);
    root.appendChild(emptyState);

    mainPane.prepend(root);

    uiState.root = root;
    uiState.groupsContainer = groupsContainer;
    uiState.searchInput = searchInput;
    uiState.emptyState = emptyState;
  }

  function setCallbacks(callbacks) {
    uiState.callbacks = {
      ...uiState.callbacks,
      ...callbacks,
    };
  }

  function createEmailItem(email) {
    const rowButton = document.createElement("button");
    rowButton.className = "sg-email-row";
    rowButton.type = "button";
    rowButton.title = email.subject;

    const subject = document.createElement("span");
    subject.className = "sg-email-subject";
    subject.textContent = email.subject;

    rowButton.appendChild(subject);

    rowButton.addEventListener("click", () => {
      if (typeof uiState.callbacks.onEmailOpen === "function") {
        uiState.callbacks.onEmailOpen(email);
      }
    });

    return rowButton;
  }

  function setBodyExpanded(body, expanded) {
    body.dataset.expanded = String(expanded);
    if (expanded) {
      body.style.maxHeight = `${body.scrollHeight}px`;
    } else {
      body.style.maxHeight = "0px";
    }
  }

  function toggleGroup(senderKey, card, body, chevron) {
    const shouldCollapse = !uiState.collapsedSenderKeys.has(senderKey);
    if (shouldCollapse) {
      uiState.collapsedSenderKeys.add(senderKey);
      card.classList.add("is-collapsed");
      chevron.textContent = "▸";
      setBodyExpanded(body, false);
    } else {
      uiState.collapsedSenderKeys.delete(senderKey);
      card.classList.remove("is-collapsed");
      chevron.textContent = "▾";
      setBodyExpanded(body, true);
    }
  }

  function createGroupCard(group) {
    const card = document.createElement("article");
    card.className = "sg-group";
    card.dataset.senderKey = group.senderKey;

    const header = document.createElement("button");
    header.className = "sg-group-header";
    header.type = "button";

    const left = document.createElement("div");
    left.className = "sg-group-left";

    const chevron = document.createElement("span");
    chevron.className = "sg-chevron";
    chevron.textContent = "▾";

    const labelWrap = document.createElement("div");
    labelWrap.className = "sg-label-wrap";

    const senderName = document.createElement("span");
    senderName.className = "sg-sender-name";

    const senderEmail = document.createElement("span");
    senderEmail.className = "sg-sender-email";

    labelWrap.appendChild(senderName);
    labelWrap.appendChild(senderEmail);

    left.appendChild(chevron);
    left.appendChild(labelWrap);

    const count = document.createElement("span");
    count.className = "sg-count";

    header.appendChild(left);
    header.appendChild(count);

    const body = document.createElement("div");
    body.className = "sg-group-body";

    header.addEventListener("click", () => toggleGroup(group.senderKey, card, body, chevron));

    card.appendChild(header);
    card.appendChild(body);

    return {
      card,
      senderName,
      senderEmail,
      count,
      body,
      chevron,
    };
  }

  function updateGroupCard(groupElement, group, shouldRefreshRows) {
    groupElement.senderName.textContent = group.senderName;
    groupElement.senderEmail.textContent = group.senderEmail;
    groupElement.count.textContent = `(${group.emails.length})`;

    if (!shouldRefreshRows) {
      return;
    }

    const fragment = document.createDocumentFragment();
    group.emails.forEach((email) => {
      fragment.appendChild(createEmailItem(email));
    });

    groupElement.body.innerHTML = "";
    groupElement.body.appendChild(fragment);

    const isCollapsed = uiState.collapsedSenderKeys.has(group.senderKey);
    if (isCollapsed) {
      groupElement.card.classList.add("is-collapsed");
      groupElement.chevron.textContent = "▸";
      setBodyExpanded(groupElement.body, false);
    } else {
      groupElement.card.classList.remove("is-collapsed");
      groupElement.chevron.textContent = "▾";
      setBodyExpanded(groupElement.body, true);
    }
  }

  function render({ groups, diff, forceRefresh }) {
    ensureMounted();
    if (!uiState.groupsContainer) {
      return;
    }

    const changedKeys = new Set(diff.changedSenderKeys || []);
    const incomingKeys = new Set(groups.map((group) => group.senderKey));

    (diff.removedSenderKeys || []).forEach((senderKey) => {
      const existing = uiState.groupElements.get(senderKey);
      if (existing) {
        existing.card.remove();
        uiState.groupElements.delete(senderKey);
      }
    });

    Array.from(uiState.groupElements.keys()).forEach((senderKey) => {
      if (!incomingKeys.has(senderKey)) {
        uiState.groupElements.get(senderKey).card.remove();
        uiState.groupElements.delete(senderKey);
      }
    });

    groups.forEach((group) => {
      let groupElement = uiState.groupElements.get(group.senderKey);
      if (!groupElement) {
        groupElement = createGroupCard(group);
        uiState.groupElements.set(group.senderKey, groupElement);
      }

      const shouldRefreshRows = forceRefresh || changedKeys.has(group.senderKey) || !groupElement.body.children.length;
      updateGroupCard(groupElement, group, shouldRefreshRows);
      uiState.groupsContainer.appendChild(groupElement.card);
    });

    uiState.emptyState.hidden = groups.length > 0;
  }

  function setSearchValue(value) {
    ensureMounted();
    if (uiState.searchInput) {
      uiState.searchInput.value = value || "";
    }
  }

  NAMESPACE.UiRenderer = {
    setCallbacks,
    render,
    setSearchValue,
  };
})(window);
