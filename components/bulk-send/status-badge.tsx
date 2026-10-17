import { Badge } from "@/components/ui/badge";
import type { BulkJobStatus, BulkRecipientStatus } from "@/types/bulk-send";

const JOB_LABELS: Record<BulkJobStatus, string> = {
  draft: "Draft",
  submitting: "Submitting",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  unknown: "Unknown",
};

const jobVariant = (status: BulkJobStatus): "default" | "secondary" | "destructive" => {
  if (status === "failed" || status === "completed_with_errors") {
    return "destructive";
  }
  if (status === "completed") {
    return "default";
  }
  return "secondary";
};

export const JobStatusBadge = ({ status }: { status: BulkJobStatus }) => {
  return <Badge variant={jobVariant(status)}>{JOB_LABELS[status]}</Badge>;
};

export const RecipientStatusBadge = ({ status }: { status: BulkRecipientStatus }) => {
  const variant = status === "failed" ? "destructive" : status === "sent" ? "default" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
};
