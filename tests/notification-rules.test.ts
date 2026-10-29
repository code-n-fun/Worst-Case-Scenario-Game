import {it,expect} from 'vitest';
import {newRoomNotices,nextReadCursor,unreadMessages} from '../src/lib/notification-rules';
import type {ChatMessage,RoomNotice} from '../src/lib/types';
it('keeps the read cursor monotonic across stale responses',()=>{expect(nextReadCursor(120,100)).toBe(120);expect(nextReadCursor(null,50)).toBe(50);});
it('does not count old messages or ones sent by the current player',()=>{
 const messages=[{id:10,sender_id:'other'},{id:11,sender_id:'me'},{id:12,sender_id:'other'}] as ChatMessage[];
 expect(unreadMessages(messages,10,'me')).toBe(1);
});
it('only announces departures that occurred after joining and excludes oneself',()=>{
 const events=[{id:1,user_id:'other'},{id:2,user_id:'me'},{id:3,user_id:'other'}] as RoomNotice[];
 expect(newRoomNotices(events,1,'me').map(e=>e.id)).toEqual([3]);
});
