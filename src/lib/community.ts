import {getClient,act} from './client';
import {useGame} from './store';
import {nextReadCursor,unreadMessages} from './notification-rules';
import {demoWallet,demoBuy,demoSettings} from './demo';
import type {Wallet,PublicRoom,ChatMessage,Person,Conversation,DailyReward} from './types';
export async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{
 const db=await getClient();const {data,error}=await db.rpc(name,args);
 if(error)throw new Error(error.message);if(data?.error)throw new Error(data.error);return data as T;
}
export async function profile(nickname:string){if(!nickname.trim())throw new Error('Choose a nickname first.');await rpc('community_profile',{p_nickname:nickname.trim()});localStorage.setItem('wcs-nickname',nickname.trim());}
export const publicRooms=()=>rpc<PublicRoom[]>('list_public_rooms');
export const readChat=(room:string|null)=>rpc<ChatMessage[]>('chat_read',{p_room_code:room,p_after:0});
export async function sendChat(body:string,room:string|null,invite:string|null,reply:number|null=null){
 try{return await rpc<number>('chat_reply',{p_body:body,p_room_code:room,p_invite_code:invite,p_reply:reply});}
 catch(error){if(reply===null&&/chat_reply|schema cache/.test(String(error)))return rpc<number>('chat_send',{p_body:body,p_room_code:room,p_invite_code:invite});throw error;}
}
export const blockUser=(id:string,block=true)=>rpc('chat_block',{p_user:id,p_block:block});
export const reportMessage=(id:number,reason:string)=>rpc('chat_report',{p_message:id,p_reason:reason});
export const wallet=()=>useGame.getState().connection==='demo'?Promise.resolve(demoWallet()):rpc<Wallet>('wallet_read');
export const dailyReward=()=>rpc<DailyReward>('daily_reward_status');
export const claimDailyReward=()=>rpc<{awarded:number;balance:number;reward:DailyReward}>('claim_daily_reward');
export async function buy(sku:string,code?:string,item?:number){
 if(useGame.getState().connection==='demo'){const result=demoBuy(sku,item);useGame.getState().setRoom(result.room);return result.effect;}
 const result=await rpc<Record<string,unknown>>('shop_buy',{p_sku:sku,p_room_code:code||null,p_item:item??null});
 if(useGame.getState().room)await act('snapshot',{},undefined,true);return result;
}
export async function roomSettings(code:string,visibility:boolean,title:string,rerolls:boolean){
 if(useGame.getState().connection==='demo'){useGame.getState().setRoom(demoSettings(title,rerolls));return;}
 await rpc('room_settings',{p_code:code,p_public:visibility,p_title:title,p_rerolls:rerolls});await act('snapshot',{},undefined,true);
}
export async function subscribeChat(room:string|null,refresh:()=>void){
 if(room){window.addEventListener('wcs-chat',refresh);return ()=>window.removeEventListener('wcs-chat',refresh);}
 return watchLounge(refresh);
}

let loungeChannel:import('@supabase/supabase-js').RealtimeChannel|null=null;
let loungeJoining:Promise<void>|null=null;
const loungeListeners=new Set<()=>void>();
export async function watchLounge(refresh:()=>void){
 loungeListeners.add(refresh);
 if(!loungeChannel&&!loungeJoining){loungeJoining=(async()=>{const db=await getClient();loungeChannel=db.channel('community:lounge',{config:{private:true}})
  .on('broadcast',{event:'chat_changed'},()=>{for(const fn of loungeListeners)fn();})
  .subscribe(status=>{if(status==='SUBSCRIBED')for(const fn of loungeListeners)fn();});})().finally(()=>{loungeJoining=null;});}
 try{await loungeJoining;}catch(error){loungeListeners.delete(refresh);throw error;}
 return ()=>{loungeListeners.delete(refresh);if(!loungeListeners.size&&loungeChannel){const channel=loungeChannel;loungeChannel=null;void getClient().then(db=>db.removeChannel(channel));}};
}
let identity:string|null=null;
async function loungeIdentity(){if(!identity){const db=await getClient();const {data:{session}}=await db.auth.getSession();identity=session?.user.id||null;}if(!identity)throw new Error('Guest session unavailable.');return identity;}
function savedRead(id:string){const value=localStorage.getItem(`wcs-lounge-read:${id}`);if(value===null)return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
export async function loungeUnread(){
 const me=await loungeIdentity();const after=savedRead(me);let summary:{latestId:number;unread:number};
 try{summary=await rpc('lounge_notifications',{p_after:after});}
 catch(error){if(!/lounge_notifications|schema cache|PGRST202/.test(String(error)))throw error;const messages=await readChat(null);const latestId=Math.max(0,...messages.map(m=>m.id));summary={latestId,unread:after===null?0:unreadMessages(messages,after,me)};}
 if(after===null)localStorage.setItem(`wcs-lounge-read:${me}`,String(summary.latestId));
 if(savedRead(me)!==(after===null?summary.latestId:after))return loungeUnread();
 useGame.getState().set({loungeUnread:summary.unread});return summary;
}
export async function markLoungeRead(latest:number){
 const me=await loungeIdentity();const old=savedRead(me)||0;
 localStorage.setItem(`wcs-lounge-read:${me}`,String(nextReadCursor(old,latest)));
 window.dispatchEvent(new Event('wcs-lounge-read'));
}

export const searchPlayers=(name:string,room:string)=>rpc<Person[]>('search_players',{p_query:name,p_room:room});
export const playerPresence=(nickname:string)=>rpc('player_presence',{p_nickname:nickname});
export const directInbox=()=>rpc<Conversation[]>('direct_inbox');
export const readDirect=(peer:string)=>rpc<ChatMessage[]>('direct_read',{p_peer:peer});
export const sendDirect=(peer:string,body:string,reply:number|null)=>rpc<number>('direct_send',{p_peer:peer,p_body:body,p_reply:reply});
const markedDirect=new Map<string,number>();
export async function markDirectRead(peer:string,latest:number){const previous=markedDirect.get(peer)||0;if(latest<=previous)return;markedDirect.set(peer,latest);try{await rpc('direct_mark_read',{p_peer:peer,p_latest:latest});window.dispatchEvent(new Event('wcs-direct'));}catch(error){if(markedDirect.get(peer)===latest)markedDirect.set(peer,previous);throw error;}}
export const reactMessage=(scope:'public'|'direct',message:number,emoji:string)=>rpc('message_react',{p_scope:scope,p_message:message,p_emoji:emoji});
export const reportDirect=(message:number,reason:string)=>rpc('direct_report',{p_message:message,p_reason:reason});
export async function peekAt(code:string,target:string){
 if(useGame.getState().connection==='demo'){const result=demoBuy('item_peek',undefined,target);useGame.getState().setRoom(result.room);return result.effect;}
 const result=await rpc<Record<string,unknown>>('buy_peek',{p_code:code,p_target:target});await act('snapshot',{},undefined,true);return result;
}
export async function watchDirect(refresh:()=>void){const db=await getClient();const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Guest session unavailable.');
 const channel=db.channel(`person:${session.user.id}`,{config:{private:true}}).on('broadcast',{event:'direct_changed'},()=>{refresh();window.dispatchEvent(new Event('wcs-direct'));}).subscribe(status=>{if(status==='SUBSCRIBED')refresh();});
 return ()=>{void db.removeChannel(channel);};
}
