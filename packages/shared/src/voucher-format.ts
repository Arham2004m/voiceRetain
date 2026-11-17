export const VOUCHER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const VOUCHER_REGEX =
  /^VR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export function toSpokenCode(code: string): string {
  return code
    .split("-")
    .map((part) => part.split("").join(" "))
    .join(", ");
}
