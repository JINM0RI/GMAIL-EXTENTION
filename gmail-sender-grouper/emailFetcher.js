(function initEmailFetcher(global) {
  "use strict";

  const API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
  const PAGE_SIZE = 100;
  const DETAIL_BATCH_SIZE = 20;
  const MAX_MESSAGE_SCAN = 500;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  async function fetchAllMessageIds() {
    const all = [];
    let pageToken = null;
    let pages = 0;

    do {
      let url = `${API_BASE}/messages?maxResults=${PAGE_SIZE}&q=${encodeURIComponent("label:inbox")}`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const data = await fetchJson(url);
      if (Array.isArray(data.messages) && data.messages.length) {
        all.push(...data.messages);
      }

      if (all.length >= MAX_MESSAGE_SCAN) {
        return all.slice(0, MAX_MESSAGE_SCAN);
      }

      pageToken = data.nextPageToken || null;
      pages += 1;

      if (pages > 500) {
        break;
      }
    } while (pageToken);

    return all.slice(0, MAX_MESSAGE_SCAN);
  }

  async function fetchMessageDetails(messageId) {
    const url = `${API_BASE}/messages/${encodeURIComponent(
      messageId
    )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;

    return fetchJson(url);
  }

  function toNormalizedMessage(message) {
    const headers = (message && message.payload && message.payload.headers) || [];
    const from = parseFromHeader(getHeaderValue(headers, "From"));

    return {
      senderName: from.name,
      senderEmail: from.email,
      subject: normalizeText(getHeaderValue(headers, "Subject")) || "(No subject)",
      snippet: normalizeText(message && message.snippet),
      time: formatTime(getHeaderValue(headers, "Date"), message && message.internalDate),
      threadId: normalizeText(message && message.threadId) || normalizeText(message && message.id),
    };
  }

  async function fetchAllMessagesDetailed() {
    const ids = await fetchAllMessageIds();

    if (!ids.length) {
      return {
        scannedMessages: 0,
        processedMessages: 0,
        messages: [],
      };
    }

    const detailed = [];

    for (let i = 0; i < ids.length; i += DETAIL_BATCH_SIZE) {
      const chunk = ids.slice(i, i + DETAIL_BATCH_SIZE);
      const results = await Promise.all(
        chunk.map((item) =>
          fetchMessageDetails(item.id)
            .then((message) => toNormalizedMessage(message))
            .catch((error) => {
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
        if (result && result.threadId) {
          detailed.push(result);
        }
      });

      await sleep(220);
    }

    return {
      scannedMessages: ids.length,
      processedMessages: detailed.length,
      messages: detailed,
    };
  }

  function groupBySender(messages) {
    const groups = new Map();

    messages.forEach((message) => {
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
