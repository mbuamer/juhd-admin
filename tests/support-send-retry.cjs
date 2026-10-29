const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/app/admin/bug-reports/SupportInbox.tsx','utf8');
const handler=source.slice(source.indexOf(' async function send()'),source.indexOf(' const statuses='));
async function scenario(attachment){
 const calls=[],uploads=[];let attempt=0;
 const state={selected:{id:'synthetic-report'},busy:false,threadLoading:false,file:attachment?{type:'image/jpeg',size:123}:null,pending:null,body:'Synthetic reply',status:'reviewed',error:false};
 const c={auth:{getUser:async()=>({data:{user:{id:'synthetic-admin'}}})},storage:{from:()=>({upload:async(path)=>{uploads.push(path);return uploads.length===1?{}:{error:{statusCode:'409'}};}})},rpc:async(name,args)=>{calls.push(args);attempt++;return attempt===1?{error:Error('lost confirmation')}:{data:args.p_id};}};
 Object.assign(state,{crypto:{randomUUID:()=> 'stable-retry-id'},createClient:()=>c,setBusy:v=>state.busy=v,setError:v=>state.error=v,setPending:v=>state.pending=v,open:async()=>{state.pending=null;state.body='';},load:async()=>{}});
 vm.createContext(state);vm.runInContext(ts.transpileModule(handler+';globalThis.run=send;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,state);
 await state.run();assert.equal(state.error,true);assert.equal(state.pending,'stable-retry-id');assert.equal(state.body,'Synthetic reply');
 await state.run();assert.equal(state.error,false);assert.equal(calls.length,2);assert.equal(JSON.stringify(calls[0]),JSON.stringify(calls[1]));
 if(attachment){assert.equal(uploads.length,2);assert.equal(uploads[0],uploads[1]);}
}
(async()=>{await scenario(false);await scenario(true);console.log('Actual send handler: text and attachment retry preserve request ID/body/status/path; duplicate upload handled; draft retained on failure.');})().catch(e=>{console.error(e);process.exit(1)});
