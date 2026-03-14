import { NextRequest } from "next/server";
import { deliverJob } from "@/services/jobService";
import { requireAuth } from "@/lib/routeAuth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const auth = await requireAuth(req);
    const body = await req.json();
    const { id } = await params;
    const deliverable = String(body.deliverable || "").trim();
    if (!deliverable) throw fail("deliverable is required", 400);

    const job = await deliverJob(id, auth.id, deliverable);
    return json(job);
  });
}
