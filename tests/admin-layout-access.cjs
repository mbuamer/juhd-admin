const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const code=ts.transpileModule(fs.readFileSync('src/app/admin/layout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function run({role='admin',session=true,fail=false,login=false,cancel=false}){
 let effect,cleanup;const states=[],redirects=[];
 const router={replace:p=>redirects.push(p),refresh(){}};
 const client={auth:{getSession:async()=>{if(fail)throw Error('network');return {data:{session:session?{user:{id:'test'}}:null}}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})})})};
 const context={exports:{},require:n=>{
  if(n==='react')return {useState:()=>[false,v=>states.push(v)],useEffect:f=>effect=f};
  if(n==='next/navigation')return {usePathname:()=>login?'/admin/login':'/admin/releases',useRouter:()=>router};
  if(n==='@/lib/supabase')return {createClient:()=>client};
  if(n==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
  if(n==='next/link')return {default:()=>null};throw Error(n);
 }};vm.runInNewContext(code,context);context.exports.default({children:null});cleanup=effect();if(cancel)cleanup?.();
 await new Promise(r=>setImmediate(r));return {states,redirects};
}
(async()=>{for(const c of [{role:'admin'},{role:'ADMIN'},{role:'free'},{role:null},{session:false},{fail:true},{login:true},{cancel:true}]){
 const r=await run(c),allowed=!c.login&&!c.cancel&&!c.fail&&c.session!==false&&(!('role'in c)||String(c.role).toLowerCase()==='admin');assert.equal(r.states.includes(true),allowed,JSON.stringify(c));
 if(!allowed&&!c.login&&!c.cancel)assert.deepEqual(r.redirects,['/admin/login']);
 }console.log('8 actual-layout effect cases passed (mocked React/router/Supabase; not browser acceptance)');})().catch(e=>{console.error(e);process.exit(1)});
