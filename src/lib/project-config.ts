/** Public browser configuration shared by every visitor. Never put a secret key here. */
export const sharedProject = {
 url: 'https://javelihuqrvwvecswtke.supabase.co',
 key: 'sb_publishable_BpRHNTTVOVquy0xQ85VbBg_Ff3-yIhB',
};
export function validatePublicProject(url:string,key:string){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('The owner must configure a project HTTPS origin.');
 if(!key.startsWith('sb_publishable_')){
  let role:string|undefined;try{role=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;}catch{}
  if(role!=='anon')throw new Error('Only a public publishable or anon key may be used.');
 }
 if(key.length<25)throw new Error('The public project key is incomplete.');
 return {url:parsed.origin,key};
}
export function projectConfig(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 // An override must provide BOTH values; never pair one project's URL with another's key.
 return validatePublicProject(url||key?url||'':sharedProject.url,url||key?key||'':sharedProject.key);
}
