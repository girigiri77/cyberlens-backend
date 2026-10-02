// Load universal extraction modules
(function() {
  const universalScript = document.createElement('script');
  universalScript.src = chrome.runtime.getURL('extractors/universal.js');
  document.head.appendChild(universalScript);
  
  const normalizerScript = document.createElement('script');
  normalizerScript.src = chrome.runtime.getURL('extractors/normalizer.js');
  document.head.appendChild(normalizerScript);
  
  const platformScript = document.createElement('script');
  platformScript.src = chrome.runtime.getURL('extractors/platform-specific.js');
  document.head.appendChild(platformScript);
})();

// Wait for modules to load before making functions available
setTimeout(() => {
  if (typeof extractProductUniversal === 'undefined') {
    console.log('[CONTENT] Warning: extractProductUniversal not loaded');
  }
  if (typeof normalizeProduct === 'undefined') {
    console.log('[CONTENT] Warning: normalizeProduct not loaded');
  }
}, 500);

function extractOffers(){

  const offers = [];

  document.querySelectorAll("li, span, div").forEach(el => {

    const text = el.innerText?.toLowerCase();

    if(!text) return;

    if(
      text.includes("discount") ||
      text.includes("cashback") ||
      text.includes("bank offer") ||
      text.includes("emi") ||
      text.includes("coupon")
    ){
      offers.push(el.innerText.trim());
    }

  });

  return [...new Set(offers)].slice(0,6);

}

/**
 * UNIVERSAL PRODUCT EXTRACTION FOR NON-TECH MODE
 * Extracts product information from any ecommerce page
 */
function extractProductForNonTech() {
  console.log('[CONTENT] Starting universal product extraction');
  
  try {
    // Use universal extraction if available
    if (typeof extractProductUniversal === 'function') {
      const rawProduct = extractProductUniversal();
      
      if (rawProduct) {
        console.log('[CONTENT] Raw product extracted:', JSON.stringify(rawProduct));
        
        // Normalize the product if normalizer is available
        if (typeof normalizeProduct === 'function') {
          const normalizedProduct = normalizeProduct(rawProduct);
          
          if (normalizedProduct) {
            console.log('[CONTENT] Normalized product:', JSON.stringify(normalizedProduct));
            
            // Add structured logging
            const extractionLog = {
              platform: normalizedProduct.platform,
              extractionSource: normalizedProduct.source,
              extractionConfidence: normalizedProduct.confidence,
              rawTitle: normalizedProduct.rawTitle,
              cleanTitle: normalizedProduct.cleanTitle,
              category: normalizedProduct.category,
              brand: normalizedProduct.brand,
              productFamily: normalizedProduct.productFamily,
              model: normalizedProduct.model,
              variant: normalizedProduct.variant,
              specifications: normalizedProduct.specifications
            };
            
            console.log('[STRUCTURED_LOG] EXTRACTION_LOG:', JSON.stringify(extractionLog));
            
            return {
              success: true,
              product: normalizedProduct,
              extractionLog
            };
          }
        }
        
        // Fallback: return raw product if normalization fails
        return {
          success: true,
          product: rawProduct,
          extractionLog: {
            platform: rawProduct.platform,
            extractionSource: rawProduct.source,
            extractionConfidence: rawProduct.confidence,
            rawTitle: rawProduct.productName
          }
        };
      }
    }
    
    console.log('[CONTENT] Universal extraction failed or not available');
    return {
      success: false,
      error: 'Could not extract product from page'
    };
    
  } catch (error) {
    console.log('[CONTENT] Extraction error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse)=>{

  if(req.type === "GET_OFFERS"){

    const offers = extractOffers();

    sendResponse({offers});

  }
  
  if(req.type === "EXTRACT_PRODUCT"){
    const result = extractProductForNonTech();
    sendResponse(result);
  }

});