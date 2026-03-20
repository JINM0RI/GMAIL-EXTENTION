(function initEmailFetcher(global) {
  "use strict";

  const API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
  const PAGE_SIZE = 100;
  const DETAIL_BATCH_SIZE = 25;
  const MAX_MESSAGE_SCAN = 300;
  const FAST_REFRESH_SCAN = 120;
  const ID_OVERFETCH_BUFFER = 150;
  const GMAIL_UNITS_PER_SECOND_LIMIT = 250;
  const MESSAGE_GET_UNITS = 5;
  const DETAIL_RETRY_LIMIT = 3;
  const PERSONAL_PROVIDER_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "ymail.com",
    "rocketmail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "aol.com",
    "protonmail.com",
    "proton.me",
    "zoho.com",
    "gmx.com",
    "mail.com",
    "yandex.com",
    "rediffmail.com",
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getAdaptiveThrottleMs(batchSize, elapsedMs, rateLimited) {
    const requested = Math.max(1, Number(batchSize) || 1);
    const minWindowMs = Math.ceil((requested * MESSAGE_GET_UNITS * 1000) / GMAIL_UNITS_PER_SECOND_LIMIT);
    const remainingMs = Math.max(0, minWindowMs - Math.max(0, Number(elapsedMs) || 0));

    if (rateLimited) {
      return Math.max(remainingMs, 1200);
    }

    // Keep a small steady pacing to avoid burst failures that drop messages.
    return Math.max(remainingMs, 80);
  }

  function getHeaderValue(headers, key) {
    const lookup = String(key || "").toLowerCase();
    const match = (headers || []).find((header) => String(header.name || "").toLowerCase() === lookup);
    return match ? match.value : "";
  }

  function parseFromHeader(fromHeader) {
    const raw = normalizeText(fromHeader);
    const emailMatch = /<([^>]+)>/.exec(raw);
    const plainEmailMatch = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(raw);

    const email = normalizeText(emailMatch ? emailMatch[1] : plainEmailMatch ? plainEmailMatch[0] : "").toLowerCase();
    const name = normalizeText(raw.replace(/<[^>]*>/g, "")) || email || "Unknown Sender";

    return {
      name,
      email: email || "unknown@unknown",
    };
  }

  function formatTime(dateHeader, internalDate) {
    const date = normalizeText(dateHeader)
      ? new Date(dateHeader)
      : internalDate
      ? new Date(Number(internalDate))
      : null;

    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString();
  }

  function getDomainFromEmail(email) {
    const value = normalizeText(email).toLowerCase();
    const atIndex = value.lastIndexOf("@");
    if (atIndex < 0 || atIndex === value.length - 1) {
      return "";
    }
    return value.slice(atIndex + 1);
  }

  function getRootDomain(domain) {
    const value = normalizeText(domain).toLowerCase();
    if (!value) {
      return "";
    }

    const parts = value.split(".").filter(Boolean);
    if (parts.length <= 2) {
      return value;
    }

    const secondLevelTlds = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);
    const penultimate = parts[parts.length - 2];
    if (parts.length >= 3 && secondLevelTlds.has(penultimate) && parts[parts.length - 1].length === 2) {
      return parts.slice(-3).join(".");
    }

    return parts.slice(-2).join(".");
  }

  function toCompanyNameFromDomain(domain) {
    const root = getRootDomain(domain);
    const label = root.split(".")[0] || root;
    return label
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function deriveSenderGroup(senderEmail) {
    const email = normalizeText(senderEmail).toLowerCase();
    const domain = getDomainFromEmail(email);
    const rootDomain = getRootDomain(domain);

    if (!email || email === "unknown@unknown" || !domain) {
      return {
        groupKey: "unknown@unknown",
        groupName: "Unknown Sender",
        groupEmail: "unknown@unknown",
      };
    }

    if (PERSONAL_PROVIDER_DOMAINS.has(rootDomain)) {
      return {
        groupKey: `email:${email}`,
        groupName: "",
        groupEmail: email,
      };
    }

    return {
      groupKey: `company:${rootDomain}`,
      groupName: toCompanyNameFromDomain(rootDomain),
      groupEmail: rootDomain,
    };
  }

  async function fetchJson(url) {
    const response = await global.Auth.fetchWithAuth(url, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Gmail API error ${response.status}: ${body}`);
      error.status = response.status;
      error.body = body;
      error.url = url;
      throw error;
    }

    return response.json();
  }

  async function fetchAllMessageIds(startPageToken = null, maxMessages = MAX_MESSAGE_SCAN) {
    const all = [];
    let pageToken = startPageToken;

    while (all.length < maxMessages) {
      let url = `${API_BASE}/messages?maxResults=${PAGE_SIZE}&q=${encodeURIComponent("label:inbox")}`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const data = await fetchJson(url);
      if (Array.isArray(data.messages) && data.messages.length) {
        all.push(...data.messages);
      }

      pageToken = data.nextPageToken || null;

      if (!pageToken) {
        break;
      }
    }

    return {
      ids: all.slice(0, maxMessages),
      nextPageToken: pageToken,
    };
  }

  async function fetchMessageDetails(messageId) {
    const url = `${API_BASE}/messages/${encodeURIComponent(
      messageId
    )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&fields=payload/headers,id,snippet,labelIds`;

    return fetchJson(url);
  }

  function isRetryableDetailError(error) {
    const status = Number(error && error.status);
    return status === 429 || status === 403 || (status >= 500 && status < 600);
  }

  async function fetchMessageDetailsWithRetry(messageId) {
    let attempt = 0;
    let waitMs = 250;

    while (attempt < DETAIL_RETRY_LIMIT) {
      try {
        const message = await fetchMessageDetails(messageId);
        return toNormalizedMessage(message);
      } catch (error) {
        attempt += 1;
        if (!isRetryableDetailError(error) || attempt >= DETAIL_RETRY_LIMIT) {
          throw error;
        }

        await sleep(waitMs);
        waitMs *= 2;
      }
    }

    return null;
  }

  function isInboxMetadataMessage(message) {
    return Array.isArray(message && message.labelIds) && message.labelIds.includes("INBOX");
  }

  function toNormalizedMessage(message) {
    const headers = (message && message.payload && message.payload.headers) || [];
    const from = parseFromHeader(getHeaderValue(headers, "From"));

    return {
      messageId: normalizeText(message && message.id),
      senderName: from.name,
      senderEmail: from.email,
      subject: normalizeText(getHeaderValue(headers, "Subject")) || "(No subject)",
      snippet: normalizeText(message && message.snippet),
      time: formatTime(getHeaderValue(headers, "Date"), message && message.internalDate),
      threadId: normalizeText(message && message.threadId) || normalizeText(message && message.id),
      labelIds: Array.isArray(message && message.labelIds) ? message.labelIds.slice() : [],
    };
  }

  async function fetchAllMessagesDetailed(maxMessages = MAX_MESSAGE_SCAN) {
    const targetSize = Math.max(1, Number(maxMessages) || MAX_MESSAGE_SCAN);
    const initialFetch = await fetchAllMessageIds(null, targetSize + ID_OVERFETCH_BUFFER);
    const ids = Array.isArray(initialFetch && initialFetch.ids) ? initialFetch.ids.slice() : [];
    let nextPageToken = initialFetch ? initialFetch.nextPageToken : null;
    console.log(`[SenderGrouper] Found ${ids.length} buffered message IDs before detail scan.`);

    if (!ids.length && !nextPageToken) {
      return {
        scannedMessages: 0,
        processedMessages: 0,
        messages: [],
      };
    }

    const detailed = [];
    const seenRequestMessageIds = new Set();
    const seenResultMessageIds = new Set();
    let scannedCount = 0;
    let cursor = 0;

    while (detailed.length < targetSize) {
      if (cursor >= ids.length) {
        if (!nextPageToken) {
          break;
        }

        const remaining = Math.max(1, targetSize - detailed.length);
        const topUp = await fetchAllMessageIds(nextPageToken, Math.max(100, remaining + ID_OVERFETCH_BUFFER));
        if (Array.isArray(topUp && topUp.ids) && topUp.ids.length) {
          ids.push(...topUp.ids);
        }
        nextPageToken = topUp ? topUp.nextPageToken : null;

        if (cursor >= ids.length && !nextPageToken) {
          break;
        }
      }

      const chunk = [];
      while (chunk.length < DETAIL_BATCH_SIZE && cursor < ids.length) {
        const item = ids[cursor];
        cursor += 1;

        const messageKey = normalizeText(item && item.id);
        if (!messageKey || seenRequestMessageIds.has(messageKey)) {
          continue;
        }
        seenRequestMessageIds.add(messageKey);
        chunk.push(item);
      }

      if (!chunk.length) {
        if (cursor >= ids.length && !nextPageToken) {
          break;
        }
        continue;
      }

      scannedCount += chunk.length;

      const batchStartedAt = Date.now();
      let sawRateLimit = false;
      const results = await Promise.all(
        chunk.map((item) =>
          fetchMessageDetailsWithRetry(item.id)
            .catch((error) => {
              if (error && (error.status === 429 || error.status === 403)) {
                sawRateLimit = true;
              }
              console.error("[SenderGrouper] Message detail fetch failed", {
                messageId: item.id,
                status: error && error.status,
                body: error && error.body,
              });
              return null;
            })
        )
      );

      results.forEach((result) => {
        if (!result) {
          return;
        }

        if (!isInboxMetadataMessage(result)) {
          return;
        }

        const messageKey = normalizeText(result.messageId);

        if (messageKey && !seenResultMessageIds.has(messageKey)) {
          seenResultMessageIds.add(messageKey);
          detailed.push(result);
        }
      });

      if (detailed.length >= targetSize) {
        break;
      }

      const elapsedMs = Date.now() - batchStartedAt;
      const throttleMs = getAdaptiveThrottleMs(chunk.length, elapsedMs, sawRateLimit);

      if (throttleMs > 0) {
        await sleep(throttleMs);
      }
    }

    return {
      scannedMessages: scannedCount,
      processedMessages: detailed.slice(0, targetSize).length,
      messages: detailed.slice(0, targetSize),
    };
  }

  function groupBySender(messages) {
    const groups = new Map();
    const seenMessageIds = new Set();

    messages.forEach((message) => {
      const messageId = normalizeText(message && message.messageId);
      if (!messageId || seenMessageIds.has(messageId)) {
        return;
      }
      seenMessageIds.add(messageId);

      const senderEmail = normalizeText(message.senderEmail).toLowerCase() || "unknown@unknown";
      const senderName = normalizeText(message.senderName) || senderEmail || "Unknown Sender";
      const grouping = deriveSenderGroup(senderEmail);
      const senderKey = grouping.groupKey;

      if (!groups.has(senderKey)) {
        groups.set(senderKey, {
          name: grouping.groupName || senderName,
          email: grouping.groupEmail || senderEmail,
          count: 0,
          emails: [],
        });
      }

      const group = groups.get(senderKey);
      group.emails.push({
        messageId: message.messageId,
        subject: message.subject,
        snippet: message.snippet,
        time: message.time,
        threadId: message.threadId,
      });
      group.count += 1;
    });

    const senders = Array.from(groups.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const totalEmails = senders.reduce((sum, sender) => sum + sender.count, 0);

    return {
      totalSenders: senders.length,
      totalEmails,
      senders,
    };
  }

  async function fetchAndGroupAllEmails(maxMessages = MAX_MESSAGE_SCAN) {
    const requestedSize = Math.max(1, Number(maxMessages) || MAX_MESSAGE_SCAN);
    const detailResult = await fetchAllMessagesDetailed(requestedSize);
    const grouped = groupBySender(detailResult.messages);

    return {
      ...grouped,
      scannedMessages: detailResult.scannedMessages,
      processedMessages: detailResult.processedMessages,
      updatedAt: Date.now(),
    };
  }

  global.EmailFetcher = {
    FAST_REFRESH_SCAN,
    fetchAndGroupAllEmails,
  };
})(globalThis);
