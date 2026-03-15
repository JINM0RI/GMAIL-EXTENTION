(function initUiRenderer(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  // Gmail-injected panel rendering is intentionally disabled.
  function create() {
    return {
      render() {},
      renderStats() {},
      setEmptyStateVisible() {},
    };
  }

  NAMESPACE.UiRenderer = {
    create,
  };
})(window);
