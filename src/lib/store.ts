import { create } from 'zustand';
import type { Connection, Room } from './types';
type Notice={id:string;text:string};
type State = { notices:Notice[]; loungeUnread:number;directUnread:number; notify:(notice:Notice)=>void; dismissNotice:(id:string)=>void; unlocks:string[]; room: Room | null; connection: Connection; error: string | null; busy: boolean; setRoom: (room: Room | null) => void; set: (value: Partial<State>) => void };
export const useGame = create<State>((set) => ({ notices:[],loungeUnread:0,directUnread:0,notify:notice=>set(s=>s.notices.some(n=>n.id===notice.id)?{}:{notices:[...s.notices,notice].slice(-10)}),dismissNotice:id=>set(s=>({notices:s.notices.filter(n=>n.id!==id)})),unlocks:[], room: null, connection: 'offline', error: null, busy: false, setRoom: room => set(s => !room || !s.room || room.code !== s.room.code || room.version >= s.room.version ? { room } : {}), set }));
