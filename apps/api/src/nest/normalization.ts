/** Keep original source text separately; normalized values are for matching only. */
export function normalizePersian(value: string): string {
  return value.normalize('NFKC').replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function asciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char >= '۰' ? 0x06f0 : 0x0660)));
}
/** Iranian mobile OTP scope; other international numbers need an explicit country-aware parser later. */
export function normalizeIranMobile(value: string): string {
  const clean = asciiDigits(value).replace(/[\s()-]/g, '');
  const international = clean.startsWith('0098') ? '+' + clean.slice(2)
    : /^09\d{9}$/.test(clean) ? '+98' + clean.slice(1) : clean;
  if (!/^\+989\d{9}$/.test(international)) throw new Error('Invalid Iranian mobile number');
  return international;
}
