import type {SupabaseClient} from '@supabase/supabase-js';
export type Policy={id:boolean;enabled:boolean;latest_version:string;minimum_version:string;store_available:boolean;title_en:string;title_ar:string;body_en:string;body_ar:string;banners_per_opening:number};
export type Campaign={id:string;status:string;title_en:string;title_ar:string;body_en:string;body_ar:string;button_en:string;button_ar:string;image_en:string|null;image_ar:string|null;shared_artwork:boolean;destination:string;sponsored:boolean;sponsor:string;audience:string;starts_at:string;ends_at:string;sort_order:number;repeat_days:number};
export type State={policy:Policy;campaigns:Campaign[]};
export async function releaseOperation(client:SupabaseClient,action:string,value:unknown){
 if(action==='load'){
  const [p,c]=await Promise.all([client.from('app_release_policy').select('*').single(),client.from('app_campaigns').select('*').order('sort_order')]);
  if(p.error)throw p.error;if(c.error)throw c.error;return{policy:p.data,campaigns:c.data};
 }
 if(action==='policy'){
  const {error}=await client.from('app_release_policy').update({...value as Policy,updated_at:new Date().toISOString()}).eq('id',true);if(error)throw error;return{};
 }
 if(action==='campaign'){
  const {error}=await client.from('app_campaigns').upsert(value as Campaign);if(error)throw error;return{};
 }
 throw new Error('Unknown operation');
}
