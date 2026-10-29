import {spawn} from 'node:child_process';
// Preview runners pass Vite flags; translate only their host/port options to Next.
const input=process.argv.slice(2),args=[];
for(let i=0;i<input.length;i++){
 if(input[i]==='--strictPort')continue;
 args.push(input[i]==='--host'?'--hostname':input[i]);
}
if(!args.includes('--hostname'))args.push('--hostname','0.0.0.0');
const proc=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit'});
proc.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>proc.kill(signal));
