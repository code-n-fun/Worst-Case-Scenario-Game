import {describe,it,expect,vi,afterEach} from 'vitest';
import {demoAction,demoBuy,demoWallet} from '../src/lib/demo';
afterEach(()=>{vi.useRealTimers();demoAction('leave');});
describe('offline demo',()=>{
 it('plays five rounds and returns to a clean lobby',()=>{
  vi.useFakeTimers();demoAction('create',{nickname:'Test'});
  for(let n=1;n<=5;n++){
   let r=demoAction(n===1?'start':'next')!;expect(r.round).toBe(n);vi.advanceTimersByTime(5001);expect(demoAction('tick')!.phase).toBe('writing');
   r=demoAction('submit',{text:'Use the three items'})!;expect(r.phase).toBe('voting');expect(()=>demoAction('vote',{id:'you'})).toThrow();
   r=demoAction('vote',{id:'bot-0'})!;expect(r.phase).toBe('results');expect(r.players[0].score).toBe(Math.ceil(n/2));
  }
  expect(demoWallet().balance).toBe(75);
  expect(demoAction('next')!.phase).toBe('finished');
  const lobby=demoAction('next')!;expect(lobby.phase).toBe('lobby');expect(lobby.players.every(p=>p.score===0)).toBe(true);
 });
 it('buys a hint once from earned coins and restores it in snapshots',()=>{
  vi.useFakeTimers();demoAction('create',{nickname:'Test'});demoAction('start');vi.advanceTimersByTime(5001);demoAction('tick');
  expect(()=>demoBuy('creative_hint')).toThrow(/enough coins/);demoAction('submit',{text:'Plan'});demoAction('vote',{id:'bot-0'});
  expect(demoWallet().balance).toBe(10);demoAction('next');vi.advanceTimersByTime(5001);demoAction('tick');
  const hint=demoBuy('creative_hint');expect(hint.room.hint).toBeTruthy();expect(demoWallet().balance).toBe(0);demoBuy('creative_hint');expect(demoWallet().balance).toBe(0);
 });
});
