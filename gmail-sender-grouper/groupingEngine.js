(function initGroupingEngine(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const state = {
    senderMap: new Map(),
    emailById: new Map(),
    signature: "",
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeSenderName(name, email) {
    const cleanName = normalizeText(name);
    if (cleanName && cleanName !== email) {
      return cleanName;
    }

    if (email.includes("@")) {
      const localPart = email.split("@")[0].replace(/[._-]+/g, " ");
      return localPart
        .split(" ")
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");
    }

    return "Unknown Sender";
  }

  function parseFromTitle(titleValue) {
    const match = /<([^>]+@[^>]+)>/.exec(titleValue || "");
    return match ? match[1].trim() : "";
  }

  function extractSenderParts(row) {
    const senderNode = row.querySelector(".yW span[email], .yX.xY .yP, .yW span");
    const senderEmailFromAttr = senderNode ? normalizeText(senderNode.getAttribute("email")) : "";
    const senderTitle = senderNode ? normalizeText(senderNode.getAttribute("title")) : "";
    const senderEmailFromTitle = parseFromTitle(senderTitle);

    const senderEmail = (senderEmailFromAttr || senderEmailFromTitle || "unknown@unknown").toLowerCase();
    const senderNameFromNode = senderNode ? normalizeText(senderNode.textContent) : "";
    const senderName = sanitizeSenderName(senderNameFromNode, senderEmail);

    return {
      senderName,
      senderEmail,
    };
  }

  function extractSubject(row) {
    const subjectNode = row.querySelector(".bog, .y6 span[id], .xT .y6");
    const subject = normalizeText(subjectNode ? subjectNode.textContent : "");
    return subject || "(No subject)";
  }

  function extractMessageId(row) {
    const rawId =
      row.getAttribute("data-legacy-thread-id") ||
      row.getAttribute("data-thread-id") ||
      row.getAttribute("data-legacy-message-id") ||
      row.getAttribute("id") ||
      "";

    return normalizeText(rawId);
  }

  function collectVisibleEmails(gmail) {
    const rows = Array.from(document.querySelectorAll("tr.zA"));
    const seenIds = new Set();
    const emails = [];

    rows.forEach((row, index) => {
      const messageId = extractMessageId(row) || `row-${index}`;
      if (seenIds.has(messageId)) {
        return;
      }
      seenIds.add(messageId);

      const { senderName, senderEmail } = extractSenderParts(row, gmail);
      const subject = extractSubject(row);

      emails.push({
        messageId,
        senderName,
        senderEmail,
        senderKey: senderEmail.toLowerCase(),
        subject,
        row,
      });
    });

    return emails;
  }

  function computeSignature(emails) {
    return emails
      .map((email) => `${email.messageId}:${email.senderKey}:${email.subject}`)
      .join("|");
  }

  function buildSenderMap(emails) {
    const senderMap = new Map();
    const emailById = new Map();

    emails.forEach((email) => {
      emailById.set(email.messageId, email);

      if (!senderMap.has(email.senderKey)) {
        senderMap.set(email.senderKey, {
          senderKey: email.senderKey,
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          emails: [],
        });
      }

      senderMap.get(email.senderKey).emails.push(email);
    });

    return { senderMap, emailById };
  }

  function hasGroupChanged(previousGroup, nextGroup) {
    if (!previousGroup) {
      return true;
    }

    if (previousGroup.emails.length !== nextGroup.emails.length) {
      return true;
    }

    for (let i = 0; i < nextGroup.emails.length; i += 1) {
      if (previousGroup.emails[i].messageId !== nextGroup.emails[i].messageId) {
        return true;
      }
    }

    return false;
  }

  function sortGroups(groups) {
    return groups.sort((a, b) => {
      if (b.emails.length !== a.emails.length) {
        return b.emails.length - a.emails.length;
      }

      return a.senderName.localeCompare(b.senderName);
    });
  }

  function buildStats(senderGroups) {
    const totalEmails = senderGroups.reduce((sum, group) => sum + group.emails.length, 0);
    const topSenders = senderGroups.slice(0, 5).map((group) => ({
      senderName: group.senderName,
      senderEmail: group.senderEmail,
      count: group.emails.length,
    }));

    return {
      totalSenders: senderGroups.length,
      totalEmails,
      topSenders,
    };
  }

  function updateSenderMap(visibleEmails) {
    const nextSignature = computeSignature(visibleEmails);
    if (nextSignature === state.signature) {
      const senderGroups = sortGroups(Array.from(state.senderMap.values()));
      return {
        changed: false,
        senderGroups,
        diff: {
          changedSenderKeys: [],
          removedSenderKeys: [],
        },
        stats: buildStats(senderGroups),
      };
    }

    const previousMap = state.senderMap;
    const { senderMap, emailById } = buildSenderMap(visibleEmails);

    const changedSenderKeys = [];
    senderMap.forEach((nextGroup, senderKey) => {
      const previousGroup = previousMap.get(senderKey);
      if (hasGroupChanged(previousGroup, nextGroup)) {
        changedSenderKeys.push(senderKey);
      }
    });

    const removedSenderKeys = [];
    previousMap.forEach((_group, senderKey) => {
      if (!senderMap.has(senderKey)) {
        removedSenderKeys.push(senderKey);
      }
    });

    state.senderMap = senderMap;
    state.emailById = emailById;
    state.signature = nextSignature;

    const senderGroups = sortGroups(Array.from(senderMap.values()));

    return {
      changed: true,
      senderGroups,
      diff: {
        changedSenderKeys,
        removedSenderKeys,
      },
      stats: buildStats(senderGroups),
    };
  }

  NAMESPACE.GroupingEngine = {
    collectVisibleEmails,
    updateSenderMap,
  };
})(window);
