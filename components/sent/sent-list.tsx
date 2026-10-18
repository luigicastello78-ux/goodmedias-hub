"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { OutboundMessage } from "@/types/email-ledger";

const PAGE_SIZE = 25;

export const SentList = () => {
  const [messages, setMessages] = useState<OutboundMessage[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; messages: OutboundMessage[]; total: number }>(
          `/api/n8n/sent?page=${page}&pageSize=${PAGE_SIZE}`,
        );
        if (!cancelled) {
          setMessages(data.messages);
          setTotal(data.total);
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
  }, [page]);

  if (!messages && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading sent mail</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Sent mail</h2>
          {total > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">{total} message{total !== 1 ? "s" : ""} total</p>
          )}
        </div>
      </div>

      {error ? <StatusAlert variant="destructive" title="Sent mail could not be loaded" message={error} /> : null}

      {messages && messages.length === 0 && page === 1 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No emails have been sent yet.</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {messages?.map((message) => (
          <li key={message.id}>
            <Link
              href={`/sent/${message.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block text-sm font-medium">{message.subject}</span>
                <span className="text-xs text-muted-foreground">
                  To {message.toEmail} · {formatTimestamp(message.createdAt)}
                </span>
              </span>
              <Badge variant={message.status === "failed" ? "destructive" : message.status === "sent" ? "default" : "secondary"}>
                {message.status}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="mr-1 size-4" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
