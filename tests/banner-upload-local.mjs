// Only the development-only loopback upload route; synthetic files, no Supabase.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
const origin='http://127.0.0.1:3000';
const url=origin+'/local-release-review/artwork';
const jpg=await sharp({create:{width:1200,height:675,channels:3,background:'#ab3025'}}).jpeg().toBuffer();
let passed=0;
async function check(name,body,headers,expected){
 const response=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'image/jpeg',...headers},body});
 assert.equal(response.status,expected,name);console.log('PASS',name);passed++;return response;
}
const response=await check('valid 1200x675 JPEG',jpg,{},200);
const asset=await response.json();
try{
 assert.equal(asset.width,1200);assert.equal(asset.height,675);
 const saved=await fetch(origin+asset.url);assert.equal(saved.status,200);
 const metadata=await sharp(Buffer.from(await saved.arrayBuffer())).metadata();
 assert.equal(metadata.width,1200);assert.equal(metadata.height,675);assert.equal(metadata.format,'jpeg');
 console.log('PASS persisted image round-trip');passed++;
 await check('foreign origin denied',jpg,{Origin:'https://example.com'},403);
 await check('missing origin denied',jpg,{Origin:''},403);
 await check('unsupported content type',jpg,{'Content-Type':'image/svg+xml'},415);
 await check('oversize rejected',Buffer.alloc(5*1024*1024+1),{},413);
 await check('corrupt bytes rejected',Buffer.from('not JPEG'),{},400);
 const small=await sharp({create:{width:100,height:100,channels:3,background:'red'}}).jpeg().toBuffer();
 await check('wrong dimensions rejected',small,{},422);
 const png=await sharp(jpg).png().toBuffer();await check('spoofed JPEG rejected',png,{},422);
 const traversal=await fetch(url+'?id=../../package.json');assert.equal(traversal.status,404);passed++;console.log('PASS invalid asset path denied');
 console.log(`${passed} API checks passed`);
}finally{
 const id=new URL(asset.url,origin).searchParams.get('id');
 if(/^[0-9a-f-]{36}$/.test(id))await unlink(path.join(process.cwd(),'.runtime/banner-review',id+'.jpg'));
}
