const MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidIndianMobile(s: string): boolean {
  return MOBILE_REGEX.test(s);
}

export function normalizePhone(s: string): string | null {
  let digits = s.replace(/[\s-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

export function maskPhone(p: string): string {
  if (p.length < 5) return "*".repeat(p.length);
  return `${p.slice(0, 2)}${"*".repeat(p.length - 4)}${p.slice(-2)}`;
}
