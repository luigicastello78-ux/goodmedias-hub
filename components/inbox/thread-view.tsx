"use client";

import { ArrowLeft } from "lucide-react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName, formatTimestamp } from "@/lib/format";
import { useInboxStore } from "@/stores/inbox-store";

export const ThreadView = () => {
  const detail = useInboxStore((state) => state.detail);
  const detailStatus = useInboxStore((state) => state.detailStatus);
  const detailError = useInboxStore((state) => state.detailError);
  const selectedThreadId = useInboxStore((state) => state.selectedThreadId);
  const isComposing = useInboxStore((state) => state.isComposing);
  const showList = useInboxStore((state) => state.showList);
  const loadThread = useInboxStore((state) => state.loadThread);

  if (!isComposing && !selectedThreadId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Select a conversation or start a new message.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={showList}
        >
          <ArrowLeft />
          Back
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {detail?.thread.subject ?? (selectedThreadId ? "Conversation" : "New message")}
          </h2>
          {detail ? (
            <p className="truncate text-xs text-muted-foreground">
              {displayName(detail.thread.from.name, detail.thread.from.email)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        {detailStatus === "loading" ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading conversation</span>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="ml-auto h-24 w-4/5" />
          </div>
        ) : null}

        {detailStatus === "error" && detailError ? (
          <StatusAlert
            variant="destructive"
            title="Conversation unavailable"
            message={detailError}
            action={
              selectedThreadId ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void loadThread(selectedThreadId)}>
                  Retry
                </Button>
              ) : null
            }
          />
        ) : null}

        {detailStatus === "ready" && detail ? (
          <ol className="space-y-3">
            {detail.messages.map((message) => {
              const outbound = message.direction === "outbound";
              return (
                <li
                  key={message.id}
                  className={`max-w-2xl rounded-xl border border-border px-4 py-3 ${
                    outbound ? "ml-auto bg-primary/5" : "bg-card"
                  }`}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
                      {displayName(message.from.name, message.from.email)}
                    </p>
                    <time dateTime={message.sentAt} className="text-xs text-muted-foreground">
                      {formatTimestamp(message.sentAt)}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    To {message.to.map((person) => displayName(person.name, person.email)).join(", ")}
                  </p>
                  <p className="mt-3 text-sm whitespace-pre-wrap">{message.bodyText}</p>
                </li>
              );
            })}
          </ol>
        ) : null}

        {isComposing && !selectedThreadId ? (
          <p className="text-sm text-muted-foreground">
            This message is not attached to a synced thread. n8n will deliver it as a new email.
          </p>
        ) : null}
      </div>
    </div>
  );
};
