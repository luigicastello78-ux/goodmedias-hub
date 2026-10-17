"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { CampaignBatch, CampaignBatchContact } from "@/types/email-ledger";

export const BatchDetail = ({ batchId }: { batchId: string }) => {
  const [batch, setBatch] = useState<CampaignBatch | null>(null);
  const [contacts, setContacts] = useState<CampaignBatchContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; batch: CampaignBatch; contacts: CampaignBatchContact[] }>(
          `/api/n8n/campaign-batches/${batchId}`,
        );
        if (!cancelled) {
          setBatch(data.batch);
          setContacts(data.contacts);
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
  }, [batchId]);

  if (!batch && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading campaign batch</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <Button variant="outline" size="sm" asChild>
        <Link href="/campaigns/batches">All batches</Link>
      </Button>
      {error ? <StatusAlert variant="destructive" title="Batch could not be loaded" message={error} /> : null}
      {batch ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{batch.name}</h2>
            <Badge variant={batch.status === "failed" ? "destructive" : "secondary"}>{batch.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {batch.acceptedCount.toLocaleString()} accepted · {batch.rejectedCount.toLocaleString()} rejected ·{" "}
            {formatTimestamp(batch.createdAt)}
          </p>
          {batch.n8nBatchId ? <p className="text-sm">n8n batch {batch.n8nBatchId}</p> : null}
          {batch.error ? <StatusAlert variant="destructive" title="Queue failed" message={batch.error} /> : null}
          <p className="text-sm text-muted-foreground">
            n8n does not report each email after this queue is accepted. This list shows who was accepted or rejected at submit time.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>{contact.status}</TableCell>
                  <TableCell>{contact.rejectReason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </div>
  );
};
