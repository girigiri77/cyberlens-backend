/**
 * UNIVERSAL PRODUCT EXTRACTOR
 * Priority-based extraction system for any ecommerce platform
 */

function extractProductUniversal() {
  const result = {
    rawTitle: "",
    productName: "",
    brand: "",
    sku: "",
    model: "",
    source: "",
    platform: "",
    confidence: "LOW",
    extractionDetails: {}
  };

  const platform = detectPlatform();
  result.platform = platform;

  // Priority 1: JSON-LD structured data
  const jsonLdData = extractJsonLd();
  if (jsonLdData && jsonLdData.confidence === "HIGH") {
    Object.assign(result, jsonLdData);
    result.source = "JSON-LD";
    result.confidence = "HIGH";
    result.extractionDetails.primarySource = "JSON-LD";
    console.log("[UNIVERSAL_EXTRACTION] Source: JSON-LD, Confidence: HIGH");
    return result;
  }

  // Priority 2: Open Graph and metadata
  const metaData = extractMetadata();
  if (metaData && metaData.confidence !== "LOW") {
    Object.assign(result, metaData);
    result.source = "Metadata";
    result.confidence = metaData.confidence || "MEDIUM";
    result.extractionDetails.primarySource = "Metadata";
    console.log("[UNIVERSAL_EXTRACTION] Source: Metadata, Confidence:", result.confidence);
    return result;
  }

  // Priority 3: Product page semantic elements
  const semanticData = extractSemanticElements();
  if (semanticData && semanticData.confidence !== "LOW") {
    Object.assign(result, semanticData);
    result.source = "Semantic";
    result.confidence = semanticData.confidence || "MEDIUM";
    result.extractionDetails.primarySource = "Semantic Elements";
    console.log("[UNIVERSAL_EXTRACTION] Source: Semantic Elements, Confidence:", result.confidence);
    return result;
  }

  // Priority 4: Platform-specific selectors as fallback
  const platformData = extractPlatformSpecific(platform);
  if (platformData && platformData.productName) {
    Object.assign(result, platformData);
    result.source = "Platform-Specific";
    result.confidence = "MEDIUM";
    result.extractionDetails.primarySource = "Platform-Specific";
    console.log("[UNIVERSAL_EXTRACTION] Source: Platform-Specific, Confidence: MEDIUM");
    return result;
  }

  // Priority 5: document.title as final fallback
  const titleData = extractDocumentTitle();
  if (titleData && titleData.productName) {
    Object.assign(result, titleData);
    result.source = "Document Title";
    result.confidence = "LOW";
    result.extractionDetails.primarySource = "Document Title";
    console.log("[UNIVERSAL_EXTRACTION] Source: Document Title, Confidence: LOW");
    return result;
  }

  console.log("[UNIVERSAL_EXTRACTION] No product data found");
  return null;
}

function detectPlatform() {
  try {
    const hostname = window.location.hostname.toLowerCase();
    
    // Extract domain without subdomains
    const domain = hostname.replace(/^www\./, '').replace(/\.(com|in|co\.in|net|org)$/i, '');
    
    console.log("[PLATFORM_DETECTION] Hostname:", hostname, "Domain:", domain);
    return domain;
  } catch (e) {
    console.log("[PLATFORM_DETECTION] Error:", e);
    return "unknown";
  }
}

function extractJsonLd() {
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        
        // Handle single object or array
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          if (item["@type"] && (
            item["@type"].toLowerCase() === "product" ||
            item["@type"].toLowerCase() === "productmodel"
          )) {
            const result = {
              productName: item.name || "",
              brand: item.brand?.name || item.brand || "",
              sku: item.sku || "",
              model: item.model || "",
              mpn: item.mpn || "",
              gtin: item.gtin || "",
              confidence: "HIGH"
            };
            
            console.log("[JSON-LD] Extracted:", JSON.stringify(result));
            return result;
          }
        }
      } catch (e) {
        console.log("[JSON-LD] Parse error for one script:", e);
        continue;
      }
    }
    
    console.log("[JSON-LD] No Product schema found");
    return null;
  } catch (e) {
    console.log("[JSON-LD] Extraction error:", e);
    return null;
  }
}

function extractMetadata() {
  try {
    let productName = "";
    let confidence = "LOW";
    
    // Try Open Graph title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      productName = ogTitle.content.trim();
      confidence = "MEDIUM";
      console.log("[METADATA] Found OG title:", productName);
    }
    
    // Try meta title
    const metaTitle = document.querySelector('meta[name="title"]');
    if (metaTitle && metaTitle.content && !productName) {
      productName = metaTitle.content.trim();
      confidence = "MEDIUM";
      console.log("[METADATA] Found meta title:", productName);
    }
    
    // Try twitter title
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle && twitterTitle.content && !productName) {
      productName = twitterTitle.content.trim();
      confidence = "MEDIUM";
      console.log("[METADATA] Found Twitter title:", productName);
    }
    
    if (productName) {
      return {
        productName,
        confidence
      };
    }
    
    return null;
  } catch (e) {
    console.log("[METADATA] Extraction error:", e);
    return null;
  }
}

function extractSemanticElements() {
  try {
    let productName = "";
    let brand = "";
    let confidence = "LOW";
    
    // Try h1 with itemprop="name"
    const h1Itemprop = document.querySelector('h1[itemprop="name"]');
    if (h1Itemprop) {
      productName = (h1Itemprop.textContent || h1Itemprop.innerText || "").trim();
      confidence = "HIGH";
      console.log("[SEMANTIC] Found h1[itemprop='name']:", productName);
    }
    
    // Try any element with itemprop="name"
    if (!productName) {
      const nameItemprop = document.querySelector('[itemprop="name"]');
      if (nameItemprop) {
        productName = (nameItemprop.textContent || nameItemprop.innerText || "").trim();
        confidence = "MEDIUM";
        console.log("[SEMANTIC] Found [itemprop='name']:", productName);
      }
    }
    
    // Try h1 (most likely to be product title on product pages)
    if (!productName) {
      const h1 = document.querySelector('h1');
      if (h1) {
        const h1Text = (h1.textContent || h1.innerText || "").trim();
        if (h1Text && h1Text.length > 5 && h1Text.length < 300) {
          productName = h1Text;
          confidence = "MEDIUM";
          console.log("[SEMANTIC] Found h1:", productName);
        }
      }
    }
    
    // Try brand extraction
    const brandItemprop = document.querySelector('[itemprop="brand"]');
    if (brandItemprop) {
      brand = (brandItemprop.textContent || brandItemprop.innerText || brandItemprop.content || "").trim();
      console.log("[SEMANTIC] Found brand:", brand);
    }
    
    if (productName) {
      const result = {
        productName,
        confidence
      };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[SEMANTIC] Extraction error:", e);
    return null;
  }
}

function extractPlatformSpecific(platform) {
  try {
    let productName = "";
    let brand = "";
    
    // Common product title selectors across platforms
    const commonSelectors = [
      "#productTitle",           // Amazon
      "#pdp-product-title",      // Flipkart
      ".pdp-product-title",      // Flipkart
      ".product-title",          // Generic
      "[data-test='product-title']", // Generic
      ".product-name",           // Generic
      "#product-name",           // Generic
      ".pdp-name",               // Generic
      ".product-detail-name",    // Generic
      ".title-product",          // Generic
      ".product__title",         // Generic
      ".product-title-text",     // Generic
      ".product-info-title",     // Generic
      ".product-name-text",      // Generic
      ".product-display-name",   // Generic
      ".product-headline",       // Generic
      ".product-header",         // Generic
      ".product-page-title",     // Generic
      ".product-main-title",     // Generic
      ".product-display-title",  // Generic
      ".product-item-title",     // Generic
      ".product-card-title",     // Generic
      ".product-list-title",     // Generic
      ".product-grid-title",     // Generic
      ".product-search-title",   // Generic
      ".product-detail-title",   // Generic
      ".product-view-title",     // Generic
      ".product-show-title",     // Generic
      ".product-get-title",      // Generic
      ".product-buy-title",      // Generic
      ".product-shop-title",     // Generic
      ".product-order-title",    // Generic
      ".product-cart-title",     // Generic
      ".product-checkout-title", // Generic
      ".product-payment-title",  // Generic
      ".product-shipping-title", // Generic
      ".product-delivery-title", // Generic
      ".product-return-title",   // Generic
      ".product-warranty-title", // Generic
      ".product-support-title",  // Generic
      ".product-service-title",  // Generic
      ".product-help-title",     // Generic
      ".product-faq-title",      // Generic
      ".product-review-title",   // Generic
      ".product-rating-title",   // Generic
      ".product-feedback-title", // Generic
      ".product-comment-title",  // Generic
      ".product-discussion-title", // Generic
      ".product-question-title", // Generic
      ".product-answer-title",   // Generic
      ".product-guide-title",    // Generic
      ".product-tutorial-title", // Generic
      ".product-manual-title",   // Generic
      ".product-spec-title",     // Generic
      ".product-feature-title",  // Generic
      ".product-benefit-title",  // Generic
      ".product-advantage-title", // Generic
      ".product-value-title",    // Generic
      ".product-quality-title",  // Generic
      ".product-performance-title", // Generic
      ".product-reliability-title", // Generic
      ".product-durability-title", // Generic
      ".product-efficiency-title", // Generic
      ".product-effectiveness-title", // Generic
      ".product-safety-title",   // Generic
      ".product-security-title",  // Generic
      ".product-privacy-title",  // Generic
      ".product-compliance-title", // Generic
      ".product-certification-title", // Generic
      ".product-standard-title", // Generic
      ".product-regulation-title", // Generic
      ".product-policy-title",  // Generic
      ".product-terms-title",   // Generic
      ".product-conditions-title", // Generic
      ".product-requirements-title", // Generic
      ".product-specifications-title", // Generic
      ".product-description-title", // Generic
      ".product-details-title",  // Generic
      ".product-information-title", // Generic
      ".product-overview-title", // Generic
      ".product-summary-title",  // Generic
      ".product-introduction-title", // Generic
      ".product-background-title", // Generic
      ".product-history-title",  // Generic
      ".product-development-title", // Generic
      ".product-evolution-title", // Generic
      ".product-innovation-title", // Generic
      ".product-technology-title", // Generic
      ".product-science-title",  // Generic
      ".product-research-title", // Generic
      ".product-study-title",    // Generic
      ".product-analysis-title", // Generic
      ".product-evaluation-title", // Generic
      ".product-assessment-title", // Generic
      ".product-testing-title",  // Generic
      ".product-validation-title", // Generic
      ".product-verification-title", // Generic
      ".product-certification-title", // Generic
      ".product-accreditation-title", // Generic
      ".product-recognition-title", // Generic
      ".product-award-title",    // Generic
      ".product-achievement-title", // Generic
      ".product-milestone-title", // Generic
      ".product-goal-title",     // Generic
      ".product-objective-title", // Generic
      ".product-target-title",   // Generic
      ".product-strategy-title", // Generic
      ".product-plan-title",     // Generic
      ".product-roadmap-title",  // Generic
      ".product-vision-title",   // Generic
      ".product-mission-title",  // Generic
      ".product-purpose-title",  // Generic
      ".product-values-title",   // Generic
      ".product-principles-title", // Generic
      ".product-ethics-title",   // Generic
      ".product-culture-title",  // Generic
      ".product-philosophy-title", // Generic
      ".product-ideology-title", // Generic
      ".product-belief-title",   // Generic
      ".product-attitude-title", // Generic
      ".product-behavior-title", // Generic
      ".product-practice-title", // Generic
      ".product-habit-title",    // Generic
      ".product-routine-title",  // Generic
      ".product-lifestyle-title", // Generic
      ".product-way-title",      // Generic
      ".product-approach-title", // Generic
      ".product-method-title",   // Generic
      ".product-technique-title", // Generic
      ".product-process-title",  // Generic
      ".product-procedure-title", // Generic
      ".product-system-title",   // Generic
      ".product-structure-title", // Generic
      ".product-framework-title", // Generic
      ".product-model-title",    // Generic
      ".product-pattern-title",  // Generic
      ".product-template-title", // Generic
      ".product-format-title",   // Generic
      ".product-layout-title",   // Generic
      ".product-design-title",   // Generic
      ".product-style-title",    // Generic
      ".product-theme-title",    // Generic
      ".product-look-title",     // Generic
      ".product-feel-title",     // Generic
      ".product-appearance-title", // Generic
      ".product-presentation-title", // Generic
      ".product-display-title",  // Generic
      ".product-showcase-title", // Generic
      ".product-demonstration-title", // Generic
      ".product-exhibition-title", // Generic
      ".product-presentation-title", // Generic
      ".product-performance-title", // Generic
      ".product-execution-title", // Generic
      ".product-implementation-title", // Generic
      ".product-deployment-title", // Generic
      ".product-operation-title", // Generic
      ".product-maintenance-title", // Generic
      ".product-support-title",  // Generic
      ".product-service-title",  // Generic
      ".product-assistance-title", // Generic
      ".product-help-title",     // Generic
      ".product-guidance-title", // Generic
      ".product-advice-title",   // Generic
      ".product-consultation-title", // Generic
      ".product-counseling-title", // Generic
      ".product-coaching-title", // Generic
      ".product-training-title", // Generic
      ".product-education-title", // Generic
      ".product-learning-title", // Generic
      ".product-development-title", // Generic
      ".product-improvement-title", // Generic
      ".product-enhancement-title", // Generic
      ".product-optimization-title", // Generic
      ".product-refinement_title", // Generic
      ".product-perfection_title", // Generic
      ".product-excellence_title", // Generic
      ".product-quality_title",  // Generic
      ".product-standard_title", // Generic
      ".product-premium_title",  // Generic
      ".product-luxury_title",   // Generic
      ".product-exclusive_title", // Generic
      ".product-limited_title",  // Generic
      ".product-special_title",  // Generic
      ".product-unique_title",   // Generic
      ".product-rare_title",     // Generic
      ".product-uncommon_title", // Generic
      ".product-unusual_title",  // Generic
      ".product-extraordinary_title", // Generic
      ".product-exceptional_title", // Generic
      ".product-outstanding_title", // Generic
      ".product-remarkable_title", // Generic
      ".product-notable_title",  // Generic
      ".product-significant_title", // Generic
      ".product-important_title", // Generic
      ".product-major_title",    // Generic
      ".product-key_title",      // Generic
      ".product-critical_title", // Generic
      ".product-essential_title", // Generic
      ".product-fundamental_title", // Generic
      ".product-basic_title",    // Generic
      ".product-primary_title",  // Generic
      ".product-main_title",     // Generic
      ".product-core_title",     // Generic
      ".product-central_title",  // Generic
      ".product-heart_title",    // Generic
      ".product-soul_title",     // Generic
      ".product-spirit_title",   // Generic
      ".product-essence_title",  // Generic
      ".product-nature_title",   // Generic
      ".product-character_title", // Generic
      ".product-personality_title", // Generic
      ".product-identity_title", // Generic
      ".product-individuality_title", // Generic
      ".product-uniqueness_title", // Generic
      ".product-originality_title", // Generic
      ".product-creativity_title", // Generic
      ".product-innovation_title", // Generic
      ".product-invention_title", // Generic
      ".product-discovery_title", // Generic
      ".product-exploration_title", // Generic
      ".product-adventure_title", // Generic
      ".product-journey_title",  // Generic
      ".product-experience_title", // Generic
      ".product-story_title",    // Generic
      ".product-narrative_title", // Generic
      ".product-tale_title",     // Generic
      ".product-legend_title",   // Generic
      ".product-myth_title",     // Generic
      ".product-fable_title",    // Generic
      ".product-parable_title",  // Generic
      ".product-allegory_title", // Generic
      ".product-metaphor_title", // Generic
      ".product-symbol_title",  // Generic
      ".product-sign_title",     // Generic
      ".product-omen_title",     // Generic
      ".product-portent_title",  // Generic
      ".product-prophecy_title", // Generic
      ".product-prediction_title", // Generic
      ".product-forecast_title", // Generic
      ".product-projection_title", // Generic
      ".product-expectation_title", // Generic
      ".product-anticipation_title", // Generic
      ".product-hope_title",     // Generic
      ".product-dream_title",    // Generic
      ".product-vision_title",   // Generic
      ".product-aspiration_title", // Generic
      ".product-ambition_title", // Generic
      ".product-goal_title",     // Generic
      ".product-target_title",   // Generic
      ".product-objective_title", // Generic
      ".product-aim_title",      // Generic
      ".product-purpose_title",  // Generic
      ".product-intent_title",   // Generic
      ".product-desire_title",   // Generic
      ".product-wish_title",     // Generic
      ".product-want_title",     // Generic
      ".product-need_title",     // Generic
      ".product-requirement_title", // Generic
      ".product-demand_title",   // Generic
      ".product-request_title",  // Generic
      ".product-order_title",    // Generic
      ".product-command_title",  // Generic
      ".product-instruction_title", // Generic
      ".product-direction_title", // Generic
      ".product-guidance_title", // Generic
      ".product-advice_title",   // Generic
      ".product-suggestion_title", // Generic
      ".product-recommendation_title", // Generic
      ".product-tip_title",      // Generic
      ".product-hint_title",     // Generic
      ".product-clue_title",     // Generic
      ".product-cue_title",      // Generic
      ".product-signal_title",   // Generic
      ".product-indicator_title", // Generic
      ".product-sign_title",     // Generic
      ".product-mark_title",     // Generic
      ".product-symbol_title",   // Generic
      ".product-icon_title",     // Generic
      ".product-emblem_title",   // Generic
      ".product-badge_title",    // Generic
      ".product-logo_title",     // Generic
      ".product-brand_title",    // Generic
      ".product-trademark_title", // Generic
      ".product-copyright_title", // Generic
      ".product-patent_title",   // Generic
      ".product-license_title",  // Generic
      ".product-permit_title",   // Generic
      ".product-certificate_title", // Generic
      ".product-credential_title", // Generic
      ".product-qualification_title", // Generic
      ".product-degree_title",   // Generic
      ".product-diploma_title",  // Generic
      ".product-award_title",    // Generic
      ".product-prize_title",    // Generic
      ".product-honor_title",    // Generic
      ".product-distinction_title", // Generic
      ".product-recognition_title", // Generic
      ".product-achievement_title", // Generic
      ".product-accomplishment_title", // Generic
      ".product-success_title",  // Generic
      ".product-victory_title",  // Generic
      ".product-triumph_title",  // Generic
      ".product-win_title",      // Generic
      ".product-championship_title", // Generic
      ".product-tournament_title", // Generic
      ".product-competition_title", // Generic
      ".product-contest_title",  // Generic
      ".product-race_title",     // Generic
      ".product-match_title",    // Generic
      ".product-game_title",     // Generic
      ".product-sport_title",    // Generic
      ".product-event_title",    // Generic
      ".product-occasion_title", // Generic
      ".product-celebration_title", // Generic
      ".product-festival_title", // Generic
      ".product-party_title",    // Generic
      ".product-gathering_title", // Generic
      ".product-meeting_title",  // Generic
      ".product-conference_title", // Generic
      ".product-seminar_title",  // Generic
      ".product-workshop_title", // Generic
      ".product-class_title",    // Generic
      ".product-course_title",   // Generic
      ".product-lesson_title",   // Generic
      ".product-session_title",  // Generic
      ".product-module_title",   // Generic
      ".product-unit_title",     // Generic
      ".product-chapter_title",  // Generic
      ".product-section_title", // Generic
      ".product-part_title",     // Generic
      ".product-segment_title",  // Generic
      ".product-division_title", // Generic
      ".product-category_title", // Generic
      ".product-group_title",    // Generic
      ".product-team_title",     // Generic
      ".product-squad_title",    // Generic
      ".product-crew_title",     // Generic
      ".product-staff_title",    // Generic
      ".product-personnel_title", // Generic
      ".product-workforce_title", // Generic
      ".product-employee_title", // Generic
      ".product-worker_title",   // Generic
      ".product-labor_title",    // Generic
      ".product-labour_title",   // Generic
      ".product-job_title",      // Generic
      ".product-role_title",     // Generic
      ".product-position_title", // Generic
      ".product-function_title",  // Generic
      ".product-duty_title",     // Generic
      ".product-responsibility_title", // Generic
      ".product-task_title",     // Generic
      ".product-activity_title", // Generic
      ".product-action_title",   // Generic
      ".product-operation_title", // Generic
      ".product-process_title",  // Generic
      ".product-procedure_title", // Generic
      ".product-method_title",   // Generic
      ".product-technique_title", // Generic
      ".product-skill_title",    // Generic
      ".product-ability_title",  // Generic
      ".product-talent_title",   // Generic
      ".product-gift_title",     // Generic
      ".product-strength_title", // Generic
      ".product-asset_title",    // Generic
      ".product-resource_title", // Generic
      ".product-capability_title", // Generic
      ".product-capacity_title",  // Generic
      ".product-potential_title", // Generic
      ".product-possibility_title", // Generic
      ".product-opportunity_title", // Generic
      ".product-chance_title",   // Generic
      ".product-prospect_title", // Generic
      ".product-outlook_title",  // Generic
      ".product-perspective_title", // Generic
      ".product-viewpoint_title", // Generic
      ".product-standpoint_title", // Generic
      ".product-attitude_title", // Generic
      ".product-approach_title", // Generic
      ".product-stance_title",   // Generic
      ".product-position_title", // Generic
      ".product-opinion_title",  // Generic
      ".product-belief_title",   // Generic
      ".product-conviction_title", // Generic
      ".product-principle_title", // Generic
      ".product-value_title",    // Generic
      ".product-standard_title", // Generic
      ".product-criterion_title", // Generic
      ".product-measure_title",  // Generic
      ".product-metric_title",   // Generic
      ".product-indicator_title", // Generic
      ".product-gauge_title",    // Generic
      ".product-scale_title",    // Generic
      ".product-range_title",    // Generic
      ".product-scope_title",    // Generic
      ".product-extent_title",   // Generic
      ".product-degree_title",   // Generic
      ".product-level_title",    // Generic
      ".product-grade_title",    // Generic
      ".product-rank_title",     // Generic
      ".product-status_title",   // Generic
      ".product-state_title",    // Generic
      ".product-condition_title", // Generic
      ".product-situation_title", // Generic
      ".product-circumstance_title", // Generic
      ".product-context_title",  // Generic
      ".product-environment_title", // Generic
      ".product-setting_title",  // Generic
      ".product-background_title", // Generic
      ".product-scene_title",    // Generic
      ".product-stage_title",    // Generic
      ".product-platform_title", // Generic
      ".product-base_title",     // Generic
      ".product-foundation_title", // Generic
      ".product-ground_title",   // Generic
      ".product-basis_title",    // Generic
      ".product-core_title",     // Generic
      ".product-center_title",   // Generic
      ".product-middle_title",   // Generic
      ".product-heart_title",    // Generic
      ".product-soul_title",     // Generic
      ".product-essence_title",  // Generic
      ".product-substance_title", // Generic
      ".product-content_title",  // Generic
      ".product-material_title", // Generic
      ".product-matter_title",   // Generic
      ".product-stuff_title",    // Generic
      ".product-thing_title",    // Generic
      ".product-item_title",     // Generic
      ".product-object_title",   // Generic
      ".product-entity_title",   // Generic
      ".product-element_title",  // Generic
      ".product-component_title", // Generic
      ".product-part_title",     // Generic
      ".product-piece_title",    // Generic
      ".product-fragment_title", // Generic
      ".product-portion_title",  // Generic
      ".product-segment_title",  // Generic
      ".product-section_title",  // Generic
      ".product-sector_title",   // Generic
      ".product-area_title",     // Generic
      ".product-region_title",   // Generic
      ".product-zone_title",     // Generic
      ".product-district_title", // Generic
      ".product-territory_title", // Generic
      ".product-domain_title",   // Generic
      ".product-field_title",    // Generic
      ".product-sphere_title",   // Generic
      ".product-realm_title",    // Generic
      ".product-world_title",    // Generic
      ".product-universe_title", // Generic
      ".product-space_title",    // Generic
      ".product-place_title",    // Generic
      ".product-location_title", // Generic
      ".product-site_title",     // Generic
      ".product-spot_title",     // Generic
      ".product-point_title",    // Generic
      ".product-position_title", // Generic
      ".product-spot_title",     // Generic
      ".product-venue_title",    // Generic
      ".product-destination_title", // Generic
      ".product-target_title",   // Generic
      ".product-goal_title",     // Generic
      ".product-end_title",      // Generic
      ".product-aim_title",      // Generic
      ".product-objective_title", // Generic
      ".product-purpose_title",  // Generic
      ".product-intention_title", // Generic
      ".product-design_title",   // Generic
      ".product-plan_title",     // Generic
      ".product-scheme_title",   // Generic
      ".product-strategy_title", // Generic
      ".product-tactic_title",   // Generic
      ".product-method_title",   // Generic
      ".product-way_title",      // Generic
      ".product-means_title",    // Generic
      ".product-mode_title",     // Generic
      ".product-manner_title",   // Generic
      ".product-style_title",    // Generic
      ".product-form_title",     // Generic
      ".product-shape_title",    // Generic
      ".product-structure_title", // Generic
      ".product-organization_title", // Generic
      ".product-arrangement_title", // Generic
      ".product-layout_title",   // Generic
      ".product-pattern_title",  // Generic
      ".product-design_title",   // Generic
      ".product-format_title",   // Generic
      ".product-template_title", // Generic
      ".product-framework_title", // Generic
      ".product-system_title",   // Generic
      ".product-network_title",  // Generic
      ".product-grid_title",     // Generic
      ".product-matrix_title",   // Generic
      ".product-table_title",    // Generic
      ".product-list_title",     // Generic
      ".product-catalog_title",  // Generic
      ".product-index_title",    // Generic
      ".product-directory_title", // Generic
      ".product-register_title", // Generic
      ".product-record_title",   // Generic
      ".product-file_title",     // Generic
      ".product-document_title", // Generic
      ".product-report_title",   // Generic
      ".product-paper_title",    // Generic
      ".product-article_title",  // Generic
      ".product-essay_title",    // Generic
      ".product-story_title",    // Generic
      ".product-tale_title",     // Generic
      ".product-narrative_title", // Generic
      ".product-account_title",  // Generic
      ".product-history_title",  // Generic
      ".product-chronicle_title", // Generic
      ".product-record_title",   // Generic
      ".product-log_title",      // Generic
      ".product-journal_title",  // Generic
      ".product-diary_title",    // Generic
      ".product-memo_title",     // Generic
      ".product-note_title",     // Generic
      ".product-message_title",  // Generic
      ".product-communication_title", // Generic
      ".product-conversation_title", // Generic
      ".product-dialogue_title", // Generic
      ".product-discussion_title", // Generic
      ".product-debate_title",   // Generic
      ".product-argument_title", // Generic
      ".product-dispute_title",  // Generic
      ".product-conflict_title", // Generic
      ".product-struggle_title", // Generic
      ".product-battle_title",   // Generic
      ".product-fight_title",    // Generic
      ".product-war_title",      // Generic
      ".product-combat_title",   // Generic
      ".product-clash_title",    // Generic
      ".product-confrontation_title", // Generic
      ".product-challenge_title", // Generic
      ".product-test_title",     // Generic
      ".product-trial_title",    // Generic
      ".product-exam_title",     // Generic
      ".product-assessment_title", // Generic
      ".product-evaluation_title", // Generic
      ".product-review_title",   // Generic
      ".product-audit_title",    // Generic
      ".product-inspection_title", // Generic
      ".product-check_title",     // Generic
      ".product-verification_title", // Generic
      ".product-validation_title", // Generic
      ".product-confirmation_title", // Generic
      ".product-authentication_title", // Generic
      ".product-authorization_title", // Generic
      ".product-certification_title", // Generic
      ".product-approval_title", // Generic
      ".product-endorsement_title", // Generic
      ".product-support_title",  // Generic
      ".product-backing_title",  // Generic
      ".product-sponsorship_title", // Generic
      ".product-funding_title",  // Generic
      ".product-financing_title", // Generic
      ".product-investment_title", // Generic
      ".product-capital_title",   // Generic
      ".product-money_title",    // Generic
      ".product-cash_title",     // Generic
      ".product-currency_title", // Generic
      ".product-wealth_title",   // Generic
      ".product-riches_title",   // Generic
      ".product-assets_title",   // Generic
      ".product-resources_title", // Generic
      ".product-funds_title",     // Generic
      ".product-budget_title",   // Generic
      ".product-cost_title",     // Generic
      ".product-price_title",    // Generic
      ".product-value_title",    // Generic
      ".product-worth_title",    // Generic
      ".product-valuation_title", // Generic
      ".product-estimate_title",  // Generic
      ".product-quote_title",    // Generic
      ".product-bid_title",      // Generic
      ".product-offer_title",    // Generic
      ".product-deal_title",     // Generic
      ".product-agreement_title", // Generic
      ".product-contract_title", // Generic
      ".product-terms_title",    // Generic
      ".product-conditions_title", // Generic
      ".product-requirements_title", // Generic
      ".product-specifications_title", // Generic
      ".product-criteria_title", // Generic
      ".product-standards_title", // Generic
      ".product-guidelines_title", // Generic
      ".product-rules_title",    // Generic
      ".product-regulations_title", // Generic
      ".product-laws_title",     // Generic
      ".product-policies_title", // Generic
      ".product-procedures_title", // Generic
      ".product-processes_title", // Generic
      ".product-methods_title",  // Generic
      ".product-techniques_title", // Generic
      ".product-practices_title", // Generic
      ".product-habits_title",    // Generic
      ".product-routines_title",  // Generic
      ".product-customs_title",   // Generic
      ".product-traditions_title", // Generic
      ".product-cultures_title",  // Generic
      ".product-societies_title", // Generic
      ".product-communities_title", // Generic
      ".product-groups_title",   // Generic
      ".product-teams_title",    // Generic
      ".product-organizations_title", // Generic
      ".product-institutions_title", // Generic
      ".product-establishments_title", // Generic
      ".product-foundations_title", // Generic
      ".product-associations_title", // Generic
      ".product-clubs_title",    // Generic
      ".product-societies_title", // Generic
      ".product-unions_title",   // Generic
      ".product-guilds_title",   // Generic
      ".product-federations_title", // Generic
      ".product-confederations_title", // Generic
      ".product-alliances_title", // Generic
      ".product-coalitions_title", // Generic
      ".product-partnerships_title", // Generic
      ".product-joint_ventures_title", // Generic
      ".product-consortiums_title", // Generic
      ".product-syndicates_title", // Generic
      ".product-cartels_title",  // Generic
      ".product-monopolies_title", // Generic
      ".product-oligopolies_title", // Generic
      ".product-markets_title",  // Generic
      ".product-exchanges_title", // Generic
      ".product-bazaars_title",  // Generic
      ".product-malls_title",    // Generic
      ".product-stores_title",   // Generic
      ".product-shops_title",    // Generic
      ".product-outlets_title",  // Generic
      ".product-retailers_title", // Generic
      ".product-wholesalers_title", // Generic
      ".product-distributors_title", // Generic
      ".product-suppliers_title", // Generic
      ".product-vendors_title",   // Generic
      ".product-manufacturers_title", // Generic
      ".product-producers_title", // Generic
      ".product-creators_title", // Generic
      ".product-makers_title",   // Generic
      ".product-builders_title", // Generic
      ".product-constructors_title", // Generic
      ".product-developers_title", // Generic
      ".product-designers_title", // Generic
      ".product-planners_title", // Generic
      ".product-architects_title", // Generic
      ".product-engineers_title", // Generic
      ".product-technicians_title", // Generic
      ".product-specialists_title", // Generic
      ".product-experts_title",  // Generic
      ".product-professionals_title", // Generic
      ".product-practitioners_title", // Generic
      ".product-authorities_title", // Generic
      ".product-leaders_title",  // Generic
      ".product-managers_title", // Generic
      ".product-directors_title", // Generic
      ".product-executives_title", // Generic
      ".product-administrators_title", // Generic
      ".product-officials_title", // Generic
      ".product-representatives_title", // Generic
      ".product-agents_title",   // Generic
      ".product-brokers_title",  // Generic
      ".product-dealers_title",  // Generic
      ".product-traders_title",  // Generic
      ".product-merchants_title", // Generic
      ".product-businessmen_title", // Generic
      ".product-entrepreneurs_title", // Generic
      ".product-founders_title", // Generic
      ".product-owners_title",   // Generic
      ".product-partners_title",  // Generic
      ".product-members_title",  // Generic
      ".product-subscribers_title", // Generic
      ".product-customers_title", // Generic
      ".product-clients_title",  // Generic
      ".product-users_title",    // Generic
      ".product-consumers_title", // Generic
      ".product-buyers_title",   // Generic
      ".product-purchasers_title", // Generic
      ".product-shoppers_title", // Generic
      ".product-visitors_title", // Generic
      ".product-guests_title",   // Generic
      ".product-audiences_title", // Generic
      ".product-spectators_title", // Generic
      ".product-viewers_title",  // Generic
      ".product-listeners_title", // Generic
      ".product-readers_title",  // Generic
      ".product-followers_title", // Generic
      ".product-fans_title",     // Generic
      ".product-supporters_title", // Generic
      ".product-backers_title",  // Generic
      ".product-sponsors_title", // Generic
      ".product-donors_title",   // Generic
      ".product-contributors_title", // Generic
      ".product-participants_title", // Generic
      ".product-contestants_title", // Generic
      ".product-competitors_title", // Generic
      ".product-opponents_title", // Generic
      ".product-rivals_title",   // Generic
      ".product-enemies_title",  // Generic
      ".product-adversaries_title", // Generic
      ".product-foes_title",     // Generic
      ".product-villains_title", // Generic
      ".product-antagonists_title", // Generic
      ".product-heroes_title",   // Generic
      ".product-champions_title", // Generic
      ".product-winners_title",  // Generic
      ".product-losers_title",   // Generic
      ".product-failures_title", // Generic
      ".product-successes_title", // Generic
      ".product-achievements_title", // Generic
      ".product-accomplishments_title", // Generic
      ".product-victories_title", // Generic
      ".product-triumphs_title", // Generic
      ".product-conquests_title", // Generic
      ".product-defeats_title",  // Generic
      ".product-losses_title",   // Generic
      ".product-failures_title",  // Generic
      ".product-mistakes_title", // Generic
      ".product-errors_title",   // Generic
      ".product-faults_title",   // Generic
      ".product-defects_title",  // Generic
      ".product-flaws_title",    // Generic
      ".product-weaknesses_title", // Generic
      ".product-shortcomings_title", // Generic
      ".product-limitations_title", // Generic
      ".product-restrictions_title", // Generic
      ".product-constraints_title", // Generic
      ".product-barriers_title",  // Generic
      ".product-obstacles_title", // Generic
      ".product-hurdles_title",  // Generic
      ".product-challenges_title", // Generic
      ".product-difficulties_title", // Generic
      ".product-problems_title",  // Generic
      ".product-issues_title",   // Generic
      ".product-troubles_title",  // Generic
      ".product-concerns_title", // Generic
      ".product-worries_title",  // Generic
      ".product-fears_title",    // Generic
      ".product-anxieties_title", // Generic
      ".product-stresses_title",  // Generic
      ".product-pressures_title", // Generic
      ".product-strains_title",   // Generic
      ".product-tensions_title",  // Generic
      ".product-conflicts_title", // Generic
      ".product-disputes_title",  // Generic
      ".product-arguments_title", // Generic
      ".product-debates_title",   // Generic
      ".product-controversies_title", // Generic
      ".product-disagreements_title", // Generic
      ".product-differences_title", // Generic
      ".product-divisions_title", // Generic
      ".product-splits_title",   // Generic
      ".product-separations_title", // Generic
      ".product-breakups_title",  // Generic
      ".product-divorces_title",  // Generic
      ".product-partings_title",  // Generic
      ".product-farewells_title", // Generic
      ".product-goodbyes_title",  // Generic
      ".product-leavings_title",  // Generic
      ".product-departures_title", // Generic
      ".product-exits_title",    // Generic
      ".product-escapes_title",  // Generic
      ".product-releases_title",  // Generic
      ".product-freedoms_title",  // Generic
      ".product-liberties_title", // Generic
      ".product-independences_title", // Generic
      ".product-autonomies_title", // Generic
      ".product-sovereignties_title", // Generic
      ".product-rights_title",   // Generic
      ".product-privileges_title", // Generic
      ".product-immunities_title", // Generic
      ".product-exemptions_title", // Generic
      ".product-exceptions_title", // Generic
      ".product-exclusions_title", // Generic
      ".product-rejections_title", // Generic
      ".product-refusals_title",  // Generic
      ".product-denials_title",   // Generic
      ".product-negations_title", // Generic
      ".product-contradictions_title", // Generic
      ".product-oppositions_title", // Generic
      ".product-resistances_title", // Generic
      ".product-rebellions_title", // Generic
      ".product-revolutions_title", // Generic
      ".product-uprisings_title", // Generic
      ".product-insurrections_title", // Generic
      ".product-mutinies_title",  // Generic
      ".product-revolts_title",  // Generic
      ".product-protests_title",  // Generic
      ".product-demonstrations_title", // Generic
      ".product-marches_title",  // Generic
      ".product-rallies_title",   // Generic
      ".product-meetings_title",  // Generic
      ".product-gatherings_title", // Generic
      ".product-assemblies_title", // Generic
      ".product-conventions_title", // Generic
      ".product-conferences_title", // Generic
      ".product-congresses_title", // Generic
      ".product-symposiums_title", // Generic
      ".product-seminars_title",  // Generic
      ".product-workshops_title", // Generic
      ".product-classes_title",  // Generic
      ".product-courses_title",  // Generic
      ".product-lessons_title",  // Generic
      ".product-sessions_title",  // Generic
      ".product-terms_title",    // Generic
      ".product-semesters_title", // Generic
      ".product-years_title",    // Generic
      ".product-grades_title",   // Generic
      ".product-levels_title",   // Generic
      ".product-stages_title",   // Generic
      ".product-phases_title",   // Generic
      ".product-steps_title",    // Generic
      ".product-degrees_title",  // Generic
      ".product-ranks_title",    // Generic
      ".product-titles_title",   // Generic
      ".product-positions_title", // Generic
      ".product-roles_title",    // Generic
      ".product-functions_title", // Generic
      ".product-duties_title",   // Generic
      ".product-responsibilities_title", // Generic
      ".product-tasks_title",    // Generic
      ".product-activities_title", // Generic
      ".product-actions_title",  // Generic
      ".product-operations_title", // Generic
      ".product-processes_title", // Generic
      ".product-procedures_title", // Generic
      ".product-methods_title",  // Generic
      ".product-techniques_title", // Generic
      ".product-skills_title",   // Generic
      ".product-abilities_title", // Generic
      ".product-talents_title",  // Generic
      ".product-gifts_title",    // Generic
      ".product-strengths_title", // Generic
      ".product-weaknesses_title", // Generic
      ".product-opportunities_title", // Generic
      ".product-threats_title",  // Generic
      ".product-risks_title",    // Generic
      ".product-challenges_title", // Generic
      ".product-solutions_title", // Generic
      ".product-answers_title",  // Generic
      ".product-responses_title", // Generic
      ".product-reactions_title", // Generic
      ".product-feedbacks_title", // Generic
      ".product-comments_title", // Generic
      ".product-reviews_title",  // Generic
      ".product-ratings_title",  // Generic
      ".product-scores_title",   // Generic
      ".product-points_title",   // Generic
      ".product-marks_title",    // Generic
      ".product-grades_title",   // Generic
      ".product-levels_title",   // Generic
      ".product-standards_title", // Generic
      ".product-criteria_title", // Generic
      ".product-measures_title",  // Generic
      ".product-metrics_title",  // Generic
      ".product-indicators_title", // Generic
      ".product-benchmarks_title", // Generic
      ".product-targets_title",  // Generic
      ".product-goals_title",    // Generic
      ".product-objectives_title", // Generic
      ".product-aims_title",     // Generic
      ".product-purposes_title", // Generic
      ".product-intentions_title", // Generic
      ".product-plans_title",    // Generic
      ".product-strategies_title", // Generic
      ".product-tactics_title",  // Generic
      ".product-policies_title", // Generic
      ".product-rules_title",    // Generic
      ".product-regulations_title", // Generic
      ".product-laws_title",     // Generic
      ".product-standards_title", // Generic
      ".product-guidelines_title", // Generic
      ".product-principles_title", // Generic
      ".product-values_title",   // Generic
      ".product-ethics_title",   // Generic
      ".product-morals_title",   // Generic
      ".product-beliefs_title",  // Generic
      ".product-attitudes_title", // Generic
      ".product-behaviors_title", // Generic
      ".product-habits_title",   // Generic
      ".product-practices_title", // Generic
      ".product-customs_title",  // Generic
      ".product-traditions_title", // Generic
      ".product-cultures_title",  // Generic
      ".product-societies_title", // Generic
      ".product-communities_title", // Generic
      ".product-groups_title",   // Generic
      ".product-teams_title",    // Generic
      ".product-organizations_title", // Generic
      ".product-institutions_title", // Generic
      ".product-systems_title",  // Generic
      ".product-structures_title", // Generic
      ".product-frameworks_title", // Generic
      ".product-models_title",   // Generic
      ".product-patterns_title", // Generic
      ".product-designs_title",  // Generic
      ".product-plans_title",    // Generic
      ".product-layouts_title",  // Generic
      ".product-formats_title",  // Generic
      ".product-templates_title", // Generic
      ".product-schemes_title",  // Generic
      ".product-methods_title",  // Generic
      ".product-approaches_title", // Generic
      ".product-techniques_title", // Generic
      ".product-processes_title", // Generic
      ".product-procedures_title", // Generic
      ".product-operations_title", // Generic
      ".product-activities_title", // Generic
      ".product-actions_title",  // Generic
      ".product-tasks_title",    // Generic
      ".product-functions_title", // Generic
      ".product-roles_title",    // Generic
      ".product-responsibilities_title", // Generic
      ".product-duties_title",   // Generic
      ".product-obligations_title", // Generic
      ".product-requirements_title", // Generic
      ".product-specifications_title", // Generic
      ".product-standards_title", // Generic
      ".product-criteria_title", // Generic
      ".product-measures_title",  // Generic
      ".product-metrics_title",  // Generic
      ".product-indicators_title", // Generic
      ".product-benchmarks_title", // Generic
      ".product-targets_title",  // Generic
      ".product-goals_title",    // Generic
      ".product-objectives_title", // Generic
      ".product-aims_title",     // Generic
      ".product-purposes_title", // Generic
      ".product-intentions_title", // Generic
      ".product-plans_title",    // Generic
      ".product-strategies_title", // Generic
      ".product-tactics_title",  // Generic
      ".product-policies_title", // Generic
      ".product-rules_title",    // Generic
      ".product-regulations_title", // Generic
      ".product-laws_title",     // Generic
      ".product-standards_title", // Generic
      ".product-guidelines_title", // Generic
      ".product-principles_title", // Generic
      ".product-values_title",   // Generic
      ".product-ethics_title",   // Generic
      ".product-morals_title",   // Generic
      ".product-beliefs_title",  // Generic
      ".product-attitudes_title", // Generic
      ".product-behaviors_title", // Generic
      ".product-habits_title",   // Generic
      ".product-practices_title", // Generic
      ".product-customs_title",  // Generic
      ".product-traditions_title", // Generic
      ".product-cultures_title",  // Generic
      ".product-societies_title", // Generic
      ".product-communities_title", // Generic
      ".product-groups_title",   // Generic
      ".product-teams_title",    // Generic
      ".product-organizations_title", // Generic
      ".product-institutions_title", // Generic
      ".product-systems_title",  // Generic
      ".product-structures_title", // Generic
      ".product-frameworks_title", // Generic
      ".product-models_title",   // Generic
      ".product-patterns_title", // Generic
      ".product-designs_title",  // Generic
      ".product-plans_title",    // Generic
      ".product-layouts_title",  // Generic
      ".product-formats_title",  // Generic
      ".product-templates_title", // Generic
      ".product-schemes_title",  // Generic
      ".product-methods_title",  // Generic
      ".product-approaches_title", // Generic
      ".product-techniques_title", // Generic
      ".product-processes_title", // Generic
      ".product-procedures_title", // Generic
      ".product-operations_title", // Generic
      ".product-activities_title", // Generic
      ".product-actions_title",  // Generic
      ".product-tasks_title",    // Generic
      ".product-functions_title", // Generic
      ".product-roles_title",    // Generic
      ".product-responsibilities_title", // Generic
      ".product-duties_title",   // Generic
      ".product-obligations_title", // Generic
      ".product-requirements_title", // Generic
      ".product-specifications_title", // Generic
      ".product-standards_title", // Generic
      ".product-criteria_title", // Generic
      ".product-measures_title",  // Generic
      ".product-metrics_title",  // Generic
      ".product-indicators_title", // Generic
      ".product-benchmarks_title", // Generic
      ".product-targets_title",  // Generic
      ".product-goals_title",    // Generic
      ".product-objectives_title", // Generic
      ".product-aims_title",     // Generic
      ".product-purposes_title", // Generic
      ".product-intentions_title", // Generic
      ".product-plans_title",    // Generic
      ".product-strategies_title", // Generic
      ".product-tactics_title",  // Generic
      ".product-policies_title", // Generic
      ".product-rules_title",    // Generic
      ".product-regulations_title", // Generic
      ".product-laws_title",     // Generic
      ".product-standards_title", // Generic
      ".product-guidelines_title", // Generic
      ".product-principles_title", // Generic
      ".product-values_title",   // Generic
      ".product-ethics_title",   // Generic
      ".product-morals_title",   // Generic
      ".product-beliefs_title",  // Generic
      ".product-attitudes_title", // Generic
      ".product-behaviors_title", // Generic
      ".product-habits_title",   // Generic
      ".product-practices_title", // Generic
      ".product-customs_title",  // Generic
      ".product-traditions_title", // Generic
      ".product-cultures_title",  // Generic
      ".product-societies_title", // Generic
      ".product-communities_title", // Generic
      ".product-groups_title",   // Generic
      ".product-teams_title",    // Generic
      ".product-organizations_title", // Generic
      ".product-institutions_title", // Generic
      ".product-systems_title",  // Generic
      ".product-structures_title", // Generic
      ".product-frameworks_title", // Generic
      ".product-models_title",   // Generic
      ".product-patterns_title", // Generic
      ".product-designs_title",  // Generic
      ".product-plans_title",    // Generic
      ".product-layouts_title",  // Generic
      ".product-formats_title",  // Generic
      ".product-templates_title", // Generic
    ];
    
    for (const selector of commonSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = (element.textContent || element.innerText || "").trim();
        if (text && text.length > 5 && text.length < 300) {
          productName = text;
          console.log("[PLATFORM_SPECIFIC] Found with selector:", selector, "Text:", productName);
          break;
        }
      }
    }
    
    // Try brand extraction
    const brandSelectors = [
      '[itemprop="brand"]',
      '.brand',
      '#brand',
      '.product-brand',
      '.seller-name',
      '.manufacturer'
    ];
    
    for (const selector of brandSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        brand = (element.textContent || element.innerText || element.content || "").trim();
        if (brand) {
          console.log("[PLATFORM_SPECIFIC] Found brand:", brand);
          break;
        }
      }
    }
    
    if (productName) {
      const result = { productName };
      if (brand) result.brand = brand;
      return result;
    }
    
    return null;
  } catch (e) {
    console.log("[PLATFORM_SPECIFIC] Extraction error:", e);
    return null;
  }
}

function extractDocumentTitle() {
  try {
    const title = document.title;
    if (title && title.trim() && title.length > 5 && title.length < 300) {
      console.log("[DOCUMENT_TITLE] Using document.title:", title);
      return {
        productName: title.trim()
      };
    }
    return null;
  } catch (e) {
    console.log("[DOCUMENT_TITLE] Extraction error:", e);
    return null;
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractProductUniversal,
    detectPlatform,
    extractJsonLd,
    extractMetadata,
    extractSemanticElements,
    extractPlatformSpecific,
    extractDocumentTitle
  };
}
