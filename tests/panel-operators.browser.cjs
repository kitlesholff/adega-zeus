const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createServer}=require('node:http');
const {chromium}=require('../.test-tools/node_modules/playwright');
test('administrador gerencia equipe; operador ve somente pedidos e caixa no celular e computador',async()=>{
  const root=path.resolve('front-end');
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream'));res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={demoAdminPin:"test"};'});
      if(url.pathname==='/js/storage.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'js/storage.js'),'utf8')+`
        StoreAPI.getPanelRole=async function(){this.panelRole=sessionStorage.getItem('testRole')||null;return this.panelRole;};
        let users=[];
        StoreAPI.listOperators=async()=>users;
        StoreAPI.createOperator=async input=>{users.push({user_id:'operator-id',display_name:input.name,email:input.email,active:true});return {id:'operator-id'};};
        StoreAPI.setOperatorActive=async(id,active)=>{users.find(u=>u.user_id===id).active=active;};
      `});
      return route.continue();
    });
    await page.addInitScript(()=>{sessionStorage.setItem('snoop_admin_session_v1','authenticated');if(!sessionStorage.getItem('roleInitialized')){sessionStorage.setItem('testRole','admin');sessionStorage.setItem('roleInitialized','yes');}});
    await page.goto(origin+'/admin.html');await page.locator('#adminShell').waitFor({state:'visible'});
    if(width<820)await page.locator('#mobileMenu').click();
    await page.locator('[data-view=users]').click();await page.locator('#usersView').waitFor({state:'visible'});
    await page.locator('#operatorForm [name=name]').fill('Operador de teste');await page.locator('#operatorForm [name=email]').fill('op@example.test');await page.locator('#operatorForm [name=password]').fill('Senha teste 12345');await page.locator('#operatorForm button[type=submit]').click();
    await page.locator('.operator-row').waitFor();assert.equal(await page.locator('#operatorForm [name=password]').inputValue(),'');
    await page.locator('[data-operator]').click();await page.waitForFunction(()=>document.querySelector('.operator-row small').textContent.includes('desativado'));
    await page.locator('[data-operator]').click();await page.waitForFunction(()=>document.querySelector('.operator-row small').textContent.includes('Ativo'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'.test-tools/operators-'+width+'.png'});
    await page.evaluate(()=>sessionStorage.setItem('testRole','operator'));await page.reload();await page.locator('#adminShell').waitFor({state:'visible'});
    const allowed=await page.locator('.nav-item').evaluateAll(items=>items.filter(b=>!b.hidden).map(b=>b.dataset.view));assert.deepEqual(allowed,['orders','cashClosing']);
    await page.evaluate(()=>document.querySelector('[data-view=users]').click());assert.equal(await page.locator('#usersView').isVisible(),false);
    if(width<820)await page.locator('#mobileMenu').click();await page.locator('[data-view=cashClosing]').click();await page.locator('#cashClosingView').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'.test-tools/operator-cash-'+width+'.png'});
    await page.evaluate(()=>{sessionStorage.setItem('testRole','');document.querySelector('#refreshOrders').click();});await page.locator('#adminShell').waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);await page.close();
  }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
