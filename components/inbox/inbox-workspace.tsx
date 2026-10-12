"use client";

import { useEffect } from "react";

import { Composer } from "@/components/inbox/composer";
import { ThreadList } from "@/components/inbox/thread-list";
import { ThreadView } from "@/components/inbox/thread-view";
import { useInboxStore } from "@/stores/inbox-store";

export const InboxWorkspace = () => {
  const fetchInbox = useInboxStore((state) => state.fetchInbox);
  const fetchSenders = useInboxStore((state) => state.fetchSenders);
  const isComposing = useInboxStore((state) => state.isComposing);

  useEffect(() => {
    void fetchInbox();
    void fetchSenders();
  }, [fetchInbox, fetchSenders]);

  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label="Conversation list"
        className={`h-full w-full shrink-0 border-r border-border bg-card md:w-[360px] ${
          isComposing ? "hidden md:block" : "block"
        }`}
      >
        <ThreadList />
      </section>
      <section
        aria-label="Conversation"
        className={`flex h-full min-w-0 flex-1 flex-col ${isComposing ? "flex" : "hidden md:flex"}`}
      >
        <div className="min-h-0 flex-1">
          <ThreadView />
        </div>
        <Composer />
      </section>
    </div>
  );
};
