// Teste local isolado: não consulta Supabase nem registra pedidos reais.
// npm.cmd install --prefix .test-tools --no-save --package-lock=false playwright
// node --test tests/catalog-navigation.browser.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../.test-tools/node_modules/playwright');
const root = path.resolve(__dirname, '..', 'front-end');
const categories = ['Cervejas', 'Energéticos', 'Refrigerantes', 'Águas', 'Whiskies', 'Vinhos', 'Gins', 'Vodkas', 'Gelo', 'Combos', 'Sucos', 'Licores', 'Destilados & especiais', 'Kits para festas e bebidas especiais sem álcool'];
const products = categories.flatMap((category, c) => Array.from({ length: 8 }, (_, i) => ({
  id: `p-${c}-${i}`, name: `${category} ${i + 1}`, description: 'Produto de teste', price: i === 1 ? 11111 : 10,
  category, image: c % 2 ? 'assets/carousel/06-coca-cola.jpg' : 'assets/carousel/02-heineken.jpg', available: true
})));


products[0].name = 'Auditoria <img src=x onerror="window.cartInjection=true">';
test('catalogo responsivo: categorias, busca e carrinho com texto seguro', async t => {
  const server = createServer(async (req,res) => {
    try {
      const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'));
      res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    for(const width of [320,360,375,390,430,560,768,820,1024,1440])await t.test(width+'px',async()=>{
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<=820,hasTouch:width<=820,reducedMotion:'reduce',serviceWorkers:'block'});
      try {
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/*',route=>{
          const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
          if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={};'});
          if(url.pathname==='/js/storage.js')return route.fulfill({contentType:'text/javascript',body:'window.StoreAPI={getProducts:async()=>'+JSON.stringify(products)+'};'});
          return route.continue();
        });
        await page.goto(origin);
        await page.waitForFunction(()=>document.querySelectorAll('.product-card').length===112);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        if(width<=820){
          assert.equal(await page.locator('.catalog-category').count(),14);
          await page.locator('.catalog-category summary').first().click();
          assert.equal(await page.locator('.catalog-category').first().getAttribute('open'),'');
        }else{
          await page.locator('.category-button').last().click();
          assert.equal(await page.locator('.product-card').count(),8);
          await page.locator('.category-button').first().click();
        }
        await page.locator('#searchInput').fill('Auditoria');
        assert.equal(await page.locator('.product-card').count(),1);
        await page.locator('.product-card .add-button').click();
        await page.locator('#purchaseForm .purchase-confirm').click();
        await page.locator('#openCart').click();
        assert.equal(await page.locator('.cart-line').count(),1);
        assert.equal(await page.locator('.cart-line h4 img').count(),0);
        assert.equal(await page.evaluate(()=>Boolean(window.cartInjection)),false);
        assert.match(await page.locator('.cart-line h4').textContent(),/auditoria/i);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
