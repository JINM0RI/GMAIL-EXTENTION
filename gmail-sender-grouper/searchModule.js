(function initSearchModule(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function filterGroups(groups, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) {
      return groups;
    }

    return groups.filter((group) => {
      const name = normalize(group.senderName);
      const email = normalize(group.senderEmail);
      return name.includes(query) || email.includes(query);
    });
  }

  NAMESPACE.SearchModule = {
    normalize,
    filterGroups,
  };
})(window);
