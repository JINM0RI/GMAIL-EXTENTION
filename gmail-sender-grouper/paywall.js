const VERIFY_URL = "https://extension-backend-88ufke83p-jinm0ris-projects.vercel.app/api/verify";
const RAZORPAY_URL = "https://rzp.io/rzp/p8h9A6gy";
const DODO_URL = "https://test.checkout.dodopayments.com/buy/pdt_0Nayso9oxA51GhBO1QpbL?quantity=1";

async function verifyKey(licenseKey) {
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey }),
    });
    const { valid } = await res.json();
    return valid;
  } catch {
    return true;
  }
}

function showPaywall() {
  const overlay = document.createElement("div");
  overlay.id = "gmail-extension-paywall";
  overlay.innerHTML = `
    <div class="pw-box">
      <div class="pw-icon">🔒</div>
      <h2>Unlock Gmail Sender Grouper</h2>
      <p class="pw-sub">One-time payment — use forever on any device</p>

      <div class="pw-buttons">
        <button class="pw-buy pw-india" id="pw-india-btn">
          🇮🇳 Buy Now — ₹100
          <span class="pw-btn-sub">UPI · GPay · Debit Card · Net Banking</span>
        </button>
        <button class="pw-buy pw-global" id="pw-global-btn">
          🌍 International — Coming Soon
          <span class="pw-btn-sub">Available very soon!</span>
        </button>
      </div>

      <div class="pw-divider">Already purchased?</div>
      <p class="pw-hint">
        🇮🇳 Paid via Razorpay? Your <strong>Payment ID</strong> is your key (starts with pay_)<br><br>
        🌍 Paid via Dodo? Use the <strong>TRANSACTION ID</strong> from your confirmation email
      </p>
      <input class="pw-input" id="pw-license-input" placeholder="Paste license key or payment ID (pay_xxxxx)" />
      <button class="pw-activate" id="pw-activate-btn">Activate License</button>
      <p class="pw-msg" id="pw-msg"></p>

      <button class="pw-minimize" id="pw-minimize-btn">— Minimize to check my email</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("pw-india-btn").addEventListener("click", () => {
    window.open(RAZORPAY_URL, "_blank");
  });

  document.getElementById("pw-global-btn").addEventListener("click", () => {
    const msg = document.getElementById("pw-msg");
    msg.style.color = "#aaa";
    msg.textContent = "🌍 International payments coming soon!";
  });

  document.getElementById("pw-activate-btn").addEventListener("click", async () => {
    const key = document.getElementById("pw-license-input").value.trim();
    const msg = document.getElementById("pw-msg");

    if (!key) {
      msg.style.color = "red";
      msg.textContent = "Please paste your key first.";
      return;
    }

    msg.style.color = "#555";
    msg.textContent = "⏳ Checking your license...";

    const valid = await verifyKey(key);

    if (valid) {
      await chrome.storage.local.set({ licenseKey: key });
      msg.style.color = "green";
      msg.textContent = "✅ Activated! Reloading...";
      setTimeout(() => {
        overlay.remove();
        window.location.reload();
      }, 1500);
    } else {
      msg.style.color = "red";
      msg.textContent = "❌ Invalid key. Check and try again.";
    }
  });

  document.getElementById("pw-minimize-btn").addEventListener("click", () => {
    overlay.style.display = "none";
    const existingRestore = document.getElementById("pw-restore-btn");
    if (existingRestore) return;

    const restoreBtn = document.createElement("div");
    restoreBtn.id = "pw-restore-btn";
    restoreBtn.textContent = "🔒 Activate Extension";
    restoreBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0a0a0a;
      color: #d4d4d4;
      padding: 10px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      z-index: 999999;
      border: 1px solid #888;
      box-shadow: 0 0 14px rgba(180,180,180,0.2), 0 0 30px rgba(150,150,150,0.08);
      font-family: sans-serif;
      transition: box-shadow 0.2s;
    `;
    document.body.appendChild(restoreBtn);
    restoreBtn.addEventListener("click", () => {
      overlay.style.display = "flex";
      restoreBtn.remove();
    });
  });
}

async function checkLicense() {
  const { licenseKey } = await chrome.storage.local.get("licenseKey");
  if (!licenseKey) { showPaywall(); return false; }
  const valid = await verifyKey(licenseKey);
  if (!valid) { showPaywall(); return false; }
  return true;
}

window.__checkLicense = checkLicense;
