import { randomInt } from "node:crypto";
import { VOUCHER_ALPHABET } from "@voiceretain/shared";

type RandomInt = (max: number) => number;

/** `VR-XXXX-XXXX` from an alphabet without 0/O/1/I/L, using a cryptographic RNG by default. */
export function generateVoucherCode(rand: RandomInt = (max) => randomInt(max)): string {
  const group = () =>
    Array.from({ length: 4 }, () => VOUCHER_ALPHABET[rand(VOUCHER_ALPHABET.length)]).join("");
  return `VR-${group()}-${group()}`;
}
