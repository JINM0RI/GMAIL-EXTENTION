(function initSenderExtractor(global) {
  "use strict";

  const NAMESPACE = (global.SenderGrouper = global.SenderGrouper || {});
  const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseEmail(value) {
    const source = normalizeText(value);
    const match = EMAIL_REGEX.exec(source);
    return match ? match[0].toLowerCase() : "";
  }

  function humanizeDomain(domain) {
    const raw = normalizeText(domain).toLowerCase();
    if (!raw) {
      return "";
    }

    const parts = raw.split(".").filter(Boolean);
    if (!parts.length) {
      return "";
    }

    const secondLevel = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return secondLevel
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function senderNameFromEmail(email) {
    const normalized = normalizeText(email).toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      return "";
    }

    const domain = normalized.split("@")[1] || "";
    return humanizeDomain(domain);
  }

  function toSenderName(rawName, fallbackEmailOrText) {
    const cleanName = normalizeText(rawName).replace(/<[^>]*>/g, "");
    if (cleanName && cleanName.toLowerCase() !== String(fallbackEmailOrText || "").toLowerCase()) {
      return cleanName;
    }

    const fallback = normalizeText(fallbackEmailOrText);
    const fromEmail = senderNameFromEmail(fallback);
    if (fromEmail) {
      return fromEmail;
    }

    if (!fallback || !fallback.includes("@")) {
      return fallback || "Unknown Sender";
    }

    const localPart = fallback.split("@")[0].replace(/[._-]+/g, " ");
    const titleCase = localPart
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    return titleCase || fallback;
  }

  function extractSenderFromElement(element) {
    if (!element) {
      return {
        senderName: "Unknown Sender",
        senderEmail: "unknown@unknown",
      };
    }

    const senderText = normalizeText(element.textContent || element.innerText);

    const email =
      normalizeText(element.getAttribute("email")).toLowerCase() ||
      parseEmail(element.getAttribute("title")) ||
      parseEmail(element.getAttribute("aria-label")) ||
      parseEmail(senderText) ||
      normalizeText(senderText).toLowerCase() ||
      "unknown@unknown";

    const senderName = toSenderName(senderText, email);

    return {
      senderName,
      senderEmail: email,
    };
  }

  function findSenderElement(row) {
    return row.querySelector(
      "span.yP[email], span.yP[title], span.yP[aria-label], span.yP, .yW span[email], .yX.xY .yP, .yW span"
    );
  }

  function extractSender(row) {
    const senderElement = findSenderElement(row);
    return extractSenderFromElement(senderElement);
  }

  NAMESPACE.SenderExtractor = {
    parseEmail,
    extractSender,
    extractSenderFromElement,
  };
})(window);
