(function () {
  // Empty state for unavailable remote images, without changing the saved product.
  document.addEventListener('error', event => {
    const image=event.target;
    if (!(image instanceof HTMLImageElement)||image.dataset.imageFallback) return;
    if (!image.closest('.product-card,.purchase-option,.cart-line,.admin-product-row')) return;
    image.dataset.imageFallback='true';
    image.src='assets/product-image-pending.svg';
  },true);
})();
