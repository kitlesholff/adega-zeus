const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('back-end/supabase/functions/create-panel-operator/index.ts','utf8').replace(/^import .*;\r?\n/,''));
function handler({allowed=true,valid=true,registerError=false,cleanupError=false}={}) {
  const calls=[];let serve;
  const admin={auth:{getUser:async()=>({data:{user:valid?{id:'owner'}:null},error:valid?null:{}}),admin:{
    createUser:async input=>{calls.push(['create',input]);return {data:{user:{id:'new-user'}}};},
    deleteUser:async id=>{calls.push(['delete',id]);return {error:cleanupError?{}:null};}
  }},rpc:async(name,args)=>{calls.push([name,args]);return {error:registerError?{}:null};}};
  const caller={rpc:async()=>({data:allowed})};
  vm.runInNewContext(source,{Request,Response,JSON,Deno:{env:{get:key=>key},serve:fn=>serve=fn},createClient:(_url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?admin:caller});
  return {calls,run:(body,authorization='Bearer valid')=>serve(new Request('https://example.test/function',{method:'POST',headers:{Authorization:authorization},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
const input={name:'Operador',email:'op@example.test',password:'Senha de teste 123'};
test('funcao recusa visitante, sessao invalida e operador antes de criar conta',async()=>{
  for(const options of [{valid:false},{allowed:false}]){const h=handler(options);assert.ok([401,403].includes((await h.run(input)).status));assert.equal(h.calls.length,0);}
  const h=handler();assert.equal((await h.run(input,'')).status,401);assert.equal(h.calls.length,0);
});
test('funcao valida entrada e nao aceita escalada pelo corpo da requisicao',async()=>{
  const h=handler();assert.equal((await h.run('{')).status,400);assert.equal((await h.run({...input,password:'123'})).status,400);assert.equal(h.calls.length,0);
  assert.equal((await h.run({...input,role:'admin',p_created_by:'attacker'})).status,201);
  assert.equal(h.calls[0][1].user_metadata.display_name,'Operador');assert.equal(h.calls[0][1].app_metadata,undefined);
  assert.equal(h.calls[1][0],'register_panel_operator');assert.equal(h.calls[1][1].p_created_by,'owner');
});
test('falha no vinculo remove somente conta recem-criada e informa compensacao incompleta',async()=>{
  for(const cleanupError of [false,true]){const h=handler({registerError:true,cleanupError});const response=await h.run(input);assert.equal(response.status,500);assert.deepEqual(h.calls[2],['delete','new-user']);const body=await response.json();assert.match(body.error,cleanupError?/sem acesso/:/instala/);}
});
