const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../front-end/js/cash-register-core');
test('saldo inclui todas as formas de pagamento e saídas, com fechamento automático',()=>{
 const movements=[['receipt','cash',40],['receipt','pix',60],['receipt','card',30],['reinforcement','cash',20],['expense','cash',25],['expense','pix',10],['withdrawal','cash',5],['refund','card',8]].map(([kind,method,amount])=>({kind,method,amount,verified_at:'ok'}));
 const result=core.summarize({opening_cash:100},movements);
 assert.equal(result.balance,202);assert.equal(result.expected,130);
 assert.equal(core.closing(result,{counted_cash:202}).counted_cash,202);assert.equal(core.closing(result,{counted_cash:202}).difference,0);
 assert.throws(()=>core.closing(result,{counted_cash:203}),/Confirme/);
 assert.equal(core.closing(result,{counted_cash:203,confirm_excess:true}).difference,1);
 assert.throws(()=>core.closing(result,{counted_cash:200,notes:''}),/justificativa/);
 assert.equal(core.closing(result,{counted_cash:200,notes:'Diferença conferida'}).difference,-2);
 for(const keep_pending of [false,true])assert.throws(()=>core.closing({...result,pending:[{remaining:0}]},{counted_cash:130,keep_pending,notes:'Não permitir pendência'}),/pendentes/);
});
