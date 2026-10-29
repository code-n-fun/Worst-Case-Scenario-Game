import type { Metadata, Viewport } from 'next';
import './globals.css';
import './modern.css';
export const metadata:Metadata={title:'Worst Case Scenario — Play with your friends',description:'A ridiculous multiplayer survival game. Three random items. One terrible situation. What’s your plan?'};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#f5f2ea'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
