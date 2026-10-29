// Local QA transport only. No production credentials or Supabase connection.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BANNER_WIDTH, BANNER_HEIGHT, MAX_BANNER_BYTES } from '@/lib/announcements/artwork';
export const runtime='nodejs';
const directory=path.join(process.cwd(),'.runtime','banner-review');
function allowed(request:Request){
  const url=new URL(request.url);
  return process.env.NODE_ENV==='development'&&process.env.JUHD_LOCAL_UI_REVIEW==='1'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
}
export async function POST(request:Request){
  if(!allowed(request))return new Response(null,{status:404});
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  const incoming=host ? new URL(`http://${host}`) : null;
  if(!incoming||!['127.0.0.1','localhost','[::1]'].includes(incoming.hostname)||origin!==incoming.origin)return new Response(null,{status:403});
  if(request.headers.get('content-type')!=='image/jpeg')return new Response(null,{status:415});
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BANNER_BYTES){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
    const input=Buffer.concat(chunks);
    const image=sharp(input,{limitInputPixels:BANNER_WIDTH*BANNER_HEIGHT});
    const info=await image.metadata();
    if(info.format!=='jpeg'||info.width!==BANNER_WIDTH||info.height!==BANNER_HEIGHT)return new Response(null,{status:422});
    // Decode/re-encode; discard metadata and reject spoofed/corrupt payloads.
    const output=await image.jpeg({quality:90}).toBuffer();
    if(output.length>MAX_BANNER_BYTES)return new Response(null,{status:413});
    const id=randomUUID();await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,`${id}.jpg`),output,{flag:'wx',mode:0o600});
    return Response.json({url:`/local-release-review/artwork?id=${id}`,width:BANNER_WIDTH,height:BANNER_HEIGHT,bytes:output.length},{headers:{'Cache-Control':'no-store'}});
  }catch{return new Response(null,{status:400});}
}
export async function GET(request:Request){
  if(!allowed(request))return new Response(null,{status:404});
  const id=new URL(request.url).searchParams.get('id')??'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))return new Response(null,{status:404});
  try{return new Response(new Uint8Array(await readFile(path.join(directory,`${id}.jpg`))),{headers:{'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'}});}catch{return new Response(null,{status:404});}
}
