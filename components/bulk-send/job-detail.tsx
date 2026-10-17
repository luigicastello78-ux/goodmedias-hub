"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { JobProgress } from "@/components/bulk-send/job-progress";
import { JobStatusBadge, RecipientStatusBadge } from "@/components/bulk-send/status-badge";
import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { BULK_POLL_INTERVAL_MS } from "@/lib/constants";
import { formatTimestamp } from "@/lib/format";
import type { BulkJob, BulkJobDetail, BulkJobStatus } from "@/types/bulk-send";

const ACTIVE = new Set<BulkJobStatus>(["submitting", "queued", "running", "unknown"]);
const PAGE_SIZE = 50;
const FILTERS = ["all", "pending", "sent", "failed", "skipped", "unknown"] as const;

export const JobDetail = ({ jobId }: { jobId: string }) => {
  const [detail, setDetail] = useState<BulkJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof FILTERS)[number]>("all");
  const [offset, setOffset] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const load = async (): Promise<BulkJobStatus | null> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      try {
        const data = await requestJson<BulkJobDetail & { ok: true }>(`/api/n8n/bulk-send/${jobId}?${params.toString()}`);
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
        return data.job.status;
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError));
        }
        return null;
      }
    };

    const startPolling = (status: BulkJobStatus | null) => {
      window.clearInterval(timer);
      if (!status || !ACTIVE.has(status)) {
        return;
      }
      timer = window.setInterval(() => {
        if (document.visibilityState === "hidden") {
          return;
        }
        void load().then((next) => {
          if (next && !ACTIVE.has(next)) {
            window.clearInterval(timer);
          }
        });
      }, BULK_POLL_INTERVAL_MS);
    };

    void load().then((status) => {
      if (!cancelled) {
        startPolling(status);
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [jobId, offset, statusFilter]);

  const handleRetry = async () => {
    setRetrying(true);
    setError(null);
    try {
      await requestJson<{ ok: true; job: BulkJob }>(`/api/n8n/bulk-send/${jobId}/retry`, { method: "POST" });
      const data = await requestJson<BulkJobDetail & { ok: true }>(`/api/n8n/bulk-send/${jobId}?limit=${PAGE_SIZE}&offset=${offset}`);
      setDetail(data);
    } catch (retryError) {
      setError(getErrorMessage(retryError));
    } finally {
      setRetrying(false);
    }
  };

  if (!detail && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading bulk job</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const job = detail?.job;
  const waitingForCallbacks = job && !job.lastEventAt && (job.status === "queued" || job.status === "submitting");
  const canRetry = job?.status === "unknown" || job?.status === "submitting";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/bulk-send/jobs">All jobs</Link>
        </Button>
        {job ? <JobStatusBadge status={job.status} /> : null}
      </div>
      {error ? <StatusAlert variant="destructive" title="Could not update this job" message={error} /> : null}
      {job && detail ? (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{job.name}</h2>
            <p className="text-sm text-muted-foreground">
              From {job.fromName ? `${job.fromName} <${job.fromEmail}>` : job.fromEmail} · every {job.intervalMinutes} minutes
            </p>
          </div>
          <JobProgress counts={detail.counts} />
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Estimated finish</dt>
              <dd>{job.estimatedFinishAt ? formatTimestamp(job.estimatedFinishAt) : "Not available yet"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last update</dt>
              <dd>{job.lastEventAt ? formatTimestamp(job.lastEventAt) : "No progress events yet"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contacts</dt>
              <dd>{job.total.toLocaleString()}</dd>
            </div>
          </dl>
          {waitingForCallbacks ? (
            <StatusAlert
              title="Queued in n8n"
              message="Live progress appears here after n8n posts to the hub. Until the first update, this page cannot show which emails have been sent."
            />
          ) : null}
          {job.status === "unknown" ? (
            <StatusAlert
              title="Submit result unknown"
              message="The hub lost the response from n8n. Retry uses the same job id and will not start a second job if n8n already accepted this one."
            />
          ) : null}
          {job.error ? <StatusAlert variant="destructive" title="n8n rejected the job" message={job.error} /> : null}
          <p className="text-sm text-muted-foreground">
            This hub cannot cancel or pause a running job. To stop it, cancel the execution in n8n.
          </p>
          {canRetry ? (
            <Button type="button" onClick={() => void handleRetry()} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry submit"}
            </Button>
          ) : null}
          <div className="max-w-xs space-y-1.5">
            <label htmlFor="recipient-filter" className="text-sm font-medium">
              Recipient status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as (typeof FILTERS)[number]);
                setOffset(0);
              }}
            >
              <SelectTrigger id="recipient-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((filter) => (
                  <SelectItem key={filter} value={filter}>
                    {filter === "all" ? "All" : filter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {detail.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipients in this view.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell>{recipient.email}</TableCell>
                    <TableCell>
                      <RecipientStatusBadge status={recipient.status} />
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">{recipient.error || recipient.skipReason || "—"}</TableCell>
                    <TableCell>{recipient.sentAt ? formatTimestamp(recipient.sentAt) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {detail.recipientTotal.toLocaleString()} matching recipients
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= detail.recipientTotal}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
