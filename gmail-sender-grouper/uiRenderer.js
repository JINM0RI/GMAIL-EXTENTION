(function initUiRenderer(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function create(groupsContainer, onEmailOpen) {
    const state = {
      groupsContainer,
      onEmailOpen,
      groupElements: new Map(),
      collapsedSenderKeys: new Set(),
    };

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
        if (typeof state.onEmailOpen === "function") {
          state.onEmailOpen(email);
        }
      });

      return rowButton;
    }

    function setBodyExpanded(body, expanded) {
      body.dataset.expanded = String(expanded);
      if (expanded) {
        const desiredHeight = Math.min(body.scrollHeight, 300);
        body.style.maxHeight = `${desiredHeight}px`;
      } else {
        body.style.maxHeight = "0px";
      }
    }

    function toggleGroup(senderKey, card, body, chevron) {
      const shouldCollapse = !state.collapsedSenderKeys.has(senderKey);
      if (shouldCollapse) {
        state.collapsedSenderKeys.add(senderKey);
        card.classList.add("is-collapsed");
        chevron.textContent = "▸";
        setBodyExpanded(body, false);
      } else {
        state.collapsedSenderKeys.delete(senderKey);
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

      const emailList = document.createElement("div");
      emailList.className = "sg-email-list";
      body.appendChild(emailList);

      header.addEventListener("click", () => toggleGroup(group.senderKey, card, body, chevron));

      card.appendChild(header);
      card.appendChild(body);

      return {
        card,
        senderName,
        senderEmail,
        count,
        body,
        emailList,
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

      groupElement.emailList.innerHTML = "";
      groupElement.emailList.appendChild(fragment);

      const isCollapsed = state.collapsedSenderKeys.has(group.senderKey);
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

    function render(groups, diff, forceRefresh) {
      if (!state.groupsContainer) {
        return;
      }

      const changedKeys = new Set((diff && diff.changedSenderKeys) || []);
      const incomingKeys = new Set(groups.map((group) => group.senderKey));

      ((diff && diff.removedSenderKeys) || []).forEach((senderKey) => {
        const existing = state.groupElements.get(senderKey);
        if (existing) {
          existing.card.remove();
          state.groupElements.delete(senderKey);
        }
      });

      Array.from(state.groupElements.keys()).forEach((senderKey) => {
        if (!incomingKeys.has(senderKey)) {
          state.groupElements.get(senderKey).card.remove();
          state.groupElements.delete(senderKey);
        }
      });

      groups.forEach((group) => {
        let groupElement = state.groupElements.get(group.senderKey);
        if (!groupElement) {
          groupElement = createGroupCard(group);
          state.groupElements.set(group.senderKey, groupElement);
        }

        const shouldRefreshRows = forceRefresh || changedKeys.has(group.senderKey) || !groupElement.body.children.length;
        updateGroupCard(groupElement, group, shouldRefreshRows);
        state.groupsContainer.appendChild(groupElement.card);
      });
    }

    return {
      render,
    };
  }

  NAMESPACE.UiRenderer = {
    create,
  };
})(window);
