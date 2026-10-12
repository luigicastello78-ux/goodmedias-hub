"use client";

import { Inbox } from "lucide-react";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName, formatTimestamp } from "@/lib/format";
import { useInboxStore } from "@/stores/inbox-store";

export const ThreadList = () => {
  const threads = useInboxStore((state) => state.threads);
  const listStatus = useInboxStore((state) => state.listStatus);
  const listError = useInboxStore((state) => state.listError);
  const selectedThreadId = useInboxStore((state) => state.selectedThreadId);
  const nextCursor = useInboxStore((state) => state.nextCursor);
  const filter = useInboxStore((state) => state.filter);
  const setFilter = useInboxStore((state) => state.setFilter);
  const fetchInbox = useInboxStore((state) => state.fetchInbox);
  const loadMore = useInboxStore((state) => state.loadMore);
  const loadThread = useInboxStore((state) => state.loadThread);
  const startNewMessage = useInboxStore((state) => state.startNewMessage);

  const needle = filter.trim().toLowerCase();
  const visibleThreads = threads.filter((thread) => {
    if (!needle) {
      return true;
    }
    const haystack = `${thread.subject} ${thread.snippet} ${thread.from.email} ${thread.from.name ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <Button type="button" size="sm" onClick={startNewMessage}>
            New message
          </Button>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inbox-filter" className="text-xs font-medium text-muted-foreground">
            Filter loaded conversations
          </label>
          <Input
            id="inbox-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Name, email, or subject"
          />
        </div>
      </div>

      {listStatus === "error" && listError ? (
        <div className="p-4">
          <StatusAlert
            variant="destructive"
            title="Inbox unavailable"
            message={listError}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => void fetchInbox()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {listStatus === "loading" && threads.length === 0 ? (
          <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading conversations</span>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : null}

        {listStatus !== "loading" && visibleThreads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox />
            </span>
            <p className="text-sm text-muted-foreground">
              {threads.length === 0
                ? "No conversations yet. When n8n syncs mail, it will show up here."
                : "No loaded conversations match that filter."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleThreads.map((thread) => {
              const selected = thread.id === selectedThreadId;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => void loadThread(thread.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 ${
                      selected ? "bg-muted" : "bg-card"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {displayName(thread.from.name, thread.from.email)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTimestamp(thread.receivedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm">{thread.subject}</span>
                      {thread.unread ? <Badge>New</Badge> : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{thread.snippet}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      {nextCursor ? (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={listStatus === "loading"}
            onClick={() => void loadMore()}
          >
            {listStatus === "loading" ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
