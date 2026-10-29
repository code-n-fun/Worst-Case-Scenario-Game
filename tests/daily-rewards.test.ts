import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
let db:PGlite;
const ids=[1,2,3].map(i=>`99999999-0000-4000-8000-${String(i).padStart(12,'0')}`);
async function call(i:number,name:string):Promise<any>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]||'']);return (await db.query<{result:any}>(`select ${name}() result`)).rows[0].result;}
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);await db.exec(readFileSync('supabase/migrations/001_party.sql','utf8'));for(const f of readdirSync('supabase/community').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/community/'+f,'utf8'));},30000);
afterAll(async()=>db.close());
describe.sequential('daily coin gifts',()=>{
 it('reads eligibility without issuing coins and awards the welcome gift only once',async()=>{
  expect(await call(0,'daily_reward_status')).toMatchObject({canClaim:true,welcomeAvailable:true,amount:6});
  expect((await call(0,'wallet_read')).balance).toBe(0);
  expect(await call(0,'claim_daily_reward')).toMatchObject({awarded:6,balance:6,reward:{canClaim:false,claimedToday:true,welcomeAvailable:false}});
  expect(await call(0,'claim_daily_reward')).toMatchObject({awarded:0,balance:6});
  expect((await call(0,'wallet_read')).history).toHaveLength(1);
 });
 it('awards two on a later UTC day without accumulating missed days',async()=>{
  await db.query("update daily_reward_accounts set welcome_day=((now() at time zone 'UTC')::date-5) where user_id=$1",[ids[0]]);
  await db.query("update daily_reward_claims set claim_day=((now() at time zone 'UTC')::date-5) where user_id=$1",[ids[0]]);
  await db.query("update coin_ledger set event_key='daily:v1:'||user_id||':'||((now() at time zone 'UTC')::date-5) where user_id=$1",[ids[0]]);
  expect(await call(0,'daily_reward_status')).toMatchObject({canClaim:true,welcomeAvailable:false,amount:2});
  expect(await call(0,'claim_daily_reward')).toMatchObject({awarded:2,balance:8});
  expect(await call(0,'claim_daily_reward')).toMatchObject({awarded:0,balance:8});
 });
 it('uses UTC midnight regardless of the connection timezone',async()=>{
  await db.exec("set timezone='Pacific/Honolulu'");
  const status=await call(1,'daily_reward_status');
  const expected=(await db.query<{next:string}>("select to_char(((now() at time zone 'UTC')::date+1),'YYYY-MM-DD') next")).rows[0].next;
  expect(new Date(status.nextClaimAt).toISOString()).toBe(`${expected}T00:00:00.000Z`);
  expect(await call(1,'claim_daily_reward')).toMatchObject({awarded:6,balance:6});
  await db.exec("set timezone='UTC'");
 });
 it('keeps identity balances isolated and never stacks welcome and daily gifts',async()=>{
  expect(await call(1,'claim_daily_reward')).toMatchObject({awarded:0,balance:6});
  expect((await call(0,'wallet_read')).balance).toBe(8);
  const receipt=await db.query<{amount:number}>('select amount from daily_reward_claims where user_id=$1',[ids[1]]);
  expect(receipt.rows).toEqual([{amount:6}]);
 });
 it('rolls back eligibility and receipt when the wallet credit fails, allowing a safe retry',async()=>{
  await db.exec(`create function reject_test_gift() returns trigger language plpgsql as $$begin raise exception 'Simulated wallet failure';end;$$;create trigger reject_test_gift before insert on coin_ledger for each row execute function reject_test_gift();`);
  await expect(call(2,'claim_daily_reward')).rejects.toThrow(/Simulated wallet failure/);
  expect((await db.query('select * from daily_reward_accounts where user_id=$1',[ids[2]])).rows).toEqual([]);
  expect((await db.query('select * from daily_reward_claims where user_id=$1',[ids[2]])).rows).toEqual([]);
  await db.exec('drop trigger reject_test_gift on coin_ledger;drop function reject_test_gift()');
  expect(await call(2,'claim_daily_reward')).toMatchObject({awarded:6,balance:6});
 });
 it('requires authentication, prevents raw writes, and permits only the public claim RPC',async()=>{
  await expect(call(99,'claim_daily_reward')).rejects.toThrow(/guest session/);
  await expect(call(99,'daily_reward_status')).rejects.toThrow(/guest session/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]]);
  await db.exec('set role authenticated');
  await expect(db.query("insert into daily_reward_claims values($1,current_date,6,now())",[ids[0]])).rejects.toThrow(/permission denied/);
  await expect(db.query('select * from daily_reward_accounts')).rejects.toThrow(/permission denied/);
  expect((await db.query<{result:any}>('select claim_daily_reward() result')).rows[0].result.awarded).toBe(0);
  await db.exec('reset role');
 });
});
