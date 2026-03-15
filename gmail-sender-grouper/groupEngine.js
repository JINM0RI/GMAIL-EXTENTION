(function initGroupEngine(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const state = {
    senderMap: new Map(),
    signature: "",
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractEmailFromTitle(titleValue) {
    const title = normalizeText(titleValue);
    const match = /<([^>]+@[^>]+)>/.exec(title);
    return match ? match[1].toLowerCase() : "";
  }

  function humanizeSender(email) {
    if (!email || !email.includes("@")) {
      return "Unknown Sender";
    }

    const localPart = email.split("@")[0].replace(/[._-]+/g, " ");
    return localPart
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function extractSender(row) {
    const node = row.querySelector(".yW span[email], .yX.xY .yP, .yW span");
    if (!node) {
      return {
        senderName: "Unknown Sender",
        senderEmail: "unknown@unknown",
      };
    }

    const senderEmail =
      normalizeText(node.getAttribute("email")).toLowerCase() ||
      extractEmailFromTitle(node.getAttribute("title")) ||
      "unknown@unknown";

    const senderNameRaw = normalizeText(node.textContent);
    const senderName = senderNameRaw && senderNameRaw !== senderEmail ? senderNameRaw : humanizeSender(senderEmail);

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

  function extractThreadId(row, fallbackIndex) {
    return (
      normalizeText(row.getAttribute("data-legacy-thread-id")) ||
      normalizeText(row.getAttribute("data-thread-id")) ||
      normalizeText(row.getAttribute("data-legacy-message-id")) ||
      normalizeText(row.getAttribute("id")) ||
      `row-${fallbackIndex}`
    );
  }

  function collectVisibleEmails() {
    const rows = Array.from(document.querySelectorAll("tr.zA"));
    const seen = new Set();
    const emails = [];

    rows.forEach((row, index) => {
      if (!(row instanceof HTMLElement)) {
        return;
      }

      const threadId = extractThreadId(row, index);
      if (seen.has(threadId)) {
        return;
      }
      seen.add(threadId);

      const sender = extractSender(row);
      const subject = extractSubject(row);

      emails.push({
        threadId,
        senderKey: sender.senderEmail,
        senderName: sender.senderName,
        senderEmail: sender.senderEmail,
        subject,
        row,
      });
    });

    return emails;
  }

  function computeSignature(emails) {
    return emails.map((email) => `${email.threadId}:${email.senderKey}:${email.subject}`).join("|");
  }

  function hasGroupChanged(prevGroup, nextGroup) {
    if (!prevGroup) {
      return true;
    }

    if (prevGroup.emails.length !== nextGroup.emails.length) {
      return true;
    }

    for (let i = 0; i < nextGroup.emails.length; i += 1) {
      if (prevGroup.emails[i].threadId !== nextGroup.emails[i].threadId) {
        return true;
      }
    }

    return false;
  }

  function buildNextMap(emails) {
    const nextMap = new Map();

    emails.forEach((email) => {
      if (!nextMap.has(email.senderKey)) {
        nextMap.set(email.senderKey, {
          senderKey: email.senderKey,
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          emails: [],
        });
      }

      nextMap.get(email.senderKey).emails.push(email);
    });

    return nextMap;
  }

  function sortGroups(groups) {
    return groups.sort((a, b) => {
      if (b.emails.length !== a.emails.length) {
        return b.emails.length - a.emails.length;
      }
      return a.senderName.localeCompare(b.senderName);
    });
  }

  function buildStats(groups) {
    const totalEmails = groups.reduce((acc, group) => acc + group.emails.length, 0);
    return {
      totalSenders: groups.length,
      totalEmails,
      topSenders: groups.slice(0, 5).map((group) => ({
        senderName: group.senderName,
        senderEmail: group.senderEmail,
        count: group.emails.length,
      })),
    };
  }

  function update(emailList) {
    const signature = computeSignature(emailList);
    if (signature === state.signature) {
      const groups = sortGroups(Array.from(state.senderMap.values()));
      return {
        changed: false,
        groups,
        stats: buildStats(groups),
        diff: {
          changedSenderKeys: [],
          removedSenderKeys: [],
        },
      };
    }

    const previousMap = state.senderMap;
    const nextMap = buildNextMap(emailList);

    const changedSenderKeys = [];
    nextMap.forEach((nextGroup, senderKey) => {
      if (hasGroupChanged(previousMap.get(senderKey), nextGroup)) {
        changedSenderKeys.push(senderKey);
      }
    });

    const removedSenderKeys = [];
    previousMap.forEach((_group, senderKey) => {
      if (!nextMap.has(senderKey)) {
        removedSenderKeys.push(senderKey);
      }
    });

    state.senderMap = nextMap;
    state.signature = signature;

    const groups = sortGroups(Array.from(nextMap.values()));

    return {
      changed: true,
      groups,
      stats: buildStats(groups),
      diff: {
        changedSenderKeys,
        removedSenderKeys,
      },
    };
  }

  NAMESPACE.GroupEngine = {
    collectVisibleEmails,
    update,
  };
})(window);
