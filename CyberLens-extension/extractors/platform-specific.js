/**
 * PLATFORM-SPECIFIC EXTRACTORS
 * Modular fallback extractors for known platforms
 * Used only when universal extraction confidence is low
 */

const platformExtractors = {
  amazon: extractAmazonProduct,
  flipkart: extractFlipkartProduct,
  myntra: extractMyntraProduct,
  ajio: extractAjioProduct,
  meesho: extractMeeshoProduct,
  croma: extractCromaProduct,
  reliance: extractRelianceProduct,
  tatacliq: extractTataCliqProduct,
  nykaa: extractNykaaProduct,
  snapdeal: extractSnapdealProduct,
  generic: extractGenericProduct
};

function extractPlatformSpecific(platform) {
  const platformKey = platform.toLowerCase().replace(/\.(com|in|co\.in)$/, '');
  const extractor = platformExtractors[platformKey] || platformExtractors.generic;
  
  console.log("[PLATFORM_SPECIFIC] Using extractor for:", platformKey);
  
  try {
    const result = extractor();
    if (result && result.productName) {
      console.log("[PLATFORM_SPECIFIC] Successfully extracted:", result);
      return result;
    }
  } catch (e) {
    console.log("[PLATFORM_SPECIFIC] Extractor error:", e);
  }
  
  return null;
}

function extractAmazonProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Amazon-specific selectors
    const selectors = [
      "#productTitle",
      "#title h1",
      "#product-name",
      ".product-title",
      "[data-feature-name='productTitle']"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      "#bylineInfo",
      ".po-brand .po-break-word",
      "[data-feature-name='bylineInfo']"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = (element.textContent || element.innerText || "").trim();
        // Remove "Brand: " prefix if present
        brand = text.replace(/^Brand:\s*/i, "").replace(/^Visit\s+\w+\s+Store\s*/i, "");
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[AMAZON_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractFlipkartProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Flipkart-specific selectors
    const selectors = [
      ".B_NuCI",
      ".pdp-product-title",
      "#pdp-product-title",
      ".product-title"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".G6XhRU",
      ".pdp-brand-name",
      ".brand-name"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[FLIPKART_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractMyntraProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Myntra-specific selectors
    const selectors = [
      ".pdp-product-title",
      ".product-title",
      ".pdp-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".pdp-brand-name",
      ".brand-name",
      ".pdp-brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[MYNTRA_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractAjioProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Ajio-specific selectors
    const selectors = [
      ".prod-name",
      ".product-name",
      ".name-des"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".fn-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[AJIO_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractMeeshoProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Meesho-specific selectors
    const selectors = [
      ".product-title",
      ".ProductDetail_title__",
      ".title"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".BrandDetail_brandName__",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[MEESHO_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractCromaProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Croma-specific selectors
    const selectors = [
      ".pdp-product-title",
      ".product-title",
      ".product-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".pdp-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[CROMA_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractRelianceProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Reliance Digital-specific selectors
    const selectors = [
      ".product-title",
      ".pdp-product-title",
      ".product-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".pdp-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[RELIANCE_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractTataCliqProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Tata CLiQ-specific selectors
    const selectors = [
      ".product-title",
      ".pdp-product-title",
      ".product-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".pdp-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[TATACLIQ_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractNykaaProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Nykaa-specific selectors
    const selectors = [
      ".product-title",
      ".pdp-product-title",
      ".product-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".pdp-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[NYKAA_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractSnapdealProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Snapdeal-specific selectors
    const selectors = [
      ".product-title",
      ".pdp-product-title",
      ".product-name"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        productName = (element.textContent || element.innerText || "").trim();
        if (productName && productName.length > 5) {
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      ".brand-name",
      ".pdp-brand",
      ".brand"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[SNAPDEAL_EXTRACTOR] Error:", e);
    return null;
  }
}

function extractGenericProduct() {
  try {
    let productName = "";
    let brand = "";
    
    // Generic ecommerce selectors
    const selectors = [
      ".product-title",
      ".pdp-product-title",
      ".product-name",
      ".product-detail-name",
      ".title-product",
      ".product__title",
      ".product-title-text",
      ".product-info-title",
      ".product-name-text",
      ".product-display-name",
      ".product-headline",
      ".product-header",
      ".product-page-title",
      ".product-main-title",
      ".product-display-title",
      ".product-item-title",
      ".product-card-title",
      ".product-list-title",
      ".product-grid-title",
      ".product-search-title",
      ".product-detail-title",
      ".product-view-title",
      ".product-show-title",
      ".product-get-title",
      ".product-buy-title",
      ".product-shop-title",
      ".product-order-title",
      ".product-cart-title",
      ".product-checkout-title",
      ".product-payment-title",
      ".product-shipping-title",
      ".product-delivery-title",
      ".product-return-title",
      ".product-warranty-title",
      ".product-support-title",
      ".product-service-title",
      ".product-help-title",
      ".product-faq-title",
      ".product-review-title",
      ".product-rating-title",
      ".product-feedback-title",
      ".product-comment-title",
      ".product-discussion-title",
      ".product-question-title",
      ".product-answer-title",
      ".product-guide-title",
      ".product-tutorial-title",
      ".product-manual-title",
      ".product-spec-title",
      ".product-feature-title",
      ".product-benefit-title",
      ".product-advantage-title",
      ".product-value-title",
      ".product-quality-title",
      ".product-performance-title",
      ".product-reliability-title",
      ".product-durability-title",
      ".product-efficiency-title",
      ".product-effectiveness-title",
      ".product-safety-title",
      ".product-security-title",
      ".product-privacy-title",
      ".product-compliance-title",
      ".product-certification-title",
      ".product-standard-title",
      ".product-regulation-title",
      ".product-policy-title",
      ".product-terms-title",
      ".product-conditions-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-description-title",
      ".product-details-title",
      ".product-information-title",
      ".product-overview-title",
      ".product-summary-title",
      ".product-introduction-title",
      ".product-background-title",
      ".product-history-title",
      ".product-development-title",
      ".product-evolution-title",
      ".product-innovation-title",
      ".product-technology-title",
      ".product-science-title",
      ".product-research-title",
      ".product-study-title",
      ".product-analysis-title",
      ".product-evaluation-title",
      ".product-assessment-title",
      ".product-testing-title",
      ".product-validation-title",
      ".product-verification-title",
      ".product-authentication-title",
      ".product-authorization-title",
      ".product-certification-title",
      ".product-approval-title",
      ".product-endorsement-title",
      ".product-support-title",
      ".product-backing-title",
      ".product-sponsorship-title",
      ".product-funding-title",
      ".product-financing-title",
      ".product-investment-title",
      ".product-capital-title",
      ".product-money-title",
      ".product-cash-title",
      ".product-currency-title",
      ".product-wealth-title",
      ".product-riches-title",
      ".product-assets-title",
      ".product-resources-title",
      ".product-funds-title",
      ".product-budget-title",
      ".product-cost-title",
      ".product-price-title",
      ".product-value-title",
      ".product-worth-title",
      ".product-valuation-title",
      ".product-estimate-title",
      ".product-quote-title",
      ".product-bid-title",
      ".product-offer-title",
      ".product-deal-title",
      ".product-agreement-title",
      ".product-contract-title",
      ".product-terms-title",
      ".product-conditions-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      ".product-schemes-title",
      ".product-methods-title",
      ".product-approaches-title",
      ".product-techniques-title",
      ".product-processes-title",
      ".product-procedures-title",
      ".product-operations-title",
      ".product-activities-title",
      ".product-actions-title",
      ".product-tasks-title",
      ".product-functions-title",
      ".product-roles-title",
      ".product-responsibilities-title",
      ".product-duties-title",
      ".product-obligations-title",
      ".product-requirements-title",
      ".product-specifications-title",
      ".product-standards-title",
      ".product-criteria-title",
      ".product-measures-title",
      ".product-metrics-title",
      ".product-indicators-title",
      ".product-benchmarks-title",
      ".product-targets-title",
      ".product-goals-title",
      ".product-objectives-title",
      ".product-aims-title",
      ".product-purposes-title",
      ".product-intentions-title",
      ".product-plans-title",
      ".product-strategies-title",
      ".product-tactics-title",
      ".product-policies-title",
      ".product-rules-title",
      ".product-regulations-title",
      ".product-laws-title",
      ".product-standards-title",
      ".product-guidelines-title",
      ".product-principles-title",
      ".product-values-title",
      ".product-ethics-title",
      ".product-morals-title",
      ".product-beliefs-title",
      ".product-attitudes-title",
      ".product-behaviors-title",
      ".product-habits-title",
      ".product-practices-title",
      ".product-customs-title",
      ".product-traditions-title",
      ".product-cultures-title",
      ".product-societies-title",
      ".product-communities-title",
      ".product-groups-title",
      ".product-teams-title",
      ".product-organizations-title",
      ".product-institutions-title",
      ".product-systems-title",
      ".product-structures-title",
      ".product-frameworks-title",
      ".product-models-title",
      ".product-patterns-title",
      ".product-designs-title",
      ".product-plans-title",
      ".product-layouts-title",
      ".product-formats-title",
      ".product-templates-title",
      "#productTitle",
      "#title h1",
      "#product-name",
      ".product-title",
      "[data-feature-name='productTitle']",
      "#bylineInfo",
      ".po-brand .po-break-word",
      "[data-feature-name='bylineInfo']"
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = (element.textContent || element.innerText || "").trim();
        if (text && text.length > 5 && text.length < 300) {
          productName = text;
          break;
        }
      }
    }
    
    // Brand extraction
    const brandSelectors = [
      '[itemprop="brand"]',
      '.brand',
      '#brand',
      '.product-brand',
      '.seller-name',
      '.manufacturer',
      ".po-brand .po-break-word",
      "[data-feature-name='bylineInfo']"
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || element.content || "").trim();
        if (brand) break;
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[GENERIC_EXTRACTOR] Error:", e);
    return null;
  }
}

// Export for use in universal.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractPlatformSpecific,
    platformExtractors,
    extractAmazonProduct,
    extractFlipkartProduct,
    extractMyntraProduct,
    extractAjioProduct,
    extractMeeshoProduct,
    extractCromaProduct,
    extractRelianceProduct,
    extractTataCliqProduct,
    extractNykaaProduct,
    extractSnapdealProduct,
    extractGenericProduct
  };
}
