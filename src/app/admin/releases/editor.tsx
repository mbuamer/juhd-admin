'use client';
import {useMemo} from 'react';
import ReleaseEditor,{type ReleaseTransport} from '@/components/announcements/ReleaseEditor';
import {createClient} from '@/lib/supabase';
import {releaseOperation} from '@/lib/announcements/release-service';
export default function Editor(){
 const transport=useMemo<ReleaseTransport>(()=>{
  const client=createClient();
  const artwork=async(path:string)=>{const r=await client.storage.from('app-campaigns').createSignedUrl(path,3600);if(r.error)throw r.error;return{url:r.data.signedUrl,path,width:1200,height:675,bytes:0};};
  return {call:(a,v)=>releaseOperation(client,a,v),artwork,upload:async(blob,signal)=>{
   const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('Sign in required');if(signal.aborted)throw new Error('Cancelled');
   const path=`${data.user.id}/${crypto.randomUUID()}.jpg`;const r=await client.storage.from('app-campaigns').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(r.error)throw r.error;if(signal.aborted)throw new Error('Cancelled');return{...await artwork(path),bytes:blob.size};
  }};
 },[]);
 return <ReleaseEditor transport={transport} local={process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321'}/>;
}
