const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../front-end/js/storage.js'),'utf8');
function load(config){
  const writes=[],storage={getItem:()=>null,setItem:(...args)=>writes.push(args),removeItem:(...args)=>writes.push(args)};
  const context={window:{APP_CONFIG:config,DEFAULT_PRODUCTS:[]},localStorage:storage,sessionStorage:storage};
  vm.runInNewContext(source,context);return {api:context.window.StoreAPI,writes};
}
test('loja configurada sem SDK recusa operacoes e nao grava dados locais',async()=>{
  for(const config of [{supabaseUrl:'https://example.test',supabaseAnonKey:'public'},{supabaseUrl:'https://example.test'}]){
    const {api,writes}=load(config);assert.equal(api.mode,'cloud');
    for(const method of ['getProducts','login','isAuthenticated','createOrder','createExpense','saveProduct','resetOperationalData']){
      assert.equal(typeof api[method],'function');await assert.rejects(api[method](),/indispon/);
    }
    assert.deepEqual(writes,[]);
  }
});
test('demonstracao explicita continua disponivel para testes locais',async()=>{
  const {api}=load({demoAdminPin:'test'});assert.equal(api.mode,'local');assert.equal(await api.login('', 'test'),true);assert.equal(await api.login('', 'wrong'),false);
});

test('tabela de despesas ausente nao retorna sucesso nem altera armazenamento local',async()=>{
  const writes=[],storage={getItem:()=>null,setItem:(...args)=>writes.push(args)};
  const failure={error:{code:'42P01',message:'missing table'}};
  const query={select:()=>query,insert:()=>query,delete:()=>query,order:async()=>failure,single:async()=>failure,eq:async()=>failure};
  const context={window:{APP_CONFIG:{supabaseUrl:'https://example.test',supabaseAnonKey:'public'},supabase:{createClient:()=>({from:()=>query})}},localStorage:storage,sessionStorage:storage};
  vm.runInNewContext(source,context);const api=context.window.StoreAPI;
  await assert.rejects(api.getExpenses(),/indispon/);
  await assert.rejects(api.createExpense({description:'Teste',amount:10}),/salva/);
  await assert.rejects(api.deleteExpense('test'),/removida/);
  assert.deepEqual(writes,[]);
});
