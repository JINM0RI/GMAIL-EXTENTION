(function initTrial(global) {
  "use strict";

  const TRIAL_DAYS = 7;
  const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

  async function checkTrial() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["trialStart", "trialEnd", "isPaid"], (result) => {
        const now = Date.now();
        let trialStart = result.trialStart;
        let trialEnd = result.trialEnd;
        let isPaid = result.isPaid;

        // First time: initialize trial
        if (!trialStart) {
          trialStart = now;
          trialEnd = now + TRIAL_DURATION_MS;
          chrome.storage.local.set({ trialStart, trialEnd, isPaid: false });
        }

        // If paid, it's always active
        if (isPaid) {
          resolve({ active: true, daysLeft: 0, isPaid: true });
          return;
        }

        // Trial still active
        if (now < trialEnd) {
          const daysLeft = Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000));
          resolve({ active: true, daysLeft, isPaid: false });
          return;
        }

        // Trial expired
        resolve({ active: false, daysLeft: 0, isPaid: false });
      });
    });
  }

  async function activatePaid() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ isPaid: true }, () => {
        resolve({ active: true, daysLeft: 0, isPaid: true });
      });
    });
  }

  global.SenderGrouper = global.SenderGrouper || {};
  global.SenderGrouper.Trial = {
    checkTrial,
    activatePaid,
    TRIAL_DAYS,
  };
})(globalThis);
