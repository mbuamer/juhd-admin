const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const cache={};
function load(name){if(cache[name])return cache[name];const api={};cache[name]=api;vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:s=>load(s.replace('@/lib/','')),Date,Intl,AbortSignal});return api;}
const {growthHeadlines}=load('growth-dashboard');
const fixture={source:'live',generatedAt:'2026-10-30T21:00:00Z',premiumAccounts:4,payload:{periodDays:7,totalUsers:3178,newSignUps:18,unavailable:['newPremiumSubscribers'],signUpsOverTime:[{label:'2026-10-30',value:3},{label:'2026-10-31',value:0}],workoutsOverTime:[{label:'2026-10-30',value:10},{label:'2026-10-31',value:0}]}};
let r=growthHeadlines(fixture);assert.equal(r.signupsToday,0);assert.equal(r.workoutsToday,0);assert.equal(r.signups7d,18);assert.equal(r.userCount,3178);assert.equal(r.premiumCount,4);assert.equal(r.premiumUpgradesToday,null);
r=growthHeadlines({...fixture,generatedAt:'2026-10-30T20:59:59Z'});assert.equal(r.signupsToday,3);assert.equal(r.workoutsToday,10);
for(const change of [{source:'empty'},{payload:{...fixture.payload,periodDays:30}}])assert.ok(Object.values(growthHeadlines({...fixture,...change})).every(v=>v===null));
for(const generatedAt of [undefined,'invalid','2026-11-01T12:00:00Z'])assert.equal(growthHeadlines({...fixture,generatedAt}).signupsToday,null);
assert.equal(growthHeadlines({...fixture,premiumAccounts:undefined}).premiumCount,null);
const page=fs.readFileSync('src/app/admin/dashboard/page.tsx','utf8');assert.equal((page.match(/fetchGrowthDashboard\(supabase,/g)||[]).length,1);
console.log('15 headline regression checks passed (Saudi midnight, zeros, missing data, premium semantics, one RPC).');
