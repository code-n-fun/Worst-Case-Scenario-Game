import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();const dir=new URL('../supabase/community/',import.meta.url);
const ids=[1,2,3,4].map(i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
let checks=0;const ok=(condition,message)=>{assert.ok(condition,message);checks++;};
async function user(i){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);}
async function call(i,fn,args=[]){await user(i);return (await db.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;}
async function action(i,a,p={},c=code){const r=await call(i,'party_action',[a,c,JSON.stringify(p)]);if(r?.error)throw Error(r.error);return r;}
async function fails(p,pattern){await assert.rejects(p,pattern);checks++;}
let code;
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(id int);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select ''::text$$;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/001_party.sql',import.meta.url),'utf8'));
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){await db.exec(readFileSync(new URL(f,dir),'utf8'));console.log('Applied:',f);}
 code=(await action(0,'create',{nickname:'Host'})).code;
 await action(1,'join',{nickname:'Blair'});await action(2,'join',{nickname:'Casey'});
 ok((await call(0,'list_public_rooms')).length===0,'Private room hidden');
 await call(0,'room_settings',[code,true,'Goose squad',true]);ok((await call(1,'list_public_rooms'))[0].code===code,'Public room listed');
 await fails(call(1,'room_settings',[code,false,'Hijack',false]),/host/);
 await call(0,'community_profile',['Host']);
 const msg=await call(0,'chat_send',['Join my squad!',null,code]);ok(!!msg,'Lounge invite sent');
 ok((await call(1,'chat_read'))[0].invite_code===code,'Invite readable');
 await fails(call(0,'chat_send',['Spam']),/two seconds/);
 await call(1,'chat_report',[msg,'Test report']);await call(1,'chat_block',[ids[0],true]);ok((await call(1,'chat_read')).length===0,'Blocked messages hidden');
 await fails(call(3,'chat_read',[code]),/Join/);
 await db.exec("update chat_messages set created_at=now()-interval '3 seconds'");
 ok(!!(await call(0,'chat_send',['Hello team',code])),'Room chat sent');
 let firstMatch;
 for(let round=1;round<=5;round++){
  let r=await action(0,round===1?'start':'next');
  if(round===1){firstMatch=(await db.query('select match_id from rooms where code=$1',[code])).rows[0].match_id;}
  await db.query("update rooms set deadline=now()-interval '6 seconds' where code=$1",[code]);await action(0,'tick');
  if(round===1){await db.exec("update chat_messages set created_at=now()-interval '3 seconds'");await fails(call(0,'chat_send',['Give me the answer',code]),/reopens/);await fails(call(0,'shop_buy',['creative_hint',code]),/enough coins/);}
  if(round===2){const hint=await call(0,'shop_buy',['creative_hint',code]);ok(!!hint.hint,'Hint delivered');ok(JSON.stringify(await call(0,'shop_buy',['creative_hint',code]))===JSON.stringify(hint),'Hint retry idempotent');ok((await call(0,'wallet_read')).balance===0,'Only charged once');}
  if(round===4){const original=(await action(0,'snapshot')).items;const roll=await call(0,'shop_buy',['item_reroll',code,0]);ok(roll.items[0]!==original[0]&&roll.items[1]===original[1],'Reroll changes only selected item');}
  for(let i=0;i<3;i++)await action(i,'submit',{text:`Plan ${i} round ${round}`});
  const hostPlan=(await action(0,'snapshot')).plans.find(p=>p.mine).id;
  const other=(await action(1,'snapshot')).plans.find(p=>p.mine).id;
  await action(0,'vote',{id:other});await action(1,'vote',{id:hostPlan});r=await action(2,'vote',{id:hostPlan});
  ok(r.players.find(p=>p.id===ids[0]).score===round,'Standings count round wins');
 }
 ok((await call(0,'wallet_read')).balance===65,'95 victory coins minus 30 purchases');
 ok((await call(1,'wallet_read')).balance===0,'No coins per individual vote');
 const ledger=(await db.query('select count(*) n from coin_ledger where user_id=$1',[ids[0]])).rows[0].n;
 await action(0,'tick');ok((await db.query('select count(*) n from coin_ledger where user_id=$1',[ids[0]])).rows[0].n===ledger,'No duplicate rewards');
 await call(0,'shop_buy',['goose_badge']);await call(0,'shop_buy',['goose_badge']);ok((await call(0,'wallet_read')).balance===15,'Permanent unlock charged once');
 await action(0,'next');await action(0,'next');
 const nextMatch=(await db.query('select match_id from rooms where code=$1',[code])).rows[0].match_id;
 ok(nextMatch!==firstMatch,'Replay uses fresh reward identity');ok((await action(0,'snapshot')).players.every(p=>p.score===0),'Match standings reset');ok((await call(0,'wallet_read')).balance===15,'Coins survive replay');
 await db.exec('set role authenticated');await fails(db.query('select * from coin_wallets'),/permission denied/);await fails(db.query("select wallet_change($1,100,'cheat','cheat')",[ids[0]]),/permission denied/);await db.exec('reset role');
 console.log(`PASS: ${checks} checks, including 5 rounds, chat/privacy, purchases, rewards, and replay.`);
}finally{await db.close();}
