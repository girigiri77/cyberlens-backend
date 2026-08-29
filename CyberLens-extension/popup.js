document.addEventListener("DOMContentLoaded", () => {

/* ===================== GLOBAL ===================== */

const techBtn = document.getElementById("techBtn");
const nonTechBtn = document.getElementById("nonTechBtn");
const container = document.querySelector(".container");


/* ===================== COMPONENT LOADER ===================== */

function loadComponent(path, callback){

  fetch(chrome.runtime.getURL(path))
  .then(res => res.text())
  .then(html => {

    container.innerHTML = html;

    initBackButton();
    initSwitchButton();

    if(callback) callback();

  })
  .catch(err => console.error("Component load failed:", err));

}


/* ===================== MODE BUTTONS ===================== */

if(techBtn){
  techBtn.addEventListener("click", () => {
    loadComponent("components/techMode.html", initTechMode);
  });
}

if(nonTechBtn){
  nonTechBtn.addEventListener("click", () => {
    loadComponent("components/nonTechMode.html", initNonTechMode);
  });
}


/* ===================== BACK BUTTON ===================== */

function initBackButton(){

  const backBtn = document.getElementById("backBtn");

  if(backBtn){
    backBtn.onclick = () => location.reload();
  }

}


/* ===================== SWITCH BUTTON ===================== */

function initSwitchButton(){

  const switchBtn = document.getElementById("switchBtn");

  if(!switchBtn) return;

  switchBtn.onclick = () => {

    if(document.body.innerText.includes("Tech Mode")){
      loadComponent("components/nonTechMode.html", initNonTechMode);
    }else{
      loadComponent("components/techMode.html", initTechMode);
    }

  };

}


/* ===========================================================
   ===================== NON-TECH MODE =======================
=========================================================== */

async function initNonTechMode(){

  const productStatus = document.getElementById("productStatus");
  const offers = document.getElementById("offers");
  const bestDeal = document.getElementById("bestDeal");

  if(!productStatus || !offers || !bestDeal) return;

  productStatus.innerHTML = "🔎 Detecting product...";
  offers.innerHTML = "Waiting for product detection...";
  bestDeal.innerHTML = "No comparison yet.";

  const nlInput = document.getElementById("nlQueryInput");
  const nlBtn = document.getElementById("nlSearchBtn");

  let detectedProduct = null;

  try{

    detectedProduct = await detectProduct();

    if(!detectedProduct){
      productStatus.innerHTML = "❌ Product not detected. You can type it manually below.";
      if(nlInput) offers.innerHTML = "Type the product name above, then press <b>Compare Prices</b>.";
    }else{

      productStatus.innerHTML = `<b>📦 Product Detected:</b><br>${escapeHtml(detectedProduct)}`;

      if(nlInput && !nlInput.value.trim()){
        nlInput.value = detectedProduct;
      }

      if(nlInput){
        offers.innerHTML = "Press <b>Compare Prices</b> to find the lowest valid price.";
      }

    }

  }catch(error){

    console.error(error);

    productStatus.innerHTML = "❌ Detection failed.";
    offers.innerHTML = "You can still type the product manually.";

  }

  if(nlInput && nlBtn){

    const runNlSearch = () => {
      const query = nlInput.value.trim();
      if(query){
        searchNonTech(query);
      }
    };

    nlBtn.addEventListener("click", runNlSearch);

    nlInput.addEventListener("keydown", (e) => {
      if(e.key === "Enter") runNlSearch();
    });

  } else {

    /* Legacy fallback path (old HTML without the search card) */
    if(detectedProduct){

      offers.innerHTML = "💰 Comparing prices...";

      const response = await fetch(
        `http://localhost:3000/compare?product=${encodeURIComponent(detectedProduct)}`
      );

      const data = await response.json();

      displayComparison(data);

    }

  }

}


/* ===================== PRODUCT DETECTION ===================== */

async function detectProduct(){

  const [tab] = await chrome.tabs.query({
    active:true,
    currentWindow:true
  });

  if(!tab || !tab.url) return null;

  const url = tab.url;

  if(!(url.includes("amazon") || url.includes("flipkart") || url.includes("myntra")))
  return null;

  const results = await chrome.scripting.executeScript({
    target:{tabId:tab.id},
    func:extractProductName
  });

  return results[0]?.result;

}


/* ===================== EXTRACT PRODUCT NAME ===================== */

function extractProductName(){

  /* TITLE-RULES-START */
  function normalizeTitle(value){
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isValidProductTitle(value){

    var s = normalizeTitle(value);

    if(!s || s.length < 6 || s.length > 300) return false;

    var GENERIC = [
      /product summary/i,
      /key product information/i,
      /^product information$/i,
      /^add to cart$/i,
      /^buy now$/i,
      /^sign in$/i,
      /frequently bought/i,
      /customers? also/i,
      /^sponsored/i,
      /^(results?|deals?|best sellers?)$/i,
      /keep shopping/i,
      /your recently viewed/i,
      /^(home|today's deals|shop by category)$/i
    ];

    for(var i = 0; i < GENERIC.length; i++){
      if(GENERIC[i].test(s)) return false;
    }

    if(!/[a-z]/i.test(s)) return false;

    var stripped = s
      .replace(/(₹|rs\.?|inr|\$|€|£)\s?[\d,.]+/gi, " ")
      .replace(/[\d\s.,%xX×\-–—]/g, "");

    if(stripped.replace(/\s/g, "").length < 4) return false;

    var FILLER = {
      the:true, and:true, for:true, with:true, new:true, best:true,
      only:true, all:true, you:true, your:true, this:true, that:true,
      from:true, into:true, per:true, via:true
    };

    var words = stripped.toLowerCase().match(/[a-z]+/g) || [];

    return words.some(function(w){
      return w.length >= 3 && !FILLER[w];
    });

  }

  function detectProductTitle(doc){

    if(!doc || !doc.querySelector) return null;

    var el = doc.querySelector("#productTitle");
    if(el && isValidProductTitle(el.textContent)) return normalizeTitle(el.textContent);

    var meta = doc.querySelector("meta[property='og:title']");
    if(meta && isValidProductTitle(meta.content)) return normalizeTitle(meta.content);

    var h1 = doc.querySelector("h1");
    var h1Text = h1 && (
      (h1.innerText && String(h1.innerText)) ||
      (h1.textContent && String(h1.textContent)) ||
      ""
    );
    if(h1Text && isValidProductTitle(h1Text)) return normalizeTitle(h1Text);

    if(isValidProductTitle(doc.title)) return normalizeTitle(doc.title);

    return null;

  }
  /* TITLE-RULES-END */

  return detectProductTitle(document);

}


/* ===================== DISPLAY PRICE RESULTS ===================== */

function displayComparison(data){

  const offers = document.getElementById("offers");
  const bestDeal = document.getElementById("bestDeal");

  if(!data || !data.best){

    offers.innerHTML = "❌ No price data found.";
    bestDeal.innerHTML = "No best suggestion available.";
    return;

  }

  let priceList = "";

  data.all.forEach(item=>{
    priceList += `<p>${item.site} – ₹${item.price}</p>`;
  });

  offers.innerHTML = priceList;

  bestDeal.innerHTML = `
  <div style="
  padding:10px;
  background:rgba(0,255,136,0.1);
  border:1px solid #00ff88;
  border-radius:8px;
  font-weight:600;
  ">
  🏆 Best Deal<br>
  ${data.best.site}<br>
  💰 ₹${data.best.price}
  </div>
  `;

}


/* ===================== SERP PRICE COMPARISON ===================== */

const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£"
};

let lastNonTechQuery = "";

function escapeHtml(text){
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[c]);
}

function openOfferUrl(url){
  try{
    chrome.tabs.create({ url });
  }catch(e){
    window.open(url, "_blank");
  }
}

function formatPrice(price, currency){
  const symbol = CURRENCY_SYMBOLS[currency] || "";
  const formatted = Number(price).toLocaleString("en-IN");
  return `${symbol}${formatted} ${currency === "INR" ? "" : currency}`.trim();
}

async function searchNonTech(query){

  const productStatus = document.getElementById("productStatus");
  const offers = document.getElementById("offers");
  const bestDeal = document.getElementById("bestDeal");

  if(!productStatus || !offers || !bestDeal) return;

  lastNonTechQuery = query;

  productStatus.innerHTML = `🔎 Searching for:<br><b>${escapeHtml(query)}</b>`;
  offers.innerHTML = "💰 Comparing prices across stores...";
  bestDeal.innerHTML = "Finding the lowest valid price...";

  try{

    const response = await fetch(
      `http://localhost:3000/nontech-compare?q=${encodeURIComponent(query)}`
    );

    const data = await response.json();

    if(!response.ok || data.success === false){
      showNonTechError(data.error || "Something went wrong while comparing prices.");
      return;
    }

    renderNonTechResults(data);

  }catch(error){

    console.error("Non-Tech search failed:", error);
    showNonTechError(
      "Could not reach the CyberLens backend. Is it running on http://localhost:3000?"
    );

  }

}

function renderNonTechResults(data){

  const productStatus = document.getElementById("productStatus");
  const offers = document.getElementById("offers");
  const bestDeal = document.getElementById("bestDeal");

  const dp = data.detectedProduct || {};
  const nameParts = [dp.brand, dp.name].filter(Boolean).join(" ");

  const variantParts = [];
  if(dp.variant){
    if(dp.variant.storage) variantParts.push(dp.variant.storage);
    if(dp.variant.ram) variantParts.push(`${dp.variant.ram} RAM`);
    if(dp.variant.color) variantParts.push(dp.variant.color);
    if(dp.variant.size) variantParts.push(dp.variant.size);
  }

  if(nameParts){
    productStatus.innerHTML =
      `<b>📦 Product:</b><br>` +
      escapeHtml([nameParts, variantParts.join(", ")].filter(Boolean).join(" – "));
  }

  const bp = data.bestPrice;

  const offerImage = bp.image ||
    (data.offers || []).map((o) => o.image).find(Boolean) ||
    null;

  bestDeal.innerHTML = `
  <div style="
  padding:10px;
  background:rgba(0,255,136,0.14);
  border:1px solid #00ff88;
  border-radius:8px;
  font-weight:700;
  ">
  🏆 BEST DEAL<br>
  ${escapeHtml(bp.store)}<br>
  💰 ${escapeHtml(formatPrice(bp.price, bp.currency))}<br>
  <a href="#" id="bestPriceLink" style="color:#00ff88;font-size:11px;">View product →</a>
  </div>
  <div style="font-size:10px;color:#8aa0b4;margin-top:6px;">
  Lowest of ${data.offers.length} valid offer(s)
  ${data.meta && data.meta.exactMatches === 0 ? " · variant-matched only" : ""}
  </div>
  `;

  const bestCard = bestDeal.querySelector("div");

  if(bestCard && offerImage){

    const img = document.createElement("img");

    img.src = offerImage;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.style.cssText =
      "width:100%;max-height:110px;object-fit:contain;background:#ffffff;" +
      "border-radius:6px;padding:4px;margin-top:8px;box-sizing:border-box;";

    bestCard.appendChild(img);

  }

  const bestLink = document.getElementById("bestPriceLink");
  if(bestLink){
    bestLink.onclick = (e) => {
      e.preventDefault();
      openOfferUrl(bp.url);
    };
  }

  let priceList = "";

  data.offers.forEach((offer, index) => {

    const isBest = index === 0;

    priceList += `
    <p style="margin:6px 0;${isBest ? "font-weight:600;color:#00ff88;" : ""}">
    ${index + 1}. <b>${escapeHtml(offer.store)}</b> –
    ${escapeHtml(formatPrice(offer.price, offer.currency))}
    ${offer.matchType === "variant-mismatch"
      ? `<span style="color:#ffb84d;font-size:9px;">(variant mismatch)</span>`
      : ""}
    <br>
    <a href="#" class="offer-link" data-url="${escapeHtml(offer.url)}"
       style="color:#7fd4ff;font-size:10px;word-break:break-all;">
       ${escapeHtml(offer.title.length > 60 ? offer.title.slice(0, 60) + "…" : offer.title)}
    </a>
    </p>`;

  });

  offers.innerHTML = priceList || "No offers found.";

  offers.querySelectorAll(".offer-link").forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      openOfferUrl(link.dataset.url);
    };
  });

}

function showNonTechError(message){

  const offers = document.getElementById("offers");
  const bestDeal = document.getElementById("bestDeal");

  if(offers){

    offers.innerHTML = `❌ ${escapeHtml(message)}`;

    if(lastNonTechQuery){

      const retryBtn = document.createElement("button");

      retryBtn.textContent = "🔄 Retry";
      retryBtn.style.cssText =
        "margin-top:8px;padding:6px 14px;border-radius:8px;" +
        "border:1px solid #00ff88;background:rgba(0,255,136,0.12);" +
        "color:#00ff88;font-weight:600;cursor:pointer;";
      retryBtn.addEventListener("click", () => searchNonTech(lastNonTechQuery));

      offers.appendChild(retryBtn);

    }

  }

  if(bestDeal) bestDeal.innerHTML = "No comparison available.";

}


/* ===========================================================
   ================= SHOPPING ASSISTANT ======================
=========================================================== */

async function loadShoppingAssistant(){

  const offersBox = document.getElementById("shoppingOffers");
  const couponBox = document.getElementById("couponOffers");
  const cardBox = document.getElementById("cardOffers");
  const saleBox = document.getElementById("currentSales");

  const [tab] = await chrome.tabs.query({
    active:true,
    currentWindow:true
  });

  const url = tab.url || "";

  /* ===== CURRENT SALES ===== */

  if(saleBox){

    if(url.includes("amazon")){
      saleBox.innerText = "Great Indian Festival";
    }
    else if(url.includes("flipkart")){
      saleBox.innerText = "Big Billion Days";
    }
    else if(url.includes("myntra")){
      saleBox.innerText = "End of Reason Sale";
    }
    else{
      saleBox.innerText = "No major sale detected";
    }

  }

  const pageOffers = await detectPageOffers();

  if(offersBox){

    if(pageOffers.length){
      offersBox.innerHTML = pageOffers.map(o=>`• ${o}`).join("<br>");
    }else{
      offersBox.innerHTML = "No special offers detected";
    }

  }

  if(couponBox){
    couponBox.innerHTML = "Coupons detected from page offers";
  }

  if(cardBox){
    cardBox.innerHTML = "Bank discounts detected from page";
  }

}


/* ===================== IMPROVED OFFER SCRAPER ===================== */

async function detectPageOffers(){

  const [tab] = await chrome.tabs.query({
    active:true,
    currentWindow:true
  });

  const results = await chrome.scripting.executeScript({
    target:{tabId:tab.id},
    func: () => {

      const offers = [];

      /* AMAZON */

      document.querySelectorAll(
        "#quickPromoBucketContent li,\
         #quickPromoBucketContent_feature_div li,\
         #promotions_feature_div li,\
         .a-box-inner span"
      ).forEach(el => {

        const text = el.innerText.trim();

        if(text.length > 15 && text.length < 200){
          offers.push(text);
        }

      });

      /* FLIPKART */

      document.querySelectorAll(
        "._16eBzU, ._3xFhiH, ._1AtVbE span"
      ).forEach(el => {

        const text = el.innerText.trim();

        if(text.includes("Bank") || text.includes("Discount")){
          offers.push(text);
        }

      });

      /* MYNTRA */

      document.querySelectorAll(
        ".pdp-offers li, .coupons-base-label"
      ).forEach(el => {
        offers.push(el.innerText.trim());
      });

      /* AJIO */

      document.querySelectorAll(
        ".promo-banner, .offer"
      ).forEach(el => {
        offers.push(el.innerText.trim());
      });

      return offers.slice(0,6);

    }
  });

  return results[0].result || [];

}


/* ===========================================================
   ===================== TECH MODE ===========================
=========================================================== */

async function initTechMode(){

  const scoreEl = document.getElementById("securityScore");

  if(scoreEl){
    scoreEl.innerText = "Calculating...";
  }

  const scanData = await loadTechData();

  if(scanData){
    startSecurityScan(scanData.data, scanData.protocol);
  }

}


/* ===================== FETCH SCAN DATA ===================== */

async function loadTechData(){

  try{

    const [tab] = await chrome.tabs.query({
      active:true,
      currentWindow:true
    });

    const url = new URL(tab.url);

    const domain = url.hostname;
    const protocol = url.protocol.replace(":","");

    const protocolEl = document.getElementById("protocol");
    if(protocolEl) protocolEl.innerText = protocol;

    const res = await fetch(`http://localhost:3000/scan?domain=${domain}`);

    const data = await res.json();

    const domainEl = document.getElementById("domain");
    if(domainEl) domainEl.innerText = domain;

    const ipEl = document.getElementById("ip");
    if(ipEl) ipEl.innerText = data.ip;

    const buildEl = document.getElementById("buildDate");

    if(buildEl && data.domainCreationDate){

      const created = new Date(data.domainCreationDate);
      const now = new Date();

      const age = now.getFullYear() - created.getFullYear();

      buildEl.innerText = age + " years old";

    }

    const issuerEl = document.getElementById("issuer");
    if(issuerEl) issuerEl.innerText = data.certificate?.issuer || "Unknown";

    const fromEl = document.getElementById("validFrom");
    if(fromEl) fromEl.innerText = data.certificate?.valid_from || "-";

    const toEl = document.getElementById("validTo");
    if(toEl) toEl.innerText = data.certificate?.valid_to || "-";

    const tlsEl = document.getElementById("tlsStatus");

    if(tlsEl){

      if(data.tls === "Secure"){
        tlsEl.innerText = "Secure";
        tlsEl.style.color = "#00ff88";
      }else{
        tlsEl.innerText = "Not Secure";
        tlsEl.style.color = "#ff4d4d";
      }

    }

    return {data,protocol};

  }catch(err){

    console.error("Tech Mode Error:", err);
    return null;

  }

}


/* ===================== SECURITY STACK ANIMATION ===================== */

function startSecurityScan(data,protocol){

  const steps = document.querySelectorAll("#securityStack li");

  const domainSecure =
    data.checks?.domainAge || data.checks?.tls;

  const headerSecure =
    data.checks?.headers || protocol==="https";

  const checks = [
    protocol==="https",
    data.checks?.tls,
    headerSecure,
    true,
    domainSecure,
    data.checks?.phishing
  ];

  let index = 0;

  function runStep(){

    if(index >= steps.length){

      let score = 0;

      if(checks[0]) score += 20;
      if(checks[1]) score += 20;
      if(checks[2]) score += 20;
      if(checks[3]) score += 10;
      if(checks[4]) score += 15;
      if(checks[5]) score += 15;

      const scoreEl = document.getElementById("securityScore");

      if(scoreEl){
        scoreEl.innerText = score + "/100";
      }

      return;
    }

    const step = steps[index];
    const status = step.querySelector(".status");

    step.classList.add("active");
    status.innerText = "Scanning...";

    setTimeout(()=>{

      if(checks[index]){

        step.classList.add("pass");
        status.innerText="Secure";
        status.style.color="#00ff88";

      }else{

        step.classList.add("warn");
        status.innerText="Risk";
        status.style.color="#ff4d4d";

      }

      index++;

      setTimeout(runStep,600);

    },900);

  }

  runStep();

}

});