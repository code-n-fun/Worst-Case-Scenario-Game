'use client';
import {useCallback,useEffect,useState} from 'react';
import {Check,Gift,LoaderCircle} from 'lucide-react';
import {dailyReward,claimDailyReward} from '@/lib/community';
import type {DailyReward} from '@/lib/types';
import {Button} from './ui/button';

function explain(error:unknown){
 const text=error instanceof Error?error.message:'Please try again.';
 return /daily_reward|schema cache|PGRST202/.test(text)
  ?'Daily gifts aren’t available yet. Please check back soon.' :text;
}
function countdown(milliseconds:number){
 const total=Math.max(0,Math.ceil(milliseconds/1000));
 return `${Math.floor(total/3600)}h ${String(Math.floor(total%3600/60)).padStart(2,'0')}m ${String(total%60).padStart(2,'0')}s`;
}
export function DailyRewardCard({onClaim}:{onClaim:()=>Promise<void>}){
 const [reward,setReward]=useState<DailyReward|null>(null);
 const [clock,setClock]=useState({server:0,received:0});
 const [now,setNow]=useState(0);const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const accept=useCallback((value:DailyReward)=>{setReward(value);setClock({server:Date.parse(value.serverTime),received:performance.now()});setNow(performance.now());},[]);
 const refresh=useCallback(async()=>{try{accept(await dailyReward());setError('');}catch(e){setError(explain(e));}},[accept]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);const focus=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',focus);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',focus);};},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>setNow(performance.now()),1000);return()=>clearInterval(timer);},[]);
 const remaining=reward?Date.parse(reward.nextClaimAt)-(clock.server+now-clock.received):0;
 useEffect(()=>{if(reward&&!reward.canClaim&&remaining<=0)void refresh();},[reward,remaining,refresh]);
 async function claim(){setBusy(true);setError('');setNotice('');try{const result=await claimDailyReward();accept(result.reward);setNotice(result.awarded?`${result.awarded} coins added. Enjoy your next game!`:'You’ve already collected today’s gift.');await onClaim();}catch(e){setError(explain(e));}finally{setBusy(false);}}
 return <section className="daily-reward" aria-label="Daily coin reward"><div className="daily-reward-icon"><Gift size={24}/></div><div className="daily-reward-copy"><h3>{reward?.welcomeAvailable?'A little something to get you started.':'Your daily pick-me-up.'}</h3><p>{reward?.welcomeAvailable?'Collect 6 welcome coins today. Come back tomorrow for 2 more.':'Drop by each day for 2 coins. Miss a day? No worries—there’s no streak to lose.'}</p>{reward?.claimedToday&&<span className="daily-countdown" role="timer">Next gift in {countdown(remaining)} · resets at 00:00 UTC</span>}{notice&&<p className="success-note" role="status">{notice}</p>}{error&&<p className="community-error" role="alert">{error}</p>}</div><Button disabled={busy||!reward||!reward.canClaim||!!error} onClick={()=>void claim()}>{busy?<LoaderCircle size={16} className="spin"/>:reward?.claimedToday?<><Check size={16}/> Collected</>:reward?<>Claim {reward.amount} coins</>:error?'Unavailable':<LoaderCircle size={16} className="spin"/>}</Button></section>;
}
