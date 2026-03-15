(function initPanelController(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  // Side panel UI is intentionally disabled. Sender data is displayed in popup only.
  function ensureMounted() {
    return null;
  }

  function setEmptyStateVisible() {}

  function setOpen(open) {
    return Boolean(open);
  }

  function togglePanel() {
    return false;
  }

  function isOpen() {
    return false;
  }

  NAMESPACE.PanelController = {
    ensureMounted,
    setEmptyStateVisible,
    setOpen,
    togglePanel,
    isOpen,
  };
})(window);
