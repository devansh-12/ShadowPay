/**
 * @module stealth
 * @description ERC-5564 scheme-1 cryptographic engine for stealth address payments.
 *
 * Scheme 1 uses secp256k1 — the same curve Ethereum uses for wallet keys.
 * Pure cryptography: no blockchain calls, no I/O, no side effects.
 */

import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CURVE_ORDER: bigint = secp.Point.CURVE().n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt("0x" + Buffer.from(bytes).toString("hex"));
}

function modN(scalar: bigint): bigint {
  return secp.etc.mod(scalar, CURVE_ORDER);
}

// ---------------------------------------------------------------------------
// Public constant
// ---------------------------------------------------------------------------

/** ERC-5564 scheme identifier for secp256k1. */
export const SCHEME_ID = 1 as const;

// ---------------------------------------------------------------------------
// Meta-address encoding / decoding
// ---------------------------------------------------------------------------

/**
 * Encodes the recipient's two compressed public keys into a meta-address string.
 * Format: `st:eth:0x{spendPubKey66}{viewPubKey66}`
 */
export function encodeMetaAddress(
  spendPubKeyHex: string,
  viewPubKeyHex: string,
): string {
  return `st:eth:0x${spendPubKeyHex}${viewPubKeyHex}`;
}

/**
 * Parses a meta-address back into its two constituent compressed public keys.
 * @throws {Error} on bad prefix or wrong length.
 */
export function parseMetaAddress(metaAddress: string): {
  spendPubKey: string;
  viewPubKey: string;
} {
  const PREFIX = "st:eth:0x";
  if (!metaAddress.startsWith(PREFIX)) {
    throw new Error(
      `parseMetaAddress: invalid prefix. Expected "${PREFIX}", ` +
        `received "${metaAddress.slice(0, PREFIX.length)}"`,
    );
  }
  const body = metaAddress.slice(PREFIX.length);
  if (body.length !== 132) {
    throw new Error(
      `parseMetaAddress: invalid body length. Expected 132 hex chars, received ${body.length}`,
    );
  }
  return { spendPubKey: body.slice(0, 66), viewPubKey: body.slice(66, 132) };
}

// ---------------------------------------------------------------------------
// Address derivation utility
// ---------------------------------------------------------------------------

/**
 * Derives an Ethereum address from a compressed (33-byte) or uncompressed (65-byte)
 * secp256k1 public key.
 */
export function pubKeyToEthAddress(pubKeyBytes: Uint8Array): string {
  let body64: Uint8Array;
  if (pubKeyBytes.length === 33) {
    const point = secp.Point.fromBytes(pubKeyBytes);
    const uncompressed = point.toBytes(false);
    body64 = uncompressed.slice(1);
  } else if (pubKeyBytes.length === 65) {
    body64 = pubKeyBytes.slice(1);
  } else {
    throw new Error(
      `pubKeyToEthAddress: unsupported key length ${pubKeyBytes.length}`,
    );
  }
  const digest = keccak_256(body64);
  return "0x" + Buffer.from(digest.slice(12)).toString("hex");
}

// ---------------------------------------------------------------------------
// Sender-side: stealth address generation
// ---------------------------------------------------------------------------

/**
 * Generates a one-time stealth address for a payment to the given recipient.
 *
 * Derivation (ERC-5564 scheme 1):
 *   ephemeralPrivKey  = random 32 bytes
 *   sharedSecret      = Keccak256(compress(ephemeralPrivKey × viewPubKey))
 *   viewTag           = sharedSecret[0]
 *   tweakScalar       = BigInt(sharedSecret) mod n
 *   stealthPubKey     = spendPubKey + (tweakScalar × G)
 *   stealthAddress    = EthAddress(stealthPubKey)
 */
export function generateStealthAddress(recipientMetaAddress: string): {
  stealthAddress: string;
  ephemeralPublicKey: string;
  viewTag: number;
} {
  const { spendPubKey: spendPubKeyHex, viewPubKey: viewPubKeyHex } =
    parseMetaAddress(recipientMetaAddress);

  const spendPubKeyBytes = secp.etc.hexToBytes(spendPubKeyHex);
  const viewPubKeyBytes = secp.etc.hexToBytes(viewPubKeyHex);

  const ephemeralPrivKey = secp.utils.randomSecretKey();
  const ephemeralPubKey = secp.getPublicKey(ephemeralPrivKey, true);
  const sharedSecretBytes = secp.getSharedSecret(
    ephemeralPrivKey,
    viewPubKeyBytes,
    true,
  );
  const hashedSecret = keccak_256(sharedSecretBytes);
  const viewTag = hashedSecret[0];
  const tweakScalar = modN(bytesToBigInt(hashedSecret));
  const stealthPubKeyPoint = secp.Point.fromBytes(spendPubKeyBytes).add(
    secp.Point.BASE.multiply(tweakScalar),
  );
  const stealthAddress = pubKeyToEthAddress(stealthPubKeyPoint.toBytes(true));

  return {
    stealthAddress,
    ephemeralPublicKey: secp.etc.bytesToHex(ephemeralPubKey),
    viewTag,
  };
}

// ---------------------------------------------------------------------------
// Recipient-side: view-tag check
// ---------------------------------------------------------------------------

/**
 * Cheap view-tag check (ERC-5564). Allows ~255/256 foreign announcements to be
 * discarded without full key derivation.
 */
export function checkViewTag(
  viewPrivKeyHex: string,
  ephemeralPubKeyHex: string,
  expectedViewTag: number,
): boolean {
  const sharedSecretBytes = secp.getSharedSecret(
    secp.etc.hexToBytes(viewPrivKeyHex),
    secp.etc.hexToBytes(ephemeralPubKeyHex),
    true,
  );
  return keccak_256(sharedSecretBytes)[0] === expectedViewTag;
}

// ---------------------------------------------------------------------------
// Recipient-side: full stealth private key derivation
// ---------------------------------------------------------------------------

/**
 * Derives the stealth private key that controls the stealth address.
 * Returns `null` if the view tag doesn't match (payment not for this recipient).
 *
 * Derivation:
 *   sharedSecret   = Keccak256(compress(ephemeralPubKey × viewPrivKey))
 *   tweakScalar    = BigInt(sharedSecret) mod n
 *   stealthPrivKey = (spendPrivKey + tweakScalar) mod n
 */
export function deriveStealthPrivateKey(
  spendPrivKeyHex: string,
  viewPrivKeyHex: string,
  ephemeralPubKeyHex: string,
  viewTag: number,
): string | null {
  if (!checkViewTag(viewPrivKeyHex, ephemeralPubKeyHex, viewTag)) return null;

  const sharedSecretBytes = secp.getSharedSecret(
    secp.etc.hexToBytes(viewPrivKeyHex),
    secp.etc.hexToBytes(ephemeralPubKeyHex),
    true,
  );
  const hashedSecret = keccak_256(sharedSecretBytes);
  const tweakScalar = modN(bytesToBigInt(hashedSecret));
  const spendPrivScalar = modN(bytesToBigInt(secp.etc.hexToBytes(spendPrivKeyHex)));
  return modN(spendPrivScalar + tweakScalar).toString(16).padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Announcement packaging
// ---------------------------------------------------------------------------

/**
 * Packages the data the ERC-5564 registry `announce()` call needs.
 */
export function generateAnnouncement(
  stealthAddress: string,
  ephemeralPubKeyHex: string,
  viewTag: number,
): {
  schemeId: number;
  stealthAddress: string;
  ephemeralPubKey: string;
  viewTag: number;
} {
  return { schemeId: SCHEME_ID, stealthAddress, ephemeralPubKey: ephemeralPubKeyHex, viewTag };
}
