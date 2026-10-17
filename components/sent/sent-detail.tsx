"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { ContactActivity, OutboundMessage } from "@/types/email-ledger";

export const SentDetail = ({ messageId }: { messageId: string }) => {
  const [message, setMessage] = useState<OutboundMessage | null>(null);
  const [activity, setActivity] = useState<ContactActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; message: OutboundMessage; activity: ContactActivity[] }>(
          `/api/n8n/sent/${messageId}`,
        );
        if (!cancelled) {
          setMessage(data.message);
          setActivity(data.activity);
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
  }, [messageId]);

  if (!message && !error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading sent message</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-8">
      <Button variant="outline" size="sm" asChild>
        <Link href="/sent">All sent mail</Link>
      </Button>
      {error ? <StatusAlert variant="destructive" title="Message could not be loaded" message={error} /> : null}
      {message ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{message.subject}</h2>
            <Badge variant={message.status === "failed" ? "destructive" : "secondary"}>{message.status}</Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">To</dt>
              <dd>{message.toName ? `${message.toName} <${message.toEmail}>` : message.toEmail}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">From</dt>
              <dd>{message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{message.sentAt ? formatTimestamp(message.sentAt) : "Not confirmed"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Provider id</dt>
              <dd className="break-all">{message.providerMessageId ?? "—"}</dd>
            </div>
          </dl>
          {message.error ? <StatusAlert variant="destructive" title="Send failed" message={message.error} /> : null}
          <pre className="whitespace-pre-wrap rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">{message.bodyText}</pre>
          {activity.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Other mail to this address</h3>
              <ul className="space-y-2 text-sm">
                {activity.map((item) => (
                  <li key={`${item.source}-${item.id}`} className="text-muted-foreground">
                    {item.source}: {item.label} · {item.status} · {item.at ? formatTimestamp(item.at) : "—"}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
