import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
it('runs 29 integration checks for community access, rewards, spending, and replay',()=>{
 const output=execFileSync(process.execPath,['scripts/verify-community.mjs'],{encoding:'utf8'});
 expect(output).toContain('PASS: 29 checks');
},30000);
