import type {ChatMessage,RoomNotice} from './types';
export function unreadMessages(messages:ChatMessage[],after:number,me:string){
 return messages.filter(m=>m.id>after&&m.sender_id!==me).length;
}
export function nextReadCursor(previous:number|null,visibleLatest:number){return Math.max(previous||0,visibleLatest);}
export function departureText(event:RoomNotice){return event.kind==='room_closed'?`${event.nickname} left. The room is now closed.`:`${event.nickname} left the room.`;}
export function newRoomNotices(events:RoomNotice[],after:number,me:string){return events.filter(e=>e.id>after&&e.user_id!==me);}
