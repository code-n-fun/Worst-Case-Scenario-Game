import {it,expect} from 'vitest';
import {leaveReceipt} from '../src/lib/wallet-receipt';
it('accepts a confirmed balance including a capped or zero deduction',()=>{
 for(const charged of [0,2,3])expect(leaveReceipt({left:true,charged,balance:7})).toEqual({left:true,charged,balance:7});
});
it('rejects old, malformed, or impossible departure responses',()=>{
 for(const value of [null,{}, {left:true}, {left:true,charged:4,balance:7},{left:true,charged:3,balance:-1},{left:true,charged:'3',balance:7}])expect(()=>leaveReceipt(value)).toThrow(/verified/);
});
