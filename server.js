require("dotenv").config();

const express = require("express");
const dns = require("dns").promises;
const https = require("https");
const tls = require("tls");
const cors = require("cors");
const whois = require("whois-json");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json());

const SERP_API_KEY = process.env.SERP_API_KEY || "";

/* =====================================================
   ===================== SCAN API ======================
===================================================== */

app.get("/scan", async (req, res) => {

  const domain = String(req.query.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  const isValidDomain = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);

  if (!isValidDomain) {
    return res.status(400).json({ error: "No domain provided" });
  }

  const result = {
    ip: "Unavailable",
    buildDate: "Not Publicly Available",
    domainCreationDate: "Unknown",
    tls: "Not Secure",
    certificate: null,
    securityScore: 0,
    checks: {
      https: false,
      tls: false,
      headers: false,
      domainAge: false,
      phishing: false
    }
  };

  try {

    try {
      const whoisData = await whois(domain);

      result.domainCreationDate =
        whoisData.creationDate ||
        whoisData.created ||
        whoisData["Creation Date"] ||
        "Unknown";

      if (result.domainCreationDate !== "Unknown") {
        result.checks.domainAge = true;
      }

    } catch {}

    try {
      const dnsData = await dns.lookup(domain);
      result.ip = dnsData.address;
    } catch {}

    await new Promise((resolve) => {

      const request = https.request(
        { host: domain, method: "HEAD", timeout: 4000 },
        (response) => {

          result.checks.https = true;

          result.buildDate =
            response.headers["last-modified"] ||
            response.headers["date"] ||
            result.buildDate;

          if (
            response.headers["content-security-policy"] ||
            response.headers["x-frame-options"] ||
            response.headers["strict-transport-security"]
          ) {
            result.checks.headers = true;
          }

          resolve();
        }
      );

      request.on("error", () => resolve());
      request.on("timeout", () => {
        request.destroy();
        resolve();
      });
      request.end();

    });

    await new Promise((resolve) => {

      const socket = tls.connect(
        443,
        domain,
        { servername: domain },
        () => {

          const cert = socket.getPeerCertificate();

          if (cert && cert.valid_to) {

            result.tls = "Secure";
            result.checks.tls = true;

            result.certificate = {
              issuer: cert.issuer?.O || "Unknown",
              valid_from: cert.valid_from,
              valid_to: cert.valid_to
            };

            if (result.buildDate === "Not Publicly Available") {
              result.buildDate = cert.valid_from;
            }

          }

          socket.end();
          resolve();

        }
      );

      socket.setTimeout(5000);
      socket.on("timeout", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => resolve());

    });

    if (!domain.includes("-") && domain.length < 30) {
      result.checks.phishing = true;
    }

    const domainSecure =
      result.checks.domainAge || result.checks.tls;

    result.securityScore =
      (
        (result.checks.https ? 1 : 0) +
        (result.checks.tls ? 1 : 0) +
        (result.checks.headers ? 1 : 0) +
        (domainSecure ? 1 : 0) +
        (result.checks.phishing ? 1 : 0)
      ) * 20;

    res.json(result);

  } catch {
    res.status(500).json({ error: "Scan failed" });
  }

});


/* =====================================================
   ============ PRICE COMPARISON API ===================
===================================================== */

app.get("/compare", async (req, res) => {

  const product = req.query.product;

  if (!product) {
    return res.status(400).json({ error: "No product provided" });
  }

  const normalizePrice = (text) => {
    if (!text) return null;
    const cleaned = text.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value);
  };

  const fetchSitePrice = async ({ site, url, selectors }) => {
    try {
      const { data } = await axios.get(url, {
        timeout: 7000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      const $ = cheerio.load(data);

      for (const selector of selectors) {
        const text = $(selector).first().text().trim();
        const price = normalizePrice(text);
        if (price !== null) {
          return { site, price, url };
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  try {

    const encodedProduct = encodeURIComponent(product);
    const productSlug = product.trim().toLowerCase().replace(/\s+/g, "-");

    const stores = [
      { site: "Amazon", url: `https://www.amazon.in/s?k=${encodedProduct}`, selectors: [".a-price-whole"] },
      { site: "Flipkart", url: `https://www.flipkart.com/search?q=${encodedProduct}`, selectors: ["._30jeq3"] }
    ];

    const siteResponses = await Promise.all(
      stores.map((store) => fetchSitePrice(store))
    );

    const results = siteResponses.filter(Boolean);

    if (results.length === 0) {
      return res.json({ error: "No prices found" });
    }

    const best = results.reduce((min, item) =>
      item.price < min.price ? item : min
    );

    res.json({
      product,
      best,
      all: results.sort((a, b) => a.price - b.price)
    });

  } catch {
    res.status(500).json({ error:"Price comparison failed" });
  }

});


/* =====================================================
   ===== NON-TECH MODE (SERP API PRICE COMPARISON) =====
===================================================== */

const SERP_BASE_URL = "https://serpapi.com/search.json";
const SERP_TIMEOUT_MS = 12000;
const MAX_SERP_ATTEMPTS = 3;
const MIN_EXACT_MATCHES = 5;
const MAX_OFFERS_RETURNED = 10;

const STORE_NAME_MAP = {
  "amazon": "Amazon",
  "amazon.in": "Amazon",
  "amazon.com": "Amazon",
  "flipkart": "Flipkart",
  "flipkart.com": "Flipkart",
  "croma": "Croma",
  "croma retail": "Croma",
  "croma.com": "Croma",
  "reliance digital": "Reliance Digital",
  "reliancedigital.in": "Reliance Digital",
  "reliancedigital": "Reliance Digital",
  "myntra": "Myntra",
  "apple": "Apple",
  "apple store": "Apple",
  "tata cliq": "Tata CLiQ",
  "tatacliq": "Tata CLiQ",
  "vijay sales": "Vijay Sales",
  "vijaysales": "Vijay Sales",
  "poorvika": "Poorvika"
};

function normalizeStoreName(source) {

  const raw = String(source || "").trim();
  if (!raw) return "";

  const key = raw.toLowerCase().replace(/\s*\.com\s*$/i, "").replace(/\s+/g, " ");

  return STORE_NAME_MAP[key] || raw;

}

const FILLER_START =
  /^\s*(please|can you|could you|i want to|i wanna|i would like to|i am looking for|i'm looking for|im looking for|looking for|find me|find|search for|search|show me|show|get me|get|buy me|buy|order|compare prices for|compare prices of|compare price of|compare|best price for|best price of|cheapest price for|cheapest price of|cheapest|lowest price for|lowest price of|lowest|price of|price for|the|a|an|me|my)\b\s*/i;

const FILLER_END =
  /\s*(please|for me|in india|online|best price|lowest price|price|prices|deal|deals|offer|offers)$/i;

const COLOR_WORDS = [
  "black", "white", "blue", "red", "green", "yellow", "pink", "purple",
  "violet", "orange", "brown", "grey", "gray", "silver", "gold", "beige",
  "titanium", "midnight", "starlight", "coral", "mint", "navy", "maroon",
  "teal", "copper", "bronze"
];

const DIFFERENTIATOR_WORDS = [
  "pro", "max", "plus", "ultra", "mini", "lite", "se", "fe", "neo", "gt",
  "edge", "turbo"
];

const USED_CONDITION_RE =
  /\b(used|refurbished|renewed|pre.?owned|preowned|second.?hand|open.?box|pre.?loved|superb grade|fair grade|good grade|pristine grade|tested.?&.?verified|certified pre.?owned)\b/i;

const PARTS_RE =
  /\b(mainboard|motherboard|logic ?board|spare parts?|parts only|for parts|body housing)\b/i;

const ACCESSORY_RE =
  /\b(case|cover|tempered|protector|skin|sticker|decal|sleeve|pouch|holster|clip|mount|holder|stand|charger|cable|adapter|strap|bracelet|lanyard|keychain|film)\b/i;

const RAM_SIZES = [2, 3, 4, 6, 8, 12, 16, 18, 24, 32];

const PRODUCT_FAMILY_MAP = {
  iphone: { brand: "Apple", display: "iPhone" },
  ipad: { brand: "Apple", display: "iPad" },
  macbook: { brand: "Apple", display: "MacBook" },
  airpods: { brand: "Apple", display: "AirPods" },
  galaxy: { brand: "Samsung", display: "Galaxy" },
  pixel: { brand: "Google", display: "Pixel" },
  redmi: { brand: "Xiaomi", display: "Redmi" },
  poco: { brand: "Xiaomi", display: "Poco" },
  playstation: { brand: "Sony", display: "PlayStation" },
  ps5: { brand: "Sony", display: "PS5" },
  xbox: { brand: "Microsoft", display: "Xbox" }
};

function parsePriceValue(text) {
  if (typeof text === "number" && Number.isFinite(text)) return text;
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function detectCurrency(text) {
  const t = String(text || "").toLowerCase();
  if (/₹|\brs\.?\b|\binr\b/.test(t)) return "INR";
  if (/\$|\busd\b/.test(t)) return "USD";
  if (/€|\beur\b/.test(t)) return "EUR";
  if (/£|\bgbp\b/.test(t)) return "GBP";
  return "INR";
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bi\s+(phone|pad)\b/gi, "i$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =====================================================
   ===== PRODUCT IDENTITY NORMALIZATION ================
===================================================== */

const MARKETING_NOUN_RE =
  /\b(battery\s+life|camera\s+system|center\s+stage\s+front\s+camera|front\s+camera|center\s+stage|rear\s+camera|cameras?|display|promotions?|breakthrough|fusion|resolution|brightness|nits|amoled|oled|lcd|retina|snapdragon|dimensity|exynos|mediatek|helio|kirin|tensor|processors?|chips?|octa.?core|gpu|cpu|wireless|noise|cancelling|canceling|bluetooth|headphones?|headsets?|earbuds|tws|smartphones?|mobiles?|phones?|handsets?|cellphones?|gadget|features?|support|supports|built.?in|charged?|charging|batterys?|life|system|stage|cosmic|awesome|starry|phantom|mystic|aura|ai)\b/gi;

const UNIT_DIMENSION_RES = [
  /\b\d+(?:\.\d+)?\s*(?:cm|mm)\b(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:cm|mm)\b)*/gi,
  /\b\d+(?:\.\d+)?\s*inch(?:es)?\b/gi,
  /\b\d+(?:\.\d+)?(?:["”″])\b/gi,
  /\b(?:up\s+to\s*)?\d{2,5}\s*hz\b/gi,
  /\b\d+(?:\.\d+)?\s*mah\b(?:\s+battery)?/gi,
  /\b(?:super\s+)?a\d{1,2}\s*pro?(?:\s*(?:bionic\s*)?chip\b)?/gi,
  /\bpro\s+chip\b/gi,
  /\b(?:5g|4g|lte|volte|nr)\b/gi
];

const CONNECTOR_RE = /\b(with|featuring|includes|including|incl)\b/g;
const FAMILY_NUMBER_PREFIXES =
  /^(iphone|ipad|galaxy|pixel|redmi|note|poco|mi|oneplus|nord|vivo|oppo|realme|infinix|motorola|moto|playstation|xbox|series|air|wh|wf|mdr|boat|jbl|echo|nest)$/i;

function stripMarketingSpec(text) {

  let t = String(text || "");

  t = t.replace(/\b([a-z]{1,4})-(\d)/gi, "$1$2");

  t = t.replace(/\(([^)]*)\)/g, (m, inner) =>
    /\b(gb|tb|ram)\b/i.test(String(inner)) ? ` ${inner} ` : " "
  );

  for (let pass = 0; pass < 3; pass++) {

    for (const re of UNIT_DIMENSION_RES) {
      t = t.replace(re, " ");
    }

    t = t.replace(MARKETING_NOUN_RE, " ");
    t = t.replace(CONNECTOR_RE, " ");

  }

  const tokens = t.replace(/[^A-Za-z0-9.+]+/g, " ").trim().split(/\s+/);
  const kept = [];

  for (let i = 0; i < tokens.length; i++) {

    const tok = tokens[i];
    const prev = kept.length > 0 ? kept[kept.length - 1] : "";

    if (/^\d+([.,]\d+)?[%+]?$/.test(tok)) {
      if (FAMILY_NUMBER_PREFIXES.test(prev)) {
        kept.push(tok);
      }
      continue;
    }

    if (
      kept.length > 0 &&
      kept[kept.length - 1].toLowerCase() === tok.toLowerCase() &&
      tok.length >= 2
    ) {
      continue;
    }

    kept.push(tok);

  }

  return kept.join(" ").replace(/\s+/g, " ").trim();

}

function buildSearchIdentity(detected) {

  const brandPart = detected.brand ? detected.brand.charAt(0).toUpperCase() + detected.brand.slice(1) : "";
  const colorAttached =
    detected.variant.color &&
    !detected.variant.storage &&
    !detected.variant.ram &&
    !detected.variant.size;

  return [
    brandPart,
    detected.name,
    detected.variant.storage || "",
    detected.variant.ram ? `${detected.variant.ram} RAM` : "",
    detected.variant.size || "",
    colorAttached ? detected.variant.color : ""
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

}


function tokenPresent(normalizedTitle, token) {
  const spaced = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
  if (spaced.test(normalizedTitle)) return true;

  if (/[a-z]/i.test(token) && /\d/i.test(token) && token.replace(/\s/g, "").length >= 6) {
    return normalizedTitle.replace(/\s/g, "").includes(token.replace(/\s/g, ""));
  }
  return false;
}

function parseProductQuery(rawQuery) {

  if (!rawQuery || typeof rawQuery !== "string") return null;

  let q = rawQuery.replace(/\s+/g, " ").trim();
  if (!q) return null;

  let budget = null;
  q = q.replace(
    /\b(?:under|below|less than|within)\s+(?:rs\.?|₹|inr)?\s?(\d[\d,]*)\b/ig,
    (match, amount) => {
      budget = amount;
      return " ";
    }
  );

  let changed = true;
  while (changed) {
    changed = false;
    const startTrimmed = q.replace(FILLER_START, " ");
    if (startTrimmed !== q) { q = startTrimmed; changed = true; }
    const endTrimmed = q.replace(FILLER_END, " ");
    if (endTrimmed !== q) { q = endTrimmed; changed = true; }
  }

  q = q.replace(/\s+/g, " ").trim();
  if (!q || !/[a-z0-9]/i.test(q)) return null;

  const variant = {};

  q = q.replace(/\b(\d{1,3})\s?gb\s+(?:ram|memory)\b/ig, (match, n) => {
    variant.ram = `${n}GB`;
    return " ";
  });

  q = q.replace(/\b(?:size\s*)?(uk|us|eu)\s?(\d{1,2}(?:\.\d)?)\b/i, (match, region, size) => {
    variant.size = `${region.toUpperCase()} ${size}`;
    return " ";
  });

  if (!variant.size) {
    q = q.replace(/\bsize\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)\b/i, (match, size) => {
      variant.size = size;
      return " ";
    });
  }

  const storageCandidates = [];
  q = q.replace(/\b(\d{1,4})\s?(tb|gb)\b/ig, (match, value, unit) => {
    storageCandidates.push({ value: parseInt(value, 10), unit: unit.toUpperCase() });
    return " ";
  });

  if (storageCandidates.length > 0) {

    const toGb = (entry) => entry.unit === "TB" ? entry.value * 1024 : entry.value;
    storageCandidates.sort((a, b) => toGb(b) - toGb(a));

    const largest = storageCandidates[0];
    variant.storage = `${largest.value}${largest.unit}`;

    const second = storageCandidates[1];
    if (second && !variant.ram && RAM_SIZES.includes(second.value) && second.unit === "GB") {
      variant.ram = `${second.value}GB`;
    }

  }

  for (const color of COLOR_WORDS) {
    const colorRe = new RegExp(`\\b${color}\\b`, "i");
    if (colorRe.test(q)) {
      variant.color = color.charAt(0).toUpperCase() + color.slice(1);
      q = q.replace(colorRe, " ");
      break;
    }
  }

  q = q.replace(/\s+/g, " ").trim();

  if (!q || !/[a-z0-9]/i.test(q)) return null;

  q = stripMarketingSpec(q);

  if (!q || !/[a-z]/i.test(q)) return null;

  const tokens = q.split(" ");

  let brand = null;
  let name = q;
  let familyToken = null;

  if (tokens.length >= 2 && /^[a-z]+$/i.test(tokens[0])) {
    brand = tokens[0];
    name = tokens.slice(1).join(" ");
  }

  const brandLower = (brand || "").toLowerCase();
  const nameTokens = name.split(" ");
  const nameFirstLower = (nameTokens[0] || "").toLowerCase();

  if (PRODUCT_FAMILY_MAP[brandLower]) {
    familyToken = brandLower;
    const fam = PRODUCT_FAMILY_MAP[familyToken];
    brand = fam.brand;
    name = `${fam.display} ${name}`.trim();
  } else if (brand && PRODUCT_FAMILY_MAP[nameFirstLower]) {
    familyToken = nameFirstLower;
    const fam = PRODUCT_FAMILY_MAP[familyToken];
    brand = fam.brand;
    name = `${fam.display} ${nameTokens.slice(1).join(" ")}`.trim();
  }

  return {
    query: rawQuery.trim(),
    cleaned: q,
    brand,
    name,
    familyToken,
    variant,
    budget
  };

}

function getSignificantTokens(detected) {

  const source = `${detected.brand || ""} ${detected.name}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);

  const excluded = new Set(
    ["india"]
      .concat((detected.variant.storage || "").toLowerCase())
      .concat((detected.variant.ram || "").toLowerCase())
      .filter(Boolean)
  );

  let tokens = [...new Set(source)].filter((token) => !excluded.has(token));

  if (detected.familyToken) {

    const familyBrand = PRODUCT_FAMILY_MAP[detected.familyToken].brand.toLowerCase();
    const displayLower = PRODUCT_FAMILY_MAP[detected.familyToken].display.toLowerCase();

    tokens = tokens.filter((token) =>
      token !== detected.familyToken &&
      token !== displayLower &&
      token !== familyBrand
    );
    tokens.unshift(detected.familyToken);

  }

  return tokens;

}

function classifyOfferDetailed(offer, detected) {

  const normalizedTitle = normalizeForMatch(offer.title);
  const titleTokens = new Set(normalizedTitle.split(" "));
  const titleCollapsed = normalizedTitle.replace(/\s/g, "");
  const queryText = normalizeForMatch(`${detected.brand || ""} ${detected.name} ` +
    Object.values(detected.variant).join(" "));

  const sigTokens = getSignificantTokens(detected);

  const missing = sigTokens.filter((token) => !tokenPresent(normalizedTitle, token));

  if (missing.length > 0) {

    const nameCollapsed =
      `${detected.brand || ""}${detected.name}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    if (
      /[a-z]/.test(nameCollapsed) &&
      /\d/.test(nameCollapsed) &&
      titleCollapsed.includes(nameCollapsed)
    ) {
      missing.length = 0;
    } else {

      const coreMissing = missing.filter(
        (token) => !DIFFERENTIATOR_WORDS.includes(token)
      );

      if (coreMissing.length > 0) {
        return {
          verdict: "reject",
          reason: `missing product tokens: ${coreMissing.join(", ")}`
        };
      }

      return {
        verdict: "variant-mismatch",
        reason: `different model line: no "${missing.join(" ")}" in listing`
      };

    }
  }

  for (const diff of DIFFERENTIATOR_WORDS) {
    if (titleTokens.has(diff) && !queryText.includes(diff)) {
      return {
        verdict: "variant-mismatch",
        reason: `different variant: ${diff}`
      };
    }
  }

  const rawTitle = String(offer.title || "");
  const queryRaw = `${detected.brand || ""} ${detected.name}`.toLowerCase();

  for (const qTok of sigTokens) {

    if (qTok.length < 2 || !/[a-z]/i.test(qTok)) continue;
    const base = escapeRegExp(qTok);

    for (const diff of DIFFERENTIATOR_WORDS) {

      const gluedRe = new RegExp(`^${base}${escapeRegExp(diff)}[a-z]*$`, "i");
      const queryHasDiff = new RegExp(`\\b${base}\\s*${diff}\\b`, "i").test(queryRaw);

      if (!queryHasDiff) {
        for (const t of titleTokens) {
          if (gluedRe.test(t)) {
            return {
              verdict: "variant-mismatch",
              reason: `different variant: ${qTok}${diff.toUpperCase()}`
            };
          }
        }
      }

    }

    if (!new RegExp(`${base}\\s*\\+`, "i").test(queryRaw)) {
      if (new RegExp(`\\b${base}\\s*\\+`, "i").test(rawTitle)) {
        return {
          verdict: "variant-mismatch",
          reason: `different variant: ${qTok}+`
        };
      }
    }

  }

  if (detected.variant.storage) {

    const wanted = detected.variant.storage.toLowerCase();
    let foundAny = false;

    const matches = normalizedTitle.matchAll(/(\d{1,4})\s?(gb|tb)(?!\s*(?:ram|memory))/gi);
    for (const m of matches) {
      foundAny = true;
      const found = `${m[1]}${m[2].toUpperCase()}`.toLowerCase();
      if (found !== wanted &&
          !(wanted.endsWith("TB") && found === `${parseInt(wanted) * 1024}gb`)) {
        return {
          verdict: "reject",
          reason: `storage conflict: wanted ${wanted}, found ${found}`
        };
      }
    }

    if (!foundAny) {
      return {
        verdict: "variant-mismatch",
        reason: "storage not verifiable in listing"
      };
    }

  }

  if (detected.variant.ram) {
    const wantedRam = parseInt(detected.variant.ram);
    const ramMatches = normalizedTitle.matchAll(/(\d{1,3})\s?gb\s+(?:ram|memory)/gi);
    for (const m of ramMatches) {
      if (parseInt(m[1]) !== wantedRam) {
        return {
          verdict: "reject",
          reason: `ram conflict: wanted ${wantedRam}GB`
        };
      }
    }
  }

  if (detected.variant.color) {
    const wantedColor = detected.variant.color.toLowerCase();
    for (const color of COLOR_WORDS) {
      if (titleTokens.has(color) && color !== wantedColor) {
        return {
          verdict: "reject",
          reason: `color conflict: wanted ${wantedColor}, found ${color}`
        };
      }
    }
  }

  if (detected.variant.size) {
    const wantedSize = detected.variant.size.toLowerCase().replace(/\s+/g, "");
    const explicitSizes =
      normalizedTitle.match(/(?:uk|us|eu|ind)\s?\d{1,2}(?:\.\d)?/g) || [];
    if (
      explicitSizes.length > 0 &&
      !explicitSizes.some((s) => s.replace(/\s+/g, "") === wantedSize)
    ) {
      return {
        verdict: "reject",
        reason: `size conflict: wanted ${wantedSize}`
      };
    }
  }

  return { verdict: "exact", reason: "all checks passed" };

}

function classifyOffer(offer, detected) {
  return classifyOfferDetailed(offer, detected).verdict;
}

function extractSerpOffers(shoppingResults, { allowUsed = false } = {}) {

  const offers = [];

  if (!Array.isArray(shoppingResults)) return offers;

  for (const item of shoppingResults) {

    if (!item || typeof item !== "object") continue;
    if (!item.title) continue;

    const title = String(item.title);

    const url = item.link || item.product_link || item.serpapi_link || null;
    if (!url) continue;

    if (!allowUsed && USED_CONDITION_RE.test(title)) continue;
    if (!allowUsed && item.condition && /used|refurbished/i.test(item.condition)) continue;
    if (!allowUsed && item.second_hand_condition) continue;
    if (PARTS_RE.test(title)) continue;
    if (ACCESSORY_RE.test(title)) continue;

    const price =
      parsePriceValue(item.extracted_price) ??
      parsePriceValue(item.price);

    if (price === null) continue;

    offers.push({
      title,
      url,
      store: normalizeStoreName(
        item.source || item.seller ||
        (() => {
          try { return new URL(url).hostname.replace(/^www\./, ""); }
          catch { return "Unknown Store"; }
        })()
      ),
      price,
      currency: detectCurrency(item.price || item.extracted_price),
      image: item.thumbnail || null
    });

  }

  return offers;

}

function dedupeOffers(offers) {

  const seen = new Map();

  for (const offer of offers) {
    const key = [
      offer.store.toLowerCase(),
      normalizeForMatch(offer.title).replace(/\s/g, ""),
      offer.price
    ].join("|");

    if (!seen.has(key)) {
      seen.set(key, offer);
    }
  }

  return [...seen.values()];

}

async function serpShoppingSearch(query) {

  let response;

  try {

    response = await axios.get(SERP_BASE_URL, {
      params: {
        engine: "google_shopping",
        q: query,
        api_key: SERP_API_KEY,
        google_domain: "google.co.in",
        gl: "in",
        hl: "en"
      },
      timeout: SERP_TIMEOUT_MS
    });

  } catch (err) {

    const status = err.response?.status;

    if (status === 401 || status === 403) {
      throw Object.assign(new Error("SERP API rejected the API key"), { code: "INVALID_KEY" });
    }
    if (err.code === "ECONNABORTED") {
      throw Object.assign(new Error("SERP API request timed out"), { code: "TIMEOUT" });
    }
    if (!err.response) {
      throw Object.assign(new Error("Could not reach SERP API"), { code: "NETWORK" });
    }

    throw Object.assign(new Error("SERP API error"), { code: "UPSTREAM", status });

  }

  if (!response.data || typeof response.data !== "object") {
    throw Object.assign(new Error("Malformed SERP response"), { code: "MALFORMED" });
  }

  if (typeof response.data.error === "string" && response.data.error) {
    throw Object.assign(new Error("SERP API error"), { code: "UPSTREAM" });
  }

  return Array.isArray(response.data.shopping_results)
    ? response.data.shopping_results
    : [];

}

function buildSearchQueries(detected) {

  const identity = buildSearchIdentity(detected);

  const queries = [
    `${identity} price`,
    `${identity} buy online`,
    `${identity} cheapest price`
  ];

  return [...new Set(queries)];

}

async function runNonTechCompare(rawQuery, { serpSearch = serpShoppingSearch } = {}) {

  const detected = parseProductQuery(rawQuery);

  if (!detected) {
    return {
      success: false,
      error: "Could not detect a product in your query.",
      stage: "detect"
    };
  }

  const allowUsed = /\b(used|refurbished|second hand|preowned)\b/i.test(rawQuery);
  const queries = buildSearchQueries(detected);
  const usedQueries = [];

  let allOffers = [];
  let exactCount = 0;

  for (const query of queries) {

    if (exactCount >= MIN_EXACT_MATCHES) break;

    usedQueries.push(query);

    const rawResults = await serpSearch(query);
    const extracted = extractSerpOffers(rawResults, { allowUsed });

    for (const offer of extracted) {
      const detailed = classifyOfferDetailed(offer, detected);
      offer.matchType = detailed.verdict;
      offer.matchReason = detailed.reason;
    }

    const valid = extracted.filter((o) => o.matchType !== "reject");
    allOffers = dedupeOffers(allOffers.concat(valid));
    exactCount = allOffers.filter((o) => o.matchType === "exact").length;

    const rejected = extracted.filter((o) => o.matchType === "reject");
    console.log(
      `[NONTECH] q="${query}" raw=${rawResults.length} extracted=${extracted.length} ` +
      `exact=${exactCount} mismatch=${allOffers.length - exactCount} rejected=${rejected.length}`
    );
    rejected.slice(0, 3).forEach((o) =>
      console.log(`[NONTECH]   reject: ${o.title} -> ${o.matchReason}`)
    );

  }

  const exactOffers = allOffers.filter((o) => o.matchType === "exact");
  const nearOffers = allOffers.filter((o) => o.matchType === "variant-mismatch");
  let pool = exactOffers.length > 0 ? exactOffers : nearOffers;

  if (pool.length === 0) {
    return {
      success: false,
      error: "I couldn't find reliable matching product listings for this product.",
      stage: "results",
      query: rawQuery.trim(),
      detectedProduct: detected,
      searchedQueries: usedQueries
    };
  }

  const currencyCounts = {};
  for (const offer of pool) {
    currencyCounts[offer.currency] = (currencyCounts[offer.currency] || 0) + 1;
  }
  const primaryCurrency = Object.entries(currencyCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  const comparable = pool
    .filter((o) => o.currency === primaryCurrency)
    .sort((a, b) => a.price - b.price);

  const best = comparable[0];

  const detectedProduct = {
    brand: detected.brand,
    name: detected.name,
    variant: Object.keys(detected.variant).length > 0 ? detected.variant : undefined
  };

  const result = {
    success: true,
    query: rawQuery.trim(),
    searchIdentity: buildSearchIdentity(detected),
    detectedProduct,
    bestPrice: {
      price: best.price,
      currency: best.currency,
      store: best.store,
      title: best.title,
      url: best.url,
      image: best.image || null
    },
    offers: comparable.slice(0, MAX_OFFERS_RETURNED).map((offer) => ({
      store: offer.store,
      title: offer.title,
      price: offer.price,
      currency: offer.currency,
      url: offer.url,
      image: offer.image,
      matchType: offer.matchType
    })),
    meta: {
      searchedQueries: usedQueries,
      totalValidListings: allOffers.length,
      exactMatches: exactOffers.length,
      variantMismatches: nearOffers.length,
      otherCurrencyExcluded:
        pool.length - comparable.length
    }
  };

  if (exactOffers.length === 0) {
    result.note =
      "Only variant-mismatched listings were found; prices shown may be for related variants.";
  }

  result.product = detectedProduct.name;
  result.best = {
    site: best.store,
    price: best.price,
    title: best.title,
    url: best.url
  };
  result.all = comparable.slice(0, MAX_OFFERS_RETURNED).map((offer) => ({
    site: offer.store,
    price: offer.price,
    title: offer.title,
    url: offer.url
  }));

  return result;

}

app.get("/nontech-compare", async (req, res) => {

  const query = req.query.q || req.query.product;

  if (!query || !String(query).trim()) {
    return res.status(400).json({
      success: false,
      error: "Please provide a product search query, e.g. ?q=cheapest iPhone 15 128GB"
    });
  }

  const trimmedQuery = String(query).trim();

  if (!parseProductQuery(trimmedQuery)) {
    return res.status(400).json({
      success: false,
      error: "Could not detect a product in your query."
    });
  }

  if (!SERP_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "SERP API key not configured on the server"
    });
  }

  try {

    const result = await runNonTechCompare(trimmedQuery);

    if (!result.success && result.stage === "detect") {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (err) {

    console.log("NONTECH ERROR:", err.code || "", err.message);

    const statusByCode = {
      INVALID_KEY: 502,
      TIMEOUT: 504,
      NETWORK: 502,
      UPSTREAM: 502,
      MALFORMED: 502
    };

    res.status(statusByCode[err.code] || 500).json({
      success: false,
      error:
        err.code === "INVALID_KEY"
          ? "The search service rejected the configured API key."
          : err.code === "TIMEOUT"
            ? "The price search timed out. Please try again."
            : err.code === "NETWORK"
              ? "Could not reach the price search service."
              : "Non-tech comparison failed. Please try again later."
    });

  }

});


/* =====================================================
   ================= SERVER START ======================
===================================================== */

app.get("/", (req, res) => {
  res.send("CyberLens Backend Running");
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CyberLens backend running on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  normalizeStoreName,
  stripMarketingSpec,
  buildSearchIdentity,
  parseProductQuery,
  classifyOffer,
  classifyOfferDetailed,
  extractSerpOffers,
  dedupeOffers,
  runNonTechCompare
};