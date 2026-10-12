"use client";

import { useMemo } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { analyzeRows, buildContacts, getMappingError, getTemplateError } from "@/lib/campaign-draft";
import { toSchedulePayload } from "@/lib/schedule";
import { useCampaignStore } from "@/stores/campaign-store";

export const DispatchBar = () => {
  const rows = useCampaignStore((state) => state.rows);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const campaignName = useCampaignStore((state) => state.campaignName);
  const subjectTemplate = useCampaignStore((state) => state.subjectTemplate);
  const bodyTemplate = useCampaignStore((state) => state.bodyTemplate);
  const schedule = useCampaignStore((state) => state.schedule);
  const dispatchStatus = useCampaignStore((state) => state.dispatchStatus);
  const dispatchError = useCampaignStore((state) => state.dispatchError);
  const dispatchRetryable = useCampaignStore((state) => state.dispatchRetryable);
  const editedSinceError = useCampaignStore((state) => state.editedSinceError);
  const dispatchCampaign = useCampaignStore((state) => state.dispatchCampaign);

  const analysis = useMemo(() => analyzeRows(rows, emailColumn), [rows, emailColumn]);
  const contacts = useMemo(
    () => buildContacts(rows, emailColumn, tokenBindings),
    [rows, emailColumn, tokenBindings],
  );
  const mappingError = getMappingError(emailColumn, tokenBindings);
  const templateError = getTemplateError(subjectTemplate, bodyTemplate);
  const scheduleResult = toSchedulePayload(schedule);
  const ready =
    rows.length > 0 &&
    campaignName.trim().length > 0 &&
    !mappingError &&
    !templateError &&
    scheduleResult.ok &&
    contacts.length > 0;
  const sendBlocked = dispatchStatus === "error" && !dispatchRetryable && !editedSinceError;
  const showRetry = dispatchStatus === "error" && dispatchRetryable && !editedSinceError;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {contacts.length} {contacts.length === 1 ? "contact" : "contacts"} will be handed to n8n.
        {analysis.invalidRows.length > 0
          ? ` ${analysis.invalidRows.length} invalid ${analysis.invalidRows.length === 1 ? "email is" : "emails are"} excluded.`
          : ""}
        {analysis.duplicateRows.length > 0
          ? ` ${analysis.duplicateRows.length} ${analysis.duplicateRows.length === 1 ? "duplicate is" : "duplicates are"} excluded.`
          : ""}
      </p>
      <p className="text-sm text-muted-foreground">{senderPoolNote(scheduleResult.ok)}</p>

      {dispatchStatus === "sending" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Sending the batch to n8n…
        </p>
      ) : null}

      {dispatchStatus === "error" && dispatchError ? (
        <StatusAlert
          variant="destructive"
          title={dispatchRetryable ? "Batch may already be queued" : "Batch was not queued"}
          message={dispatchError}
          action={
            showRetry ? (
              <Button type="button" size="sm" onClick={() => void dispatchCampaign()}>
                Retry
              </Button>
            ) : null
          }
        />
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          disabled={!ready || dispatchStatus === "sending" || sendBlocked || showRetry}
          onClick={() => void dispatchCampaign()}
        >
          Queue campaign
        </Button>
      </div>
    </div>
  );
};

const senderPoolNote = (scheduleOk: boolean): string =>
  scheduleOk
    ? "n8n paces delivery, rotates senders, and returns as soon as the batch is queued."
    : "Fix the schedule before queueing.";
