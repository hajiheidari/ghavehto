import { normalizeIranMobile } from './normalization.js';
import type { OtpProvider } from './otp.js';

const endpoint = 'https://api.sms.ir/v1/send/verify';

/** Prepared for explicit composition only. No application startup path instantiates it. */
export class SmsIrOtpProvider implements OtpProvider {
  readonly enabled = true;
  readonly #apiKey: string;
  readonly #templateId: number;
  readonly #parameterName: string;

  constructor(config: Readonly<{ apiKey: string; templateId: number; parameterName: string }>,
    private readonly transport: typeof fetch = fetch) {
    if (!/^[\x21-\x7e]+$/.test(config.apiKey) ||
      !Number.isSafeInteger(config.templateId) || config.templateId <= 0 ||
      !/^[a-z][a-z0-9_]{0,31}$/i.test(config.parameterName)) {
      throw new Error('Invalid SMS.ir OTP configuration');
    }
    this.#apiKey = config.apiKey;
    this.#templateId = config.templateId;
    this.#parameterName = config.parameterName;
  }

  async send(input: Parameters<OtpProvider['send']>[0]): Promise<void> {
    const deadline = AbortSignal.timeout(5000);
    const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    try {
      signal.throwIfAborted();
      if (!/^\d{6}$/.test(input.code)) throw new Error();
      const mobile = normalizeIranMobile(input.destination).slice(3);
      const response = await this.transport(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': this.#apiKey },
        body: JSON.stringify({
          mobile, templateId: this.#templateId,
          parameters: [{ name: this.#parameterName, value: input.code }],
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const receipt = await response.json() as { status?: unknown; data?: { messageId?: unknown } } | null;
      signal.throwIfAborted();
      const id = receipt?.data?.messageId;
      if (receipt?.status !== 1 || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error();
      // Provider acceptance is not proof that the handset received a message.
    } catch {
      // Do not attach provider response, network error cause or request details.
      throw new Error('SMS.ir OTP delivery was not accepted');
    }
  }
}
