(function initPopup() {
  "use strict";

  const STORAGE_KEY = "senderGrouperData";
  const totalSendersNode = document.getElementById("totalSenders");
  const totalEmailsNode = document.getElementById("totalEmails");
  const senderListNode = document.getElementById("senderList");
  const statusText = document.getElementById("statusText");

  function setStatus(message) {
    statusText.textContent = message;
  }

  function formatUpdatedAt(updatedAt) {
    if (!updatedAt) {
      return "No updates yet";
    }
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return "Data updated";
    }
    return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function renderSenders(senders) {
    senderListNode.innerHTML = "";

    if (!Array.isArray(senders) || senders.length === 0) {
      const placeholder = document.createElement("p");
      placeholder.className = "placeholder-text";
      placeholder.textContent = "Open Gmail to load sender data.";
      senderListNode.appendChild(placeholder);
      return;
    }

    const fragment = document.createDocumentFragment();

    senders.forEach((sender) => {
      const row = document.createElement("div");
      row.className = "sender-row";

      const name = document.createElement("span");
      name.className = "sender-name";
      name.textContent = sender.senderName || sender.senderKey || "Unknown Sender";
      name.title = name.textContent;

      const count = document.createElement("span");
      count.className = "sender-count";
      count.textContent = String(sender.count || 0);

      row.appendChild(name);
      row.appendChild(count);
      fragment.appendChild(row);
    });

    senderListNode.appendChild(fragment);
  }

  function renderData(data) {
    if (!data) {
      totalSendersNode.textContent = "--";
      totalEmailsNode.textContent = "--";
      renderSenders([]);
      setStatus("Waiting for Gmail data...");
      return;
    }

    totalSendersNode.textContent = String(data.totalSenders ?? 0);
    totalEmailsNode.textContent = String(data.totalEmails ?? 0);
    renderSenders(data.senders || []);
    setStatus(formatUpdatedAt(data.updatedAt));
  }

  function loadFromStorage() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        setStatus("Unable to read extension data");
        return;
      }
      renderData(result[STORAGE_KEY] || null);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }
    renderData(changes[STORAGE_KEY].newValue || null);
  });

  loadFromStorage();
})();
