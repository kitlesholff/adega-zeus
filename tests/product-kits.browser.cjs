const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('../.test-tools/node_modules/playwright');

test('cadastro de combo, fardos e confirmação de exclusões',async()=>{
  const root=path.resolve(__dirname,'..','front-end');
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(await fs.readFile(file))}catch{res.writeHead(404).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={demoAdminPin:"test",storeName:"Snoop",whatsapp:"5592999999999"};'});return route.continue()});
    await page.addInitScript(()=>{
      sessionStorage.setItem('snoop_admin_session_v1','authenticated');
      if(!localStorage.getItem('snoop_products_v1')) localStorage.setItem('snoop_products_v1',JSON.stringify([
        {id:'whisky-base',name:'Whisky base',description:'Produto isolado do teste',price:50,category:'Combos',image:'assets/carousel/05-dewars-12.jpg',available:true,kit_items:[]},
        {id:'energetico-base',name:'Energético base',description:'Produto isolado do teste',price:10,category:'Combos',image:'assets/carousel/06-coca-cola.jpg',available:true,kit_items:[]}
      ]));
    });
    await page.goto(origin+'/admin.html');
    const resized=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;canvas.getContext('2d').fillRect(0,0,1200,600);const source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const url=await StoreAPI.uploadProductImage(new File([source],'produto.png',{type:'image/png'}));const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});return{width:image.naturalWidth,height:image.naturalHeight,url}});
    assert.deepEqual([resized.width,resized.height],[900,900]);assert.match(resized.url,/^data:image\/webp/);
    await page.locator('[data-view=products]').click();await page.locator('#addProduct').click();
    assert.equal(await page.locator('#productDialog').evaluate(dialog=>{const box=dialog.getBoundingClientRect();return Math.abs((box.left+box.width/2)-innerWidth/2)<2&&Math.abs((box.top+box.height/2)-innerHeight/2)<2}),true);
    await page.mouse.click(20,20);await page.locator('#productDialog').waitFor({state:'hidden'});assert.equal(await page.locator('[data-product-type=kit]').count(),1);await page.locator('#addProduct').click();
    await page.locator('#productForm [name=name]').fill('Produto temporário');
    await page.locator('#productForm [name=description]').fill('Produto usado para validar a exclusão.');
    await page.locator('#productForm [name=price]').fill('79.90');
    await page.locator('#productForm [name=image]').fill('assets/produtos/kit.webp');
    await page.locator('#saveProduct').click();await page.waitForTimeout(500);
    if(await page.locator('#productDialog').isVisible()){const detail=await page.evaluate(()=>({toast:document.querySelector('#toast').textContent,invalid:[...document.querySelectorAll('#productForm :invalid')].map(element=>element.name||element.outerHTML)}));throw new Error(JSON.stringify(detail))}
    await page.locator('.feedback-notification[data-tone=success]').first().waitFor({state:'visible'});
    const temporary=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(product=>product.name==='Produto temporário'));
    assert.equal(temporary.kit_items.length,0);assert.equal(temporary.price,79.9);
    await page.locator('#addProduct').click();
    await page.locator('#productForm [name=name]').fill('Cerveja Pilsen');await page.locator('#productForm [name=description]').fill('Cerveja gelada por unidade.');await page.locator('#productForm [name=price]').fill('6');
    await page.locator('#productForm [name=category]').selectOption('Combos');
    await page.locator('#productForm [name=image]').fill('assets/produtos/cerveja-unidade.webp');
    await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
    const baseBeer=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.name==='Cerveja Pilsen'));
    await page.locator('#addProduct').click();await page.locator('[data-product-type=box]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#boxBaseProduct option').length===2);
    assert.equal(await page.locator('#boxBaseProduct option').count(),2);
    await page.locator('#saveProduct').click();assert.equal(await page.locator('#productDialog').isVisible(),true);
    await page.locator('#boxBaseProduct').selectOption(baseBeer.id);
    assert.equal(await page.locator('#productForm [name=name]').isVisible(),false);
    await page.locator('#productForm [name=boxUnits]').fill('12');await page.locator('#productForm [name=boxPrice]').fill('60');await page.locator('#productForm [name=boxImage]').fill('assets/produtos/cerveja-caixinha.webp');await page.locator('#productBoxHasPromotion').check();await page.locator('#productForm [name=boxSalePrice]').fill('50');await page.locator('#productForm [name=boxPromotionLabel]').fill('Oferta da caixa fechada');
    await page.screenshot({path:'.test-tools/product-box-dialog.png',fullPage:false});
    await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
    await page.locator('.feedback-notification[data-tone=success]').first().waitFor({state:'visible'});
    const beer=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(product=>product.name==='Cerveja Pilsen'));
    const boxProduct=await page.evaluate(id=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.parent_product_id===id),beer.id);assert.equal(boxProduct.category,'Fardo');assert.equal(boxProduct.parent_product_id,beer.id);assert.equal(boxProduct.price,60);assert.equal(boxProduct.sale_price,50);assert.equal(beer.box_option,null);
    assert.equal(beer.id,baseBeer.id);assert.equal(beer.price,baseBeer.price);assert.equal(beer.image,baseBeer.image);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).length),5);
    assert.equal(await page.locator('#feedbackDialog').isVisible(),false);
    await page.locator('#productSearch').fill('Cerveja Pilsen');await page.locator('#productCategoryFilter').selectOption('Combos');assert.equal(await page.locator('#adminProducts .admin-product-row').count(),1);assert.match(await page.locator('#adminProducts').innerText(),/Cerveja Pilsen/);assert.equal(await page.locator('#productCategoryFilter').count(),1);
    await page.locator('#adminProducts [data-edit]').click();assert.equal(await page.locator('#productHasPromotion').isChecked(),false);await page.locator('#productHasPromotion').check();await page.locator('#productForm [name=salePrice]').fill('5');await page.locator('#productForm [name=promotionLabel]').fill('Promoção de verão');await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
    const promotionalBeer=await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(product=>product.name==='Cerveja Pilsen'));assert.equal(promotionalBeer.price,6);assert.equal(promotionalBeer.sale_price,5);assert.equal(promotionalBeer.promotion_label,'Promoção de verão');
    await page.locator('#productCategoryFilter').selectOption('Fardo');
    await page.locator('#adminProducts [data-edit]').click();
    assert.equal(await page.locator('#productForm [name=standaloneBoxUnits]').inputValue(),'12');
    await page.locator('#productForm [name=description]').fill('Fardo editada separadamente');
    await page.locator('#saveProduct').click();await page.locator('#productDialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('snoop_products_v1')).find(p=>p.id===id).parent_product_id,boxProduct.id),beer.id);
    await page.goto(origin+'/index.html');
    const card=page.locator('.product-card').filter({has:page.locator('h3',{hasText:/^Produto temporário$/})});await card.waitFor();assert.match(await card.locator('.product-price').innerText(),/79,90/);assert.equal(await card.locator('.kit-badge').count(),0);
    await card.locator('[data-add]').click();await page.locator('#purchaseForm .purchase-confirm').click();assert.equal(await page.locator('#cartCount').innerText(),'1');
    const beerCard=page.locator('.product-card').filter({has:page.locator('h3',{hasText:/^Cerveja Pilsen$/i})});assert.match(await beerCard.locator('.product-price s').innerText(),/6,00/);assert.match(await beerCard.locator('.product-price span').innerText(),/5,00/);assert.equal(await beerCard.locator('.product-price .promotion-discount').innerText(),'-17%');assert.equal(await page.locator(`[data-product-card="${boxProduct.id}"]`).count(),0);assert.equal(await beerCard.locator('[data-catalog-option]').count(),0);const boxCard=beerCard;
    for(const width of [320,360,390,430,768]){
      await page.setViewportSize({width,height:900});
      await page.locator('#searchInput').fill('Cerveja Pilsen');
      await beerCard.locator('[data-add]').click();
      assert.equal(await page.locator('#purchaseOptions input[type="radio"]').count(),2);
      assert.match(await page.locator('#purchaseOptions').innerText(),/Unidade/);
      assert.match(await page.locator('#purchaseOptions').innerText(),/Fardo · 12 un\./);
      assert.match(await page.locator('#purchaseOptions').innerText(),/50,00/);
      assert.equal(await page.locator('.purchase-option').evaluateAll(options=>options.every(option=>{const bounds=option.getBoundingClientRect(),dialog=option.closest('dialog').getBoundingClientRect();return bounds.height>=44&&bounds.left>=dialog.left&&bounds.right<=dialog.right;})),true,`opções inteiras e fáceis de tocar em ${width}px`);
      if(width===390)await page.screenshot({path:'.test-tools/mobile-purchase-modal.png'});
      await page.locator('#closePurchaseDialog').click();
    }
    await page.setViewportSize({width:1280,height:900});
    await boxCard.locator('[data-view-product-image]').click();assert.equal(await page.locator('#productImageDialog').isVisible(),true);await page.locator('#closeProductImage').click();assert.equal(await page.locator('#productImageDialog').isVisible(),false);
    await boxCard.locator('[data-view-product-image]').click();await page.locator('#productImageDialog').click({position:{x:2,y:2}});assert.equal(await page.locator('#productImageDialog').isVisible(),false);
    await boxCard.locator('[data-add]').click();const boxOption=page.locator('.purchase-option').filter({hasText:'Fardo · 12 un.'});await boxOption.locator('[data-purchase-delta="1"]').click();await boxOption.locator('[data-purchase-delta="1"]').click();assert.equal(await boxOption.locator('[data-purchase-quantity]').inputValue(),'3');assert.match(await boxOption.locator('[data-option-total]').innerText(),/150,00/);assert.match(await page.locator('#purchaseTotal').innerText(),/150,00/);await page.locator('#purchaseForm .purchase-confirm').click();assert.equal(await page.locator('#cartCount').innerText(),'4');assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('snoop_cart_v1'))[`${id}::unit`],boxProduct.id),3);
    assert.match(await page.locator('#cartItems').innerText(),/Fardo de Cerveja Pilsen \(12 un\.\)/i);
    const order=await page.evaluate(productId=>StoreAPI.createOrder({customerName:'Cliente teste',deliveryType:'Retirada',address:'',payment:'Pix',notes:'',clientTotal:1,items:[{productId,quantity:1,variant:'unit'}]}),boxProduct.id);
    assert.equal(order.trustedTotal,50);assert.match(order.items[0].name,/Fardo de Cerveja Pilsen/);
    await page.goto(origin+'/admin.html');await page.locator('[data-view=products]').click();assert.equal(await page.locator('[data-product-type=kit]').count(),1);await page.locator('#productSearch').fill('Produto temporário');const deleteProduct=page.locator('#adminProducts [data-delete]');await deleteProduct.click();assert.equal(await page.locator('#feedbackDialog').isVisible(),true);assert.match(await page.locator('#feedbackTitle').innerText(),/Excluir produto/i);assert.match(await page.locator('#feedbackMessage').innerText(),/Produto temporário/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).some(product=>product.name==='Produto temporário')),true);await page.locator('#feedbackCancel').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).some(product=>product.name==='Produto temporário')),true);await deleteProduct.click();await page.locator('#feedbackConfirm').click();await page.locator('.feedback-notification[data-tone=success]').first().waitFor({state:'visible'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_products_v1')).some(product=>product.name==='Produto temporário')),false);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
