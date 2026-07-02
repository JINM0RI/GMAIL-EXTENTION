const DODO_PAYMENT_LINK = "https://test.checkout.dodopayments.com/buy/pdt_0Nayso9oxA51GhBO1QpbL?quantity=1";

(function setupPaywall(global) {
  "use strict";

  function createPaywallOverlay(trial) {
    const overlay = document.createElement("div");
    overlay.id = "sg-trial-paywall";
    overlay.className = "sg-paywall-overlay";

    const card = document.createElement("div");
    card.className = "sg-paywall-card";

    const state = trial.active ? "active" : "expired";
    const daysLeft = trial.daysLeft || 0;
    const daysUsed = 7 - daysLeft;

    let contentHTML = `
      <!-- Top Navigation -->
      <div class="sg-paywall-nav">
        <button class="sg-nav-back-btn" id="sg-nav-back">
          <span class="sg-back-arrow">←</span> Gmail Sender Grouper
        </button>
      </div>

      <!-- Tabs Navigation -->
      <div class="sg-paywall-tabs">
        <button class="sg-tab-btn active" id="sg-tab-purchase">Purchase</button>
        <button class="sg-tab-btn" id="sg-tab-activate">Activate License</button>
      </div>

      <!-- Tab 1: Purchase Content -->
      <div class="sg-tab-content active" id="sg-content-purchase">
        <div class="sg-purchase-main" id="sg-purchase-main">
          <div class="sg-paywall-header">
            <div class="sg-paywall-icon">🎁</div>
            <h2>Free Trial ${state === "active" ? "Active" : "Expired"}</h2>
          </div>
    `;

    if (state === "active") {
      contentHTML += `
          <div class="sg-paywall-timer">
            <div class="sg-timer-bar">
              <div class="sg-timer-fill" style="width: ${(daysUsed / 7) * 100}%;"></div>
            </div>
            <p class="sg-timer-text">
              <strong>${daysLeft}</strong> day${daysLeft !== 1 ? "s" : ""} remaining
              <span style="opacity: 0.6;">(${daysUsed}/7 used)</span>
            </p>
          </div>
          
          <div class="sg-paywall-expired" style="background: rgba(0, 212, 255, 0.05); border: 1px solid rgba(0, 212, 255, 0.2);">
            <p style="color: #00d4ff; margin: 4px 0; font-size: 14px; font-weight: 600;">Your 7-day free trial is currently active.</p>
            <p style="color: #66b8d1; margin: 4px 0; font-size: 14px; font-weight: 600;">Upgrade to lifetime access at any time.</p>
          </div>
      `;
    } else {
      contentHTML += `
          <div class="sg-paywall-expired">
            <p>Your 7-day free trial has ended.</p>
            <p>Subscribe to continue using Gmail Sender Grouper.</p>
          </div>
      `;
    }

    contentHTML += `
          <div class="sg-paywall-features">
            <h3>Unlock Lifetime Premium:</h3>
            <ul>
              <li><span class="sg-check">✔</span> Email Sender Grouping</li>
              <li><span class="sg-check">✔</span> Bulk Email Processing</li>
              <li><span class="sg-check">✔</span> Smart Organization</li>
              <li><span class="sg-check">✔</span> Full Gmail Integration</li>
            </ul>
          </div>

          <!-- Lifetime License Pricing Details -->
          <div class="sg-price-container">
            <div class="sg-price-title">Lifetime License</div>
            <div class="sg-price-row">
              <span class="sg-price-val">₹100</span>
              <span class="sg-price-approx">≈ $1.20 USD</span>
            </div>
            <div class="sg-price-note">One-time payment • No monthly subscription</div>
          </div>

          <!-- Purchase buttons -->
          <button class="sg-paywall-btn sg-subscribe-btn" id="sg-buy-license-btn">
            <span class="sg-btn-main-text">Buy Lifetime License</span>
            <span class="sg-btn-sub-text">₹100 (~$1.20)</span>
          </button>
          
          <button class="sg-paywall-btn sg-info-btn" id="sg-how-purchase-btn">
            How do I purchase?
          </button>

          <button class="sg-paywall-btn sg-close-btn" id="sg-close-paywall">
            ${state === "active" ? "Continue Trial" : "Dismiss"}
          </button>
        </div>

        <!-- Purchase Instructions Panel (Hidden by default) -->
        <div class="sg-instructions-panel" id="sg-instructions-panel" style="display: none;">
          <h3>How to Purchase</h3>
          <ol class="sg-instructions-list">
            <li>Click <strong>Buy Lifetime License</strong> button.</li>
            <li>Complete payment securely using Dodo Payments.</li>
            <li>After successful payment, you will receive your <strong>payment receipt</strong> and <strong>license key</strong> in your email.</li>
            <li>Copy the license key.</li>
            <li>Open the <strong>Activate License</strong> tab in this popup.</li>
            <li>Paste your license key into the input field.</li>
            <li>Click <strong>Activate License</strong> to unlock premium features.</li>
          </ol>
          <button class="sg-paywall-btn sg-close-instructions-btn" id="sg-close-instructions">
            Close
          </button>
        </div>
      </div>

      <!-- Tab 2: Activate License Content -->
      <div class="sg-tab-content" id="sg-content-activate" style="display: none;">
        <div class="sg-activate-main">
          <div class="sg-paywall-header">
            <div class="sg-paywall-icon">🔑</div>
            <h2>Activate Your License</h2>
            <p class="sg-activate-desc">Enter the license key you received in your email after purchase.</p>
          </div>

          <div class="sg-input-group">
            <label class="sg-input-label" for="sg-license-key">License Key</label>
            <input type="text" id="sg-license-key" class="sg-license-input" placeholder="Paste your license key here..." />
          </div>

          <button class="sg-paywall-btn sg-subscribe-btn" id="sg-activate-license-btn">
            Activate License
          </button>
          <button class="sg-paywall-btn sg-restore-btn" id="sg-restore-btn">
            Restore Purchase
          </button>
          <button class="sg-paywall-btn sg-help-btn" id="sg-need-help-btn">
            Need Help?
          </button>
        </div>
      </div>
    `;

    card.innerHTML = contentHTML;
    overlay.appendChild(card);

    // Event Listeners for Tab Navigation
    const tabPurchase = card.querySelector("#sg-tab-purchase");
    const tabActivate = card.querySelector("#sg-tab-activate");
    const contentPurchase = card.querySelector("#sg-content-purchase");
    const contentActivate = card.querySelector("#sg-content-activate");

    if (tabPurchase && tabActivate && contentPurchase && contentActivate) {
      tabPurchase.addEventListener("click", () => {
        tabPurchase.classList.add("active");
        tabActivate.classList.remove("active");
        contentPurchase.style.display = "block";
        contentActivate.style.display = "none";
      });

      tabActivate.addEventListener("click", () => {
        tabActivate.classList.add("active");
        tabPurchase.classList.remove("active");
        contentActivate.style.display = "block";
        contentPurchase.style.display = "none";
      });
    }

    // Event Listener for Back Arrow Header
    const backBtn = card.querySelector("#sg-nav-back");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        goBack();
      });
    }

    // Event Listener for Buy Lifetime License button
    const buyLicenseBtn = card.querySelector("#sg-buy-license-btn");
    if (buyLicenseBtn) {
      buyLicenseBtn.addEventListener("click", () => {
        openDodoCheckout();
      });
    }

    // Event Listener for How Do I Purchase? button
    const howPurchaseBtn = card.querySelector("#sg-how-purchase-btn");
    const instructionsPanel = card.querySelector("#sg-instructions-panel");
    const purchaseMain = card.querySelector("#sg-purchase-main");
    if (howPurchaseBtn && instructionsPanel && purchaseMain) {
      howPurchaseBtn.addEventListener("click", () => {
        showPurchaseInstructions();
      });
    }

    // Event Listener for Close Instructions button
    const closeInstructionsBtn = card.querySelector("#sg-close-instructions");
    if (closeInstructionsBtn && instructionsPanel && purchaseMain) {
      closeInstructionsBtn.addEventListener("click", () => {
        instructionsPanel.style.display = "none";
        purchaseMain.style.display = "block";
      });
    }

    // Event Listener for Activate License button
    const activateLicenseBtn = card.querySelector("#sg-activate-license-btn");
    const licenseInput = card.querySelector("#sg-license-key");
    if (activateLicenseBtn) {
      activateLicenseBtn.addEventListener("click", () => {
        const key = licenseInput ? licenseInput.value.trim() : "";
        activateLicense(key);
      });
    }

    // Event Listener for Restore Purchase button
    const restoreBtn = card.querySelector("#sg-restore-btn");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", () => {
        restorePurchase();
      });
    }

    // Event Listener for Need Help? button
    const needHelpBtn = card.querySelector("#sg-need-help-btn");
    if (needHelpBtn) {
      needHelpBtn.addEventListener("click", () => {
        // Mock support action (opens email client with pre-filled details)
        window.open("mailto:support@sendergrouper.com?subject=License%20Activation%20Help", "_blank");
      });
    }

    // Event Listener for Dismiss/Close Paywall button
    const closeBtn = card.querySelector("#sg-close-paywall");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        hidePaywall();
      });
    }

    return overlay;
  }

  // --- FUTURE INTEGRATION PLACEHOLDERS ---

  function openDodoCheckout() {
    if (!DODO_PAYMENT_LINK) {
      console.error("Dodo Checkout failed: DODO_PAYMENT_LINK is not configured.");
      alert("We couldn't initiate checkout because the payment link is missing.");
      return;
    }

    console.log("Dodo Checkout initiation started.");
    console.log("Target Payment Link:", DODO_PAYMENT_LINK);

    const buyBtn = document.getElementById("sg-buy-license-btn");
    if (!buyBtn) {
      console.error("Buy license button (#sg-buy-license-btn) not found in DOM.");
      return;
    }

    const originalContent = buyBtn.innerHTML;

    // 1. Disable the button during the opening process
    buyBtn.disabled = true;

    // 2. Show loading state in the button labels
    const mainTextSpan = buyBtn.querySelector(".sg-btn-main-text");
    const subTextSpan = buyBtn.querySelector(".sg-btn-sub-text");

    if (mainTextSpan) {
      mainTextSpan.textContent = "Opening Checkout...";
    }
    if (subTextSpan) {
      subTextSpan.textContent = "Please wait a moment...";
    }

    const startTime = Date.now();

    // 3. Open Dodo payment link in a new tab via background messaging
    const message = { type: "OPEN_TAB", url: DODO_PAYMENT_LINK };
    chrome.runtime.sendMessage(
      message,
      (response) => {
        const elapsedTime = Date.now() - startTime;
        // Keep the loading state for approximately 1 second (1000ms)
        const delay = Math.max(0, 1000 - elapsedTime);

        setTimeout(() => {
          const runtimeErr = chrome.runtime.lastError;
          if (runtimeErr) {
            console.error("Chrome Runtime Error:", runtimeErr);
            handleFailure(runtimeErr.message);
          } else if (response && !response.ok) {
            console.error("Dodo Checkout Open Failure:", response.error);
            handleFailure(response.error);
          } else {
            console.log("Successfully opened Dodo checkout tab.");
            // Re-enable and restore button state
            buyBtn.disabled = false;
            buyBtn.innerHTML = originalContent;
          }
        }, delay);
      }
    );

    function handleFailure(errorDetail) {
      console.error("Failed to open Dodo checkout page automatically:", errorDetail);
      // Re-enable the button if opening fails
      buyBtn.disabled = false;
      buyBtn.innerHTML = originalContent;
      // Display user-friendly error message
      alert(
        "We couldn't open the payment window automatically.\n\n" +
        "Please check your browser settings to ensure pop-ups are allowed, or manually copy and visit the checkout link:\n" +
        DODO_PAYMENT_LINK
      );
    }
  }

  async function activateLicense(licenseKey) {
    console.log("activateLicense placeholder called with key:", licenseKey);
    if (!licenseKey) {
      alert("Please enter a license key.");
      return;
    }
    alert(`Verifying license key: ${licenseKey}... (Placeholder function activateLicense will later call your backend to verify the key)`);
    
    // TODO: Add backend API call to verify the license key
    // For now, let's mock successful activation
    await globalThis.SenderGrouper.Trial.activatePaid();
    hidePaywall();
    location.reload();
  }

  async function restorePurchase() {
    console.log("restorePurchase placeholder called");
    alert("Restoring purchase... (Placeholder function restorePurchase will later restore access via email verification or active session)");
    
    // TODO: Verify if user has already purchased the license
    // For now, let's mock successful restoration
    await globalThis.SenderGrouper.Trial.activatePaid();
    hidePaywall();
    location.reload();
  }

  function showPurchaseInstructions() {
    console.log("showPurchaseInstructions placeholder called");
    const instructionsPanel = document.getElementById("sg-instructions-panel");
    const purchaseMain = document.getElementById("sg-purchase-main");
    if (instructionsPanel && purchaseMain) {
      purchaseMain.style.display = "none";
      instructionsPanel.style.display = "block";
    }
  }

  function goBack() {
    console.log("goBack placeholder called");
    // Return to the previous page or popup. For now, hide the paywall overlay.
    hidePaywall();
  }

  function showPaywall() {
    (async () => {
      if (!globalThis.SenderGrouper || !globalThis.SenderGrouper.Trial) {
        console.error("Trial system not loaded");
        return;
      }

      const trial = await globalThis.SenderGrouper.Trial.checkTrial();
      let existing = document.getElementById("sg-trial-paywall");

      if (existing) {
        existing.remove();
      }

      const overlay = createPaywallOverlay(trial);
      document.body.appendChild(overlay);
      document.body.classList.add("sg-subscription-locked");
    })();
  }

  function hidePaywall() {
    const overlay = document.getElementById("sg-trial-paywall");
    if (overlay) {
      overlay.remove();
    }
    document.body.classList.remove("sg-subscription-locked");
    if (globalThis.SenderGrouper && globalThis.SenderGrouper.FloatingWidget && typeof globalThis.SenderGrouper.FloatingWidget.removeMainUI === "function") {
      globalThis.SenderGrouper.FloatingWidget.removeMainUI();
    }
  }

  global.window.__showPaywall = showPaywall;
  global.window.__hidePaywall = hidePaywall;
})(globalThis);
