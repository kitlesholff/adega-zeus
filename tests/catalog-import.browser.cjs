const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('../.test-tools/node_modules/playwright');
test('importação editável, combos e reexecução preservam dados',async()=>{
 const root=path.resolve('front-end');
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={demoAdminPin:"test",whatsapp:"5500000000000"}'});return route.continue();});
  await page.addInitScript(()=>sessionStorage.setItem('snoop_admin_session_v1','authenticated'));
  await page.goto(origin+'/admin.html');
  const first=await page.evaluate(()=>window.importZeusCatalog());assert.equal(first.inserted,293);
  const repeat=await page.evaluate(()=>window.importZeusCatalog());assert.equal(repeat.inserted,0);
  await page.evaluate(()=>document.querySelector('[data-view=products]').click());
  await page.locator('#productSearch').fill('Brahma');
  await page.locator('[data-edit="uairango-10999-3477643"]').click();
  await page.locator('#productForm [name=price]').fill('7.25');
  await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
  await page.evaluate(()=>window.importZeusCatalog());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.id==='uairango-10999-3477643').price),7.25);
  await page.locator('#productSearch').fill('Tanqueray');
  await page.locator('[data-edit="uairango-10999-3073981"]').click();
  assert.equal(await page.locator('[data-product-type=kit]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-kit-name="3"]').inputValue(),'Copos');
  await page.locator('#productForm [name=price]').fill('180');
  await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
  const combo=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.id==='uairango-10999-3073981'));
  assert.equal(combo.kit_items[3].name,'Copos');assert.equal(combo.kit_items[3].quantity,4);
  // Novo combo pelo cadastro manual: preço próprio e componentes editáveis.
  await page.locator('#addProduct').click();await page.locator('[data-product-type=kit]').click();
  await page.locator('[data-kit-product="0"]').selectOption('uairango-10999-1236479');
  await page.locator('[data-kit-product="1"]').selectOption('uairango-10999-1236461');
  await page.locator('#productForm [name=price]').fill('99');
  await page.locator('#productForm [name=category]').selectOption('COMBOS');
  await page.locator('#productForm [name=image]').fill('assets/catalogo/uairango-10999-1236479.png');
  await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
  const manual=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.name==='Red label + Red bull 250ml'));
  assert.equal(manual.product_type,'combo');assert.equal(manual.price,99);assert.equal(manual.kit_items.length,2);
  // Um combo sem composição na fonte continua editável e conserva o tipo.
  await page.locator('#productSearch').fill('combo jim beam');
  await page.locator('[data-edit="uairango-10999-3231181"]').click();
  await page.locator('#productForm [name=price]').fill('191');
  await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
  // Quantidade ausente é preservada, sem inventar uma unidade.
  await page.locator('#productSearch').fill('Red label');
  await page.locator('[data-edit="uairango-10999-568637"]').click();
  assert.equal(await page.locator('[data-kit-quantity="1"]').inputValue(),'');
  await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.id==='uairango-10999-568637').kit_items[1].quantity),null);
  await page.goto(origin+'/index.html');
  await page.locator('.catalog-category').first().waitFor();
  assert.equal(await page.locator('.catalog-category[open]').count(),0);
  const compare=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true}).compare;
  const labels=await page.locator('.catalog-category > summary > span:nth-child(2)').allTextContents();
  assert.deepEqual(labels,[...labels].sort(compare));
  const sentence=value=>value.toLocaleLowerCase('pt-BR').replace(/\p{L}/u,c=>c.toLocaleUpperCase('pt-BR'));
  for(const label of labels)assert.equal(label,sentence(label));
  for(const section of await page.locator('.catalog-category-list').all()){
    const names=await section.locator('h3').allTextContents();
    assert.deepEqual(names,[...names].sort(compare));
    for(const name of names)assert.equal(name,sentence(name));
  }
  await page.locator('[data-catalog-category="COMBOS"] > summary').click();
  const card=page.locator('[data-product-card="uairango-10999-3073981"]');
  await card.waitFor();assert.match(await card.locator('h3').innerText(),/Gin tanqueray \+ red bull/);
  assert.match(await card.locator('.product-price').innerText(),/180,00/);
  await card.locator('[data-add]').click();
  await page.locator('[data-purchase-delta="1"]').click();
  assert.match(await page.locator('#purchaseTotal').innerText(),/360,00/);
  await page.locator('.purchase-confirm').click();
  assert.match(await page.locator('#cartTotal').innerText(),/360,00/);
  await page.locator('[data-catalog-category="CERVEJA LATA"] > summary').click();
  const linked=page.locator('[data-catalog-category="CERVEJA LATA"] [data-product-card="uairango-10999-3477643"]');
  await linked.locator('[data-add]').click();assert.equal(await page.locator('.purchase-option').count(),2);
  assert.match(await page.locator('#purchaseOptions').innerText(),/Fardo · 12 un\./);
  await page.screenshot({path:'.test-tools/import-fardo-mobile.png'});
  await page.locator('#closePurchaseDialog').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#searchInput').fill('Tanqueray');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({path:'.test-tools/import-combos-mobile.png'});
  await page.locator('#searchInput').fill('produto inexistente xyz');
  assert.equal(await page.locator('#emptyState').isVisible(),true);
  await page.locator('#searchInput').fill('');
  for(const width of [320,360,430,768]){
    await page.setViewportSize({width,height:850});
    await page.locator('[data-catalog-category="CERVEJA LATA"]').evaluate(el=>el.open=true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:1280,height:900});
  await page.waitForFunction(()=>!document.querySelector('.catalog-category'));
  assert.equal(await page.locator('#categoryNavigation').isVisible(),true);
  const desktopNames=await page.locator('#productGrid h3').allTextContents();
  assert.deepEqual(desktopNames,[...desktopNames].sort(compare));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
