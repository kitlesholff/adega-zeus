const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../.test-tools/node_modules/playwright');

const root = path.resolve(__dirname, '..', 'front-end');
const featured = { id: 'destaque-real', name: 'Produto real', description: 'Destaque', price: 15, sale_price: 12.5, promotion_label: 'Promoção de fim de ano', category: 'Teste', image: 'assets/carousel/02-heineken.jpg', available: true, featured: false };
const featuredTwo = { ...featured, id: 'destaque-real-2', name: 'Segundo produto', price: 20, sale_price: null, box_option:{units:12, price:100, sale_price:80, image:'assets/carousel/06-coca-cola.jpg',promotion_label:'Oferta da caixinha'} };

test('carrossel faz loop contínuo e compra produto real em destaque', async () => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (url.pathname === '/js/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.APP_CONFIG={};' });
      if (url.pathname === '/js/storage.js') return route.fulfill({ contentType: 'text/javascript', body: `window.StoreAPI={getProducts:async()=>${JSON.stringify([featured, featuredTwo,{...featured,id:'normal',sale_price:null,featured:true},{...featured,id:'sem-estoque',available:false}])},createOrder:async()=>{}};` });
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('[data-featured-product="destaque-real"]');
    assert.equal(await page.locator('.hero-carousel-dot').count(), 2);
    assert.equal(await page.locator('.hero-product-slide:not([data-carousel-clone])').count(), 2);
    assert.equal(await page.locator('.hero-carousel-track > [data-carousel-clone]').count(), 2);

    await page.locator('.hero-carousel-dot').last().click();
    await page.waitForTimeout(800);
    await page.locator('[data-carousel-next]').click();
    await page.waitForFunction(() => document.querySelector('.hero-carousel-track').style.transform === 'translate3d(-300%, 0px, 0px)');
    assert.equal(await page.locator('.hero-carousel-track').evaluate(element => element.style.transform), 'translate3d(-300%, 0px, 0px)');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.hero-carousel-track').evaluate(element => element.style.transform), 'translate3d(-100%, 0px, 0px)');

    await page.locator('.hero-carousel-dot').first().click();
    await page.waitForTimeout(800);
    const promotionalSlideText = await page.locator('.hero-product-slide:not([data-carousel-clone])').first().innerText();
    assert.match(promotionalSlideText, /promoção de fim de ano/i);
    assert.doesNotMatch(promotionalSlideText, /teste/i);
    assert.match(await page.locator('.hero-product-slide:not([data-carousel-clone])').first().locator('s').innerText(), /15,00/);
    assert.match(await page.locator('.hero-product-slide:not([data-carousel-clone])').first().locator('.hero-product-price b').innerText(), /12,50/);
    assert.equal(await page.locator('.hero-product-slide:not([data-carousel-clone])').first().evaluate(slide => {
      const image = slide.querySelector('img').getBoundingClientRect();
      const content = slide.querySelector('.hero-product-content').getBoundingClientRect();
      return image.bottom <= content.top + 1;
    }), true, 'a área de compra deve ficar abaixo da imagem');
    await page.locator('.hero-product-slide:not([data-carousel-clone]) .hero-buy-button').first().click();
    assert.equal(await page.locator('#purchaseDialog').isVisible(), true);
    await page.locator('#purchaseForm .purchase-confirm').click();
    assert.equal(await page.locator('#cartCount').textContent(), '1');
    await page.locator('.hero-carousel-dot').last().click();
    await page.waitForTimeout(800);
    const boxSlide=page.locator('.hero-product-slide:not([data-carousel-clone])').last();
    assert.match(await boxSlide.innerText(),/Fardo de Segundo produto/);
    assert.match(await boxSlide.locator('.hero-product-price b').innerText(),/80,00/);
    await boxSlide.locator('.hero-buy-button').click();
    await page.locator('#purchaseForm .purchase-confirm').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_cart_v1'))['destaque-real-2::box']),1);
    // Retirar todas as promoções oculta o carrossel mesmo com o antigo destaque marcado.
    await page.evaluate(items=>{StoreAPI.getProducts=async()=>items;window.dispatchEvent(new Event('focus'));},[{...featured,sale_price:null,featured:true}]);
    await page.waitForFunction(()=>document.querySelector('.hero-visual').hidden);
    assert.equal(await page.locator('.hero-slide').count(),0);
    // Uma nova promoção reaparece automaticamente; com um item não há navegação.
    await page.evaluate(items=>{StoreAPI.getProducts=async()=>items;window.dispatchEvent(new Event('focus'));},[featured]);
    await page.waitForFunction(()=>!document.querySelector('.hero-visual').hidden);
    assert.equal(await page.locator('.hero-product-slide:not([data-carousel-clone])').count(),1);
    assert.equal(await page.locator('[data-carousel-next]').isVisible(),false);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
