import {createHash,randomBytes} from 'node:crypto';
import type pg from 'pg';

export function hashReferralCode(code:string):Buffer {
  if(!/^[0-9a-f]{64}$/.test(code)) throw new TypeError('Invalid referral code');
  return createHash('sha256').update(code,'ascii').digest();
}

// This is an internal helper. Normal startup does not grant access to this function.
export async function issueReferralLink(db:Pick<pg.Pool,'query'>,inviterId:string,lifetimeSeconds:number) {
  const code=randomBytes(32).toString('hex');
  const {rows:[row]}=await db.query<{id:string}>(
    'SELECT public.register_referral_link($1,$2,$3) AS id',[inviterId,hashReferralCode(code),lifetimeSeconds]);
  return {id:row.id,code};
}
