import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { useGame } from './store';
import { demoAction } from './demo';
import {projectConfig} from './project-config';
import {departureText,newRoomNotices} from './notification-rules';
import {leaveReceipt} from './wallet-receipt';
import type { Action, Payload, Room,RoomNotice } from './types';
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let currentCode: string | null = null;
let demo = false;
let refreshing = false;
let roomEpoch=0;let eventCursor=0;const seenRoomEvents=new Set<number>();
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;
export const hasConfig = () => {try{projectConfig();return true;}catch{return false;}};
let signingIn:Promise<void>|null=null;
export async function getClient() {
 if(!hasConfig()) throw new Error('Online play is temporarily unavailable. Please let the host know, or try the offline demo.');
 if(!client){const c=projectConfig();client=createClient(c.url!,c.key!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});}
 const {data:{session}}=await client.auth.getSession();
 if(!session){if(!signingIn){signingIn=(async()=>{const {error}=await client!.auth.signInAnonymously();if(error)throw new Error(`Guest sign-in failed: ${error.message}`);})().finally(()=>{signingIn=null;});}await signingIn;}
 return client;
}
export async function act(action:Action,payload:Payload={},code?:string,quiet=false):Promise<Room|null>{
 const epoch=roomEpoch;const store=useGame.getState();if(!quiet)store.set({busy:true,error:null});
 try{
  if(demo||store.connection==='demo'){const room=demoAction(action,payload);store.setRoom(room);return room;}
  const db=await getClient();const requestStart=Date.now();const requestedCode=code||currentCode;
  const {data,error}=action==='leave'?await db.rpc('leave_room',{p_code:requestedCode}):await db.rpc('party_action',{p_action:action,p_code:requestedCode,p_payload:payload});
  if(action==='leave'){
   if(error){if(/leave_room|platform_coin_ledger|room_lifecycle|schema cache|PGRST202/.test(error.message))throw new Error('Leaving is temporarily unavailable while the game is being updated. Please try again shortly.');throw new Error(error.message);}
   if(data?.code==='ROOM_CLOSED'){await closeCurrentRoom(data.error);window.dispatchEvent(new Event('wcs-wallet'));return null;}
   if(data?.error)throw new Error(data.error);
   const receipt=leaveReceipt(data);window.dispatchEvent(new CustomEvent('wcs-wallet',{detail:{balance:receipt.balance}}));
   if(receipt.charged>0)store.notify({id:`fee:${requestedCode}:${requestStart}`,text:`You left the match. ${receipt.charged} coins went to the platform. Your balance is ${receipt.balance} coins.`});
   if(currentCode&&currentCode!==requestedCode)return null;
   roomEpoch++;if(store.room)sessionStorage.removeItem(`wcs-room-events:${store.room.code}:${store.room.me}`);sessionStorage.removeItem('party-room');currentCode=null;store.set({room:null,connection:'offline'});await disconnect();window.dispatchEvent(new Event('wcs-rooms'));return null;
  }
  if(epoch!==roomEpoch&&action!=='create'&&action!=='join')return null;
  if(data?.code==='ROOM_CLOSED'){await closeCurrentRoom(data.error);return null;}
  if(error)throw new Error(error.message);if(data?.error)throw new Error(data.error);
  const room=data as Room|null;if(room?.serverTime)clockOffset=room.serverTime-(requestStart+Date.now())/2;acceptRoom(room);
  if(room && (action==='create'||action==='join')){roomEpoch++;seenRoomEvents.clear();
      const saved=sessionStorage.getItem(`wcs-room-events:${room.code}:${room.me}`);eventCursor=saved===null?Math.max(0,...(room.roomEvents||[]).map(e=>e.id)):Number(saved)||0;
      ingestEvents(room);currentCode=room.code;sessionStorage.setItem('party-room',room.code);await subscribe(room.code);}
  return room;
 }catch(e){store.set({error:e instanceof Error?e.message:'Connection failed. Try again.'});if(!quiet)throw e;return null;}
 finally{if(!quiet)store.set({busy:false});}
}
async function refresh(){if(refreshing||!currentCode)return;refreshing=true;try{const r=await act('snapshot',{},undefined,true);if(r)useGame.getState().set({error:null});}finally{refreshing=false;}}
async function subscribe(code:string){
 await disconnect();const db=await getClient();useGame.getState().set({connection:'connecting'});
 channel=db.channel(`room:${code}`,{config:{private:true}}).on('broadcast',{event:'changed'},refresh).on('broadcast',{event:'chat_changed'},()=>window.dispatchEvent(new Event('wcs-chat'))).on('broadcast',{event:'room_notice'},({payload})=>{if(currentCode!==code)return;const notice=payload as RoomNotice;if(notice.kind==='room_closed'){void closeCurrentRoom(departureText(notice));}else if(notice.id>eventCursor&&!seenRoomEvents.has(notice.id)){seenRoomEvents.add(notice.id);if(notice.user_id!==useGame.getState().room?.me)useGame.getState().notify({id:`room:${code}:${notice.id}`,text:departureText(notice)});void refresh();}}).subscribe(async status=>{
  if(status==='SUBSCRIBED'){useGame.getState().set({connection:'live'});await refresh();}
  else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))useGame.getState().set({connection:'reconnecting'});
 });
}
async function disconnect(){if(channel&&client){const old=channel;channel=null;await client.removeChannel(old);}}
export async function enterDemo(nickname:string){roomEpoch++;await disconnect();demo=true;clockOffset=0;currentCode=null;sessionStorage.removeItem('party-room');useGame.getState().set({connection:'demo',error:null});return act('create',{nickname});}
export async function endSession(){if(demo||useGame.getState().connection==='demo'){demoAction('leave');demo=false;useGame.getState().set({room:null,connection:'offline',error:null});}else await act('leave');}
export async function resume(){const code=sessionStorage.getItem('party-room');if(code&&hasConfig())await act('join',{},code,true);}

function ingestEvents(room:Room){
 for(const event of newRoomNotices(room.roomEvents||[],eventCursor,room.me)){if(!seenRoomEvents.has(event.id)){seenRoomEvents.add(event.id);useGame.getState().notify({id:`room:${room.code}:${event.id}`,text:departureText(event)});}}
 eventCursor=Math.max(eventCursor,...(room.roomEvents||[]).map(e=>e.id));
 sessionStorage.setItem(`wcs-room-events:${room.code}:${room.me}`,String(eventCursor));
}
function acceptRoom(room:Room|null){
 const previous=useGame.getState().room;
 if(room&&previous?.code===room.code&&room.version>=previous.version)ingestEvents(room);
 useGame.getState().setRoom(room);
}
async function closeCurrentRoom(reason:string){
 const code=currentCode||useGame.getState().room?.code;if(!code)return;
 roomEpoch++;currentCode=null;const previous=useGame.getState().room;if(previous)sessionStorage.removeItem(`wcs-room-events:${previous.code}:${previous.me}`);sessionStorage.removeItem('party-room');
 useGame.getState().set({room:null,connection:'offline',error:null});
 useGame.getState().notify({id:`closed:${code}`,text:reason});await disconnect();
 window.dispatchEvent(new Event('wcs-rooms'));window.dispatchEvent(new Event('wcs-wallet'));
}
