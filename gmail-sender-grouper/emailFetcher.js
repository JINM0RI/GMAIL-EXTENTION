(function initEmailFetcher(global) {
  "use strict";

  const API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
  const PAGE_SIZE = 100;
  const DETAIL_BATCH_SIZE = 50;
  const MAX_MESSAGE_SCAN = 300;
  const INITIAL_ID_BUFFER = 500;
  const EXTRA_ID_BUFFER = 200;
  const GMAIL_UNITS_PER_SECOND_LIMIT = 250;
  const MESSAGE_GET_UNITS = 5;

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

    return remainingMs;
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

  async function fetchAllMessageIds(targetCount = INITIAL_ID_BUFFER, startPageToken = null) {
    const all = [];
    let pageToken = startPageToken;
    let hasNextPage = true;

    while (all.length < targetCount && hasNextPage) {
      let url = `${API_BASE}/messages?maxResults=${PAGE_SIZE}&q=${encodeURIComponent("label:inbox")}`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const data = await fetchJson(url);
      if (Array.isArray(data.messages) && data.messages.length) {
        all.push(...data.messages);
      }

      hasNextPage = Boolean(data.nextPageToken);
      pageToken = data.nextPageToken || null;
    }

    return {
      ids: all,
      nextPageToken: pageToken,
    };
  }

  async function fetchMessageDetails(messageId) {
    const url = `${API_BASE}/messages/${encodeURIComponent(
      messageId
    )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&fields=payload/headers,id,snippet,labelIds`;

    return fetchJson(url);
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

  async function fetchAllMessagesDetailed() {
    const initialFetch = await fetchAllMessageIds(INITIAL_ID_BUFFER, null);
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

    while (detailed.length < MAX_MESSAGE_SCAN) {
      if (cursor >= ids.length) {
        if (!nextPageToken) {
          break;
        }

        const topUp = await fetchAllMessageIds(EXTRA_ID_BUFFER, nextPageToken);
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
          fetchMessageDetails(item.id)
            .then((message) => toNormalizedMessage(message))
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

      if (detailed.length >= MAX_MESSAGE_SCAN) {
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
      processedMessages: detailed.slice(0, MAX_MESSAGE_SCAN).length,
      messages: detailed.slice(0, MAX_MESSAGE_SCAN),
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
      const senderKey = senderEmail !== "unknown@unknown" ? senderEmail : `name:${senderName.toLowerCase()}`;

      if (!groups.has(senderKey)) {
        groups.set(senderKey, {
          name: senderName,
          email: senderEmail,
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

  async function fetchAndGroupAllEmails() {
    const detailResult = await fetchAllMessagesDetailed();
    const grouped = groupBySender(detailResult.messages);

    return {
      ...grouped,
      scannedMessages: detailResult.scannedMessages,
      processedMessages: detailResult.processedMessages,
      updatedAt: Date.now(),
    };
  }

  global.EmailFetcher = {
    fetchAndGroupAllEmails,
  };
})(globalThis);
