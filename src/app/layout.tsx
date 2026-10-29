import type { Metadata, Viewport } from 'next';
import './globals.css';
import './modern.css';
export const metadata:Metadata={title:'Worst Case Scenario — Play with your friends',description:'A party game for 2–8 players. Get three random items, write your survival plan, and vote for your favorite. Play together on any device.',icons:{icon:'/icon.svg'},openGraph:{title:'Worst Case Scenario',description:'Three random items. Ninety seconds. What’s your plan?',type:'website'},twitter:{card:'summary',title:'Worst Case Scenario',description:'A party game for your next night with friends.'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#11141c'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
