"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { JobStatusBadge } from "@/components/bulk-send/status-badge";
import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { BulkJob } from "@/types/bulk-send";

export const JobList = () => {
  const [jobs, setJobs] = useState<BulkJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await requestJson<{ ok: true; jobs: BulkJob[] }>("/api/n8n/bulk-send");
      setJobs(data.jobs);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; jobs: BulkJob[] }>("/api/n8n/bulk-send");
        if (!cancelled) {
          setJobs(data.jobs);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!jobs && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading bulk jobs</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Jobs</h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/bulk-send">New bulk send</Link>
          </Button>
        </div>
      </div>
      {error ? <StatusAlert variant="destructive" title="Jobs could not be loaded" message={error} /> : null}
      {jobs && jobs.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No bulk jobs yet. Start one from the upload form.
        </p>
      ) : null}
      <ul className="space-y-3">
        {jobs?.map((job) => (
          <li key={job.jobId}>
            <Link
              href={`/bulk-send/jobs/${job.jobId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span>
                <span className="block font-medium">{job.name}</span>
                <span className="text-xs text-muted-foreground">
                  {job.total.toLocaleString()} contacts · {formatTimestamp(job.createdAt)}
                </span>
              </span>
              <JobStatusBadge status={job.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
