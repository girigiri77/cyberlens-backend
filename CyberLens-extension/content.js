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

chrome.runtime.onMessage.addListener((req, sender, sendResponse)=>{

  if(req.type === "GET_OFFERS"){

    const offers = extractOffers();

    sendResponse({offers});

  }

});