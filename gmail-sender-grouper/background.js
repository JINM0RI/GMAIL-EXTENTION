chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_FLOATING_BUTTON" }, () => {
    // Ignore missing receiver errors when the active tab is not Gmail.
    void chrome.runtime.lastError;
  });
});
