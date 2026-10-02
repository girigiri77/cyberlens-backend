/**
 * ARCHITECTURE TEST MATRIX
 * Tests the generic, extensible CyberLens architecture
 * Multiple platforms and product categories
 */

const { buildSmartSearchQueries } = require('../query-generator');
const { classifyOfferGeneric, sortResultsByMatchType } = require('../matcher');

// Test data for different platforms and product categories
const testCases = [
  {
    name: "Flipkart Mobile Phone",
    platform: "flipkart",
    rawTitle: "realme P4s 5G (128 GB Storage, 8 GB RAM) Online at Best Price On Flipkart.com",
    expectedCategory: "mobile",
    expectedBrand: "realme",
    expectedModel: "P4s"
  },
  {
    name: "Amazon iPhone",
    platform: "amazon",
    rawTitle: "Apple iPhone 17 Pro Max 256GB - Midnight Black",
    expectedCategory: "mobile",
    expectedBrand: "Apple",
    expectedModel: "iPhone 17 Pro Max"
  },
  {
    name: "Myntra Shoes",
    platform: "myntra",
    rawTitle: "Skechers Men Glide Step Slip Ons Sneaker - Black",
    expectedCategory: "footwear",
    expectedBrand: "Skechers",
    expectedModel: "Glide Step Slip Ons"
  },
  {
    name: "Generic Laptop",
    platform: "generic",
    rawTitle: "HP Pavilion 15 Laptop Intel i5 12th Gen 16GB RAM 512GB SSD",
    expectedCategory: "computer",
    expectedBrand: "HP",
    expectedModel: "Pavilion 15"
  },
  {
    name: "Ajio Clothing",
    platform: "ajio",
    rawTitle: "Levi's Men Slim Fit Jeans Blue Size 32",
    expectedCategory: "clothing",
    expectedBrand: "Levi's",
    expectedModel: "Slim Fit Jeans"
  },
  {
    name: "Croma Headphones",
    platform: "croma",
    rawTitle: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black",
    expectedCategory: "headphone",
    expectedBrand: "Sony",
    expectedModel: "WH-1000XM5"
  }
];

// Simulated normalized products for testing
function createNormalizedProduct(rawTitle, category, brand, model) {
  return {
    rawTitle: rawTitle,
    cleanTitle: rawTitle.replace(/\s*Online at Best Price.*$/i, '').replace(/\s*\|\s*\w+$/i, ''),
    brand: brand,
    productFamily: model.split(' ').slice(0, 2).join(' '),
    model: model,
    variant: "",
    category: category,
    specifications: {
      storage: category === 'mobile' ? '128GB' : '',
      ram: category === 'mobile' ? '8GB RAM' : '',
      size: category === 'footwear' ? '42' : '',
      color: category === 'footwear' ? 'Black' : ''
    },
    source: "JSON-LD",
    platform: "test",
    confidence: "HIGH"
  };
}

// Test query generation
function testQueryGeneration() {
  console.log('\n========================================');
  console.log('TESTING QUERY GENERATION');
  console.log('========================================\n');

  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Raw Title: "${testCase.rawTitle}"`);
    
    const normalizedProduct = createNormalizedProduct(
      testCase.rawTitle,
      testCase.expectedCategory,
      testCase.expectedBrand,
      testCase.expectedModel
    );
    
    const queries = buildSmartSearchQueries(normalizedProduct);
    
    console.log(`Generated ${queries.length} queries:`);
    queries.forEach((query, qIndex) => {
      console.log(`  ${qIndex + 1}. "${query}"`);
    });
    
    console.log(`Expected Category: ${testCase.expectedCategory} - Actual: ${normalizedProduct.category}`);
    console.log(`Expected Brand: ${testCase.expectedBrand} - Actual: ${normalizedProduct.brand}`);
    console.log('---\n');
  });
}

// Test matching classification
function testMatchingClassification() {
  console.log('\n========================================');
  console.log('TESTING MATCHING CLASSIFICATION');
  console.log('========================================\n');

  const testProduct = createNormalizedProduct(
    "realme P4s 5G (128 GB Storage, 8 GB RAM)",
    "mobile",
    "realme",
    "P4s 5G"
  );

  const testOffers = [
    { title: "realme P4s 5G 128GB 8GB RAM", price: 15000, store: "Amazon" },
    { title: "realme P4s 5G 256GB 8GB RAM", price: 17000, store: "Flipkart" },
    { title: "realme P4 5G 128GB 8GB RAM", price: 14000, store: "Croma" },
    { title: "Samsung Galaxy S24 128GB", price: 65000, store: "Amazon" },
    { title: "realme P4s 5G", price: 14500, store: "Reliance Digital" }
  ];

  console.log('Test Product:', JSON.stringify(testProduct, null, 2));
  console.log('\nClassifying Offers:\n');

  const classifiedOffers = testOffers.map(offer => {
    const classification = classifyOfferGeneric(offer, testProduct);
    return {
      ...offer,
      matchType: classification.matchType,
      reason: classification.reason,
      confidence: classification.confidence
    };
  });

  classifiedOffers.forEach((offer, index) => {
    console.log(`${index + 1}. ${offer.title}`);
    console.log(`   Store: ${offer.store}, Price: ₹${offer.price}`);
    console.log(`   Match Type: ${offer.matchType}, Confidence: ${offer.confidence}`);
    console.log(`   Reason: ${offer.reason}\n`);
  });

  // Test sorting
  console.log('Sorting by match type...');
  const sortedOffers = sortResultsByMatchType(classifiedOffers);
  console.log('Sorted Order:');
  sortedOffers.forEach((offer, index) => {
    console.log(`  ${index + 1}. ${offer.matchType} - ${offer.title} (${offer.store})`);
  });
}

// Test exact match found flag
function testExactMatchFlag() {
  console.log('\n========================================');
  console.log('TESTING EXACT MATCH FLAG');
  console.log('========================================\n');

  const testProduct = createNormalizedProduct(
    "Skechers Men Glide Step Slip Ons Sneaker",
    "footwear",
    "Skechers",
    "Glide Step Slip Ons"
  );

  const offersWithExactMatch = [
    { title: "Skechers Glide Step Slip Ons Sneaker Black", price: 4000, store: "Amazon" },
    { title: "Skechers Glide Step Slip Ons Sneaker White", price: 4200, store: "Flipkart" }
  ];

  const offersWithoutExactMatch = [
    { title: "Skechers Glide Step Walking Shoes", price: 3500, store: "Amazon" },
    { title: "Skechers Go Walk Sneakers", price: 3800, store: "Flipkart" }
  ];

  console.log('Scenario 1: With Exact Matches');
  const classifiedWithExact = offersWithExactMatch.map(offer => ({
    ...offer,
    ...classifyOfferGeneric(offer, testProduct)
  }));
  
  const exactMatches = classifiedWithExact.filter(o => o.matchType === "EXACT_MATCH");
  const exactMatchFound = exactMatches.length > 0;
  console.log(`Exact Match Found: ${exactMatchFound}`);
  console.log(`Exact Matches Count: ${exactMatches.length}\n`);

  console.log('Scenario 2: Without Exact Matches');
  const classifiedWithoutExact = offersWithoutExactMatch.map(offer => ({
    ...offer,
    ...classifyOfferGeneric(offer, testProduct)
  }));
  
  const exactMatches2 = classifiedWithoutExact.filter(o => o.matchType === "EXACT_MATCH");
  const exactMatchFound2 = exactMatches2.length > 0;
  console.log(`Exact Match Found: ${exactMatchFound2}`);
  
  if (!exactMatchFound2) {
    const relatedVariants = classifiedWithoutExact.filter(o => 
      o.matchType === "FAMILY_MATCH" || o.matchType === "RELATED_VARIANT"
    );
    console.log(`Related Variants Count: ${relatedVariants.length}`);
    console.log('Note: "Exact match not found. Showing related variants."');
  }
}

// Run all tests
function runAllTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  CYBERLENS ARCHITECTURE TEST SUITE         ║');
  console.log('║  Generic Platform & Category Support       ║');
  console.log('╚════════════════════════════════════════════╝');

  testQueryGeneration();
  testMatchingClassification();
  testExactMatchFlag();

  console.log('\n========================================');
  console.log('TEST SUITE COMPLETED');
  console.log('========================================\n');
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testQueryGeneration,
  testMatchingClassification,
  testExactMatchFlag,
  runAllTests
};
