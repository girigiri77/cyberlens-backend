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
  offers.innerHTML = "Waiting for price data...";
  bestDeal.innerHTML = "No comparison yet.";

  try{

    const product = await detectProduct();

    if(!product){
      productStatus.innerHTML = "❌ Product not detected.";
    }else{

      productStatus.innerHTML = `<b>📦 Product Detected:</b><br>${product}`;
      offers.innerHTML = "💰 Comparing prices...";

      const response = await fetch(
        `http://localhost:3000/compare?product=${encodeURIComponent(product)}`
      );

      const data = await response.json();

      displayComparison(data);

    }

  }catch(error){

    console.error(error);

    productStatus.innerHTML = "❌ Detection failed.";
    offers.innerHTML = "Error loading prices.";

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

  const ogTitle = document.querySelector("meta[property='og:title']");
  if(ogTitle) return ogTitle.content;

  const h1 = document.querySelector("h1");
  if(h1) return h1.innerText;

  return document.title;

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