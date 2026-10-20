import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { normalizeIranMobile } from './normalization.js';

/** Delivery is a privileged boundary. No implementation may log a code or destination. */
export interface OtpProvider {
  readonly enabled: boolean;
  send(input: Readonly<{ destination: string; code: string }>): Promise<void>;
}

/** Default composition must use this adapter until provider and sending are approved. */
export class DisabledOtpProvider implements OtpProvider {
  readonly enabled = false;
  async send(_input: Readonly<{ destination: string; code: string }>): Promise<never> {
    throw new Error('OTP delivery is disabled');
  }
}

/** Internal crypto primitive, not an authentication flow or an in-memory OTP store.
 * Persist digest + expiry + attempt count transactionally before enabling verification.
 * A keyed digest prevents offline enumeration of the one-million-code space after a DB leak.
 */
export class OtpCrypto {
  private readonly key: Buffer;
  constructor(key: Buffer) {
    if (key.length < 32) throw new Error('OTP HMAC key must contain at least 32 random bytes');
    this.key = Buffer.from(key);
  }

  generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  digest(challengeId: string, destination: string, code: string): Buffer {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
      throw new Error('Invalid OTP challenge ID');
    }
    if (!/^\d{6}$/.test(code)) throw new Error('Invalid OTP code format');
    const payload = JSON.stringify(['ghahvehto:login-otp:v1', challengeId.toLowerCase(), normalizeIranMobile(destination), code]);
    return createHmac('sha256', this.key).update(payload).digest();
  }

  matches(challengeId: string, destination: string, code: string, expected: Buffer): boolean {
    if (expected.length !== 32 || !/^\d{6}$/.test(code)) return false;
    return timingSafeEqual(this.digest(challengeId, destination, code), expected);
  }
}
