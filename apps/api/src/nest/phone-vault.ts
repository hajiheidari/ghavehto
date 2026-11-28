import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { normalizeIranMobile } from './normalization.js';

/** Separate durable lookup and encryption keys; neither is the short-lived OTP key. */
export class PhoneVault {
  private readonly lookupKey: Buffer;
  private readonly keys: ReadonlyMap<string, Buffer>;
  constructor(lookupKey: Buffer, keys: ReadonlyMap<string, Buffer>, private readonly activeKeyId: string) {
    if (lookupKey.length < 32 || !keys.has(activeKeyId) || [...keys].some(([id, key]) => !/^[a-zA-Z0-9_-]{1,32}$/.test(id) || key.length !== 32)) {
      throw new Error('Explicit valid identity encryption and lookup keys required');
    }
    this.lookupKey = Buffer.from(lookupKey);
    this.keys = new Map([...keys].map(([id, key]) => [id, Buffer.from(key)]));
  }
  lookup(phone: string): Buffer {
    return createHmac('sha256', this.lookupKey).update(JSON.stringify(['ghahvehto:private-phone:v1', normalizeIranMobile(phone)])).digest();
  }
  seal(userId: string, phone: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKeyId)!, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(['ghahvehto:private-phone:v1', userId, this.activeKeyId])));
    const ciphertext = Buffer.concat([cipher.update(normalizeIranMobile(phone), 'utf8'), cipher.final()]);
    return Buffer.from(JSON.stringify({ v: 1, kid: this.activeKeyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') }));
  }
  open(userId: string, envelope: Buffer): string {
    try {
      const value = JSON.parse(envelope.toString('utf8'));
      const key = this.keys.get(value.kid);
      if (value.v !== 1 || !key) throw new Error();
      const iv = Buffer.from(value.iv, 'base64'), tag = Buffer.from(value.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(JSON.stringify(['ghahvehto:private-phone:v1', userId, value.kid])));
      cipher.setAuthTag(tag);
      return normalizeIranMobile(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8'));
    } catch { throw new Error('Invalid private identity ciphertext'); }
  }
}
