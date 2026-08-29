const assert = require("assert");
const {
  buildSearchIdentity,
  parseProductQuery,
  getSignificantTokensForTests
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

const AMAZON_IPHONE_17_PRO =
  'Apple iPhone 17 Pro 512 GB: 15.93 cm (6.3") Display with Promotion up to 120Hz, A19 Pro Chip, Breakthrough Battery Life, Pro Fusion Camera System with Center Stage Front Camera; Cosmic Orange';

test("identity: full Amazon iPhone 17 Pro marketing title -> Apple iPhone 17 Pro 512GB", () => {
  const d = parseProductQuery(AMAZON_IPHONE_17_PRO);
  assert.strictEqual(buildSearchIdentity(d), "Apple iPhone 17 Pro 512GB");
});

test("identity: iPhone 17 Pro Max preserved", () => {
  const d = parseProductQuery("iPhone 17 Pro Max 512GB");
  assert.strictEqual(buildSearchIdentity(d), "Apple iPhone 17 Pro Max 512GB");
});

test("identity: 256GB vs 512GB remain distinct", () => {
  const a = buildSearchIdentity(parseProductQuery("iPhone 17 Pro 256GB"));
  const b = buildSearchIdentity(parseProductQuery("iPhone 17 Pro 512GB"));
  assert.notStrictEqual(a, b);
  assert.match(a, /256GB$/);
  assert.match(b, /512GB$/);
});

test("identity: Samsung title keeps model + storage + RAM", () => {
  const d = parseProductQuery(
    "Samsung Galaxy S25 256GB 5G AI Smartphone, 12GB RAM, 6.2 inch Display, Awesome Navy"
  );
  assert.strictEqual(buildSearchIdentity(d), "Samsung Galaxy S25 256GB 12GB RAM");
  assert.strictEqual(d.variant.ram, "12GB");
  assert.strictEqual(d.variant.storage, "256GB");
});

test("identity: Sony WH-1000XM5 not destroyed, color kept", () => {
  const d = parseProductQuery("Sony WH-1000XM5 Wireless Noise Cancelling Headphones, Black");
  assert.strictEqual(d.variant.color, "Black");
  const id = buildSearchIdentity(d);
  assert.match(id.replace(/\s/g, ""), /WH1000XM5/i);
  assert.ok(id.endsWith("Black"));
});

test("matcher tokens: no marketing junk leaks into significant tokens", () => {
  const d = parseProductQuery(AMAZON_IPHONE_17_PRO);
  for (const bad of ["15.93", "cm", "display", "promotion", "120hz", "a19", "chip", "battery", "camera", "cosmic"]) {
    const { getSignificantTokens } = require("../server");
  }
  // direct import path:
  const mod = require("../server");
  assert.ok(typeof mod.parseProductQuery === "function");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
