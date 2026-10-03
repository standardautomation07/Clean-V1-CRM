// Which pending approvals may be approved in bulk.
//
// Bulk approval exists because a Maps campaign produces CRM writes in bulk and
// the real work is reviewing the list, not clicking fifty times. It must never
// quietly cover an action that contacts someone or commits money.
//
// The test is a deny-list by design: an unrecognised risk is treated as unsafe,
// so a tool added later with a new risk level has to be considered explicitly
// rather than silently joining the bulk path.

const INDIVIDUAL_ONLY = new Set(["external", "financial"]);

export function isBulkApprovable(risk: string): boolean {
  const normalised = String(risk ?? "").trim().toLowerCase();
  if (!normalised) return false;
  return !INDIVIDUAL_ONLY.has(normalised) && (normalised === "read" || normalised === "write");
}

export function partitionApprovals<T extends { risk: string }>(approvals: T[]): { bulk: T[]; individual: T[] } {
  const bulk: T[] = [];
  const individual: T[] = [];
  for (const approval of approvals) {
    (isBulkApprovable(approval.risk) ? bulk : individual).push(approval);
  }
  return { bulk, individual };
}
