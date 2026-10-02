const assert = require("assert");
const {
  parseProductQuery,
  classifyOffer,
  extractSerpOffers,
  dedupeOffers,
  runNonTechCompare,
  buildSmartSearchQueries,
  classifyOfferGeneric,
  detectProductCategory
} = require("../server");

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

/* ===== STORE NORMALIZATION ===== */

test("store names normalized for known merchants", () => {
  const offers = extractSerpOffers([
    { title: "Apple iPhone 16 Plus 256GB", product_link: "https://a.in/x", source: "Amazon.in", extracted_price: 89900 },
    { title: "Apple iPhone 16 Plus 256GB Teal", product_link: "https://f.in/x", source: "Flipkart", extracted_price: 88999 },
    { title: "Apple iPhone 16 Plus 256GB White", product_link: "https://c.in/x", source: "Croma Retail", extracted_price: 90499 }
  ]);
  assert.deepStrictEqual(
    offers.map((o) => o.store),
    ["Amazon", "Flipkart", "Croma"]
  );
});

test("unknown store name passes through untouched", () => {
  const offers = extractSerpOffers([
    { title: "Apple iPhone 16 Plus 256GB", product_link: "https://x.in/i", source: "Some Local Shop", extracted_price: 91000 }
  ]);
  assert.strictEqual(offers[0].store, "Some Local Shop");
});

/* ===== iPHONE 16 PLUS 256GB VARIANT MATRIX ===== */

const iphone16Plus = parseProductQuery("Apple iPhone 16 Plus 256 GB");

test("parse: iPhone 16 Plus 256 GB detected correctly", () => {
  assert.strictEqual(iphone16Plus.brand, "Apple");
  assert.strictEqual(iphone16Plus.name, "iPhone 16 Plus");
  assert.strictEqual(iphone16Plus.variant.storage, "256GB");
});

test("match matrix per spec", () => {
  const cases = [
    ["Apple iPhone 16 Plus 256 GB Teal", "exact"],
    ["iPhone 16 Plus 256 GB", "exact"],
    ["APPLE iPhone 16 Plus 256GB Blue", "exact"],
    ["APPLE iPhone16 256GB Blue", "reject"],
    ["iPhone 16 Plus 128 GB", "reject"],
    ["iPhone 16 Plus 512 GB", "reject"],
    ["iPhone 16 Pro 256 GB", "variant-mismatch"],
    ["iPhone 16 Pro Max 256 GB", "variant-mismatch"],
    ["iPhone 16 256 GB", "variant-mismatch"],
    ["iPhone 15 Plus 256 GB", "reject"]
  ];
  for (const [title, expected] of cases) {
    const got = classifyOffer({ title }, iphone16Plus);
    assert.strictEqual(got, expected, `title: ${title}`);
  }
});

test("accessories and second-hand rejected at extraction", () => {
  const offers = extractSerpOffers([
    { title: "iPhone 16 Plus Case Clear Cover", product_link: "https://x/1", source: "AccShop", extracted_price: 499 },
    { title: "Refurbished iPhone 16 Plus 256GB", product_link: "https://x/2", source: "RefurbShop", extracted_price: 60000 },
    { title: "Used Apple iPhone 16 Plus 256GB", product_link: "https://x/3", source: "UsedShop", extracted_price: 55000, second_hand_condition: "pre-owned" },
    { title: "iPhone 16 Plus Display Unit Spare Part", product_link: "https://x/4", source: "PartsShop", extracted_price: 12000 },
    { title: "Apple iPhone 16 Plus 256GB Black", product_link: "https://x/5", source: "RealShop", extracted_price: 89900 }
  ]);
  assert.strictEqual(offers.length, 1);
  assert.strictEqual(offers[0].price, 89900);
});

test("URL fallback: works without link field", () => {
  const offers = extractSerpOffers([
    { title: "Apple iPhone 16 Plus 256 GB", product_link: "https://g.co/shop/p1", source: "Croma", price: "\u20B990,499" }
  ]);
  assert.strictEqual(offers.length, 1);
  assert.strictEqual(offers[0].url, "https://g.co/shop/p1");
});

test("dedupe collapses same store/title/price", () => {
  const out = dedupeOffers([
    { store: "Flipkart", title: "iPhone 16 Plus 256GB", price: 88999 },
    { store: "Flipkart", title: "iPhone 16 Plus  256GB!", price: 88999 },
    { store: "Flipkart", title: "iPhone 16 Plus 256GB", price: 89999 }
  ]);
  assert.strictEqual(out.length, 2);
});

/* ===== END TO END (MOCKED SERP - MULTI-MERCHANT) ===== */

const MOCK_SHOPPING_RESULTS = [
  { title: "Apple iPhone 16 Plus 256 GB Teal", product_link: "https://m1/p", source: "Amazon.in", extracted_price: 89900, price: "\u20B989,900", thumbnail: "img1" },
  { title: "Apple iPhone 16 Plus 256 GB (Teal)", product_link: "https://m2/p", source: "Flipkart", extracted_price: 88999, price: "\u20B988,999", thumbnail: "img2" },
  { title: "APPLE iPhone 16 Plus 256GB White", product_link: "https://m3/p", source: "Croma Retail", extracted_price: 90499, price: "\u20B990,499", thumbnail: "img3" },
  { title: "Apple iPhone 16 Plus 256 GB Black", product_link: "https://m4/p", source: "Reliance Digital", extracted_price: 91200, price: "\u20B991,200", thumbnail: "img4" },
  { title: "Apple iPhone 16 Plus 256GB", product_link: "https://m5/p", source: "Apple", extracted_price: 89900, price: "\u20B989,900", thumbnail: "img5" },
  { title: "iPhone 16 Pro 256 GB Titanium", product_link: "https://m6/p", source: "Vijay Sales", extracted_price: 105000, price: "\u20B91,05,000" },
  { title: "iPhone 16 Plus 128 GB Green", product_link: "https://m7/p", source: "Poorvika", extracted_price: 79900, price: "\u20B979,900" },
  { title: "iPhone 16 Plus 512 GB Silver", product_link: "https://m8/p", source: "Hindustan Trading", extracted_price: 99900, price: "\u20B999,900" },
  { title: "Renewed iPhone 16 Plus 256GB", product_link: "https://m9/p", source: "Ovantica", extracted_price: 70000, price: "\u20B970,000" },
  { title: "iPhone 16 Plus Back Cover", product_link: "https://m10/p", source: "CaseZone", extracted_price: 299, price: "\u20B9299" },
  { title: "No price iPhone 16 Plus listing", product_link: "https://m11/p", source: "MysteryShop" },
  { title: "Apple iPhone 16 Plus 256 GB US Variant", product_link: "https://m12/p", source: "ImportShop", extracted_price: 1079, price: "$1079" }
];

awaitTest();

async function awaitTest() {

  await testAsync("e2e: cheapest exact across multiple real-shaped merchants", async () => {

    const result = await runNonTechCompare("Apple iPhone 16 Plus 256 GB", {
      serpSearch: async () => MOCK_SHOPPING_RESULTS
    });

    assert.strictEqual(result.success, true);

    assert.strictEqual(result.detectedProduct.brand, "Apple");
    assert.strictEqual(result.detectedProduct.name, "iPhone 16 Plus");
    assert.strictEqual(result.detectedProduct.variant.storage, "256GB");

    assert.strictEqual(result.bestPrice.price, 88999);
    assert.strictEqual(result.bestPrice.store, "Flipkart");
    assert.strictEqual(result.bestPrice.currency, "INR");
    assert.ok(result.bestPrice.image || result.offers.some((o) => o.image));

    const stores = result.offers.map((o) => o.store);
    assert.ok(new Set(stores).size >= 4, `expected merchant diversity, got ${stores.join(",")}`);
    assert.ok(!stores.includes("ImportShop"), "USD offer must not be in INR offers");

    for (const offer of result.offers) {
      assert.strictEqual(offer.matchType, "exact", offer.title);
      assert.ok(!/\b(pro|max)\b/i.test(offer.title), `wrong variant leaked: ${offer.title}`);
      assert.ok(!/128\s?gb|512\s?gb/i.test(offer.title), `wrong storage leaked: ${offer.title}`);
      assert.ok(!/case|cover|renewed|refurbished/i.test(offer.title), `junk leaked: ${offer.title}`);
    }

    const prices = result.offers.map((o) => o.price);
    assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b));

    assert.strictEqual(result.meta.otherCurrencyExcluded, 1);
    assert.ok(result.meta.exactMatches >= 5);

    assert.strictEqual(result.product, "iPhone 16 Plus");
    assert.strictEqual(result.best.site, "Flipkart");

  });

  await testAsync("e2e: no valid matches -> friendly failure", async () => {
    const r = await runNonTechCompare("iPhone 16 Plus 256GB", { serpSearch: async () => [] });
    assert.strictEqual(r.success, false);
    assert.match(r.error, /couldn't find reliable matching product listings/i);
  });

  await testAsync("e2e: undetectable query fails at detect stage", async () => {
    const r = await runNonTechCompare("!!! ???", { serpSearch: async () => [] });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.stage, "detect");
  });

  await testAsync("e2e: SERP error code propagates", async () => {
    await assert.rejects(
      runNonTechCompare("iPhone 16 Plus 256GB", {
        serpSearch: async () => {
          throw Object.assign(new Error("bad key"), { code: "INVALID_KEY" });
        }
      }),
      (err) => err.code === "INVALID_KEY"
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);

}
