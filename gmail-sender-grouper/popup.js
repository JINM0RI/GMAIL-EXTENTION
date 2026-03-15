(function initPopup() {
  "use strict";

  const status = document.getElementById("status");
  const openGmailBtn = document.getElementById("openGmailBtn");

  status.textContent = "Extension loaded. Open Gmail to view grouped inbox.";

  openGmailBtn.addEventListener("click", async () => {
    await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/#inbox" });
    status.textContent = "Opened Gmail in a new tab.";
  });
})();
