import type { BulkRecipientCounts } from "@/types/bulk-send";

const SEGMENTS = [
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
  { key: "unknown", label: "Unknown" },
  { key: "pending", label: "Pending" },
] as const;

export const JobProgress = ({ counts }: { counts: BulkRecipientCounts }) => {
  const total = SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0);
  const finished = total - counts.pending;

  return (
    <div className="space-y-2">
      <progress
        className="h-2 w-full overflow-hidden rounded-full accent-primary"
        value={total === 0 ? 0 : finished}
        max={Math.max(total, 1)}
        aria-label="Send progress"
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SEGMENTS.map((segment) => (
          <li key={segment.key}>
            {segment.label}: {counts[segment.key].toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
};
