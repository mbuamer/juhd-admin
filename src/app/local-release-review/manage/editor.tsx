'use client';
import ReleaseEditor,{type ReleaseTransport} from '@/components/announcements/ReleaseEditor';
const url='/local-release-review/backend';
async function call(action:string,value?:unknown){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,value})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;}
const transport:ReleaseTransport={call,artwork:path=>call('artwork',path),upload:async(blob,signal)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob,signal});if(!r.ok)throw new Error('Upload failed');return r.json();}};
export default function Editor(){return <ReleaseEditor transport={transport} local/>;}
