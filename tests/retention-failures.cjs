const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/measured-retention.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,AbortSignal,Error,Date});
const client=(value,throws=false)=>({rpc:()=>({abortSignal:async()=>{if(throws)throw value;return value;}})});
(async()=>{
 for(const [response,expected] of [[{error:{code:'57014',message:'statement timeout'}},'timeout'],[{error:{code:'42501'}},'access'],[{error:{code:'PGRST301'}},'access'],[{error:{code:'XX000'}},'backend'],[{data:{}},'contract']])assert.equal((await api.fetchRetentionResult(client(response),30)).failure,expected);
 assert.equal((await api.fetchRetentionResult(client(new Error('offline'),true),30)).failure,'network');
 const timeout=new Error('expired');timeout.name='TimeoutError';assert.equal((await api.fetchRetentionResult(client(timeout,true),30)).failure,'timeout');
 assert.equal(await api.fetchMeasuredRetention(client({error:{code:'57014'}}),30),null);
 console.log('8 retention failure and compatibility checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
