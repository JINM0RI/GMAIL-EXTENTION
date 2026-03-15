(function initSearchModule(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function matchesGroup(group, query) {
    if (!query) {
      return true;
    }

    const senderName = normalize(group.senderName);
    const senderEmail = normalize(group.senderEmail);
    return senderName.includes(query) || senderEmail.includes(query);
  }

  function filterGroups(groups, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) {
      return groups;
    }

    return groups.filter((group) => matchesGroup(group, query));
  }

  NAMESPACE.Search = {
    normalize,
    filterGroups,
  };
})(window);
