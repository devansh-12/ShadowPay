import { NextRequest, NextResponse } from "next/server";
import { disburseTo } from "@/services/disbursementService";
import { logger } from "@/lib/logger";

export interface DisburseBody {
  recipientMetaAddress: string;
  recipientAlias: string;
  amountSats: number;
}

/**
 * POST /api/disburse
 *
 * Body: { recipientMetaAddress, recipientAlias, amountSats }
 * Returns: { disbursementId, stealthAddress, txHash, announcement }
 */
export async function POST(req: NextRequest) {
  let body: DisburseBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recipientMetaAddress, recipientAlias, amountSats } = body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!recipientMetaAddress || !recipientMetaAddress.startsWith("st:eth:0x")) {
    return NextResponse.json(
      { error: "recipientMetaAddress must start with 'st:eth:0x'" },
      { status: 400 },
    );
  }
  if (!recipientAlias || typeof recipientAlias !== "string") {
    return NextResponse.json(
      { error: "recipientAlias is required" },
      { status: 400 },
    );
  }
  if (!amountSats || typeof amountSats !== "number" || amountSats <= 0) {
    return NextResponse.json(
      { error: "amountSats must be a positive number" },
      { status: 400 },
    );
  }

  // ── Disburse ──────────────────────────────────────────────────────────────
  try {
    const result = await disburseTo(
      recipientMetaAddress,
      recipientAlias,
      BigInt(amountSats),
    );

    logger.info("[POST /api/disburse] success", result.disbursementId);

    return NextResponse.json(
      {
        disbursementId: result.disbursementId,
        stealthAddress: result.stealthAddress,
        txHash: result.txHash,
        announcement: result.announcement,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    logger.error("[POST /api/disburse] failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
