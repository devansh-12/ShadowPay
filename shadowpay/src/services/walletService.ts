import {
  checkViewTag,
  deriveStealthPrivateKey,
  pubKeyToEthAddress,
} from "@/lib/stealth";
import * as secp from "@noble/secp256k1";
import { logger } from "@/lib/logger";

export interface ScanResult {
  /** Stealth private key hex (64 chars) — can spend funds at `stealthAddress`. */
  stealthPrivKey: string;
  /** Ethereum address controlled by the stealth private key. */
  stealthAddress: string;
}

/**
 * Scans a single announcement against the recipient's keys.
 *
 * @returns `ScanResult` if the announcement belongs to this recipient, `null` otherwise.
 */
export function scanForPayment(
  viewPrivKeyHex: string,
  spendPrivKeyHex: string,
  ephemeralPubKeyHex: string,
  viewTag: number,
): ScanResult | null {
  // Fast-fail: view tag check (1/256 cost of full derivation)
  if (!checkViewTag(viewPrivKeyHex, ephemeralPubKeyHex, viewTag)) {
    logger.info("[walletService] view tag mismatch — skipped");
    return null;
  }

  const stealthPrivKey = deriveStealthPrivateKey(
    spendPrivKeyHex,
    viewPrivKeyHex,
    ephemeralPubKeyHex,
    viewTag,
  );

  if (!stealthPrivKey) return null;

  const stealthPubBytes = secp.getPublicKey(
    secp.etc.hexToBytes(stealthPrivKey),
    true,
  );
  const stealthAddress = pubKeyToEthAddress(stealthPubBytes);

  logger.info("[walletService] payment found → stealth address", stealthAddress);
  return { stealthPrivKey, stealthAddress };
}
