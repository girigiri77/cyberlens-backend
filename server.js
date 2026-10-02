require("dotenv").config();

const express = require("express");
const dns = require("dns").promises;
const https = require("https");
const tls = require("tls");
const cors = require("cors");
const whois = require("whois-json");
const axios = require("axios");
const cheerio = require("cheerio");

// Import new generic modules
const { buildSmartSearchQueries } = require("./query-generator");
const { classifyOfferGeneric, sortResultsByMatchType } = require("./matcher");

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
  let normalized = String(text || "")
    .toLowerCase()
    .replace(/\bi\s+(phone|pad)\b/gi, "i$1")
    .replace(/[-–—]/g, " ")  // Convert hyphens/dashes to spaces
    .replace(/['']/g, "")   // Remove apostrophes
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Normalize common plural to singular for fashion items
  normalized = normalized.replace(/\b(sneakers|shoes|boots|sandals|slippers|trainers|loafers|heels|flats|wedges)\b/g, (match) => {
    // Remove trailing 's' if it's a plural
    if (match.endsWith('s') && match.length > 3) {
      return match.slice(0, -1);
    }
    return match;
  });

  // Normalize "men's" / "mens" / "men" to "men"
  normalized = normalized.replace(/\b(men['s]?|mens)\b/g, "men");
  normalized = normalized.replace(/\b(women['s]?|womens)\b/g, "women");

  // Normalize "slip ons" / "slip-ons" / "slip on" to "slip on"
  normalized = normalized.replace(/\bslip[-\s]?ons?\b/g, "slip on");

  return normalized;
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

function extractSimpleProductName(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") return rawTitle;

  let simple = rawTitle.replace(/\s+/g, " ").trim();
  console.log(`[RAW_PRODUCT] "${rawTitle}"`);

  // Remove everything after colon, semicolon, pipe, or dash (marketing descriptions)
  simple = simple.split(/[:;|\-–—]/)[0].trim();

  // Remove generic marketing noise
  const marketingNoise = [
    /\bbest\s+seller\b/gi,
    /\blimited\s+time\s+deal\b/gi,
    /\bfree\s+delivery\b/gi,
    /\bnew\s+launch\b/gi,
    /\bexclusive\b/gi,
    /\boffer\b/gi,
    /\bdeal\b/gi,
    /\bdiscoun?t\b/gi,
    /\bcashback\b/gi,
    /\bemi\b/gi,
    /\bcoupon\b/gi,
    /\breview(s)?\b/gi,
    /\brating\b/gi,
    /\bstar\b/gi,
    /\bvoted\b/gi,
    /\btop\s+rated\b/gi,
    /\bmost\s+popular\b/gi,
    /\btrending\b/gi,
    /\bfeatured\b/gi,
    /\brecommended\b/gi,
    /\bchoice\b/gi,
    /\baward\s+winning\b/gi,
    /\bpatented\b/gi,
    /\bcertified\b/gi,
    /\bguaranteed\b/gi,
    /\bauthentic\b/gi,
    /\boriginal\b/gi,
    /\bgenuine\b/gi
  ];

  for (const noise of marketingNoise) {
    simple = simple.replace(noise, " ");
  }

  // Remove display specifications (generic)
  simple = simple.replace(/\b\d+(?:\.\d+)?\s*(?:cm|mm|inch(?:es)?|[""])\b/gi, " ");
  simple = simple.replace(/\b(?:display|screen|promotions?|promotion|amoled|oled|lcd|retina|nits|hz|hertz|refresh|rate)\b/gi, " ");

  // Remove processor/chip details (generic)
  simple = simple.replace(/\b(?:a\d{1,2}\s*(?:pro)?(?:\s*(?:bionic\s*)?chip)?|snapdragon|dimensity|exynos|mediatek|helio|kirin|tensor|octa.?core|processor|chip|cpu|gpu|intel\s+core|amd\s+ryzen|core\s+i\d|m\d|ryzen\s+\d)\b/gi, " ");

  // Remove battery claims (generic)
  simple = simple.replace(/\b(?:battery\s+life|best\s+battery|mah|charged?|charging|fast\s+charge|quick\s+charge|power\s+delivery)\b/gi, " ");

  // Remove camera specifications (generic)
  simple = simple.replace(/\b(?:camera\s+system|front\s+camera|rear\s+camera|cameras?|center\s+stage|fusion|megapixel|mp|optical\s+zoom|digital\s+zoom)\b/gi, " ");

  // Remove generic feature descriptions
  simple = simple.replace(/\b(?:features?|breakthrough|awesome|starry|phantom|mystic|aura|cosmic|ever|any|innovative|advanced|premium|quality|performance|technology|smart|intelligent|automatic|wireless|bluetooth|noise\s+cancelling|cancelling)\b/gi, " ");

  // Remove generic category words when they appear as standalone descriptors
  const genericCategories = [
    /\b(?:men|women|kids|boys|girls|unisex|adult|child)\s+(?!shoe|boot|sneaker|watch|phone|laptop|tablet|headphone|speaker|camera|tv|monitor|keyboard|mouse|printer|scanner|router|modem|drive|storage|memory|ram|ssd|hdd|case|cover|stand|holder|mount|adapter|cable|charger|battery|screen|display|speaker|headphone|earphone|earbud|microphone|webcam|lens|filter|tripod|bag|backpack|wallet|belt|hat|cap|glove|scarf|sock|shirt|pants|jeans|jacket|coat|dress|skirt|suit|uniform|costume|lingerie|underwear|sleepwear|swimwear|sportswear|footwear|shoe|boot|sandal|slipper|sneaker|trainer|loafer|heel|flat|wedge|platform|athletic|running|walking|hiking|basketball|soccer|football|tennis|golf|fitness|yoga|gym|workout|outdoor|indoor|casual|formal|business|party|wedding|evening|night|day|summer|winter|spring|fall|autumn|seasonal|holiday|festival|occasion|special|limited|exclusive|collection|series|line|range|set|kit|bundle|pack|lot|multi|combo|dual|triple|quad|penta|hexa|octa|deca|mega|giga|tera|peta|exa|zetta|yotta)\b/gi
  ];

  // Only remove generic categories if they're not part of a product model name
  // This is a conservative approach - we'll keep them for now and rely on search query fallbacks

  // Remove color names at the end (but not if they're part of the model name)
  const colorPattern = new RegExp(`\\b(${COLOR_WORDS.join("|")})\\s*$`, "i");
  simple = simple.replace(colorPattern, " ");

  // Remove gender words at the beginning or end (but keep if they're part of brand)
  simple = simple.replace(/^(men|women|kids|boys|girls|unisex)\s+/gi, " ");
  simple = simple.replace(/\s+(men|women|kids|boys|girls|unisex)$/gi, " ");

  // Remove common filler words
  const fillerWords = [
    /\bthe\b/gi,
    /\ba\b/gi,
    /\ban\b/gi,
    /\bfor\b/gi,
    /\bwith\b/gi,
    /\band\b/gi,
    /\bor\b/gi,
    /\bbut\b/gi,
    /\bby\b/gi,
    /\bfrom\b/gi,
    /\bat\b/gi,
    /\bon\b/gi,
    /\bin\b/gi,
    /\bof\b/gi,
    /\bto\b/gi,
    /\babout\b/gi,
    /\babove\b/gi,
    /\bacross\b/gi,
    /\bafter\b/gi,
    /\bagainst\b/gi,
    /\balong\b/gi,
    /\bamong\b/gi,
    /\baround\b/gi,
    /\bbefore\b/gi,
    /\bbehind\b/gi,
    /\bbelow\b/gi,
    /\bbetween\b/gi,
    /\bbeyond\b/gi,
    /\bduring\b/gi,
    /\bexcept\b/gi,
    /\binside\b/gi,
    /\binto\b/gi,
    /\bnear\b/gi,
    /\boff\b/gi,
    /\bonto\b/gi,
    /\bout\b/gi,
    /\bover\b/gi,
    /\bthrough\b/gi,
    /\btoward\b/gi,
    /\bunder\b/gi,
    /\bupon\b/gi,
    /\bwithin\b/gi,
    /\bwithout\b/gi
  ];

  for (const filler of fillerWords) {
    simple = simple.replace(filler, " ");
  }

  // Clean up spacing
  simple = simple.replace(/\s+/g, " ").trim();

  // Remove spaces between storage values (e.g., "256 GB" -> "256GB")
  simple = simple.replace(/\b(\d+)\s+(GB|TB)\b/gi, "$1$2");

  // Normalize plural to singular for common product types (conservative)
  simple = simple.replace(/\b(sneakers|shoes|boots|sandals|slippers|headphones|earphones|earbuds|speakers|cameras|lenses|filters|tripods|bags|backpacks|wallets|belts|hats|caps|gloves|scarves|socks|shirts|pants|jeans|jackets|coats|dresses|skirts|suits|uniforms|costumes|lingerie|underwear|sleepwear|swimwear|sportswear|footwear|trainers|loafers|heels|flats|wedges|platforms|athletics|runnings|walkings|hikings|basketballs|soccers|footballs|tennis|golfs|fitness|yogas|gyms|workouts|outdoors|indoors|casuals|formals|businesses|parties|weddings|evenings|nights|days|summers|winters|springs|falls|autumns|seasonals|holidays|festivals|occasions|specials|limiteds|exclusives|collections|series|lines|ranges|sets|kits|bundles|packs|lots|multis|combos|duals|triples|quads|pentas|hexas|octas|decas|megas|gigas|teras|petas|exas|zettas|yottas)\b/gi, (match) => {
    return match.slice(0, -1); // Remove 's'
  });

  // Final cleanup
  simple = simple.replace(/\s+/g, " ").trim();

  console.log(`[NORMALIZED_PRODUCT] "${simple}"`);
  return simple;
}

function parseProductQuery(rawQuery) {

  if (!rawQuery || typeof rawQuery !== "string") return null;

  console.log(`[PARSE_QUERY] Raw input: "${rawQuery}"`);

  // Extract simple product name first
  const simpleName = extractSimpleProductName(rawQuery);
  console.log(`[PARSE_QUERY] Simple product name: "${simpleName}"`);

  let q = simpleName.replace(/\s+/g, " ").trim();
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

function getCoreModelTokens(detected) {
  // Extract core model tokens (excluding generic descriptive words)
  const descriptiveTokens = new Set([
    'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'sandal', 'sandals',
    'slipper', 'slippers', 'trainer', 'trainers', 'loafer', 'loafers', 'heel', 'heels',
    'flat', 'flats', 'wedge', 'wedges', 'men', 'mens', 'men\'s', 'women', 'womens', 'women\'s',
    'kids', 'boys', 'girls', 'unisex', 'slip', 'ons', 'on', 'for', 'with', 'and', 'the', 'a', 'an',
    'step', 'steps', 'go', 'walk', 'running', 'walking', 'athletic', 'sport', 'fitness'
  ]);

  const allTokens = getSignificantTokens(detected);
  
  // Filter out descriptive tokens to get core model identity
  const coreTokens = allTokens.filter(token => 
    !descriptiveTokens.has(token.toLowerCase()) && 
    token.length >= 2
  );

  return coreTokens;
}

function calculateSimilarityScore(offer, detected) {
  const normalizedTitle = normalizeForMatch(offer.title);
  const titleTokens = new Set(normalizedTitle.split(" "));
  const titleCollapsed = normalizedTitle.replace(/\s/g, "");
  
  const queryText = normalizeForMatch(`${detected.brand || ""} ${detected.name} ` +
    Object.values(detected.variant).join(" "));
  
  const sigTokens = getSignificantTokens(detected);
  
  let score = 0;
  let maxScore = 0;
  const details = {
    brandMatch: false,
    modelMatch: false,
    variantMatch: false,
    tokenMatches: [],
    tokenMisses: []
  };
  
  // Brand match (highest weight)
  maxScore += 30;
  if (detected.brand) {
    const brandLower = detected.brand.toLowerCase();
    if (normalizedTitle.includes(brandLower)) {
      score += 30;
      details.brandMatch = true;
    }
  }
  
  // Model/token matches (high weight)
  maxScore += 40;
  const matchedTokens = [];
  const missingTokens = [];
  
  for (const token of sigTokens) {
    if (tokenPresent(normalizedTitle, token)) {
      matchedTokens.push(token);
      score += 40 / sigTokens.length;
    } else {
      missingTokens.push(token);
    }
  }
  
  details.tokenMatches = matchedTokens;
  details.tokenMisses = missingTokens;
  
  // Check for collapsed name match (brand+model without spaces)
  maxScore += 20;
  const nameCollapsed = `${detected.brand || ""}${detected.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  
  if (/[a-z]/.test(nameCollapsed) && /\d/.test(nameCollapsed) && 
      titleCollapsed.includes(nameCollapsed)) {
    score += 20;
    details.modelMatch = true;
  }
  
  // Variant/spec matches (medium weight)
  maxScore += 10;
  if (detected.variant.storage) {
    const wanted = detected.variant.storage.toLowerCase();
    const matches = normalizedTitle.matchAll(/(\d{1,4})\s?(gb|tb)(?!\s*(?:ram|memory))/gi);
    for (const m of matches) {
      const found = `${m[1]}${m[2].toUpperCase()}`.toLowerCase();
      if (found === wanted || 
          (wanted.endsWith("TB") && found === `${parseInt(wanted) * 1024}gb`)) {
        score += 5;
        details.variantMatch = true;
        break;
      }
    }
  }
  
  if (detected.variant.ram) {
    const wantedRam = parseInt(detected.variant.ram);
    const ramMatches = normalizedTitle.matchAll(/(\d{1,3})\s?gb\s+(?:ram|memory)/gi);
    for (const m of ramMatches) {
      if (parseInt(m[1]) === wantedRam) {
        score += 5;
        details.variantMatch = true;
        break;
      }
    }
  }
  
  // Penalize for differentiator words not in query
  maxScore += 10;
  for (const diff of DIFFERENTIATOR_WORDS) {
    if (titleTokens.has(diff) && !queryText.includes(diff)) {
      score -= 10;
    }
  }
  
  // Normalize score to 0-100
  const normalizedScore = Math.max(0, Math.min(100, (score / maxScore) * 100));
  
  return {
    score: Math.round(normalizedScore),
    details
  };
}

function classifyOfferDetailed(offer, detected) {

  const normalizedTitle = normalizeForMatch(offer.title);
  const titleTokens = new Set(normalizedTitle.split(" "));
  const titleCollapsed = normalizedTitle.replace(/\s/g, "");
  const queryText = normalizeForMatch(`${detected.brand || ""} ${detected.name} ` +
    Object.values(detected.variant).join(" "));

  const sigTokens = getSignificantTokens(detected);
  const coreModelTokens = getCoreModelTokens(detected);

  // Detect if this is a fashion product
  const isFashionProduct = detected.name && /shoe|sneaker|boot|sandal|slipper|trainer|loafer|heel|flat|wedge|athletic|running|walking|hiking|basketball|soccer|football|tennis|golf|fitness|yoga|gym|workout|outdoor|indoor|casual|formal|business|party|wedding|evening|night|day|summer|winter|spring|fall|autumn|seasonal|holiday|festival|occasion|special|limited|exclusive|collection|series|line|range|set|kit|bundle|pack|lot|multi|combo|dual|triple|quad|penta|hexa|octa|deca|mega|giga|tera|peta|exa|zetta|yotta/i.test(detected.name);

  // CORE MODEL TOKEN RULE: Require sufficient match of core model tokens
  if (coreModelTokens.length > 0) {
    const matchedCoreTokens = coreModelTokens.filter(token => tokenPresent(normalizedTitle, token));
    const coreMatchRatio = matchedCoreTokens.length / coreModelTokens.length;
    
    console.log(`[CORE_MODEL_CHECK] Core tokens: [${coreModelTokens.join(", ")}], Matched: [${matchedCoreTokens.join(", ")}], Ratio: ${coreMatchRatio.toFixed(2)}`);
    
    // For fashion products, require at least 60% of core model tokens (stricter)
    // For tech products, require stricter matching
    const minCoreRatio = isFashionProduct ? 0.6 : 0.7;
    
    // Special case: if we have very few core tokens (1-2), require ALL of them
    if (coreModelTokens.length <= 2 && coreMatchRatio < 1.0) {
      return {
        verdict: "reject",
        reason: `insufficient core model match: ${matchedCoreTokens.length}/${coreModelTokens.length} core tokens matched (required all for short model names) - tokens: ${coreModelTokens.join(", ")}`
      };
    }
    
    if (coreMatchRatio < minCoreRatio) {
      return {
        verdict: "reject",
        reason: `insufficient core model match: ${matchedCoreTokens.length}/${coreModelTokens.length} core tokens matched (${coreModelTokens.join(", ")})`
      };
    }
  }

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

      // For fashion products, be more lenient - allow missing descriptive tokens like "ons", "sneaker"
      // if the core model name is present
      if (isFashionProduct) {
        const descriptiveTokens = ['ons', 'sneaker', 'shoe', 'boot', 'slip', 'on'];
        const coreMissingFiltered = coreMissing.filter(t => !descriptiveTokens.includes(t.toLowerCase()));
        
        if (coreMissingFiltered.length === 0) {
          // Only descriptive tokens missing - accept as variant-mismatch
          return {
            verdict: "variant-mismatch",
            reason: `minor descriptive differences: ${missing.join(", ")}`
          };
        }
      }

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

    console.log(`[SERPAPI] Searching for: "${query}"`);
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

    const httpStatus = response.status;
    const resultCount = Array.isArray(response.data.shopping_results) 
      ? response.data.shopping_results.length 
      : 0;
    console.log(`[SERPAPI] Response for "${query}": HTTP ${httpStatus}, ${resultCount} shopping results`);

  } catch (err) {

    const status = err.response?.status;
    console.log(`[SERPAPI] Error for "${query}": ${err.message} (status: ${status || "N/A"})`);

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
    console.log(`[SERPAPI] Malformed response for "${query}"`);
    throw Object.assign(new Error("Malformed SERP response"), { code: "MALFORMED" });
  }

  if (typeof response.data.error === "string" && response.data.error) {
    console.log(`[SERPAPI] API error for "${query}": ${response.data.error}`);
    throw Object.assign(new Error("SERP API error"), { code: "UPSTREAM" });
  }

  return Array.isArray(response.data.shopping_results)
    ? response.data.shopping_results
    : [];

}

function buildCleanSearchQuery(detected) {
  const parts = [];
  
  if (detected.brand) {
    parts.push(detected.brand.charAt(0).toUpperCase() + detected.brand.slice(1));
  }
  
  if (detected.name) {
    parts.push(detected.name);
  }
  
  if (detected.variant.storage) {
    parts.push(detected.variant.storage.replace(/\s+/g, ""));
  }
  
  const query = parts.join(" ").replace(/\s+/g, " ").trim();
  console.log(`[CLEAN_QUERY] Built clean query: "${query}"`);
  return query;
}

function buildSearchQueries(detected) {
  // Build normalized product structure for smart query generation
  const normalizedProduct = {
    brand: detected.brand || "",
    productFamily: detected.familyToken ? PRODUCT_FAMILY_MAP[detected.familyToken]?.display || detected.name : detected.name || "",
    model: detected.name || "",
    category: detectProductCategory(detected),
    specifications: {
      storage: detected.variant?.storage || "",
      ram: detected.variant?.ram || "",
      size: detected.variant?.size || "",
      color: detected.variant?.color || "",
      display: "",
      processor: ""
    },
    cleanTitle: detected.cleaned || detected.name || ""
  };

  console.log("[BUILD_QUERIES] Using smart query generator with normalized product:", JSON.stringify(normalizedProduct));
  
  // Use the new smart query generator
  const smartQueries = buildSmartSearchQueries(normalizedProduct);
  
  // Fallback to legacy queries if smart generator fails
  if (smartQueries.length === 0) {
    console.log("[BUILD_QUERIES] Smart generator failed, using legacy fallback");
    return buildLegacySearchQueries(detected);
  }
  
  console.log(`[SEARCH_QUERIES] Built ${smartQueries.length} queries using smart generator:`, smartQueries);
  return smartQueries;
}

function detectProductCategory(detected) {
  const name = (detected.name || "").toLowerCase();
  const cleaned = (detected.cleaned || "").toLowerCase();
  
  // Category detection based on keywords - use word boundaries to avoid partial matches
  if (/\b(phone|smartphone|mobile|iphone|galaxy|pixel|oneplus|vivo|oppo|realme|xiaomi|redmi|poco|moto|motorola)\b/i.test(name)) {
    return "mobile";
  }
  if (/\b(laptop|notebook|macbook|thinkpad|pavilion|inspiron|chromebook|ultrabook)\b/i.test(name)) {
    return "computer";
  }
  if (/\b(tablet|ipad|tab|kindle|surface)\b/i.test(name)) {
    return "tablet";
  }
  if (/\b(headphone|earphone|earbud|headset|tws)\b/i.test(name)) {
    return "headphone";
  }
  if (/\b(watch|smartwatch|timepiece|fitbit|garmin)\b/i.test(name)) {
    return "watch";
  }
  if (/\b(shoe|sneaker|boot|sandal|slipper|loafer|heel|trainer|athletic|running|walking|hiking)\b/i.test(name)) {
    return "footwear";
  }
  if (/\b(shirt|pant|jean|jacket|dress|skirt|suit|coat|blazer|tshirt|top|kurta|saree|lehenga)\b/i.test(name)) {
    return "clothing";
  }
  
  return "general";
}

function buildLegacySearchQueries(detected) {
  const cleanQuery = buildCleanSearchQuery(detected);
  const identity = buildSearchIdentity(detected);

  // Priority order: simplest exact identity first
  const queries = [
    cleanQuery,  // e.g., "Apple iPhone 17 Pro Max 256GB"
  ];

  // Detect if this is a fashion/shoe product (by checking for shoe-related keywords in name)
  const isFashionProduct = detected.name && /shoe|sneaker|boot|sandal|slipper|trainer|loafer|heel|flat|wedge|athletic|running|walking|hiking|basketball|soccer|football|tennis|golf|fitness|yoga|gym|workout|outdoor|indoor|casual|formal|business|party|wedding|evening|night|day|summer|winter|spring|fall|autumn|seasonal|holiday|festival|occasion|special|limited|exclusive|collection|series|line|range|set|kit|bundle|pack|lot|multi|combo|dual|triple|quad|penta|hexa|octa|deca|mega|giga|tera|peta|exa|zetta|yotta/i.test(detected.name);

  // For fashion products, preserve more of the model name in fallback queries
  if (isFashionProduct && detected.brand && detected.name) {
    const nameTokens = detected.name.split(/\s+/);
    // Keep more tokens for fashion products (up to 4-5 significant tokens)
    const significantTokens = nameTokens.filter(token => 
      token.length > 2 && 
      !/^(men|women|kids|boy|girl|unisex|with|for|and|the|a|an)$/i.test(token)
    );
    
    // Add brand + 3-4 significant model tokens (preserve model words like "Glide Step")
    if (significantTokens.length >= 3) {
      const modelName = significantTokens.slice(0, Math.min(4, significantTokens.length)).join(" ");
      queries.push(`${detected.brand} ${modelName}`);  // e.g., "Skechers Glide Step Slip Ons"
    }
    
    // Add brand + 2-3 significant model tokens
    if (significantTokens.length >= 2) {
      const coreName = significantTokens.slice(0, Math.min(3, significantTokens.length)).join(" ");
      queries.push(`${detected.brand} ${coreName}`);  // e.g., "Skechers Glide Step"
    }
    
    // Add model name with category word
    if (significantTokens.length >= 2) {
      const coreName = significantTokens.slice(0, 2).join(" ");
      queries.push(`${detected.brand} ${coreName} shoes`);  // e.g., "Skechers Glide Step shoes"
    }
  } else {
    // For non-fashion products, use the original logic
    // Fallback: brand + model (without storage)
    if (detected.brand && detected.name) {
      const nameTokens = detected.name.split(/\s+/);
      if (nameTokens.length > 2) {
        const shortName = nameTokens.slice(0, Math.min(3, nameTokens.length)).join(" ");
        queries.push(`${detected.brand} ${shortName}`);  // e.g., "Apple iPhone 17 Pro Max"
      } else {
        // For short names, use brand + full name
        queries.push(`${detected.brand} ${detected.name}`);
      }
    }

    // Fallback: brand + core model name (first 2-3 significant tokens)
    if (detected.brand && detected.name) {
      const nameTokens = detected.name.split(/\s+/);
      // Get first 2-3 tokens, but skip common words
      const significantTokens = nameTokens.filter(token => 
        token.length > 2 && 
        !/^(men|women|kids|boy|girl|unisex|with|for|and|the|a|an)$/i.test(token)
      );
      if (significantTokens.length >= 2) {
        const coreName = significantTokens.slice(0, 2).join(" ");
        queries.push(`${detected.brand} ${coreName}`);  // e.g., "Skechers Glide Step"
      }
    }
  }

  // Fallback: model only (without brand)
  if (detected.name) {
    const nameTokens = detected.name.split(/\s+/);
    if (nameTokens.length > 2) {
      const shortName = nameTokens.slice(0, Math.min(3, nameTokens.length)).join(" ");
      queries.push(shortName);  // e.g., "iPhone 17 Pro Max"
    } else {
      queries.push(detected.name);
    }
  }

  // Fallback: core model name only (first 2 significant tokens)
  if (detected.name) {
    const nameTokens = detected.name.split(/\s+/);
    const significantTokens = nameTokens.filter(token => 
      token.length > 2 && 
      !/^(men|women|kids|boy|girl|unisex|with|for|and|the|a|an)$/i.test(token)
    );
    if (significantTokens.length >= 2) {
      const coreName = significantTokens.slice(0, 2).join(" ");
      queries.push(coreName);  // e.g., "Glide Step"
    }
  }

  // Fallback: brand + family if available
  if (detected.familyToken) {
    const family = PRODUCT_FAMILY_MAP[detected.familyToken];
    if (family) {
      queries.push(`${family.brand} ${family.display}`);  // e.g., "Apple iPhone"
    }
  }

  // Fallback: brand + product category (generic) - ONLY for non-fashion products
  if (!isFashionProduct && detected.brand && detected.name) {
    const nameLower = detected.name.toLowerCase();
    // Detect category from name
    const categoryKeywords = {
      'phone': ['phone', 'smartphone', 'mobile', 'iphone', 'galaxy', 'pixel'],
      'laptop': ['laptop', 'notebook', 'macbook', 'pavilion', 'thinkpad', 'inspiron'],
      'headphone': ['headphone', 'earphone', 'earbud', 'speaker', 'audio'],
      'watch': ['watch', 'timepiece', 'smartwatch'],
      'camera': ['camera', 'lens', 'dslr', 'mirrorless']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => nameLower.includes(keyword))) {
        queries.push(`${detected.brand} ${category}`);
        break;
      }
    }
  }

  const uniqueQueries = [...new Set(queries.filter(Boolean))];
  console.log(`[SEARCH_QUERIES] Built ${uniqueQueries.length} legacy queries in priority order:`, uniqueQueries);
  return uniqueQueries;
}

async function runNonTechCompare(rawQuery, { serpSearch = serpShoppingSearch } = {}) {

  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] STARTING NON-TECH COMPARISON`);
  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] RAW_QUERY: "${rawQuery}"`);
  console.log(`[STRUCTURED_LOG] TIMESTAMP: ${new Date().toISOString()}`);

  const detected = parseProductQuery(rawQuery);

  if (!detected) {
    console.log(`[STRUCTURED_LOG] STAGE: DETECTION`);
    console.log(`[STRUCTURED_LOG] STATUS: FAILED`);
    console.log(`[STRUCTURED_LOG] REASON: Could not detect product in query`);
    console.log(`[STRUCTURED_LOG] ============================================`);
    return {
      success: false,
      error: "Could not detect a product in your query.",
      stage: "detect"
    };
  }

  console.log(`[STRUCTURED_LOG] STAGE: DETECTION`);
  console.log(`[STRUCTURED_LOG] STATUS: SUCCESS`);
  console.log(`[STRUCTURED_LOG] DETECTED_BRAND: "${detected.brand}"`);
  console.log(`[STRUCTURED_LOG] DETECTED_NAME: "${detected.name}"`);
  console.log(`[STRUCTURED_LOG] DETECTED_SIMPLE_NAME: "${detected.cleaned}"`);
  console.log(`[STRUCTURED_LOG] DETECTED_VARIANT: ${JSON.stringify(detected.variant)}`);
  console.log(`[STRUCTURED_LOG] DETECTED_FAMILY_TOKEN: "${detected.familyToken}"`);

  // Detect category for confidence classification
  const category = detectProductCategory(detected);
  console.log(`[STRUCTURED_LOG] DETECTED_CATEGORY: "${category}"`);

  // Detect if this is a fashion product for confidence classification
  const isFashionProduct = detected.name && /shoe|sneaker|boot|sandal|slipper|trainer|loafer|heel|flat|wedge|athletic|running|walking|hiking|basketball|soccer|football|tennis|golf|fitness|yoga|gym|workout|outdoor|indoor|casual|formal|business|party|wedding|evening|night|day|summer|winter|spring|fall|autumn|seasonal|holiday|festival|occasion|special|limited|exclusive|collection|series|line|range|set|kit|bundle|pack|lot|multi|combo|dual|triple|quad|penta|hexa|octa|deca|mega|giga|tera|peta|exa|zetta|yotta/i.test(detected.name);
  console.log(`[STRUCTURED_LOG] IS_FASHION_PRODUCT: ${isFashionProduct}`);

  const allowUsed = /\b(used|refurbished|second hand|preowned)\b/i.test(rawQuery);
  console.log(`[STRUCTURED_LOG] ALLOW_USED: ${allowUsed}`);

  console.log(`[STRUCTURED_LOG] STAGE: QUERY_GENERATION`);
  const queries = buildSearchQueries(detected);
  const usedQueries = [];

  console.log(`[STRUCTURED_LOG] GENERATED_QUERIES_COUNT: ${queries.length}`);
  console.log(`[STRUCTURED_LOG] GENERATED_QUERIES:`, queries);

  let allOffers = [];
  let exactCount = 0;

  for (const query of queries) {

    if (exactCount >= MIN_EXACT_MATCHES) break;

    usedQueries.push(query);
    console.log(`[STRUCTURED_LOG] SEARCH_ATTEMPT: "${query}"`);
    console.log(`[STRUCTURED_LOG] QUERY_INDEX: ${usedQueries.length}/${queries.length}`);

    const rawResults = await serpSearch(query);
    console.log(`[STRUCTURED_LOG] SERPAPI_RESULTS_COUNT: ${rawResults.length}`);

    const extracted = extractSerpOffers(rawResults, { allowUsed });
    console.log(`[STRUCTURED_LOG] EXTRACTED_OFFERS_COUNT: ${extracted.length}`);

    for (const offer of extracted) {
      // Build normalized product structure for generic matching
      const normalizedProduct = {
        brand: detected.brand || "",
        productFamily: detected.familyToken ? PRODUCT_FAMILY_MAP[detected.familyToken]?.display || detected.name : detected.name || "",
        model: detected.name || "",
        category: detectProductCategory(detected),
        specifications: {
          storage: detected.variant?.storage || "",
          ram: detected.variant?.ram || "",
          size: detected.variant?.size || "",
          color: detected.variant?.color || "",
          display: "",
          processor: ""
        },
        cleanTitle: detected.cleaned || detected.name || ""
      };

      // Use new generic matcher
      const genericClassification = classifyOfferGeneric(offer, normalizedProduct);
      offer.matchType = genericClassification.matchType;
      offer.matchReason = genericClassification.reason;
      offer.confidence = genericClassification.confidence;
      
      // Also run legacy classification for backward compatibility
      const detailed = classifyOfferDetailed(offer, detected);
      const similarity = calculateSimilarityScore(offer, detected);
      offer.similarityScore = similarity.score;
      offer.similarityDetails = similarity.details;
      
      // Use generic classification if available, otherwise use legacy
      if (genericClassification.matchType !== "UNRELATED") {
        offer.matchType = genericClassification.matchType;
        offer.matchReason = genericClassification.reason;
        offer.confidence = genericClassification.confidence;
      } else {
        offer.matchType = detailed.verdict;
        offer.matchReason = detailed.reason;
      }
      
      console.log(`[MATCH_CLASSIFICATION] "${offer.title}" -> Type: ${offer.matchType}, Reason: ${offer.matchReason}, Confidence: ${offer.confidence}`);
    }

    console.log(`[STRUCTURED_LOG] CLASSIFIED_OFFERS_COUNT: ${extracted.length}`);
    console.log(`[STRUCTURED_LOG] VALID_OFFERS_COUNT: ${extracted.filter(o => o.matchType !== "reject" && o.confidence !== "LOW").length}`);
    console.log(`[STRUCTURED_LOG] REJECTED_OFFERS_COUNT: ${extracted.filter(o => o.matchType === "reject" || o.confidence === "LOW").length}`);

    const valid = extracted.filter((o) => o.matchType !== "reject" && o.confidence !== "LOW");
    allOffers = dedupeOffers(allOffers.concat(valid));
    exactCount = allOffers.filter((o) => o.matchType === "exact").length;

    const rejected = extracted.filter((o) => o.matchType === "reject");
    const accepted = extracted.filter((o) => o.matchType !== "reject");
    console.log(
      `[NONTECH] q="${query}" raw=${rawResults.length} extracted=${extracted.length} ` +
      `exact=${exactCount} mismatch=${allOffers.length - exactCount} rejected=${rejected.length} accepted=${accepted.length}`
    );
    console.log(`[BACKEND_ACCEPTED] count=${accepted.length} for query "${query}"`);
    
    // Log accepted results with scores
    if (accepted.length > 0) {
      console.log(`[ACCEPTED_RESULTS] Top matches for query "${query}":`);
      accepted.slice(0, 3).forEach((o) => {
        console.log(`[ACCEPTED_RESULTS]   - ${o.title} (Score: ${o.similarityScore}, Store: ${o.store})`);
      });
    }
    rejected.slice(0, 3).forEach((o) =>
      console.log(`[NONTECH]   reject: ${o.title} -> ${o.matchReason}`)
    );

  }

  console.log(`[STRUCTURED_LOG] STAGE: RESULT_CLASSIFICATION`);
  console.log(`[STRUCTURED_LOG] TOTAL_OFFERS_BEFORE_DEDUPE: ${allOffers.length}`);
  
  const exactOffers = allOffers.filter((o) => o.matchType === "EXACT_MATCH" || o.matchType === "exact");
  const familyOffers = allOffers.filter((o) => o.matchType === "FAMILY_MATCH");
  const relatedOffers = allOffers.filter((o) => o.matchType === "RELATED_VARIANT");
  const nearOffers = allOffers.filter((o) => o.matchType === "variant-mismatch");
  
  console.log(`[STRUCTURED_LOG] EXACT_MATCH_COUNT: ${exactOffers.length}`);
  console.log(`[STRUCTURED_LOG] FAMILY_MATCH_COUNT: ${familyOffers.length}`);
  console.log(`[STRUCTURED_LOG] RELATED_VARIANT_COUNT: ${relatedOffers.length}`);
  console.log(`[STRUCTURED_LOG] VARIANT_MISMATCH_COUNT: ${nearOffers.length}`);
  
  // Use new match types first, fall back to legacy
  let pool = exactOffers.length > 0 ? exactOffers : 
             familyOffers.length > 0 ? familyOffers :
             relatedOffers.length > 0 ? relatedOffers : nearOffers;

  console.log(`[STRUCTURED_LOG] SELECTED_POOL_TYPE: ${exactOffers.length > 0 ? "EXACT_MATCH" : familyOffers.length > 0 ? "FAMILY_MATCH" : relatedOffers.length > 0 ? "RELATED_VARIANT" : "VARIANT_MISMATCH"}`);
  console.log(`[STRUCTURED_LOG] SELECTED_POOL_SIZE: ${pool.length}`);

  if (pool.length === 0) {
    console.log(`[STRUCTURED_LOG] STAGE: FINAL_RESULT`);
    console.log(`[STRUCTURED_LOG] STATUS: FAILED`);
    console.log(`[STRUCTURED_LOG] REASON: No valid offers found`);
    console.log(`[STRUCTURED_LOG] ============================================`);
    return {
      success: false,
      error: "I couldn't find reliable matching product listings for this product.",
      stage: "results",
      query: rawQuery.trim(),
      detectedProduct: {
        brand: detected.brand,
        name: detected.name,
        simpleName: detected.cleaned || detected.name,
        variant: Object.keys(detected.variant).length > 0 ? detected.variant : undefined
      },
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

  console.log(`[STRUCTURED_LOG] BEST_PRICE: ${best.price} ${best.currency}`);
  console.log(`[STRUCTURED_LOG] BEST_STORE: ${best.store}`);
  console.log(`[STRUCTURED_LOG] PRIMARY_CURRENCY: ${primaryCurrency}`);

  const detectedProduct = {
    brand: detected.brand,
    name: detected.name,
    simpleName: detected.cleaned || detected.name,
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
      familyMatches: familyOffers.length,
      relatedVariants: relatedOffers.length,
      variantMismatches: nearOffers.length,
      otherCurrencyExcluded:
        pool.length - comparable.length
    }
  };

  console.log(`[STRUCTURED_LOG] STAGE: FINAL_RESULT`);
  console.log(`[STRUCTURED_LOG] STATUS: SUCCESS`);
  console.log(`[STRUCTURED_LOG] RETURNED_OFFERS_COUNT: ${result.offers.length}`);
  console.log(`[STRUCTURED_LOG] EXACT_MATCHES: ${result.meta.exactMatches}`);
  console.log(`[STRUCTURED_LOG] FAMILY_MATCHES: ${result.meta.familyMatches}`);
  console.log(`[STRUCTURED_LOG] RELATED_VARIANTS: ${result.meta.relatedVariants}`);
  console.log(`[STRUCTURED_LOG] ============================================`);

  if (exactOffers.length === 0) {
    if (familyOffers.length > 0) {
      result.note =
        "Exact match not found. Showing family-matched products (same product line).";
    } else if (relatedOffers.length > 0) {
      result.note =
        "Exact match not found. Showing related variants.";
    } else {
      result.note =
        "Only variant-mismatched listings were found; prices shown may be for related variants.";
    }
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

/**
 * NON-TECH COMPARE WITH NORMALIZED PRODUCT
 * Uses structured product object from extension instead of parsing query string
 */
async function runNonTechCompareWithNormalizedProduct(normalizedProduct) {
  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] STARTING NON-TECH COMPARISON (NORMALIZED)`);
  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] NORMALIZED_PRODUCT:`, JSON.stringify(normalizedProduct));
  console.log(`[STRUCTURED_LOG] TIMESTAMP: ${new Date().toISOString()}`);

  // Build search queries using the smart query generator with normalized product
  const queries = buildSmartSearchQueries(normalizedProduct);
  
  if (queries.length === 0) {
    console.log(`[STRUCTURED_LOG] STAGE: QUERY_GENERATION`);
    console.log(`[STRUCTURED_LOG] STATUS: FAILED`);
    console.log(`[STRUCTURED_LOG] REASON: No queries generated from normalized product`);
    console.log(`[STRUCTURED_LOG] ============================================`);
    return {
      success: false,
      error: "Could not generate search queries from product data.",
      stage: "query_generation"
    };
  }

  console.log(`[STRUCTURED_LOG] STAGE: QUERY_GENERATION`);
  console.log(`[STRUCTURED_LOG] STATUS: SUCCESS`);
  console.log(`[STRUCTURED_LOG] GENERATED_QUERIES_COUNT: ${queries.length}`);
  console.log(`[STRUCTURED_LOG] GENERATED_QUERIES:`, queries);

  const usedQueries = [];
  let allOffers = [];
  let exactCount = 0;

  for (const query of queries) {
    if (exactCount >= MIN_EXACT_MATCHES) break;

    usedQueries.push(query);
    console.log(`[STRUCTURED_LOG] SEARCH_ATTEMPT: "${query}"`);
    console.log(`[STRUCTURED_LOG] QUERY_INDEX: ${usedQueries.length}/${queries.length}`);

    const rawResults = await serpShoppingSearch(query);
    console.log(`[STRUCTURED_LOG] SERPAPI_RESULTS_COUNT: ${rawResults.length}`);

    const extracted = extractSerpOffers(rawResults, { allowUsed: false });
    console.log(`[STRUCTURED_LOG] EXTRACTED_OFFERS_COUNT: ${extracted.length}`);

    for (const offer of extracted) {
      // Use the generic matcher with normalized product structure
      const genericClassification = classifyOfferGeneric(offer, normalizedProduct);
      offer.matchType = genericClassification.matchType;
      offer.matchReason = genericClassification.reason;
      offer.confidence = genericClassification.confidence;
      
      console.log(`[MATCH_CLASSIFICATION] "${offer.title}" -> Type: ${offer.matchType}, Reason: ${offer.matchReason}, Confidence: ${offer.confidence}`);
    }

    console.log(`[STRUCTURED_LOG] CLASSIFIED_OFFERS_COUNT: ${extracted.length}`);
    console.log(`[STRUCTURED_LOG] VALID_OFFERS_COUNT: ${extracted.filter(o => o.matchType !== "UNRELATED" && o.confidence !== "LOW").length}`);
    console.log(`[STRUCTURED_LOG] REJECTED_OFFERS_COUNT: ${extracted.filter(o => o.matchType === "UNRELATED" || o.confidence === "LOW").length}`);

    const valid = extracted.filter((o) => o.matchType !== "UNRELATED" && o.confidence !== "LOW");
    allOffers = dedupeOffers(allOffers.concat(valid));
    exactCount = allOffers.filter((o) => o.matchType === "EXACT_MATCH").length;

    const rejected = extracted.filter((o) => o.matchType === "UNRELATED");
    const accepted = extracted.filter((o) => o.matchType !== "UNRELATED");
    console.log(
      `[NONTECH] q="${query}" raw=${rawResults.length} extracted=${extracted.length} ` +
      `exact=${exactCount} mismatch=${allOffers.length - exactCount} rejected=${rejected.length} accepted=${accepted.length}`
    );
  }

  console.log(`[STRUCTURED_LOG] STAGE: RESULT_CLASSIFICATION`);
  console.log(`[STRUCTURED_LOG] TOTAL_OFFERS_BEFORE_DEDUPE: ${allOffers.length}`);
  
  const exactOffers = allOffers.filter((o) => o.matchType === "EXACT_MATCH");
  const familyOffers = allOffers.filter((o) => o.matchType === "FAMILY_MATCH");
  const relatedOffers = allOffers.filter((o) => o.matchType === "RELATED_VARIANT");
  
  console.log(`[STRUCTURED_LOG] EXACT_MATCH_COUNT: ${exactOffers.length}`);
  console.log(`[STRUCTURED_LOG] FAMILY_MATCH_COUNT: ${familyOffers.length}`);
  console.log(`[STRUCTURED_LOG] RELATED_VARIANT_COUNT: ${relatedOffers.length}`);
  
  // Sort results by match type using the generic sorter
  const sortedOffers = sortResultsByMatchType(allOffers);
  
  // Determine exact match found flag
  const exactMatchFound = exactOffers.length > 0;
  console.log(`[STRUCTURED_LOG] EXACT_MATCH_FOUND: ${exactMatchFound}`);
  
  if (sortedOffers.length === 0) {
    console.log(`[STRUCTURED_LOG] STAGE: FINAL_RESULT`);
    console.log(`[STRUCTURED_LOG] STATUS: FAILED`);
    console.log(`[STRUCTURED_LOG] REASON: No valid offers found`);
    console.log(`[STRUCTURED_LOG] ============================================`);
    return {
      success: false,
      error: "I couldn't find reliable matching product listings for this product.",
      stage: "results",
      exactMatchFound: false,
      relatedVariants: [],
      searchedQueries: usedQueries,
      normalizedProduct: normalizedProduct
    };
  }

  // Group by currency
  const currencyCounts = {};
  for (const offer of sortedOffers) {
    currencyCounts[offer.currency] = (currencyCounts[offer.currency] || 0) + 1;
  }
  const primaryCurrency = Object.entries(currencyCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  const comparable = sortedOffers
    .filter((o) => o.currency === primaryCurrency)
    .sort((a, b) => a.price - b.price);

  const best = comparable[0];

  console.log(`[STRUCTURED_LOG] BEST_PRICE: ${best.price} ${best.currency}`);
  console.log(`[STRUCTURED_LOG] BEST_STORE: ${best.store}`);
  console.log(`[STRUCTURED_LOG] PRIMARY_CURRENCY: ${primaryCurrency}`);

  // Build result with exact match found flag
  const result = {
    success: true,
    exactMatchFound: exactMatchFound,
    query: normalizedProduct.cleanTitle || normalizedProduct.rawTitle,
    searchIdentity: `${normalizedProduct.brand || ''} ${normalizedProduct.model || normalizedProduct.productFamily || ''}`.trim(),
    detectedProduct: {
      brand: normalizedProduct.brand,
      name: normalizedProduct.cleanTitle || normalizedProduct.rawTitle,
      productFamily: normalizedProduct.productFamily,
      model: normalizedProduct.model,
      category: normalizedProduct.category,
      variant: normalizedProduct.variant,
      specifications: normalizedProduct.specifications
    },
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
      matchType: offer.matchType,
      confidence: offer.confidence
    })),
    relatedVariants: exactMatchFound ? [] : relatedOffers.slice(0, 5).map((offer) => ({
      store: offer.store,
      title: offer.title,
      price: offer.price,
      currency: offer.currency,
      url: offer.url,
      matchType: offer.matchType
    })),
    meta: {
      searchedQueries: usedQueries,
      totalValidListings: allOffers.length,
      exactMatches: exactOffers.length,
      familyMatches: familyOffers.length,
      relatedVariants: relatedOffers.length,
      otherCurrencyExcluded: sortedOffers.length - comparable.length,
      extractionSource: normalizedProduct.source,
      extractionConfidence: normalizedProduct.confidence,
      platform: normalizedProduct.platform
    }
  };

  console.log(`[STRUCTURED_LOG] STAGE: FINAL_RESULT`);
  console.log(`[STRUCTURED_LOG] STATUS: SUCCESS`);
  console.log(`[STRUCTURED_LOG] RETURNED_OFFERS_COUNT: ${result.offers.length}`);
  console.log(`[STRUCTURED_LOG] EXACT_MATCHES: ${result.meta.exactMatches}`);
  console.log(`[STRUCTURED_LOG] FAMILY_MATCHES: ${result.meta.familyMatches}`);
  console.log(`[STRUCTURED_LOG] RELATED_VARIANTS: ${result.meta.relatedVariants}`);
  console.log(`[STRUCTURED_LOG] ============================================`);

  if (!exactMatchFound) {
    if (familyOffers.length > 0) {
      result.note = "Exact match not found. Showing family-matched products (same product line).";
    } else if (relatedOffers.length > 0) {
      result.note = "Exact match not found. Showing related variants.";
    } else {
      result.note = "Only partial matches were found; prices shown may be for related variants.";
    }
  }

  // Backward compatibility fields
  result.product = normalizedProduct.cleanTitle || normalizedProduct.rawTitle;
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

  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] NON-TECH COMPARE REQUEST`);
  console.log(`[STRUCTURED_LOG] ============================================`);
  console.log(`[STRUCTURED_LOG] TIMESTAMP: ${new Date().toISOString()}`);

  // Support both simple query (backward compatibility) and normalized product object
  const query = req.query.q || req.query.product;
  const normalizedProduct = req.query.normalizedProduct ? JSON.parse(req.query.normalizedProduct) : null;
  const extractionLog = req.query.extractionLog ? JSON.parse(req.query.extractionLog) : null;

  console.log(`[STRUCTURED_LOG] REQUEST_TYPE: ${normalizedProduct ? 'NORMALIZED_PRODUCT' : 'SIMPLE_QUERY'}`);
  
  if (extractionLog) {
    console.log(`[STRUCTURED_LOG] EXTRACTION_LOG:`, JSON.stringify(extractionLog));
  }

  if (!query && !normalizedProduct) {
    return res.status(400).json({
      success: false,
      error: "Please provide a product search query, e.g. ?q=cheapest iPhone 15 128GB"
    });
  }

  if (!SERP_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "SERP API key not configured on the server"
    });
  }

  try {
    let result;
    
    if (normalizedProduct) {
      // Use normalized product structure from extension
      console.log(`[STRUCTURED_LOG] USING_NORMALIZED_PRODUCT:`, JSON.stringify(normalizedProduct));
      result = await runNonTechCompareWithNormalizedProduct(normalizedProduct);
    } else {
      // Backward compatibility: use simple query
      const trimmedQuery = String(query).trim();
      console.log(`[STRUCTURED_LOG] USING_SIMPLE_QUERY: "${trimmedQuery}"`);
      
      const detected = parseProductQuery(trimmedQuery);
      console.log(`[NONTECH_REQUEST] product: ${JSON.stringify(detected)}`);

      if (!detected) {
        return res.status(400).json({
          success: false,
          error: "Could not detect a product in your query."
        });
      }
      
      result = await runNonTechCompare(trimmedQuery);
    }

    console.log(`[FINAL_RESPONSE] resultCount: ${result.offers ? result.offers.length : 0}`);
    console.log(`[FINAL_RESPONSE] exactMatchFound: ${result.exactMatchFound}`);
    console.log(`[STRUCTURED_LOG] ============================================`);

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
  extractSimpleProductName,
  calculateSimilarityScore,
  classifyOffer,
  classifyOfferDetailed,
  extractSerpOffers,
  dedupeOffers,
  runNonTechCompare,
  // New exports for generic system
  buildSmartSearchQueries,
  classifyOfferGeneric,
  detectProductCategory,
  sortResultsByMatchType
};