"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { CampaignBatch } from "@/types/email-ledger";

export const BatchList = () => {
  const [batches, setBatches] = useState<CampaignBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; batches: CampaignBatch[] }>("/api/n8n/campaign-batches");
        if (!cancelled) {
          setBatches(data.batches);
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

  if (!batches && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading campaigns</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Campaign batches</h2>
        <Button size="sm" asChild>
          <Link href="/campaigns">New campaign</Link>
        </Button>
      </div>
      {error ? <StatusAlert variant="destructive" title="Campaigns could not be loaded" message={error} /> : null}
      {batches && batches.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No campaign batches have been recorded yet.
        </p>
      ) : null}
      <ul className="space-y-3">
        {batches?.map((batch) => (
          <li key={batch.id}>
            <Link
              href={`/campaigns/batches/${batch.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span>
                <span className="block font-medium">{batch.name}</span>
                <span className="text-xs text-muted-foreground">
                  {batch.acceptedCount.toLocaleString()} accepted · {formatTimestamp(batch.createdAt)}
                </span>
              </span>
              <Badge variant={batch.status === "failed" ? "destructive" : "secondary"}>{batch.status}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
