/**
 * GENERIC PRODUCT NORMALIZER
 * Universal noise removal and product normalization for any platform
 */

function normalizeProduct(rawProduct) {
  if (!rawProduct || !rawProduct.productName) {
    return null;
  }

  const platform = rawProduct.platform || "unknown";
  const rawTitle = rawProduct.productName;

  console.log("[NORMALIZER] Platform:", platform);
  console.log("[NORMALIZER] Raw title:", rawTitle);

  // Step 1: Extract important specifications before any cleanup
  const specs = extractSpecifications(rawTitle);
  console.log("[NORMALIZER] Extracted specs:", JSON.stringify(specs));

  // Step 2: Remove marketplace noise (generic patterns)
  let cleanTitle = removeMarketplaceNoise(rawTitle, platform);
  console.log("[NORMALIZER] After noise removal:", cleanTitle);

  // Step 3: Remove marketing noise
  cleanTitle = removeMarketingNoise(cleanTitle);
  console.log("[NORMALIZER] After marketing removal:", cleanTitle);

  // Step 4: Normalize spacing and formatting
  cleanTitle = normalizeFormatting(cleanTitle);
  console.log("[NORMALIZER] After formatting:", cleanTitle);

  // Step 5: Detect category
  const category = detectCategory(cleanTitle, specs);
  console.log("[NORMALIZER] Detected category:", category);

  // Step 6: Build normalized product object
  const normalized = buildNormalizedProduct(cleanTitle, rawProduct, specs, category);
  console.log("[NORMALIZER] Final normalized product:", JSON.stringify(normalized));

  return normalized;
}

function extractSpecifications(title) {
  const specs = {
    storage: "",
    ram: "",
    size: "",
    color: "",
    capacity: "",
    display: "",
    processor: "",
    generation: "",
    version: "",
    model: ""
  };

  const lowerTitle = title.toLowerCase();

  // Extract storage (GB/TB) - preserve these
  const storageMatch = lowerTitle.match(/(\d{1,4})\s*(gb|tb)\s*(storage)?/i);
  if (storageMatch) {
    specs.storage = `${storageMatch[1]}${storageMatch[2].toUpperCase()}`;
  }

  // Extract RAM - preserve these
  const ramMatch = lowerTitle.match(/(\d{1,3})\s*gb\s*(ram|memory)/i);
  if (ramMatch) {
    specs.ram = `${ramMatch[1]}GB RAM`;
  }

  // Extract size (for clothing/shoes)
  const sizeMatch = lowerTitle.match(/(uk|us|eu|ind)\s*(\d{1,2}(?:\.\d)?)/i);
  if (sizeMatch) {
    specs.size = `${sizeMatch[1].toUpperCase()} ${sizeMatch[2]}`;
  } else {
    // Generic size
    const genericSizeMatch = lowerTitle.match(/\b(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\b/i);
    if (genericSizeMatch) {
      specs.size = genericSizeMatch[1].toUpperCase();
    }
  }

  // Extract color - preserve for matching but don't make mandatory
  const colorWords = [
    "black", "white", "blue", "red", "green", "yellow", "pink", "purple",
    "violet", "orange", "brown", "grey", "gray", "silver", "gold", "beige",
    "titanium", "midnight", "starlight", "coral", "mint", "navy", "maroon",
    "teal", "copper", "bronze", "rose", "champagne", "graphite", "sierra"
  ];
  
  for (const color of colorWords) {
    if (lowerTitle.includes(color)) {
      specs.color = color.charAt(0).toUpperCase() + color.slice(1);
      break;
    }
  }

  // Extract display size (for electronics)
  const displayMatch = lowerTitle.match(/(\d{1,2}(?:\.\d)?)\s*(inch|in|\"|cm)/i);
  if (displayMatch) {
    specs.display = `${displayMatch[1]}${displayMatch[2].toLowerCase()}`;
  }

  // Extract generation/version
  const genMatch = lowerTitle.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(generation|gen|version|ver|v)/i);
  if (genMatch) {
    specs.generation = `${genMatch[1]}${genMatch[2].charAt(0).toUpperCase()}`;
  }

  // Extract model number patterns
  const modelMatch = title.match(/\b([A-Z]{1,3}\d{2,4}[A-Z]?)\b/);
  if (modelMatch) {
    specs.model = modelMatch[1];
  }

  return specs;
}

function removeMarketplaceNoise(title, platform) {
  let clean = title;

  // Generic marketplace suffix patterns (not hardcoded to specific platforms)
  const noisePatterns = [
    // Generic "online" patterns
    /\bonline\s+(at\s+)?best\s+price\b/gi,
    /\bbest\s+price\b/gi,
    /\bbuy\s+online\b/gi,
    /\bshop\s+online\b/gi,
    
    // Platform name patterns (dynamic)
    new RegExp(`\\bon\\s+${escapeRegex(platform)}\\b`, 'gi'),
    new RegExp(`\\b${escapeRegex(platform)}\\.com\\b`, 'gi'),
    new RegExp(`\\b${escapeRegex(platform)}\\.in\\b`, 'gi'),
    
    // Generic website patterns
    /\s*\|\s*\w+\s*$/gi,  // " | Website Name"
    /\s*-\s*\w+\s*$/gi,   // " - Website Name"
    /\s*:\s*\w+\s*$/gi,   // " : Website Name"
    
    // Generic suffixes
    /\s*\|\s*[^|]{0,20}$/gi,  // " | anything at end"
    /\s*-\s*[^-]{0,20}$/gi,   // " - anything at end"
    
    // Common ecommerce noise
    /\bfree\s+delivery\b/gi,
    /\bcash\s+on\s+delivery\b/gi,
    /\bemi\s+available\b/gi,
    /\bbank\s+offer\b/gi,
    /\bspecial\s+offer\b/gi,
    /\blimited\s+offer\b/gi,
    /\bexclusive\s+deal\b/gi,
    
    // Generic promotional noise
    /\bdeal\s+of\s+the\s+day\b/gi,
    /\btoday's\s+deal\b/gi,
    /\bflash\s+sale\b/gi,
    /\bclearance\s+sale\b/gi,
  ];

  for (const pattern of noisePatterns) {
    clean = clean.replace(pattern, " ");
  }

  // Clean up multiple spaces
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

function removeMarketingNoise(title) {
  let clean = title;

  // Generic marketing noise patterns
  const marketingPatterns = [
    /\bbest\s+seller\b/gi,
    /\btop\s+rated\b/gi,
    /\bmost\s+popular\b/gi,
    /\btrending\b/gi,
    /\bfeatured\b/gi,
    /\brecommended\b/gi,
    /\baward\s+winning\b/gi,
    /\bcertified\b/gi,
    /\bgenuine\b/gi,
    /\bauthentic\b/gi,
    /\boriginal\b/gi,
    /\bpremium\s+quality\b/gi,
    /\bhigh\s+quality\b/gi,
    /\bnew\s+arrival\b/gi,
    /\blastest\s+model\b/gi,
    /\bnew\s+launch\b/gi,
    /\bexclusive\b/gi,
    /\blimited\s+edition\b/gi,
    /\bspecial\s+edition\b/gi,
    /\bcollectors?\s+edition\b/gi,
  ];

  for (const pattern of marketingPatterns) {
    clean = clean.replace(pattern, " ");
  }

  // Remove generic descriptive phrases that don't identify the product
  const descriptivePatterns = [
    /\bwith\s+free\s+\w+\b/gi,
    /\bincludes\s+\w+\b/gi,
    /\bcomes\s+with\b/gi,
    /\bpacked\s+with\b/gi,
    /\bloaded\s+with\b/gi,
  ];

  for (const pattern of descriptivePatterns) {
    clean = clean.replace(pattern, " ");
  }

  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

function normalizeFormatting(title) {
  let clean = title;

  // Remove extra spaces
  clean = clean.replace(/\s+/g, " ").trim();

  // Normalize storage/RAM spacing (e.g., "256 GB" -> "256GB")
  clean = clean.replace(/\b(\d+)\s+(GB|TB)\b/gi, "$1$2");

  // Normalize model spacing (e.g., "iPhone 16" -> "iPhone 16")
  // Keep single spaces between words

  // Remove trailing/leading punctuation
  clean = clean.replace(/^[^\w]+|[^\w]+$/g, "");

  return clean;
}

function detectCategory(title, specs) {
  const lowerTitle = title.toLowerCase();

  // Category detection based on keywords and specifications
  const categories = {
    mobile: /phone|smartphone|mobile|iphone|galaxy|pixel|oneplus|vivo|oppo|realme|xiaomi|redmi|poco|moto|motorola/i,
    computer: /laptop|notebook|macbook|thinkpad|pavilion|inspiron|chromebook|ultrabook/i,
    tablet: /tablet|ipad|tab|kindle|surface/i,
    headphone: /headphone|earphone|earbud|headset|tws|audio|sound/i,
    watch: /watch|smartwatch|timepiece|fitbit|garmin/i,
    camera: /camera|dslr|mirrorless|lens|photo|video/i,
    television: /tv|television|smart\s+tv|oled|led\s+tv/i,
    footwear: /shoe|sneaker|boot|sandal|slipper|loafer|heel|trainer|athletic|running|walking|hiking/i,
    clothing: /shirt|pant|jean|jacket|dress|skirt|suit|coat|blazer|tshirt|top|kurta|saree|lehenga/i,
    fashion: /fashion|style|wear|outfit|apparel/i,
    beauty: /makeup|cosmetic|skincare|lipstick|foundation|cream|lotion|perfume|fragrance/i,
    appliance: /refrigerator|fridge|washing\s+machine|dishwasher|microwave|oven|blender|mixer|juicer/i,
    furniture: /sofa|bed|table|chair|desk|shelf|cabinet|wardrobe|dresser/i,
    accessory: /case|cover|protector|charger|cable|adapter|stand|holder|mount|strap|band/i,
    electronics: /electronic|gadget|device|tech/i
  };

  // Check each category
  for (const [category, pattern] of Object.entries(categories)) {
    if (pattern.test(lowerTitle)) {
      return category;
    }
  }

  // Fallback: use specifications to infer category
  if (specs.storage || specs.ram) {
    if (specs.display) {
      return "mobile";
    }
    return "computer";
  }

  if (specs.size && (lowerTitle.includes("shoe") || lowerTitle.includes("sneaker"))) {
    return "footwear";
  }

  return "general";
}

function buildNormalizedProduct(cleanTitle, rawProduct, specs, category) {
  const normalized = {
    rawTitle: rawProduct.productName,
    cleanTitle: cleanTitle,
    brand: rawProduct.brand || "",
    productFamily: "",
    model: specs.model || "",
    variant: "",
    category: category,
    specifications: specs,
    source: rawProduct.source || "",
    platform: rawProduct.platform || "",
    confidence: rawProduct.confidence || "LOW",
    extractionDetails: rawProduct.extractionDetails || {}
  };

  // Extract product family and model from clean title
  const familyAndModel = extractFamilyAndModel(cleanTitle, rawProduct.brand, category);
  normalized.productFamily = familyAndModel.family;
  normalized.model = familyAndModel.model || normalized.model;

  // Build variant string
  const variantParts = [];
  if (specs.storage) variantParts.push(specs.storage);
  if (specs.ram) variantParts.push(specs.ram);
  if (specs.size) variantParts.push(specs.size);
  if (specs.color && category !== "footwear") variantParts.push(specs.color); // Color optional for footwear
  if (specs.display) variantParts.push(specs.display);
  
  normalized.variant = variantParts.join(" ");

  return normalized;
}

function extractFamilyAndModel(title, brand, category) {
  const family = "";
  const model = "";

  // Remove brand if present
  let remaining = title;
  if (brand) {
    const brandPattern = new RegExp(`^${escapeRegex(brand)}\\s+`, 'i');
    remaining = remaining.replace(brandPattern, "");
  }

  // Split into tokens
  const tokens = remaining.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length === 0) {
    return { family: "", model: "" };
  }

  // For mobile phones, family is usually first 1-2 tokens
  if (category === "mobile") {
    if (tokens.length >= 2) {
      return {
        family: tokens.slice(0, 2).join(" "),
        model: tokens.join(" ")
      };
    }
    return {
      family: tokens[0],
      model: tokens.join(" ")
    };
  }

  // For laptops, family is first 1-2 tokens
  if (category === "computer") {
    if (tokens.length >= 2) {
      return {
        family: tokens.slice(0, 2).join(" "),
        model: tokens.join(" ")
      };
    }
    return {
      family: tokens[0],
      model: tokens.join(" ")
    };
  }

  // For footwear, family is first 2-3 tokens (preserve model words)
  if (category === "footwear") {
    if (tokens.length >= 3) {
      return {
        family: tokens.slice(0, 3).join(" "),
        model: tokens.join(" ")
      };
    }
    return {
      family: tokens.slice(0, 2).join(" "),
      model: tokens.join(" ")
    };
  }

  // Default: family is first token, model is full remaining
  return {
    family: tokens[0],
    model: tokens.join(" ")
  };
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeProduct,
    extractSpecifications,
    removeMarketplaceNoise,
    removeMarketingNoise,
    normalizeFormatting,
    detectCategory,
    buildNormalizedProduct,
    extractFamilyAndModel
  };
}
