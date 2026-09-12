(() => {
  "use strict";

  const carousel = document.getElementById("heroCarousel");
  if (!carousel) return;
  const track = carousel.querySelector(".hero-carousel-track");
  const dotsHost = carousel.querySelector(".hero-carousel-dots");
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const progressBar = carousel.querySelector(".hero-carousel-progress span");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pauseReasons = new Set();
  const changeDelay = 4800;

  let slides = [], dots = [], currentSlide = 0, physicalSlide = 1;
  let autoplayTimer = 0, pointerStartX = null, transitioning = false;
  if (!track || !dotsHost) return;

  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
  const productPrice = product => {
    const sale = Number(product?.sale_price), original = Number(product?.price) || 0;
    return sale > 0 && sale < original ? sale : original;
  };

  function stopAutoplay() {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = 0;
    progressBar?.classList.remove("running");
  }

  function startAutoplay() {
    stopAutoplay();
    if (reducedMotion.matches || document.hidden || pauseReasons.size || slides.length < 2) return;
    if (progressBar) { void progressBar.offsetWidth; progressBar.classList.add("running"); }
    autoplayTimer = window.setTimeout(() => move(1), changeDelay);
  }

  function setPosition(index, animate = true) {
    track.style.transition = animate ? "" : "none";
    track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
    if (!animate) { void track.offsetWidth; track.style.transition = ""; }
  }

  function updateState() {
    slides.forEach((slide, index) => {
      const active = index === currentSlide;
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      slide.querySelectorAll("button, a").forEach(control => control.tabIndex = active ? 0 : -1);
    });
    dots.forEach((dot, index) => {
      const active = index === currentSlide;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function showSlide(index) {
    if (transitioning || !slides.length) return;
    if (index === currentSlide) return;
    currentSlide = (index + slides.length) % slides.length;
    physicalSlide = currentSlide + 1;
    transitioning = !reducedMotion.matches;
    setPosition(physicalSlide);
    updateState();
    startAutoplay();
  }

  function move(direction) {
    if (transitioning || slides.length < 2) return;
    currentSlide = (currentSlide + direction + slides.length) % slides.length;
    physicalSlide += direction;
    transitioning = !reducedMotion.matches;
    setPosition(physicalSlide);
    updateState();
    startAutoplay();
    if (!transitioning) normalizeLoop();
  }

  function normalizeLoop() {
    transitioning = false;
    if (physicalSlide === 0) { physicalSlide = slides.length; setPosition(physicalSlide, false); }
    else if (physicalSlide === slides.length + 1) { physicalSlide = 1; setPosition(physicalSlide, false); }
  }

  function createProductSlide(product) {
    const slide = document.createElement("article");
    slide.className = "hero-slide hero-product-slide";
    slide.dataset.featuredProduct = product.id;
    slide.dataset.variant = product.variant || 'unit';
    slide.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.src = product.image; image.alt = product.name; image.loading = "lazy";
    const content = document.createElement("div");
    content.className = "hero-product-content";
    const name = document.createElement("strong"); name.textContent = product.name;
    const promotional = productPrice(product) < Number(product.price);
    const promotion = document.createElement("span"); promotion.className = "hero-promotion-label"; promotion.textContent = String(product.promotion_label || "").trim() || "Promoção";
    const price = document.createElement("div"); price.className = `hero-product-price${promotional ? " promotional" : ""}`;
    if (promotional) { const original = document.createElement("s"); original.textContent = money(product.price); price.appendChild(original); }
    const current = document.createElement("b"); current.textContent = money(productPrice(product)); price.appendChild(current);
    const buy = document.createElement("button");
    buy.type = "button"; buy.className = "hero-buy-button"; buy.dataset.buyFeatured = product.id; buy.textContent = "Comprar agora";
    buy.dataset.variant = product.variant || 'unit';
    if (promotional) content.appendChild(promotion);
    content.append(name, price, buy);
    slide.append(image, content);
    return slide;
  }

  function rebuild(featuredProducts = []) {
    stopAutoplay();
    const previousProduct = slides[currentSlide]?.dataset.featuredProduct;
    const previousVariant = slides[currentSlide]?.dataset.variant;
    transitioning = false;
    slides = featuredProducts.filter(product => product?.available).flatMap(product => {
      const offers = [];
      if (productPrice(product) < Number(product.price)) offers.push({...product, variant:'unit'});
      const box = product.box_option;
      if (box && productPrice(box) < Number(box.price)) offers.push({...box, id:product.id, variant:'box', name:`Fardo de ${product.name} (${box.units} un.)`});
      return offers;
    }).map(createProductSlide);
    const visual = carousel.closest(".hero-visual");
    if (!slides.length) {
      track.replaceChildren(); dotsHost.replaceChildren();
      currentSlide = 0; physicalSlide = 1; dots = [];
      pauseReasons.delete('hover'); pauseReasons.delete('gesture'); pointerStartX = null;
      if (visual) visual.hidden = true;
      return;
    }
    if (visual) visual.hidden = false;
    const previousIndex = previousProduct ? slides.findIndex(slide => slide.dataset.featuredProduct === previousProduct && slide.dataset.variant === previousVariant) : -1;
    currentSlide = previousIndex >= 0 ? previousIndex : Math.min(currentSlide, slides.length - 1);
    const firstClone = slides[0].cloneNode(true), lastClone = slides.at(-1).cloneNode(true);
    firstClone.dataset.carouselClone = "true"; lastClone.dataset.carouselClone = "true";
    firstClone.setAttribute("aria-hidden", "true"); lastClone.setAttribute("aria-hidden", "true");
    firstClone.inert = true; lastClone.inert = true;
    track.replaceChildren(lastClone, ...slides, firstClone);
    dotsHost.replaceChildren();
    const multipleSlides = slides.length > 1;
    if (previousButton) previousButton.hidden = !multipleSlides;
    if (nextButton) nextButton.hidden = !multipleSlides;
    dots = slides.map((slide, index) => {
      const dot = document.createElement("button");
      dot.className = "hero-carousel-dot"; dot.type = "button";
      dot.setAttribute("aria-label", `Mostrar destaque ${index + 1} de ${slides.length}`);
      dot.addEventListener("click", () => showSlide(index));
      dotsHost.appendChild(dot);
      return dot;
    });
    physicalSlide = currentSlide + 1;
    setPosition(physicalSlide, false);
    updateState();
    startAutoplay();
  }

  track.addEventListener("transitionend", event => { if (event.propertyName === "transform") normalizeLoop(); });
  previousButton?.addEventListener("click", () => move(-1));
  nextButton?.addEventListener("click", () => move(1));
  carousel.addEventListener("click", event => {
    const button = event.target.closest("[data-buy-featured]");
    if (button) window.dispatchEvent(new CustomEvent("zeus:buy-product", { detail: { productId: button.dataset.buyFeatured, variant:button.dataset.variant } }));
  });
  carousel.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
  });
  carousel.addEventListener("mouseenter", () => { pauseReasons.add("hover"); stopAutoplay(); });
  carousel.addEventListener("mouseleave", () => { pauseReasons.delete("hover"); startAutoplay(); });
  carousel.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    pointerStartX = event.clientX; pauseReasons.add("gesture"); stopAutoplay();
  });
  carousel.addEventListener("pointerup", event => {
    if (pointerStartX === null) return;
    const movement = event.clientX - pointerStartX; pointerStartX = null;
    if (Math.abs(movement) >= 45) move(movement < 0 ? 1 : -1);
    pauseReasons.delete("gesture"); startAutoplay();
  });
  carousel.addEventListener("pointercancel", () => { pointerStartX = null; pauseReasons.delete("gesture"); startAutoplay(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseReasons.add("hidden"); else pauseReasons.delete("hidden");
    startAutoplay();
  });
  reducedMotion.addEventListener?.("change", startAutoplay);
  window.addEventListener("zeus:products-loaded", event => rebuild(event.detail?.products || []));
  rebuild();
})();
