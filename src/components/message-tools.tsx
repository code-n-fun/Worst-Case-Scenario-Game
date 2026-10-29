'use client';
import {useState} from 'react';
import {CornerUpLeft,Smile,X} from 'lucide-react';
import type {ChatMessage} from '@/lib/types';
export const emojis=['👍','❤️','😂','🔥','👏','😮','🫡','👀'];
export function EmojiPicker({onPick,disabled=false}:{onPick:(emoji:string)=>void;disabled?:boolean}){const [open,setOpen]=useState(false);return <span className="emoji-picker"><button type="button" aria-label="Add an emoji" disabled={disabled} onClick={()=>setOpen(!open)}><Smile size={17}/></button>{open&&<span className="emoji-options">{emojis.map(e=><button type="button" key={e} aria-label={`Emoji ${e}`} onClick={()=>{onPick(e);setOpen(false);}}>{e}</button>)}</span>}</span>;}
export function MessageExtras({message,locked=false,onReply,onReact}:{message:ChatMessage;locked?:boolean;onReply:()=>void;onReact:(emoji:string)=>void}){
 return <><div className="message-reactions">{message.reactions?.map(r=><button key={r.emoji} className={r.mine?'mine':''} disabled={locked} onClick={()=>onReact(r.emoji)} aria-label={`${r.emoji}, ${r.count} reactions${r.mine?', you reacted':''}`}>{r.emoji} {r.count}</button>)}</div><div className="message-extra-actions"><button type="button" disabled={locked} onClick={onReply}><CornerUpLeft size={13}/> Reply</button><EmojiPicker disabled={locked} onPick={onReact}/></div></>;
}
export function ReplyDraft({message,onCancel}:{message:ChatMessage;onCancel:()=>void}){return <div className="reply-draft"><span>Replying to <b>{message.nickname}</b><small>{message.body}</small></span><button type="button" aria-label="Cancel reply" onClick={onCancel}><X size={15}/></button></div>;}
