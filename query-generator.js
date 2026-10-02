/**
 * SMART SEARCH QUERY GENERATOR
 * Generates multiple search queries based on structured product fields
 * Supports multiple product categories and platforms
 */

function buildSmartSearchQueries(normalizedProduct) {
  if (!normalizedProduct) {
    console.log("[QUERY_GENERATOR] No normalized product provided");
    return [];
  }

  const queries = [];
  const category = normalizedProduct.category || "general";
  const brand = normalizedProduct.brand || "";
  const productFamily = normalizedProduct.productFamily || "";
  const model = normalizedProduct.model || "";
  const specs = normalizedProduct.specifications || {};

  console.log("[QUERY_GENERATOR] Category:", category);
  console.log("[QUERY_GENERATOR] Brand:", brand);
  console.log("[QUERY_GENERATOR] Product Family:", productFamily);
  console.log("[QUERY_GENERATOR] Model:", model);
  console.log("[QUERY_GENERATOR] Specs:", JSON.stringify(specs));

  // Generate queries based on category-specific rules
  switch (category) {
    case "mobile":
      queries.push(...generateMobileQueries(brand, productFamily, model, specs));
      break;
    case "computer":
      queries.push(...generateComputerQueries(brand, productFamily, model, specs));
      break;
    case "footwear":
      queries.push(...generateFootwearQueries(brand, productFamily, model, specs));
      break;
    case "clothing":
      queries.push(...generateClothingQueries(brand, productFamily, model, specs));
      break;
    case "headphone":
      queries.push(...generateHeadphoneQueries(brand, productFamily, model, specs));
      break;
    case "watch":
      queries.push(...generateWatchQueries(brand, productFamily, model, specs));
      break;
    default:
      queries.push(...generateGenericQueries(brand, productFamily, model, specs));
  }

  // Add fallback queries
  queries.push(...generateFallbackQueries(brand, productFamily, model, category));

  // Remove duplicates and empty queries
  const uniqueQueries = [...new Set(queries.filter(q => q && q.trim().length > 0))];
  
  console.log("[QUERY_GENERATOR] Generated", uniqueQueries.length, "unique queries:", uniqueQueries);
  return uniqueQueries;
}

function generateMobileQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model + important specs (storage, RAM)
  if (brand && model) {
    let primary = `${brand} ${model}`;
    if (specs.storage) primary += ` ${specs.storage}`;
    if (specs.ram) primary += ` ${specs.ram}`;
    queries.push(primary.trim());
  }
  
  // FALLBACK 1: brand + model + storage
  if (brand && model && specs.storage) {
    queries.push(`${brand} ${model} ${specs.storage}`);
  }
  
  // FALLBACK 2: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 3: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 4: model only
  if (model) {
    queries.push(model);
  }
  
  // FALLBACK 5: family only
  if (family) {
    queries.push(family);
  }
  
  return queries;
}

function generateComputerQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model + important specs (CPU, RAM, storage)
  if (brand && model) {
    let primary = `${brand} ${model}`;
    if (specs.processor) primary += ` ${specs.processor}`;
    if (specs.ram) primary += ` ${specs.ram}`;
    if (specs.storage) primary += ` ${specs.storage}`;
    queries.push(primary.trim());
  }
  
  // FALLBACK 1: brand + model + RAM + storage
  if (brand && model) {
    let fallback = `${brand} ${model}`;
    if (specs.ram) fallback += ` ${specs.ram}`;
    if (specs.storage) fallback += ` ${specs.storage}`;
    queries.push(fallback.trim());
  }
  
  // FALLBACK 2: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 3: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 4: model only
  if (model) {
    queries.push(model);
  }
  
  return queries;
}

function generateFootwearQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + full model (preserve model words like "Glide Step Slip Ons")
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 1: brand + family (preserve 2-3 model words)
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 2: brand + core model tokens (first 2-3 significant words)
  if (brand && model) {
    const tokens = model.split(/\s+/);
    const significantTokens = tokens.filter(t => 
      t.length > 2 && 
      !/^(men|women|kids|boy|girl|unisex|with|for|and|the|a|an|on|slip)$/i.test(t)
    );
    
    if (significantTokens.length >= 3) {
      queries.push(`${brand} ${significantTokens.slice(0, 3).join(" ")}`);
    }
    if (significantTokens.length >= 2) {
      queries.push(`${brand} ${significantTokens.slice(0, 2).join(" ")}`);
    }
  }
  
  // FALLBACK 3: brand + family + category
  if (brand && family) {
    queries.push(`${brand} ${family} shoes`);
  }
  
  // FALLBACK 4: model only
  if (model) {
    queries.push(model);
  }
  
  // FALLBACK 5: family only
  if (family) {
    queries.push(family);
  }
  
  return queries;
}

function generateClothingQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 1: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 2: brand + model + size (if available)
  if (brand && model && specs.size) {
    queries.push(`${brand} ${model} ${specs.size}`);
  }
  
  // FALLBACK 3: model only
  if (model) {
    queries.push(model);
  }
  
  return queries;
}

function generateHeadphoneQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 1: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 2: brand + model + color (if available)
  if (brand && model && specs.color) {
    queries.push(`${brand} ${model} ${specs.color}`);
  }
  
  // FALLBACK 3: model only
  if (model) {
    queries.push(model);
  }
  
  return queries;
}

function generateWatchQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 1: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 2: brand + model + size (if available)
  if (brand && model && specs.size) {
    queries.push(`${brand} ${model} ${specs.size}`);
  }
  
  // FALLBACK 3: model only
  if (model) {
    queries.push(model);
  }
  
  return queries;
}

function generateGenericQueries(brand, family, model, specs) {
  const queries = [];
  
  // PRIMARY: brand + model + key specs
  if (brand && model) {
    let primary = `${brand} ${model}`;
    if (specs.storage) primary += ` ${specs.storage}`;
    if (specs.ram) primary += ` ${specs.ram}`;
    if (specs.size) primary += ` ${specs.size}`;
    queries.push(primary.trim());
  }
  
  // FALLBACK 1: brand + model
  if (brand && model) {
    queries.push(`${brand} ${model}`);
  }
  
  // FALLBACK 2: brand + family
  if (brand && family) {
    queries.push(`${brand} ${family}`);
  }
  
  // FALLBACK 3: model only
  if (model) {
    queries.push(model);
  }
  
  return queries;
}

function generateFallbackQueries(brand, family, model, category) {
  const queries = [];
  
  // Brand + category (generic)
  if (brand && category && category !== "general") {
    queries.push(`${brand} ${category}`);
  }
  
  // Family + category
  if (family && category && category !== "general") {
    queries.push(`${family} ${category}`);
  }
  
  // Model + category
  if (model && category && category !== "general") {
    queries.push(`${model} ${category}`);
  }
  
  return queries;
}

// Export for use in server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildSmartSearchQueries,
    generateMobileQueries,
    generateComputerQueries,
    generateFootwearQueries,
    generateClothingQueries,
    generateHeadphoneQueries,
    generateWatchQueries,
    generateGenericQueries,
    generateFallbackQueries
  };
}
