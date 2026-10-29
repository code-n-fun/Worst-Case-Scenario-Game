import { scenarios, items } from './content';
import type { Action, Payload, Room, Wallet, ShopItem } from './types';
let state: Room | null = null;
let history:Wallet['history']=[];let unlocks:string[]=[];let purchases=new Map<string,Record<string,unknown>>();
const catalog:ShopItem[]=[{sku:'item_peek',name:'Peek at another kit',price:15,kind:'hint',enabled:true},{sku:'creative_hint',name:'Creative hint',price:10,kind:'hint',enabled:true},{sku:'item_reroll',name:'Reroll one item',price:20,kind:'reroll',enabled:true},{sku:'goose_badge',name:'First Responder badge',price:50,kind:'cosmetic',enabled:true},{sku:'victory_sparkles',name:'Victory sparkles',price:100,kind:'cosmetic',enabled:true}];
function coins(amount:number,reason:string){if(!state)return;state.coins=(state.coins||0)+amount;history.unshift({amount,reason,created_at:new Date().toISOString()});}

const botText = ['I build a decoy gift shop. Nobody stays angry while browsing overpriced souvenirs.', 'I announce an emergency dance competition, distract everyone, and escape through the gift shop.'];
export function demoAction(action: Action, payload: Payload = {}): Room | null {
 const now = Date.now();
 if(action==='create'){history=[];unlocks=[];purchases=new Map();}
 if(action === 'create') state = { coins:0,hint:null,isPublic:false,title:'Your room',allowRerolls:false,code:'DEMO', phase:'lobby', version:0, round:0, totalRounds:5, host:'you', me:'you', players:[{id:'you',nickname:String(payload.nickname || 'You'),score:0,connected:true,host:true},...['Juniper','Milo'].map((nickname,i)=>({id:`bot-${i}`,nickname:`${nickname} · bot`,score:0,connected:true,host:false}))],deadline:null,scenario:'',items:[],submitted:false,submittedCount:0,voted:false,votedCount:0,plans:[] };
 if(!state) return null;
 if(action === 'leave') {state=null; return null;}
 if(action === 'start' || action === 'next') {
  if(state.phase==='finished'){state.phase='lobby';state.round=0;state.deadline=null;purchases=new Map();state.players.forEach(p=>p.score=0);state.items=[];state.plans=[];state.submitted=false;state.voted=false;}
  else if(state.round>=state.totalRounds) {state.phase='finished';state.deadline=null;}
  else {state.hint=null;state.peek=null;state.round++;state.phase='prompt';state.deadline=now+5000;state.scenario=scenarios[(state.round-1)%scenarios.length];state.items=[...items].sort(()=>Math.random()-.5).slice(0,3);state.plans=[];state.submitted=false;state.voted=false;state.submittedCount=0;state.votedCount=0;}
 }
 if(action==='tick' && state.deadline && now>=state.deadline) {
  if(state.phase==='prompt'){state.phase='writing';state.deadline=now+90000;}
  else if(state.phase==='writing'){startVoting();}
  else if(state.phase==='voting') finish();
 }
 if(action==='submit' && state.phase==='writing' && !state.submitted){const text=String(payload.text||'').trim();if(!text || text.length>500)throw new Error('Write a plan between 1 and 500 characters.');state.plans=[{id:'you',text,mine:true}];state.submitted=true;startVoting();}
 if(action==='vote' && state.phase==='voting' && !state.voted){if(!state.plans.some(p=>p.id===payload.id&&!p.mine))throw new Error('Choose another player’s plan.');state.voted=true;finish(String(payload.id));}
 state.version++;return structuredClone(state);
}
function startVoting(){if(!state)return;state.phase='voting';state.deadline=Date.now()+30000;state.submittedCount=state.submitted?3:2;state.plans.push(...botText.map((text,i)=>({id:`bot-${i}`,text,mine:false})));}
function finish(vote?:string){if(!state || state.phase==='results')return;state.phase='results';state.deadline=null;state.votedCount=vote?3:2;state.plans=state.plans.map(p=>({...p,author:state!.players.find(x=>x.id===p.id)?.nickname,votes:p.mine?(state!.round%2?2:1):p.id===(vote||'bot-0')?(state!.round%2?1:2):0}));const best=Math.max(...state.plans.map(p=>p.votes||0),0);
 state.players.forEach(p=>{if((state!.plans.find(x=>x.id===p.id)?.votes||0)===best&&best>0){p.score++;if(p.id==='you'){coins(10,'Round victory');if(p.score===3)coins(15,'Three round victories');}}});
 if(state.round===state.totalRounds){const most=Math.max(...state.players.map(p=>p.score));if(state.players[0].score===most&&most>0)coins(30,'Overall match victory');}
}

export function demoWallet():Wallet{return {balance:state?.coins||0,catalog,unlocks:[...unlocks],history:[...history]};}
export function demoSettings(title:string,rerolls:boolean){if(!state)throw new Error('Start a demo first.');state.title=title;state.allowRerolls=rerolls;state.version++;return structuredClone(state);}
export function demoBuy(sku:string,item?:number,target?:string){
 if(!state)throw new Error('Start a demo first.');const product=catalog.find(p=>p.sku===sku);if(!product)throw new Error('Item not available.');
 const consumable=product.kind==='hint'||product.kind==='reroll';if(!consumable&&unlocks.includes(sku))return {room:structuredClone(state),effect:{unlocked:sku}};
 const key=consumable?`${state.round}:${sku}`:sku;
 if(purchases.has(key))return {room:structuredClone(state),effect:purchases.get(key)!};
 if(consumable&&(state.phase!=='writing'||state.submitted))throw new Error('Buy while writing, before submitting.');
 if(product.kind==='reroll'&&(!state.allowRerolls||item===undefined||item<0||item>2))throw new Error('Enable rerolls in the lobby and choose an item.');
 if((state.coins||0)<product.price)throw new Error('Not enough coins. Win a round to earn more.');
 const effect:Record<string,unknown>={};
 if(sku==='item_peek'){const peer=state.players.find(p=>p.id===target&&p.id!=='you');if(!peer)throw new Error('Choose another player.');state.peek={target:peer.id,nickname:peer.nickname,item:items[(state.round+3)%items.length]};Object.assign(effect,state.peek);}
 else if(product.kind==='hint'){state.hint='Use one item as a distraction, another as a tool, and the third as your escape route.';effect.hint=state.hint;}
 else if(product.kind==='reroll'){state.items[item!]=items.find(x=>!state!.items.includes(x))!;effect.items=[...state.items];effect.replacement=state.items[item!];}
 else {unlocks.push(sku);effect.unlocked=sku;}
 coins(-product.price,`Purchase: ${product.name}`);purchases.set(key,effect);state.version++;return {room:structuredClone(state),effect};
}
