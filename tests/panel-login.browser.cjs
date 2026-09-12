const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createServer}=require('node:http');
const {chromium}=require('../.test-tools/node_modules/playwright');
test('login diferencia credenciais recusadas, operador valido e acesso desativado',async()=>{
  const root=path.resolve('front-end');
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream'));res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:`
        window.APP_CONFIG={supabaseUrl:'https://isolated.test',supabaseAnonKey:'public-test'};
        let session=null;
        const query={select(){return this},order(){return this},eq(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};
        window.supabase={createClient:()=>({
          auth:{
            getSession:async()=>({data:{session}}),
            getUser:async()=>({data:{user:session?.user}}),
            signOut:async()=>{session=null;return {}},
            signInWithPassword:async({email,password})=>{
              await new Promise(resolve=>setTimeout(resolve,150));
              if(password!=='valid-password')return {error:{code:'invalid_credentials',message:'Invalid login credentials'}};
              session={user:{id:'operator',email}};return {error:null};
            }
          },
          from:()=>query,
          rpc:async(name)=>({data:name==='panel_role'?(session?.user.email==='inactive@example.test'?null:'operator'):{session:null,movements:[],pending:[],latest:null}})
        })};
      `});
      return route.continue();
    });
    await page.goto(origin+'/admin.html');await page.locator('#adminLogin').waitFor({state:'visible'});
    await page.locator('#loginForm [name=email]').fill('operator@example.test');await page.locator('#loginForm [name=password]').fill('wrong-password');
    await page.locator('#loginForm button[type=submit]').click();await page.locator('#loginError').waitFor({state:'visible'});
    assert.match(await page.locator('#loginError').textContent(),/E-mail ou senha incorretos/);
    assert.equal(await page.locator('#adminShell').isVisible(),false);
    assert.equal(await page.locator('.feedback-notification[data-tone=success]').count(),0);
    assert.equal(await page.locator('.feedback-notification[data-tone=danger] strong').first().textContent(),'Erro');
    assert.equal(await page.locator('#loginForm button[type=submit]').isEnabled(),true);
    await page.screenshot({path:'.test-tools/login-invalid-390.png'});
    await page.locator('#loginForm [name=password]').fill('valid-password');await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#adminShell').waitFor({state:'visible'});assert.equal(await page.locator('#adminLogin').isVisible(),false);
    assert.deepEqual(await page.locator('.nav-item').evaluateAll(items=>items.filter(item=>!item.hidden).map(item=>item.dataset.view)),['orders','cashClosing']);
    await page.locator('#mobileMenu').click();await page.locator('#logoutButton').click();await page.locator('#adminLogin').waitFor({state:'visible'});
    await page.locator('#loginForm [name=email]').fill('inactive@example.test');await page.locator('#loginForm [name=password]').fill('valid-password');await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#loginError').waitFor({state:'visible'});assert.match(await page.locator('#loginError').textContent(),/acesso ativo/);
    assert.equal(await page.locator('#adminShell').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});
