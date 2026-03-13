import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type DisbursementStatus = "PENDING" | "BROADCAST" | "CONFIRMED" | "FAILED";


interface BitGoTransferEvent {
  type: string;
  transfer?: {
    txid?: string;
    id?: string;
    state?: string;
  };
}

/**
 * POST /api/webhook
 *
 * Receives BitGo webhook events. Stores the raw event in `WebhookEvent` and
 * updates the matching `Disbursement` status when a transfer is confirmed/failed.
 */
export async function POST(req: NextRequest) {
  let payload: BitGoTransferEvent;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  logger.info("[POST /api/webhook] received event", payload.type);

  // ── Persist raw event ─────────────────────────────────────────────────────
  await prisma.webhookEvent.create({
    data: {
      eventType: payload.type ?? "unknown",
      payload: payload as object,
    },
  });

  // ── Update disbursement status ────────────────────────────────────────────
  const txid = payload.transfer?.txid ?? payload.transfer?.id;

  if (txid) {
    const statusMap: Record<string, DisbursementStatus> = {
      transfer_confirmed: "CONFIRMED",
      transfer_failed:    "FAILED",
    };
    const newStatus = statusMap[payload.type];

    if (newStatus) {
      const updated = await prisma.disbursement.updateMany({
        where: { txHash: txid },
        data:  { status: newStatus },
      });
      logger.info(
        `[POST /api/webhook] updated ${updated.count} disbursement(s) → ${newStatus}`,
      );
    }
  }

  return NextResponse.json({ received: true });
}
