import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
let db:PGlite;let serial=0;let ids:string[]=[];let code:string;
async function call(i:number,name:string,args:unknown[]=[]):Promise<any>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);return (await db.query<{result:any}>(`select ${name}(${args.map((_,n)=>'$'+(n+1)).join(',')}) result`,args)).rows[0].result;}
async function action(i:number,a:string,p={}){return call(i,'party_action',[a,code||null,JSON.stringify(p)]);}
async function fixture(start=true,balance=10){serial++;ids=[0,1,2,3].map(n=>`88888888-0000-4000-8000-${String(serial*10+n).padStart(12,'0')}`);code='';code=(await action(0,'create',{nickname:'Host'})).code;for(let i=1;i<3;i++)await action(i,'join',{nickname:`Guest ${i}`});for(const id of ids)await db.query("select wallet_change($1,$2,$3,'Test funding')",[id,balance,'fund:'+id]);if(start)await action(0,'start');}
async function receipt(){return (await db.query<{amount:number}>('select amount from platform_coin_ledger where user_id=any($1::uuid[])',[ids])).rows;}
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);await db.exec(readFileSync('supabase/migrations/001_party.sql','utf8'));for(const f of readdirSync('supabase/community').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/community/'+f,'utf8'));},30000);
afterAll(async()=>db.close());
describe.sequential('early match departure transfers',()=>{
 it('does not charge for leaving a lobby',async()=>{await fixture(false);await action(1,'leave');expect((await call(1,'wallet_read')).balance).toBe(10);expect(await receipt()).toEqual([]);});
 it('transfers three coins and charges only once after retries or rejoining',async()=>{
  await fixture();expect(await action(1,'leave')).toBeNull();expect((await call(1,'wallet_read')).balance).toBe(7);expect(await receipt()).toEqual([{amount:3}]);
  await action(1,'leave');await action(1,'join',{nickname:'Returning'});await action(1,'leave');expect((await call(1,'wallet_read')).balance).toBe(7);expect(await receipt()).toHaveLength(1);
 });
 it('charges only the host when their departure closes the room',async()=>{
  await fixture();await action(0,'leave');expect((await call(0,'wallet_read')).balance).toBe(7);expect((await call(1,'wallet_read')).balance).toBe(10);expect((await action(1,'snapshot')).code).toBe('ROOM_CLOSED');expect(await receipt()).toEqual([{amount:3}]);
 });
 it('caps the transfer at the available balance and never creates debt',async()=>{
  await fixture(true,2);await action(1,'leave');expect((await call(1,'wallet_read')).balance).toBe(0);expect(await receipt()).toEqual([{amount:2}]);
  await db.query('update coin_wallets set balance=0 where user_id=$1',[ids[2]]);await action(2,'leave');expect((await call(2,'wallet_read')).balance).toBe(0);expect((await receipt()).map(x=>x.amount).sort()).toEqual([0,2]);
 });
 it('does not charge a spectator waiting for the next round',async()=>{
  await fixture();const late=await action(3,'join',{nickname:'Spectator'});expect(late.items).toEqual([]);await action(3,'leave');expect((await call(3,'wallet_read')).balance).toBe(10);expect(await receipt()).toEqual([]);
 });
 it('does not charge after the final round has resolved',async()=>{
  await fixture();await db.query("update rooms set round=total_rounds,phase='results' where code=$1",[code]);await action(1,'leave');expect((await call(1,'wallet_read')).balance).toBe(10);expect(await receipt()).toEqual([]);
 });
 it('does not treat a connection timeout as a voluntary departure',async()=>{
  await fixture();await db.query("update players set last_seen=now()-interval '46 seconds' where user_id=$1",[ids[0]]);expect((await action(1,'heartbeat')).code).toBe('ROOM_CLOSED');expect((await call(0,'wallet_read')).balance).toBe(10);expect(await receipt()).toEqual([]);
 });
 it('rolls back departure and debit together if the platform receipt cannot be written',async()=>{
  await fixture();await db.exec(`create function fail_fee_test() returns trigger language plpgsql as $$begin raise exception 'Platform receipt unavailable';end;$$;create trigger fail_fee_test before insert on platform_coin_ledger for each row execute function fail_fee_test();`);
  expect((await action(1,'leave')).error).toMatch(/Platform receipt unavailable/);expect((await call(1,'wallet_read')).balance).toBe(10);expect((await action(1,'snapshot')).items).toHaveLength(3);expect(await receipt()).toEqual([]);
  await db.exec('drop trigger fail_fee_test on platform_coin_ledger;drop function fail_fee_test()');await action(1,'leave');expect((await call(1,'wallet_read')).balance).toBe(7);
 });
 it('protects platform receipts and transfer helpers from browser clients',async()=>{
  await db.exec('set role authenticated');await expect(db.query('select * from platform_coin_ledger')).rejects.toThrow(/permission denied/);await expect(db.query('select charge_departure_fee($1,gen_random_uuid())',[ids[0]])).rejects.toThrow(/permission denied/);await expect(db.query("select room_lifecycle_base('leave',null,'{}')")).rejects.toThrow(/permission denied/);await db.exec('reset role');
 });
});
