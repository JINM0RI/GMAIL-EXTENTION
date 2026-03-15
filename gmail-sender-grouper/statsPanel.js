(function initStatsPanel(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const panelState = {
    root: null,
    totalsNode: null,
    sendersNode: null,
  };

  function ensureMounted() {
    if (panelState.root && document.body.contains(panelState.root)) {
      return;
    }

    const root = document.createElement("aside");
    root.id = "sg-stats-panel";

    const title = document.createElement("h3");
    title.className = "sg-stats-title";
    title.textContent = "Sender Statistics";

    const totals = document.createElement("div");
    totals.className = "sg-stats-totals";

    const senders = document.createElement("ul");
    senders.className = "sg-stats-list";

    root.appendChild(title);
    root.appendChild(totals);
    root.appendChild(senders);

    document.body.appendChild(root);

    panelState.root = root;
    panelState.totalsNode = totals;
    panelState.sendersNode = senders;
  }

  function render(stats) {
    ensureMounted();

    if (!panelState.root) {
      return;
    }

    panelState.totalsNode.textContent = `Total senders: ${stats.totalSenders} | Total emails: ${stats.totalEmails}`;

    const fragment = document.createDocumentFragment();

    stats.topSenders.forEach((sender) => {
      const item = document.createElement("li");
      item.className = "sg-stats-item";

      const left = document.createElement("span");
      left.className = "sg-stats-sender";
      left.textContent = sender.senderName;

      const right = document.createElement("span");
      right.className = "sg-stats-count";
      right.textContent = `${sender.count} emails`;

      item.appendChild(left);
      item.appendChild(right);
      fragment.appendChild(item);
    });

    panelState.sendersNode.innerHTML = "";
    panelState.sendersNode.appendChild(fragment);
  }

  NAMESPACE.StatsPanel = {
    render,
  };
})(window);
