let deliveryTimer;

async function deliverPendingProduct() {
  const { pendingAmazonProduct } = await chrome.storage.local.get("pendingAmazonProduct");
  if (!pendingAmazonProduct?.id || !pendingAmazonProduct?.product) return;
  clearInterval(deliveryTimer);
  const send = () => window.postMessage({
    source: "product-importer-extension",
    type: "AMAZON_PRODUCT",
    id: pendingAmazonProduct.id,
    payload: JSON.stringify(pendingAmazonProduct.product)
  }, location.origin);
  send();
  deliveryTimer = setInterval(send, 500);
}

window.addEventListener("message", async event => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== "product-importer-dashboard" || event.data?.type !== "AMAZON_PRODUCT_ACCEPTED") return;
  const { pendingAmazonProduct } = await chrome.storage.local.get("pendingAmazonProduct");
  if (pendingAmazonProduct?.id === event.data.id) {
    clearInterval(deliveryTimer);
    await chrome.storage.local.remove("pendingAmazonProduct");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pendingAmazonProduct?.newValue) deliverPendingProduct();
});

deliverPendingProduct();
