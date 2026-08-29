const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

/* Extract the real TITLE-RULES block from popup.js so we test the
   exact code that gets injected into Amazon pages. */

const source = fs.readFileSync(
  path.join(__dirname, "..", "CyberLens-extension", "popup.js"),
  "utf8"
);

const match = source.match(/\/\* TITLE-RULES-START \*\/([\s\S]*?)\/\* TITLE-RULES-END \*\//);
assert.ok(match, "TITLE-RULES block not found in popup.js");

const detectProductTitle = new Function(match[1] + "\nreturn detectProductTitle;")();

/* Fake document helper: map of selector -> element-ish object */
function fakeDoc({ hostname = "www.amazon.in", elements = {}, title = "" }) {
  return {
    location: { hostname },
    querySelector: (selector) => {
      if (!(selector in elements)) return null;
      const value = elements[selector];
      if (value === null || value === undefined) return null;
      if (selector.startsWith("meta[")) return { content: value };
      return { textContent: value, innerText: value };
    },
    title
  };
}

test("amazon: #productTitle wins, trimmed + whitespace normalized", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle":
        "   Storite PU Leather Vertical Credit Card Holder 11.5 X 2 X 8 cm   "
    },
    title: "junk fallback"
  });
  assert.strictEqual(
    detectProductTitle(doc),
    "Storite PU Leather Vertical Credit Card Holder 11.5 X 2 X 8 cm"
  );
});

test("amazon: 'Product summary' h1 rejected, document.title used instead", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle": null,
      h1: "Product summary presents key product information"
    },
    title: "Storite PU Leather Vertical Credit Card Holder 11.5 X 2 X 8 cm : Amazon.in"
  });
  assert.match(detectProductTitle(doc), /^Storite PU Leather/);
});

test("og:title used when #productTitle absent", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle": null,
      "meta[property='og:title']": "Sony WH-1000XM5 Wireless Headphones : Amazon.in"
    }
  });
  assert.strictEqual(detectProductTitle(doc), "Sony WH-1000XM5 Wireless Headphones : Amazon.in");
});

test("price-only title rejected at every level -> null", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle": "\u20B943,999",
      "meta[property='og:title']": "Rs. 43,999 only",
      h1: "$ 1,299.00"
    },
    title: "INR 43,999"
  });
  assert.strictEqual(detectProductTitle(doc), null);
});

test("generic UI phrases rejected", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle": null,
      "meta[property='og:title']": null,
      h1: "Add to Cart",
      title: ""
    }
  });
  assert.strictEqual(detectProductTitle(doc), null);
});

test("sponsored / recommendation headings rejected", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle": null,
      "meta[property='og:title']": null,
      h1: "Sponsored results related to your search"
    },
    title: "Keep shopping"
  });
  assert.strictEqual(detectProductTitle(doc), null);
});

test("too-short junk rejected", () => {
  const doc = fakeDoc({
    elements: { "#productTitle": "ab", "h1": "cd ef" },
    title: ""
  });
  assert.strictEqual(detectProductTitle(doc), null);
});

test("second amazon product shape works", () => {
  const doc = fakeDoc({
    elements: {
      "#productTitle":
        " boAt Rockerz 550 Bluetooth Over Ear Headphones with Mic (Black) "
    }
  });
  assert.strictEqual(
    detectProductTitle(doc),
    "boAt Rockerz 550 Bluetooth Over Ear Headphones with Mic (Black)"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
