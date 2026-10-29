import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),listeners:new Map<string,(value:any)=>void>()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'host'}}}})},
 rpc:mocks.rpc,
 channel:()=>{const channel={on:(_type:string,filter:{event:string},callback:(v:any)=>void)=>{mocks.listeners.set(filter.event,callback);return channel;},subscribe:()=>channel};return channel;},
 removeChannel:async()=>{},
})}));
const room={code:'TEST',me:'host',host:'host',phase:'writing',version:1,round:1,totalRounds:5,players:[],deadline:null,scenario:'Test',items:['One'],submitted:false,submittedCount:0,voted:false,votedCount:0,plans:[],coins:10};
function storage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)};}
beforeEach(()=>{vi.resetModules();mocks.rpc.mockReset();mocks.listeners.clear();vi.stubGlobal('window',new EventTarget());vi.stubGlobal('sessionStorage',storage());vi.stubGlobal('localStorage',storage());});
afterEach(()=>vi.unstubAllGlobals());
async function connect(){const client=await import('../src/lib/client');mocks.rpc.mockResolvedValueOnce({data:room,error:null});await client.act('create',{nickname:'Host'});return client;}
it('processes the host fee receipt even when room closure arrives before the RPC response',async()=>{
 const client=await connect();const events:any[]=[];window.addEventListener('wcs-wallet',event=>events.push((event as CustomEvent).detail));
 mocks.rpc.mockImplementationOnce(async()=>{mocks.listeners.get('room_notice')?.({payload:{kind:'room_closed',id:1,nickname:'Host',user_id:'host'}});return {data:{left:true,charged:3,balance:7},error:null};});
 await client.endSession();const {useGame}=await import('../src/lib/store');expect(useGame.getState().room).toBeNull();expect(useGame.getState().connection).toBe('offline');expect(events).toContainEqual({balance:7});expect(useGame.getState().notices.some(n=>n.text.includes('3 coins went to the platform'))).toBe(true);
});
it('does not silently fall back to an unverified leave when the SQL update is missing',async()=>{
 const client=await connect();mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'Could not find leave_room in the schema cache'}});
 await expect(client.endSession()).rejects.toThrow(/temporarily unavailable/);const {useGame}=await import('../src/lib/store');expect(useGame.getState().room?.code).toBe('TEST');expect(mocks.rpc).toHaveBeenLastCalledWith('leave_room',{p_code:'TEST'});
});
it('keeps the room open when the server returns an invalid settlement receipt',async()=>{
 const client=await connect();mocks.rpc.mockResolvedValueOnce({data:null,error:null});await expect(client.endSession()).rejects.toThrow(/verified/);const {useGame}=await import('../src/lib/store');expect(useGame.getState().room?.code).toBe('TEST');
});
