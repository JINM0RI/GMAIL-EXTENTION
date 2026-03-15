(function initPanelController(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const state = {
    mounted: false,
    open: true,
    refs: null,
  };

  function findMainNode() {
    return document.querySelector("div[role='main']");
  }

  function findLayoutHost(mainNode) {
    return mainNode ? mainNode.parentElement : null;
  }

  function findToolbarMountPoint() {
    return (
      document.querySelector("div[role='banner'] div[gh='mtb']") ||
      document.querySelector("div[role='banner']") ||
      document.querySelector("header")
    );
  }

  function applyOpenState(layoutHost, panelNode, toggleBtn) {
    layoutHost.classList.toggle("sg-panel-collapsed", !state.open);
    panelNode.setAttribute("aria-hidden", String(!state.open));
    toggleBtn.setAttribute("aria-expanded", String(state.open));
    toggleBtn.textContent = state.open ? "Sender Panel: On" : "Sender Panel: Off";
  }

  function createPanelDom() {
    const panel = document.createElement("aside");
    panel.id = "sg-side-panel";

    const shell = document.createElement("div");
    shell.className = "sg-panel-shell";

    const sticky = document.createElement("div");
    sticky.className = "sg-sticky";

    const titleBar = document.createElement("div");
    titleBar.className = "sg-titlebar";

    const title = document.createElement("h2");
    title.className = "sg-title";
    title.textContent = "Sender Organizer";

    const statsSection = document.createElement("section");
    statsSection.className = "sg-stats";

    const searchWrap = document.createElement("div");
    searchWrap.className = "sg-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.className = "sg-search";
    searchInput.type = "search";
    searchInput.placeholder = "Search sender name or email";
    searchInput.autocomplete = "off";

    const groupsSection = document.createElement("section");
    groupsSection.className = "sg-groups";

    const emptyState = document.createElement("div");
    emptyState.className = "sg-empty";
    emptyState.textContent = "No matching senders in this inbox view.";
    emptyState.hidden = true;

    titleBar.appendChild(title);
    searchWrap.appendChild(searchInput);

    sticky.appendChild(titleBar);
    sticky.appendChild(statsSection);
    sticky.appendChild(searchWrap);

    shell.appendChild(sticky);
    shell.appendChild(groupsSection);
    shell.appendChild(emptyState);
    panel.appendChild(shell);

    return {
      panel,
      searchInput,
      groupsSection,
      emptyState,
      statsSection,
    };
  }

  function createToggleButton(onToggle) {
    const button = document.createElement("button");
    button.id = "sg-toggle-btn";
    button.type = "button";
    button.className = "sg-toggle-btn";
    button.title = "Toggle Sender Organizer panel";

    button.addEventListener("click", () => {
      state.open = !state.open;
      if (typeof onToggle === "function") {
        onToggle(state.open);
      }

      if (state.refs) {
        applyOpenState(state.refs.layoutHost, state.refs.panelNode, state.refs.toggleBtn);
      }
    });

    return button;
  }

  function ensureMounted(options) {
    const mainNode = findMainNode();
    if (!mainNode) {
      return null;
    }

    const layoutHost = findLayoutHost(mainNode);
    if (!layoutHost) {
      return null;
    }

    if (state.mounted && state.refs && document.body.contains(state.refs.panelNode)) {
      return state.refs;
    }

    layoutHost.classList.add("sg-layout-host");
    mainNode.classList.add("sg-main-node");

    const panelDom = createPanelDom();
    const panelNode = panelDom.panel;
    layoutHost.appendChild(panelNode);

    const toolbarMount = findToolbarMountPoint();
    const toggleBtn = createToggleButton(options.onToggle);
    if (toolbarMount) {
      toolbarMount.appendChild(toggleBtn);
    }

    panelDom.searchInput.addEventListener("input", (event) => {
      if (typeof options.onSearchInput === "function") {
        options.onSearchInput(event.target.value || "");
      }
    });

    state.refs = {
      mainNode,
      layoutHost,
      panelNode,
      toggleBtn,
      searchInput: panelDom.searchInput,
      groupsContainer: panelDom.groupsSection,
      emptyState: panelDom.emptyState,
      statsContainer: panelDom.statsSection,
    };

    state.mounted = true;
    applyOpenState(layoutHost, panelNode, toggleBtn);

    return state.refs;
  }

  function setEmptyStateVisible(isVisible) {
    if (!state.refs) {
      return;
    }
    state.refs.emptyState.hidden = !isVisible;
  }

  NAMESPACE.PanelController = {
    ensureMounted,
    setEmptyStateVisible,
  };
})(window);
