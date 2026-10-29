export type Phase = 'lobby' | 'prompt' | 'writing' | 'voting' | 'results' | 'finished';
export type Player = { id: string; nickname: string; score: number; voteScore?: number; connected: boolean; host: boolean };
export type Plan = { id: string; text: string; mine: boolean; author?: string; votes?: number };
export type RoomNotice = {id:number;kind:'player_left'|'room_closed';user_id:string;nickname:string};
export type Peek={target:string;nickname:string;item:string};
export type Room = {peek?:Peek|null;roomEvents?:RoomNotice[]; coins?: number; hint?: string | null; isPublic?: boolean; title?: string; allowRerolls?: boolean; serverTime?: number; code: string; phase: Phase; version: number; round: number; totalRounds: number; host: string; me: string; players: Player[]; deadline: number | null; scenario: string; items: string[]; submitted: boolean; submittedCount: number; voted: boolean; votedCount: number; plans: Plan[] };
export type Action = 'create' | 'join' | 'snapshot' | 'start' | 'submit' | 'vote' | 'next' | 'tick' | 'heartbeat' | 'leave';
export type Payload = Record<string, string | number | boolean>;
export type Connection = 'offline' | 'connecting' | 'live' | 'reconnecting' | 'demo';

export type PublicRoom = {code:string; title:string; phase:Phase; players:number; capacity:number; hostNickname:string};
export type ChatMessage = {id:number; sender_id:string; nickname:string; body:string; created_at:string; invite_code:string|null;reply?:{id:number;body:string}|null;reactions?:Reaction[]};
export type ShopItem = {sku:string; name:string; price:number; kind:'hint'|'reroll'|'cosmetic'|'pack'; enabled:boolean};
export type Wallet = {balance:number; catalog:ShopItem[]; unlocks:string[]; history:{amount:number;reason:string;created_at:string}[]};
export type DailyReward={canClaim:boolean;claimedToday:boolean;welcomeAvailable:boolean;amount:number;nextClaimAt:string;serverTime:string};

export type Reaction={emoji:string;count:number;mine:boolean};
export type Person={id:string;nickname:string;online?:boolean;room_code?:string|null;room_title?:string|null};
export type Conversation=Person&{latest_id:number;preview:string;unread:number};
