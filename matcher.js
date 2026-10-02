/**
 * GENERIC PRODUCT MATCHING SYSTEM
 * Universal matching with EXACT_MATCH, FAMILY_MATCH, RELATED_VARIANT, UNRELATED classification
 */

function classifyOfferGeneric(offer, normalizedProduct) {
  if (!offer || !normalizedProduct) {
    return {
      matchType: "UNRELATED",
      reason: "Invalid input",
      confidence: "LOW"
    };
  }

  const offerTitle = offer.title || "";
  const category = normalizedProduct.category || "general";
  const brand = normalizedProduct.brand || "";
  const productFamily = normalizedProduct.productFamily || "";
  const model = normalizedProduct.model || "";
  const specs = normalizedProduct.specifications || {};

  console.log("[MATCHER] Classifying offer:", offerTitle);
  console.log("[MATCHER] Against product:", JSON.stringify(normalizedProduct));

  // Normalize both titles for comparison
  const normalizedOfferTitle = normalizeForComparison(offerTitle);
  const normalizedProductTitle = normalizeForComparison(normalizedProduct.cleanTitle || "");

  // Check for brand match
  const brandMatch = brand && normalizedOfferTitle.includes(normalizeForComparison(brand));
  console.log("[MATCHER] Brand match:", brandMatch);

  // Check for product family match
  const familyMatch = productFamily && normalizedOfferTitle.includes(normalizeForComparison(productFamily));
  console.log("[MATCHER] Family match:", familyMatch);

  // Check for model match
  const modelMatch = model && normalizedOfferTitle.includes(normalizeForComparison(model));
  console.log("[MATCHER] Model match:", modelMatch);

  // Check specification matches
  const specMatches = checkSpecificationMatches(normalizedOfferTitle, specs, category);
  console.log("[MATCHER] Spec matches:", JSON.stringify(specMatches));

  // Calculate token similarity
  const similarity = calculateTokenSimilarity(normalizedOfferTitle, normalizedProductTitle);
  console.log("[MATCHER] Token similarity:", similarity);

  // Apply category-specific matching rules
  const classification = applyCategoryRules(
    brandMatch,
    familyMatch,
    modelMatch,
    specMatches,
    similarity,
    category
  );

  console.log("[MATCHER] Final classification:", classification.matchType, classification.reason);
  return classification;
}

function normalizeForComparison(text) {
  if (!text) return "";
  
  return String(text)
    .toLowerCase()
    .replace(/[-–—]/g, " ")  // Convert hyphens/dashes to spaces
    .replace(/['']/g, "")   // Remove apostrophes
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkSpecificationMatches(offerTitle, specs, category) {
  const matches = {
    storage: false,
    ram: false,
    size: false,
    color: false,
    display: false,
    conflicts: []
  };

  const lowerTitle = offerTitle.toLowerCase();

  // Storage match (exclude RAM/memory values)
  if (specs.storage) {
    const storagePattern = new RegExp(`\\b${specs.storage.toLowerCase()}\\b`);
    // Check if the match is not followed by RAM/memory
    const storageMatches = lowerTitle.match(storagePattern) || [];
    for (const match of storageMatches) {
      const matchIndex = lowerTitle.indexOf(match);
      const afterMatch = lowerTitle.slice(matchIndex + match.length).trim().split(/\s+/)[0];
      if (!/^(ram|memory)$/i.test(afterMatch)) {
        matches.storage = true;
        break;
      }
    }
    
    // Check for conflicting storage (exclude RAM/memory values)
    // Use a more precise regex to find GB/TB values that are NOT followed by RAM/memory
    const storageOnlyPattern = /\b(\d{1,4}(?:gb|tb))(?!\s*(?:ram|memory))/gi;
    const storageConflicts = lowerTitle.match(storageOnlyPattern) || [];
    for (const conflict of storageConflicts) {
      const conflictLower = conflict.toLowerCase();
      if (conflictLower !== specs.storage.toLowerCase()) {
        matches.conflicts.push(`storage: ${conflict} vs ${specs.storage}`);
      }
    }
  }

  // RAM match
  if (specs.ram) {
    const ramPattern = new RegExp(`\\b${specs.ram.toLowerCase()}\\b`);
    matches.ram = ramPattern.test(lowerTitle);
    
    // Check for conflicting RAM
    const ramConflicts = lowerTitle.match(/\b(\d{1,3}gb\s+ram)\b/gi) || [];
    for (const conflict of ramConflicts) {
      if (conflict.toLowerCase() !== specs.ram.toLowerCase()) {
        matches.conflicts.push(`ram: ${conflict} vs ${specs.ram}`);
      }
    }
  }

  // Size match (for clothing/footwear)
  if (specs.size && (category === "footwear" || category === "clothing")) {
    const sizePattern = new RegExp(`\\b${specs.size.toLowerCase()}\\b`);
    matches.size = sizePattern.test(lowerTitle);
  }

  // Color match (optional for most categories)
  if (specs.color && category !== "footwear") {
    const colorPattern = new RegExp(`\\b${specs.color.toLowerCase()}\\b`);
    matches.color = colorPattern.test(lowerTitle);
  }

  // Display match (for electronics)
  if (specs.display) {
    const displayPattern = new RegExp(`\\b${specs.display.toLowerCase()}\\b`);
    matches.display = displayPattern.test(lowerTitle);
  }

  return matches;
}

function calculateTokenSimilarity(title1, title2) {
  const tokens1 = new Set(title1.split(/\s+/).filter(t => t.length >= 2));
  const tokens2 = new Set(title2.split(/\s+/).filter(t => t.length >= 2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

function applyCategoryRules(brandMatch, familyMatch, modelMatch, specMatches, similarity, category) {
  // Check for specification conflicts first
  if (specMatches.conflicts.length > 0) {
    return {
      matchType: "UNRELATED",
      reason: `Specification conflicts: ${specMatches.conflicts.join(", ")}`,
      confidence: "HIGH"
    };
  }

  // Category-specific rules
  switch (category) {
    case "mobile":
      return applyMobileRules(brandMatch, familyMatch, modelMatch, specMatches, similarity);
    case "computer":
      return applyComputerRules(brandMatch, familyMatch, modelMatch, specMatches, similarity);
    case "footwear":
      return applyFootwearRules(brandMatch, familyMatch, modelMatch, specMatches, similarity);
    case "clothing":
      return applyClothingRules(brandMatch, familyMatch, modelMatch, specMatches, similarity);
    default:
      return applyGenericRules(brandMatch, familyMatch, modelMatch, specMatches, similarity);
  }
}

function applyMobileRules(brandMatch, familyMatch, modelMatch, specMatches, similarity) {
  // EXACT_MATCH: Brand + model + storage match
  if (brandMatch && modelMatch && specMatches.storage) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, model, and storage match",
      confidence: "HIGH"
    };
  }

  // EXACT_MATCH: Brand + family + storage match (when model not available)
  if (brandMatch && familyMatch && specMatches.storage) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, family, and storage match",
      confidence: "HIGH"
    };
  }

  // FAMILY_MATCH: Brand + model match (storage not verified)
  if (brandMatch && modelMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and model match, storage not verified",
      confidence: "MEDIUM"
    };
  }

  // FAMILY_MATCH: Brand + family match
  if (brandMatch && familyMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and family match",
      confidence: "MEDIUM"
    };
  }

  // RELATED_VARIANT: Brand match only
  if (brandMatch && similarity >= 0.3) {
    return {
      matchType: "RELATED_VARIANT",
      reason: "Brand match with partial similarity",
      confidence: "LOW"
    };
  }

  // UNRELATED: No brand match or low similarity
  return {
    matchType: "UNRELATED",
    reason: "Insufficient brand or model match",
    confidence: "LOW"
  };
}

function applyComputerRules(brandMatch, familyMatch, modelMatch, specMatches, similarity) {
  // EXACT_MATCH: Brand + model + key specs (RAM + storage)
  if (brandMatch && modelMatch && specMatches.ram && specMatches.storage) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, model, RAM, and storage match",
      confidence: "HIGH"
    };
  }

  // EXACT_MATCH: Brand + model + storage
  if (brandMatch && modelMatch && specMatches.storage) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, model, and storage match",
      confidence: "HIGH"
    };
  }

  // FAMILY_MATCH: Brand + model match
  if (brandMatch && modelMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and model match",
      confidence: "MEDIUM"
    };
  }

  // FAMILY_MATCH: Brand + family match
  if (brandMatch && familyMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and family match",
      confidence: "MEDIUM"
    };
  }

  // RELATED_VARIANT: Brand match with good similarity
  if (brandMatch && similarity >= 0.4) {
    return {
      matchType: "RELATED_VARIANT",
      reason: "Brand match with good similarity",
      confidence: "LOW"
    };
  }

  return {
    matchType: "UNRELATED",
    reason: "Insufficient match",
    confidence: "LOW"
  };
}

function applyFootwearRules(brandMatch, familyMatch, modelMatch, specMatches, similarity) {
  // EXACT_MATCH: Brand + model match (footwear rarely has storage/RAM specs)
  if (brandMatch && modelMatch) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand and model match",
      confidence: "HIGH"
    };
  }

  // EXACT_MATCH: Brand + family match with high similarity
  if (brandMatch && familyMatch && similarity >= 0.7) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand and family match with high similarity",
      confidence: "HIGH"
    };
  }

  // FAMILY_MATCH: Brand + family match
  if (brandMatch && familyMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and family match",
      confidence: "MEDIUM"
    };
  }

  // RELATED_VARIANT: Brand match with moderate similarity
  if (brandMatch && similarity >= 0.4) {
    return {
      matchType: "RELATED_VARIANT",
      reason: "Brand match with moderate similarity",
      confidence: "LOW"
    };
  }

  return {
    matchType: "UNRELATED",
    reason: "Insufficient match",
    confidence: "LOW"
  };
}

function applyClothingRules(brandMatch, familyMatch, modelMatch, specMatches, similarity) {
  // EXACT_MATCH: Brand + model + size match
  if (brandMatch && modelMatch && specMatches.size) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, model, and size match",
      confidence: "HIGH"
    };
  }

  // EXACT_MATCH: Brand + model match
  if (brandMatch && modelMatch) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand and model match",
      confidence: "HIGH"
    };
  }

  // FAMILY_MATCH: Brand + family match
  if (brandMatch && familyMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and family match",
      confidence: "MEDIUM"
    };
  }

  // RELATED_VARIANT: Brand match with similarity
  if (brandMatch && similarity >= 0.3) {
    return {
      matchType: "RELATED_VARIANT",
      reason: "Brand match with similarity",
      confidence: "LOW"
    };
  }

  return {
    matchType: "UNRELATED",
    reason: "Insufficient match",
    confidence: "LOW"
  };
}

function applyGenericRules(brandMatch, familyMatch, modelMatch, specMatches, similarity) {
  // EXACT_MATCH: Brand + model + key specs
  if (brandMatch && modelMatch && (specMatches.storage || specMatches.size)) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand, model, and key specifications match",
      confidence: "HIGH"
    };
  }

  // EXACT_MATCH: Brand + model match
  if (brandMatch && modelMatch && similarity >= 0.6) {
    return {
      matchType: "EXACT_MATCH",
      reason: "Brand and model match with good similarity",
      confidence: "HIGH"
    };
  }

  // FAMILY_MATCH: Brand + family match
  if (brandMatch && familyMatch) {
    return {
      matchType: "FAMILY_MATCH",
      reason: "Brand and family match",
      confidence: "MEDIUM"
    };
  }

  // RELATED_VARIANT: Brand match with similarity
  if (brandMatch && similarity >= 0.3) {
    return {
      matchType: "RELATED_VARIANT",
      reason: "Brand match with similarity",
      confidence: "LOW"
    };
  }

  return {
    matchType: "UNRELATED",
    reason: "Insufficient match",
    confidence: "LOW"
  };
}

function sortResultsByMatchType(results) {
  const matchTypeOrder = {
    "EXACT_MATCH": 1,
    "FAMILY_MATCH": 2,
    "RELATED_VARIANT": 3,
    "UNRELATED": 4
  };

  return results.sort((a, b) => {
    const orderA = matchTypeOrder[a.matchType] || 999;
    const orderB = matchTypeOrder[b.matchType] || 999;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Within same match type, sort by price
    return (a.price || Infinity) - (b.price || Infinity);
  });
}

// Export for use in server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyOfferGeneric,
    normalizeForComparison,
    checkSpecificationMatches,
    calculateTokenSimilarity,
    applyCategoryRules,
    applyMobileRules,
    applyComputerRules,
    applyFootwearRules,
    applyClothingRules,
    applyGenericRules,
    sortResultsByMatchType
  };
}
