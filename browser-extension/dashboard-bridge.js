let deliveryTimer;
const BRIDGE_ID = "product-importer-extension-payload";

async function deliverPendingProduct() {
  const { pendingAmazonProduct } = await chrome.storage.local.get("pendingAmazonProduct");
  if (!pendingAmazonProduct?.id || !pendingAmazonProduct?.product) return;
  clearInterval(deliveryTimer);
  const envelope = {
    source: "product-importer-extension",
    type: "AMAZON_PRODUCT",
    id: pendingAmazonProduct.id,
    payload: JSON.stringify(pendingAmazonProduct.product)
  };
  const send = async () => {
    let bridge = document.getElementById(BRIDGE_ID);
    if (!bridge) {
      bridge = document.createElement("div");
      bridge.id = BRIDGE_ID;
      bridge.hidden = true;
      document.documentElement.appendChild(bridge);
    }
    if (bridge.dataset.accepted === pendingAmazonProduct.id) {
      clearInterval(deliveryTimer);
      await chrome.storage.local.remove("pendingAmazonProduct");
      bridge.remove();
      return;
    }
    bridge.dataset.importId = pendingAmazonProduct.id;
    bridge.textContent = JSON.stringify(envelope);
    window.dispatchEvent(new CustomEvent("product-importer:amazon-product", { detail: JSON.stringify(envelope) }));
    window.postMessage(envelope, location.origin);
  };
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
