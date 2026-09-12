const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createServer}=require('node:http');
const {chromium}=require('../.test-tools/node_modules/playwright');
test('busca presencial filtra sem acentos, preserva outros itens e salva os totais corretos',async()=>{
  const root=path.resolve('front-end');
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream'));res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{for(const width of [320,390,1440]){
    const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={demoAdminPin:"test"};'});return route.continue();});
    await page.addInitScript(()=>{
      sessionStorage.setItem('snoop_admin_session_v1','authenticated');
      localStorage.setItem('snoop_products_v1',JSON.stringify([
        {id:'absolut',name:'Absolut',price:30,category:'Vodka',available:true},
        {id:'agua',name:'Água com gás 500ml',price:5,category:'Águas',available:true},
        {id:'beer',name:'Heineken 600ml',price:10,sale_price:8,category:'Cervejas',available:true},
        {id:'hidden',name:'Água sem estoque',price:3,category:'Águas',available:false}
      ]));
    });
    await page.goto(origin+'/admin.html');await page.locator('#addManualOrder').click();
    await page.locator('#manualOrderForm [name=status]').selectOption('pending');
    await page.locator('#addManualItem').click();
    const first=page.locator('.manual-item-row').nth(0),second=page.locator('.manual-item-row').nth(1);
    await second.locator('[data-manual-product]').selectOption('beer');await second.locator('[data-manual-quantity]').fill('2');
    await first.locator('[data-manual-search]').fill('inexistente');
    assert.equal(await first.locator('[data-manual-product]').inputValue(),'');
    assert.match(await first.locator('[data-manual-search-status]').textContent(),/Nenhum produto/);
    assert.match(await first.locator('.manual-line-total').textContent(),/0,00/);
    assert.match(await second.locator('.manual-line-total').textContent(),/16,00/);
    await page.locator('#saveManualOrder').click();assert.equal(await page.locator('#manualOrderDialog').isVisible(),true);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_orders_v1')||'[]').length),0);
    await first.locator('[data-manual-search]').fill('ag');
    assert.equal(await first.locator('[data-manual-suggestion]').count(),1);
    assert.match(await first.locator('[data-manual-suggestion]').textContent(),/500ml/);
    await first.locator('[data-manual-search]').press('Escape');assert.equal(await first.locator('.manual-suggestions').isVisible(),false);assert.equal(await page.locator('#manualOrderDialog').isVisible(),true);
    await first.locator('[data-manual-search]').fill('agu');
    await first.locator('[data-manual-search]').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-tools/manual-suggestions-'+width+'.png'});
    await first.locator('[data-manual-suggestion]').click();assert.equal(await first.locator('[data-manual-product]').inputValue(),'agua');assert.equal(await first.locator('.manual-suggestions').isVisible(),false);
    await first.locator('[data-manual-search]').fill('AGUA GAS');
    await first.locator('[data-manual-search]').press('ArrowDown');
    assert.equal(await first.locator('[data-manual-suggestion][aria-selected=true]').count(),1);
    assert.equal(await first.locator('[data-manual-product] option').count(),2);
    await first.locator('[data-manual-search]').press('Enter');assert.equal(await page.locator('#manualOrderDialog').isVisible(),true);
    await first.locator('[data-manual-product]').selectOption('agua');await first.locator('[data-manual-quantity]').fill('2');
    assert.match(await page.locator('#manualOrderTotal').textContent(),/26,00/);
    await first.locator('[data-manual-search]').fill('');assert.equal(await first.locator('[data-manual-product]').inputValue(),'agua');
    assert.equal(await first.locator('[data-manual-product] option[value=hidden]').count(),0);
    await second.locator('[data-manual-search]').fill('CERVEJAS');assert.equal(await second.locator('[data-manual-product]').inputValue(),'beer');
    assert.equal(await second.locator('[data-manual-product] option').count(),2);
    assert.equal(await page.locator('#manualOrderDialog').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    await first.locator('[data-manual-search]').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-tools/manual-search-'+width+'.png'});
    await page.locator('#saveManualOrder').click();await page.locator('#manualOrderDialog').waitFor({state:'hidden'});
    const order=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_orders_v1'))[0]);assert.equal(order.trustedTotal,26);assert.deepEqual(order.items.map(i=>[i.productId,i.quantity]),[['agua',2],['beer',2]]);
    await page.locator('#addManualOrder').click();assert.equal(await page.locator('[data-manual-search]').inputValue(),'');
    assert.deepEqual(errors,[]);await page.close();
  }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
