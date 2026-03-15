(function initGroupEngine(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});

  const state = {
    senderMap: new Map(),
    emailByThreadId: new Map(),
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

  function extractEmailFromText(rawText) {
    const text = normalizeText(rawText).toLowerCase();
    const match = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/.exec(text);
    return match ? match[1] : "";
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
    const node = row.querySelector("span.yP, .yW span[email], .yX.xY .yP, .yW span");
    if (!node) {
      return {
        senderName: "Unknown Sender",
        senderEmail: "unknown@unknown",
      };
    }

    const senderText = normalizeText(node.textContent);
    const senderEmail =
      normalizeText(node.getAttribute("email")).toLowerCase() ||
      extractEmailFromTitle(node.getAttribute("title")) ||
      extractEmailFromText(senderText) ||
      "unknown@unknown";

    const senderNameRaw = senderText.replace(/<[^>]+>/g, "");
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

  function ensureGroup(senderKey, senderName, senderEmail) {
    if (!state.senderMap.has(senderKey)) {
      state.senderMap.set(senderKey, {
        senderKey,
        senderName,
        senderEmail,
        emails: [],
      });
    }

    return state.senderMap.get(senderKey);
  }

  function removeEmailFromGroup(emailRecord) {
    const oldGroup = state.senderMap.get(emailRecord.senderKey);
    if (!oldGroup) {
      return;
    }

    oldGroup.emails = oldGroup.emails.filter((item) => item.threadId !== emailRecord.threadId);
    if (oldGroup.emails.length === 0) {
      state.senderMap.delete(emailRecord.senderKey);
    }
  }

  function mergeEmails(emails) {
    const changedSenderKeys = new Set();

    emails.forEach((email) => {
      const existing = state.emailByThreadId.get(email.threadId);

      if (existing) {
        const senderChanged = existing.senderKey !== email.senderKey;
        const subjectChanged = existing.subject !== email.subject;
        if (!senderChanged && !subjectChanged) {
          // Keep latest row reference for click navigation.
          existing.row = email.row;
          return;
        }

        removeEmailFromGroup(existing);
        changedSenderKeys.add(existing.senderKey);
      }

      const group = ensureGroup(email.senderKey, email.senderName, email.senderEmail);
      const nextEmail = {
        threadId: email.threadId,
        senderKey: email.senderKey,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        subject: email.subject,
        row: email.row,
      };

      const existingIndex = group.emails.findIndex((item) => item.threadId === nextEmail.threadId);
      if (existingIndex >= 0) {
        group.emails[existingIndex] = nextEmail;
      } else {
        group.emails.push(nextEmail);
      }

      state.emailByThreadId.set(nextEmail.threadId, nextEmail);
      changedSenderKeys.add(email.senderKey);
    });

    return {
      changedSenderKeys: Array.from(changedSenderKeys),
      removedSenderKeys: [],
    };
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

    const diff = mergeEmails(emailList);
    state.signature = signature;

    // Keep email ordering stable and newest-first based on current DOM order when rows are available.
    state.senderMap.forEach((group) => {
      group.emails.sort((a, b) => {
        if (a.row && b.row && a.row.compareDocumentPosition) {
          const position = a.row.compareDocumentPosition(b.row);
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            return -1;
          }
          if (position & Node.DOCUMENT_POSITION_PRECEDING) {
            return 1;
          }
        }
        return a.subject.localeCompare(b.subject);
      });
    });

    const groups = sortGroups(Array.from(state.senderMap.values()));

    return {
      changed: true,
      groups,
      stats: buildStats(groups),
      diff,
    };
  }

  NAMESPACE.GroupEngine = {
    collectVisibleEmails,
    update,
  };
})(window);
