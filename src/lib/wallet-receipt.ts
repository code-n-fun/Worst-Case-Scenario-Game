export type LeaveReceipt={left:true;charged:number;balance:number};
export function leaveReceipt(value:unknown):LeaveReceipt{
 const r=value as Partial<LeaveReceipt>|null;
 if(!r||r.left!==true||typeof r.charged!=='number'||!Number.isSafeInteger(r.charged)||r.charged<0||r.charged>3||typeof r.balance!=='number'||!Number.isSafeInteger(r.balance)||r.balance<0)
  throw new Error('Your departure could not be verified. Please try again.');
 return r as LeaveReceipt;
}
