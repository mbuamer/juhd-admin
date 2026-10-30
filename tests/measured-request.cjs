const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/measured-request.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api});
(async()=>{
 const client={},other={};let calls=0,active=0,max=0;
 const request=()=>async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return calls;};
 const a=api.measuredRequest(client,'details:0',request());
 const duplicate=api.measuredRequest(client,'details:0',request());
 assert.equal(a,duplicate);
 await Promise.all([a,duplicate,api.measuredRequest(client,'growth:30',request()),api.measuredRequest(other,'details:0',request())]);
 assert.equal(calls,3);assert.equal(max,1);
 await api.measuredRequest(client,'details:0',request());assert.equal(calls,4);
 await assert.rejects(api.measuredRequest(client,'bad',async()=>{throw new Error('failure');}));
 assert.equal(await api.measuredRequest(client,'bad',async()=>42),42);
 console.log('6 reporting queue checks passed: serialization, deduplication, account isolation, fresh refresh, failure recovery.');
})().catch(e=>{console.error(e);process.exit(1)});
