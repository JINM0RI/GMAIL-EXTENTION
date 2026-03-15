(function initStatsModule(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function create(container) {
    if (!container) {
      throw new Error("Stats container is required");
    }

    const totalsNode = document.createElement("div");
    totalsNode.className = "sg-stats-totals";

    const topList = document.createElement("ul");
    topList.className = "sg-top-list";

    container.appendChild(totalsNode);
    container.appendChild(topList);

    function render(stats) {
      totalsNode.textContent = `Total senders: ${stats.totalSenders} | Total emails: ${stats.totalEmails}`;

      const fragment = document.createDocumentFragment();
      stats.topSenders.forEach((sender) => {
        const item = document.createElement("li");
        item.className = "sg-top-item";

        const senderName = document.createElement("span");
        senderName.className = "sg-top-name";
        senderName.textContent = sender.senderName;

        const count = document.createElement("span");
        count.className = "sg-top-count";
        count.textContent = `${sender.count}`;

        item.appendChild(senderName);
        item.appendChild(count);
        fragment.appendChild(item);
      });

      topList.innerHTML = "";
      topList.appendChild(fragment);
    }

    return {
      render,
    };
  }

  NAMESPACE.StatsModule = {
    create,
  };
})(window);
