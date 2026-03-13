import { prisma } from "@/lib/prisma";
import { getBitGoWallet } from "@/lib/bitgo";
import {
  generateStealthAddress,
  generateAnnouncement,
} from "@/lib/stealth";
import { logger } from "@/lib/logger";
import { env } from "@/config/env";

export interface DisburseResult {
  disbursementId: string;
  stealthAddress: string;
  ephemeralPublicKey: string;
  viewTag: number;
  txHash: string | null;
  announcement: ReturnType<typeof generateAnnouncement>;
}

/**
 * End-to-end disbursement flow:
 *   1. Generate a one-time stealth address (ERC-5564)
 *   2. Persist a PENDING record in Postgres
 *   3. Broadcast via BitGo SDK
 *   4. Update record to BROADCAST with txHash
 *   5. Return announcement object for the on-chain registry
 */
export async function disburseTo(
  recipientMetaAddress: string,
  recipientAlias: string,
  amountSats: bigint,
): Promise<DisburseResult> {
  // ── Crypto layer ──────────────────────────────────────────────────────────
  const { stealthAddress, ephemeralPublicKey, viewTag } =
    generateStealthAddress(recipientMetaAddress);

  logger.info("[disbursementService] stealth address generated", {
    stealthAddress,
    viewTag,
  });

  // ── Persist PENDING disbursement ──────────────────────────────────────────
  const record = await prisma.disbursement.create({
    data: {
      recipientAlias,
      stealthAddress,
      ephemeralPubKey: ephemeralPublicKey,
      amountSats,
      status: "PENDING",
    },
  });

  logger.info("[disbursementService] PENDING record created", record.id);

  // ── Broadcast via BitGo ───────────────────────────────────────────────────
  let txHash: string | null = null;
  try {
    const wallet = await getBitGoWallet();

    const sendResult = await wallet.send({
      address: stealthAddress,
      amount: Number(amountSats),
      walletPassphrase: env.BITGO_WALLET_PASSPHRASE,
    });

    txHash = sendResult.txid ?? sendResult.transfer?.id ?? null;
    logger.info("[disbursementService] BitGo broadcast successful", { txHash });

    await prisma.disbursement.update({
      where: { id: record.id },
      data: { txHash, status: "BROADCAST" },
    });
  } catch (err) {
    logger.error("[disbursementService] BitGo broadcast failed", err);
    await prisma.disbursement.update({
      where: { id: record.id },
      data: { status: "FAILED" },
    });
    throw err;
  }

  const announcement = generateAnnouncement(
    stealthAddress,
    ephemeralPublicKey,
    viewTag,
  );

  return {
    disbursementId: record.id,
    stealthAddress,
    ephemeralPublicKey,
    viewTag,
    txHash,
    announcement,
  };
}
