const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('front-end/js/storage.js','utf8');
function load({rows=[],rpcError=null,invokeError=null}={}) {
  const client={functions:{invoke:async()=>({data:{id:'created-id'},error:invokeError})},rpc:async()=>({data:rows,error:rpcError})};
  const context={window:{APP_CONFIG:{supabaseUrl:'https://isolated.test',supabaseAnonKey:'test'},supabase:{createClient:()=>client}},localStorage:{getItem:()=>null}};
  vm.runInNewContext(source,context);return context.window.StoreAPI;
}
const input={name:'Operador',email:'op@example.test',password:'test-password-123'};
test('cadastro exige vinculo persistido com mesmo ID, email e acesso ativo',async()=>{
  for(const rows of [[],[{user_id:'other-id',email:input.email,active:true}],[{user_id:'created-id',email:'other@example.test',active:true}],[{user_id:'created-id',email:input.email,active:false}]]) {
    await assert.rejects(load({rows}).createOperator(input),/conta n.o foi confirmada/);
  }
  const api=load({rows:[{user_id:'created-id',email:input.email,active:true}]});
  const result=await api.createOperator({...input,email:' OP@EXAMPLE.TEST '});assert.equal(result.email,input.email);
});
test('falha de consulta ou JWT nao confirma criacao nem esconde o motivo',async()=>{
  await assert.rejects(load({rpcError:{code:'network',message:'Offline'}}).createOperator(input),/lista de usu/);
  await assert.rejects(load({invokeError:{context:{json:async()=>({message:'Invalid JWT'})}}}).createOperator(input),/recusou a sess/);
});
