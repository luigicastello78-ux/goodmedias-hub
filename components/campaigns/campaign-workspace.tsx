"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { CampaignStepper } from "@/components/campaigns/campaign-stepper";
import { ColumnMapper } from "@/components/campaigns/column-mapper";
import { CsvPreviewTable } from "@/components/campaigns/csv-preview-table";
import { CsvUploader } from "@/components/campaigns/csv-uploader";
import { DispatchBar } from "@/components/campaigns/dispatch-bar";
import { ScheduleForm } from "@/components/campaigns/schedule-form";
import { SpintaxPreview } from "@/components/campaigns/spintax-preview";
import { TemplateEditor } from "@/components/campaigns/template-editor";
import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMappingError, getTemplateError } from "@/lib/campaign-draft";
import { useCampaignStore } from "@/stores/campaign-store";

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
}) => {
  return (
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
};

export const CampaignWorkspace = () => {
  const hasHydrated = useCampaignStore((state) => state.hasHydrated);
  const rows = useCampaignStore((state) => state.rows);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const subjectTemplate = useCampaignStore((state) => state.subjectTemplate);
  const bodyTemplate = useCampaignStore((state) => state.bodyTemplate);
  const lastResult = useCampaignStore((state) => state.lastResult);
  const dismissResult = useCampaignStore((state) => state.dismissResult);
  const uploaded = rows.length > 0;
  const mapped = uploaded && getMappingError(emailColumn, tokenBindings) === null;
  const composed = mapped && getTemplateError(subjectTemplate, bodyTemplate) === null;

  useEffect(() => {
    void useCampaignStore.persist.rehydrate();
  }, []);

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading campaign draft</span>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      {lastResult ? (
        <StatusAlert
          title="Campaign queued"
          message={`${lastResult.campaignName} is queued as ${lastResult.batchId}. ${acceptedLabel(lastResult.acceptedCount)}`}
          action={
            <div className="space-y-2">
              {lastResult.rejected.length > 0 ? (
                <ul className="list-disc pl-4 text-sm">
                  {lastResult.rejected.map((item) => (
                    <li key={`${item.index}-${item.email}`}>
                      {item.email}: {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={dismissResult}>
                Dismiss
              </Button>
            </div>
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <CampaignStepper />
        <div className="space-y-6">
          <StepSection
            id="upload"
            title="Upload"
            description="Parse the prospect file in the browser before anything is sent."
          >
            <CsvUploader />
          </StepSection>
          <StepSection
            id="preview"
            title="Preview"
            description="Review the first rows, invalid emails, and duplicates."
            disabled={!uploaded}
          >
            <CsvPreviewTable />
          </StepSection>
          <StepSection
            id="map"
            title="Map columns"
            description="Bind each column to the token n8n will replace."
            disabled={!uploaded}
          >
            <ColumnMapper />
          </StepSection>
          <StepSection
            id="compose"
            title="Compose"
            description="Write the template. Spintax stays raw in the payload so n8n can vary each send."
            disabled={!mapped}
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <TemplateEditor />
              <SpintaxPreview />
            </div>
          </StepSection>
          <StepSection
            id="schedule"
            title="Schedule and send"
            description="Pass pacing preferences to n8n. This app does not send the batch itself."
            disabled={!composed}
          >
            <div className="space-y-6">
              <ScheduleForm />
              <DispatchBar />
            </div>
          </StepSection>
        </div>
      </div>
    </div>
  );
};

const acceptedLabel = (count: number): string =>
  count === 1 ? "1 contact was accepted." : `${count} contacts were accepted.`;
