"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { prepareBulkContacts } from "@/lib/bulk-contacts";
import { estimateBulkDuration } from "@/lib/bulk-estimate";
import { useBulkSendStore } from "@/stores/bulk-send-store";

export const BulkReview = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const jobName = useBulkSendStore((state) => state.jobName);
  const fromEmail = useBulkSendStore((state) => state.fromEmail);
  const fromName = useBulkSendStore((state) => state.fromName);
  const subject = useBulkSendStore((state) => state.subject);
  const rows = useBulkSendStore((state) => state.rows);
  const emailColumn = useBulkSendStore((state) => state.emailColumn);
  const intervalMinutes = useBulkSendStore((state) => state.intervalMinutes);
  const jitterSeconds = useBulkSendStore((state) => state.jitterSeconds);
  const pauseMin = useBulkSendStore((state) => state.pauseMin);
  const pauseMax = useBulkSendStore((state) => state.pauseMax);
  const sendWindowEnabled = useBulkSendStore((state) => state.sendWindowEnabled);
  const timezone = useBulkSendStore((state) => state.timezone);
  const startHour = useBulkSendStore((state) => state.startHour);
  const endHour = useBulkSendStore((state) => state.endHour);
  const weekdaysOnly = useBulkSendStore((state) => state.weekdaysOnly);
  const dispatchStatus = useBulkSendStore((state) => state.dispatchStatus);
  const dispatchError = useBulkSendStore((state) => state.dispatchError);
  const dispatchRetryable = useBulkSendStore((state) => state.dispatchRetryable);
  const submitBulkJob = useBulkSendStore((state) => state.submitBulkJob);
  const prepared = prepareBulkContacts(rows, emailColumn);
  const estimate = estimateBulkDuration({
    contactCount: prepared.contacts.length,
    intervalMinutes,
    pauseMin,
    pauseMax,
    sendWindowEnabled,
  });
  const sending = dispatchStatus === "sending";

  const handleConfirm = async () => {
    const job = await submitBulkJob();
    if (!job) {
      setOpen(false);
      return;
    }
    setOpen(false);
    router.push(`/bulk-send/jobs/${job.jobId}`);
  };

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Job</dt>
          <dd className="font-medium">{jobName || "Untitled"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">From</dt>
          <dd className="font-medium">{fromName ? `${fromName} <${fromEmail}>` : fromEmail}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Contacts to send</dt>
          <dd className="font-medium">
            {prepared.contacts.length.toLocaleString()}
            {prepared.invalidCount || prepared.duplicateCount
              ? ` (${prepared.invalidCount} invalid and ${prepared.duplicateCount} duplicate left out)`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Subject</dt>
          <dd className="font-medium">{subject}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Interval</dt>
          <dd className="font-medium">
            {intervalMinutes} min, jitter {jitterSeconds}s, pause {pauseMin}–{pauseMax}s
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Send window</dt>
          <dd className="font-medium">
            {sendWindowEnabled
              ? `${timezone}, ${startHour}:00–${endHour}:00${weekdaysOnly ? ", weekdays" : ""}`
              : "Any time"}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{estimate.label}</p>
      {dispatchError ? (
        <StatusAlert variant="destructive" title="Bulk send did not start" message={dispatchError} />
      ) : null}
      <Button type="button" onClick={() => setOpen(true)} disabled={sending}>
        {sending ? "Starting…" : dispatchRetryable ? "Retry submit" : "Review and start"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start this bulk send?</DialogTitle>
            <DialogDescription>
              n8n will email {prepared.contacts.length.toLocaleString()} contacts one by one, about every {intervalMinutes} minutes.
              This hub cannot cancel the job after n8n accepts it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Back
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={sending}>
              {sending ? "Starting…" : "Start bulk send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
