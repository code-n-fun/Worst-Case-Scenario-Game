import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
let db:PGlite;
const ids=[1,2,3,4].map(i=>`99999999-0000-4000-8000-${String(i).padStart(12,'0')}`);
async function call(i:number,fn:string,args:unknown[]=[]):Promise<any>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);return (await db.query<{data:any}>(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) data`,args)).rows[0].data;}
async function action(i:number,a:string,code:string|null=null,p={}){return call(i,'party_action',[a,code,JSON.stringify(p)]);}
async function room(){const r=await action(0,'create',null,{nickname:'Creator'});expect(r.error).toBeUndefined();await action(1,'join',r.code,{nickname:'Guest'});await call(0,'room_settings',[r.code,true,'Notification test',false]);return r.code as string;}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
 await db.exec(readFileSync('supabase/migrations/001_party.sql','utf8'));
 for(const file of readdirSync('supabase/community').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/community/'+file,'utf8'));
},30000);
afterAll(async()=>db.close());
describe.sequential('creator-owned room lifecycle',()=>{
 it('records member departure durably while keeping the creator room open',async()=>{
  const code=await room();await action(1,'leave',code);const r=await action(0,'snapshot',code);
  expect(r.host).toBe(ids[0]);expect(r.roomEvents).toHaveLength(1);expect(r.roomEvents[0]).toMatchObject({kind:'player_left',nickname:'Guest',user_id:ids[1]});
  expect((await call(0,'list_public_rooms')).some((r:any)=>r.code===code)).toBe(true);
 });
 it('closes on creator leave, hides the room, and rejects existing and new players',async()=>{
  const code=await room();expect(await action(0,'leave',code)).toBeNull();
  expect((await action(1,'snapshot',code)).code).toBe('ROOM_CLOSED');expect((await action(2,'join',code,{nickname:'Late'})).code).toBe('ROOM_CLOSED');
  expect((await call(1,'list_public_rooms')).some((r:any)=>r.code===code)).toBe(false);
  expect((await db.query<{n:number}>("select count(*)::int n from room_events e join rooms r on r.id=e.room_id where r.code=$1 and kind='room_closed'",[code])).rows[0].n).toBe(1);
  await expect(call(1,'chat_read',[code])).rejects.toThrow(/Join/);
 });
 it('closes instead of transferring ownership after a creator connection times out',async()=>{
  const code=await room();await db.query("update players p set last_seen=now()-interval '46 seconds' from rooms r where p.room_id=r.id and r.code=$1 and p.user_id=$2",[code,ids[0]]);
  expect((await call(1,'list_public_rooms')).some((r:any)=>r.code===code)).toBe(false);
  const result=await action(1,'heartbeat',code);expect(result.code).toBe('ROOM_CLOSED');
  expect((await db.query<{host:string}>('select host from rooms where code=$1',[code])).rows[0].host).toBe(ids[0]);
 });
 it('allows a brief creator reconnect within the grace period',async()=>{
  const code=await room();await db.query("update players p set last_seen=now()-interval '30 seconds' from rooms r where p.room_id=r.id and r.code=$1 and p.user_id=$2",[code,ids[0]]);
  const result=await action(0,'heartbeat',code);expect(result.error).toBeUndefined();expect(result.host).toBe(ids[0]);
 });
 it('notifies once when a non-creator disconnect times out',async()=>{
  const code=await room();await db.query("update players p set last_seen=now()-interval '46 seconds' from rooms r where p.room_id=r.id and r.code=$1 and p.user_id=$2",[code,ids[1]]);
  const result=await action(0,'snapshot',code);expect(result.roomEvents.filter((e:any)=>e.kind==='player_left')).toHaveLength(1);
  expect((await action(0,'snapshot',code)).roomEvents).toHaveLength(1);
 });
 it('counts unread lounge messages while excluding self and blocked senders',async()=>{
  await call(0,'community_profile',['Creator']);await call(1,'community_profile',['Guest']);await call(2,'community_profile',['Other']);
  const baseline=await call(1,'lounge_notifications',[null]);expect(baseline.unread).toBe(0);
  const first=await call(0,'chat_send',['Hello lounge',null,null]);
  expect((await call(1,'lounge_notifications',[baseline.latestId])).unread).toBe(1);
  expect((await call(0,'lounge_notifications',[baseline.latestId])).unread).toBe(0);
  await call(1,'chat_block',[ids[0],true]);expect((await call(1,'lounge_notifications',[baseline.latestId])).unread).toBe(0);
  const second=await call(2,'chat_send',['Another hello',null,null]);
  expect((await call(1,'lounge_notifications',[baseline.latestId])).unread).toBe(1);
  expect((await call(1,'lounge_notifications',[Number(second)])).unread).toBe(0);expect(Number(second)).toBeGreaterThan(Number(first));
 });
 it('prevents clients reading event tables or calling internal closure functions',async()=>{
  await db.exec('set role authenticated');await expect(db.query('select * from room_events')).rejects.toThrow(/permission denied/);
  await expect(db.query("select close_party_room('00000000-0000-4000-8000-000000000001')")).rejects.toThrow(/permission denied/);await db.exec('reset role');
 });
});
