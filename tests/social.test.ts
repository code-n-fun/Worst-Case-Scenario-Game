import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
let db:PGlite;let code:string;
const ids=[1,2,3,4].map(i=>`77777777-0000-4000-8000-${String(i).padStart(12,'0')}`);
async function call(i:number,name:string,args:unknown[]=[]):Promise<any>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);return (await db.query<{result:any}>(`select ${name}(${args.map((_,n)=>'$'+(n+1)).join(',')}) result`,args)).rows[0].result;}
async function action(i:number,a:string,c:string|null=code,p={}){return call(i,'party_action',[a,c,JSON.stringify(p)]);}
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);await db.exec(readFileSync('supabase/migrations/001_party.sql','utf8'));for(const f of readdirSync('supabase/community').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/community/'+f,'utf8'));},30000);
afterAll(async()=>db.close());
describe.sequential('social messaging and peek privacy',()=>{
 it('finds online players by name and accessible rooms without revealing private locations',async()=>{
  for(let i=0;i<4;i++)await call(i,'player_presence',[['Alex','Blair','Casey','Drew'][i]]);
  code=(await action(0,'create',null,{nickname:'Alex'})).code;await action(1,'join',code,{nickname:'Blair'});
  expect((await call(0,'search_players',['bl','']))[0].id).toBe(ids[1]);
  expect((await call(0,'search_players',['',code]))[0].id).toBe(ids[1]);
  expect(await call(2,'search_players',['',code])).toEqual([]);
  expect((await call(2,'search_players',['Blair','']))[0].room_code).toBeNull();
 });
 it('keeps direct messages private, supports emoji replies, and rejects cross-thread replies',async()=>{
  const original=await call(0,'direct_send',[ids[1],'Hello 👋',null]);
  expect((await call(1,'direct_read',[ids[0]]))[0].body).toBe('Hello 👋');expect(await call(2,'direct_read',[ids[0]])).toEqual([]);
  await call(1,'direct_send',[ids[0],'Hi! 😂',Number(original)]);
  expect((await call(0,'direct_read',[ids[1]]))[1].reply.body).toBe('Hello 👋');
  await db.exec("update direct_messages set created_at=now()-interval '3 seconds'");
  await expect(call(0,'direct_send',[ids[2],'Wrong reply',Number(original)])).rejects.toThrow(/conversation/);
 });
 it('tracks direct unread counts, reactions, and blocking',async()=>{
  let inbox=await call(1,'direct_inbox');expect(inbox[0].unread).toBe(1);
  const messages=await call(1,'direct_read',[ids[0]]);await call(1,'direct_mark_read',[ids[0],messages.at(-1).id]);expect((await call(1,'direct_inbox'))[0].unread).toBe(0);
  await call(1,'message_react',['direct',messages[0].id,'❤️']);expect((await call(1,'direct_read',[ids[0]]))[0].reactions[0]).toMatchObject({emoji:'❤️',count:1,mine:true});
  await expect(call(2,'message_react',['direct',messages[0].id,'🔥'])).rejects.toThrow(/accessible/);
  await call(1,'message_react',['direct',messages[0].id,'❤️']);expect((await call(1,'direct_read',[ids[0]]))[0].reactions).toEqual([]);
  await call(1,'chat_block',[ids[0],true]);await expect(call(0,'direct_send',[ids[1],'Blocked',null])).rejects.toThrow(/unavailable/);await call(1,'chat_block',[ids[0],false]);
 });
 it('supports public replies and reactions while enforcing channel boundaries',async()=>{
  const original=await call(0,'chat_reply',['Everyone ready? 🚀',null,null,null]);
  const reply=await call(1,'chat_reply',['Ready 👍',null,null,Number(original)]);
  const messages=await call(2,'chat_read',[null,0]);expect(messages.find((m:any)=>m.id===Number(reply)).reply.body).toBe('Everyone ready? 🚀');
  await call(2,'message_react',['public',Number(original),'👍']);expect((await call(0,'chat_read',[null,0]))[0].reactions[0].count).toBe(1);
  await expect(call(1,'chat_reply',['Wrong channel',code,null,Number(original)])).rejects.toThrow(/channel/);
 });
 it('charges peek once, reveals only one kit item, and keeps it private',async()=>{
  await action(2,'join',code,{nickname:'Casey'});await action(0,'start');
  await db.query("update rooms set deadline=now()-interval '6 seconds' where code=$1",[code]);await action(0,'tick');
  await db.query("select wallet_change($1,30,'peek-test','Test fixture')",[ids[0]]);
  const peek=await call(0,'buy_peek',[code,ids[1]]);expect(Object.keys(peek).sort()).toEqual(['item','nickname','target']);
  expect(peek.target).toBe(ids[1]);expect(typeof peek.item).toBe('string');expect((await call(0,'wallet_read')).balance).toBe(15);
  expect(await call(0,'buy_peek',[code,ids[2]])).toEqual(peek);expect((await call(0,'wallet_read')).balance).toBe(15);
  expect((await action(0,'snapshot')).peek).toEqual(peek);expect((await action(1,'snapshot')).peek).toBeNull();
  await expect(call(0,'shop_buy',['item_peek',code,null])).rejects.toThrow(/peek purchase/);
  await expect(call(3,'buy_peek',[code,ids[1]])).rejects.toThrow(/Both players/);
 });
 it('denies direct table and internal helper access',async()=>{
  await db.exec('set role authenticated');await expect(db.query('select * from direct_messages')).rejects.toThrow(/permission denied/);await expect(db.query("select shop_buy_base('item_peek',null,null)")).rejects.toThrow(/permission denied/);await db.exec('reset role');
 });
});
