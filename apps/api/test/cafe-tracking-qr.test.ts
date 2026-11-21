import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const jsQR=createRequire(import.meta.url)('jsqr') as typeof import('jsqr').default;
import {PNG} from 'pngjs';
import {prepareCafeTrackingQr} from '../src/nest/cafe-tracking-qr.js';

test('printable inactive cafe QR independently decodes to its exact HTTPS random link',async()=>{
  let queryCount=0;
  const id=randomUUID(),cafeId=randomUUID(),branchId=randomUUID();
  const db={async query(sql:string,values:unknown[]){
    queryCount++;assert.match(sql,/register_cafe_tracking_draft/);
    assert.deepEqual(values.slice(0,3),[cafeId,branchId,null]);
    assert.ok(Buffer.isBuffer(values[3]));assert.equal(values[3].length,32);
    return {rows:[{id}]};
  }};
  const draft=await prepareCafeTrackingQr(db,{cafeId,branchId,publicOrigin:'https://example.invalid',lifetimeSeconds:3600,attributionWindowSeconds:600});
  assert.equal(draft.id,id);assert.equal(queryCount,1);
  assert.match(draft.url,/^https:\/\/example\.invalid\/q\/[0-9a-f]{64}$/);
  const image=PNG.sync.read(draft.png);
  const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
  assert.equal(decoded?.data,draft.url);
  assert.match(draft.html,/<html lang="fa" dir="rtl">/);
  assert.ok(draft.html.includes('این پیوند هنوز فعال نشده است.'));
  assert.ok(draft.html.includes(draft.png.toString('base64')));
});

test('invalid public origin or lifetimes do not persist tracking drafts',async()=>{
  const db={async query(){throw new Error('Invalid input must not write');}};
  const options={cafeId:randomUUID(),branchId:randomUUID(),publicOrigin:'https://example.invalid',lifetimeSeconds:3600,attributionWindowSeconds:600};
  for(const publicOrigin of ['http://example.invalid','https://user:password@example.invalid','https://example.invalid/path','https://example.invalid/?x=1'])
    await assert.rejects(prepareCafeTrackingQr(db,{...options,publicOrigin}),TypeError);
  await assert.rejects(prepareCafeTrackingQr(db,{...options,lifetimeSeconds:0}),TypeError);
});
