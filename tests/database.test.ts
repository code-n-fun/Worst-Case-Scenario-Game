import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db:PGlite;let code:string;
const ids=Array.from({length:10},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function asUser(i:number,action:string,payload:Record<string,unknown>={},room=code){
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);
 const result=await db.query<{data:any}>("select party_action($1,$2,$3::jsonb) data",[action,room||null,JSON.stringify(payload)]);
 if(result.rows[0].data?.error)throw new Error(result.rows[0].data.error);return result.rows[0].data;
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
 await db.exec(readFileSync('supabase/migrations/001_party.sql','utf8'));
},30000);
afterAll(async()=>{await db.close();});
describe.sequential('authoritative multiplayer game',()=>{
 it('creates rooms and prevents nickname collisions',async()=>{
  const r=await asUser(0,'create',{nickname:'Alex'});code=r.code;expect(code).toMatch(/^[A-Z]{4}$/);expect(r.phase).toBe('lobby');
  await expect(asUser(1,'join',{nickname:'alex'})).rejects.toThrow(/nickname/);
  await asUser(1,'join',{nickname:'Blair'});await asUser(2,'join',{nickname:'Casey'});
 });
 it('requires host permissions and assigns three unique items',async()=>{
  await expect(asUser(1,'start')).rejects.toThrow(/host/);
  const r=await asUser(0,'start');expect(r.phase).toBe('prompt');expect(new Set(r.items).size).toBe(3);
  await db.query("update rooms set deadline=now()-interval '6 seconds' where code=$1",[code]);
  expect((await asUser(1,'tick')).phase).toBe('writing');
 });
 it('hides other submissions and author identities until reveal',async()=>{
  await asUser(0,'submit',{text:'Alex plan'});expect((await asUser(1,'snapshot')).plans).toEqual([]);
  await asUser(1,'submit',{text:'Blair plan'});const r=await asUser(2,'submit',{text:'Casey plan'});
  expect(r.phase).toBe('voting');expect(r.plans).toHaveLength(3);expect(r.plans.every((p:any)=>!p.author)).toBe(true);
 });
 it('rejects self-votes, locks votes, and scores exactly once',async()=>{
  const r=await asUser(0,'snapshot');await expect(asUser(0,'vote',{id:r.plans.find((p:any)=>p.mine).id})).rejects.toThrow(/another player/);
  const other=r.plans.find((p:any)=>!p.mine).id;await asUser(0,'vote',{id:other});await asUser(0,'vote',{id:other});expect((await asUser(0,'snapshot')).votedCount).toBe(1);
  for(const i of [1,2]){const s=await asUser(i,'snapshot');await asUser(i,'vote',{id:s.plans.find((p:any)=>!p.mine).id});}
  const done=await asUser(0,'snapshot');expect(done.phase).toBe('results');expect(done.plans.every((p:any)=>p.author)).toBe(true);expect(done.players.reduce((sum:number,p:any)=>sum+p.score,0)).toBe(3);
  await asUser(0,'tick');expect((await asUser(0,'snapshot')).players.reduce((sum:number,p:any)=>sum+p.score,0)).toBe(3);
 });
 it('holds late joiners until next round',async()=>{
  const r=await asUser(3,'join',{nickname:'Drew'});expect(r.items).toEqual([]);await asUser(0,'next');expect((await asUser(3,'snapshot')).items).toHaveLength(3);
 });
 it('limits rooms to eight and rejects outsider access',async()=>{
  for(let i=4;i<8;i++)await asUser(i,'join',{nickname:`Guest ${i}`});
  await expect(asUser(8,'join',{nickname:'Overflow'})).rejects.toThrow(/full/);await expect(asUser(8,'snapshot')).rejects.toThrow(/Join/);
 });
 it('transfers a stale host',async()=>{
  await db.query("update players set last_seen=now()-interval '1 minute' where user_id=$1",[ids[0]]);expect((await asUser(1,'heartbeat')).host).toBe(ids[1]);
 });
 it('denies direct client table access and internal RPC execution',async()=>{
  await db.exec('set role authenticated');await expect(db.query('select * from submissions')).rejects.toThrow(/permission denied/);
  await expect(db.query("select party_action_internal('snapshot',null,'{}')")).rejects.toThrow(/permission denied/);await db.exec('reset role');
 });
 it('expires rooms',async()=>{
  await db.query("update rooms set expires_at=now()-interval '1 second' where code=$1",[code]);await expect(asUser(1,'snapshot')).rejects.toThrow(/expired/);
 });
 it('plays five rounds with eight players and resets the game',async()=>{
  code=(await asUser(0,'create',{nickname:'Host'})).code;for(let i=1;i<8;i++)await asUser(i,'join',{nickname:`Player ${i}`});
  const seen=new Set();
  for(let round=1;round<=5;round++){
   const r=await asUser(0,round===1?'start':'next');expect(r.round).toBe(round);expect(seen.has(r.scenario)).toBe(false);seen.add(r.scenario);
   await db.query("update rooms set deadline=now()-interval '6 seconds' where code=$1",[code]);await asUser(0,'tick');
   for(let i=0;i<8;i++)await asUser(i,'submit',{text:`Plan ${i}, round ${round}`});
   for(let i=0;i<8;i++){const s=await asUser(i,'snapshot');expect(s.plans).toHaveLength(8);await asUser(i,'vote',{id:s.plans.find((p:any)=>!p.mine).id});}
   const result=await asUser(0,'snapshot');expect(result.phase).toBe('results');expect(result.players.reduce((sum:number,p:any)=>sum+p.score,0)).toBe(round*8);
  }
  expect((await asUser(0,'next')).phase).toBe('finished');const lobby=await asUser(0,'next');expect(lobby.phase).toBe('lobby');expect(lobby.players.every((p:any)=>p.score===0)).toBe(true);
 });
 it('recovers missed deadlines with zero submissions',async()=>{
  await asUser(0,'start');await db.query("update rooms set deadline=now()-interval '3 minutes' where code=$1",[code]);
  const r=await asUser(1,'tick');expect(r.phase).toBe('results');expect(r.plans).toEqual([]);
 });
 it('resumes the same browser without duplicate membership',async()=>{
  const before=await asUser(2,'snapshot');const after=await asUser(2,'join');expect(after.me).toBe(before.me);expect(after.players.length).toBe(before.players.length);
 });
 it('throttles failed room-code attempts',async()=>{
  for(let i=0;i<180;i++)await asUser(9,'snapshot',{},'ZZZZ').catch(()=>{});
  await expect(asUser(9,'snapshot',{},'ZZZZ')).rejects.toThrow(/Too many requests/);
 });
});
