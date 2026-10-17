"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { OutboundMessage } from "@/types/email-ledger";

export const SentList = () => {
  const [messages, setMessages] = useState<OutboundMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; messages: OutboundMessage[] }>("/api/n8n/sent");
        if (!cancelled) {
          setMessages(data.messages);
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

  if (!messages && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading sent mail</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <h2 className="text-base font-semibold">Sent mail</h2>
      {error ? <StatusAlert variant="destructive" title="Sent mail could not be loaded" message={error} /> : null}
      {messages && messages.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No single emails have been recorded yet.
        </p>
      ) : null}
      <ul className="space-y-3">
        {messages?.map((message) => (
          <li key={message.id}>
            <Link
              href={`/sent/${message.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span>
                <span className="block font-medium">{message.subject}</span>
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
    </div>
  );
};
