"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import { BulkCompose } from "@/components/bulk-send/bulk-compose";
import { BulkDrip } from "@/components/bulk-send/bulk-drip";
import { BulkReview } from "@/components/bulk-send/bulk-review";
import { BulkUpload } from "@/components/bulk-send/bulk-upload";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { prepareBulkContacts } from "@/lib/bulk-contacts";
import { isEmail } from "@/lib/email";
import { useBulkSendStore } from "@/stores/bulk-send-store";

const StepSection = ({
  id,
  title,
  description,
  disabled = false,
  children,
}: {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
    <div className="mb-4 space-y-1">
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <fieldset disabled={disabled} className={disabled ? "min-w-0 opacity-60" : "min-w-0"}>
      {children}
    </fieldset>
  </section>
);

export const BulkSendWorkspace = () => {
  const hasHydrated = useBulkSendStore((state) => state.hasHydrated);
  const rows = useBulkSendStore((state) => state.rows);
  const emailColumn = useBulkSendStore((state) => state.emailColumn);
  const fromEmail = useBulkSendStore((state) => state.fromEmail);
  const subject = useBulkSendStore((state) => state.subject);
  const bodyText = useBulkSendStore((state) => state.bodyText);
  const bodyHtml = useBulkSendStore((state) => state.bodyHtml);
  const intervalMinutes = useBulkSendStore((state) => state.intervalMinutes);
  const pauseMin = useBulkSendStore((state) => state.pauseMin);
  const pauseMax = useBulkSendStore((state) => state.pauseMax);
  const jitterSeconds = useBulkSendStore((state) => state.jitterSeconds);
  const sendWindowEnabled = useBulkSendStore((state) => state.sendWindowEnabled);
  const startHour = useBulkSendStore((state) => state.startHour);
  const endHour = useBulkSendStore((state) => state.endHour);
  const jobName = useBulkSendStore((state) => state.jobName);

  useEffect(() => {
    void useBulkSendStore.persist.rehydrate();
  }, []);

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading bulk send draft</span>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const prepared = prepareBulkContacts(rows, emailColumn);
  const uploaded = prepared.contacts.length > 0;
  const composed =
    uploaded &&
    isEmail(fromEmail) &&
    ((subject.trim().length > 0 && (bodyText.trim().length > 0 || bodyHtml.trim().length > 0)) ||
      rows.every((row) => {
        const ownSubject = Object.entries(row).find(([key]) => key.toLowerCase() === "subject")?.[1]?.trim();
        const ownText = Object.entries(row).find(([key]) => key.replace(/[\s_\-]/g, "").toLowerCase() === "bodytext")?.[1]?.trim();
        const ownHtml = Object.entries(row).find(([key]) => key.replace(/[\s_\-]/g, "").toLowerCase() === "bodyhtml")?.[1]?.trim();
        return Boolean(ownSubject && (ownText || ownHtml));
      }));
  const dripReady =
    composed &&
    jobName.trim().length > 0 &&
    intervalMinutes > 0 &&
    intervalMinutes <= 1440 &&
    jitterSeconds >= 0 &&
    jitterSeconds <= 3600 &&
    Number.isInteger(jitterSeconds) &&
    pauseMin >= 1 &&
    pauseMax <= 600 &&
    pauseMin <= pauseMax &&
    (!sendWindowEnabled || startHour < endHour);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Upload contacts, write one template, and hand the job to n8n. n8n sends the emails one by one.
        </p>
        <Button variant="outline" asChild>
          <Link href="/bulk-send/jobs">View jobs</Link>
        </Button>
      </div>
      <StepSection id="upload" title="Upload" description="Parse the file in the browser before anything is sent.">
        <BulkUpload />
      </StepSection>
      <StepSection
        id="compose"
        title="Compose"
        description="Merge fields use the CSV columns. A fallback looks like {{firstName|there}}."
        disabled={!uploaded}
      >
        <BulkCompose />
      </StepSection>
      <StepSection
        id="drip"
        title="Drip settings"
        description="n8n waits this many minutes between emails, plus a short random pause."
        disabled={!composed}
      >
        <BulkDrip />
      </StepSection>
      <StepSection
        id="review"
        title="Review"
        description="Confirm the job. A second click reuses the same job id."
        disabled={!dripReady}
      >
        <BulkReview />
      </StepSection>
    </div>
  );
};
