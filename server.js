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

app.get("/nontech-compare", async (req, res) => {

  const product = req.query.product;

  if (!product) {
    return res.json({ error: "Product required" });
  }

  if (!SERP_API_KEY) {
    return res.status(500).json({
      error: "SERP API key not configured"
    });
  }

  try {

    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_shopping",
        q: product + " price in india",
        api_key: SERP_API_KEY,
        google_domain: "google.co.in",
        gl: "in",
        hl: "en"
      }
    });

    const results = response.data.shopping_results || [];

    if (results.length === 0) {
      return res.json({ error: "No results" });
    }

    const cleaned = results.map(item => ({

      title: item.title,
      price: item.price,
      store:
        item.source ||
        item.seller ||
        "Store",
      link: item.link

    }));

    cleaned.sort((a, b) => {
      const pa = parseInt(a.price?.replace(/[^\d]/g, "") || 0);
      const pb = parseInt(b.price?.replace(/[^\d]/g, "") || 0);
      return pa - pb;
    });

    res.json({
      product,
      best: cleaned[0],
      all: cleaned.slice(0, 10)
    });

  } catch (err) {

    console.log("SERP ERROR:", err.message);

    res.status(500).json({
      error: "Non-tech comparison failed"
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

app.listen(PORT, () => {
  console.log(`CyberLens backend running on http://localhost:${PORT}`);
});