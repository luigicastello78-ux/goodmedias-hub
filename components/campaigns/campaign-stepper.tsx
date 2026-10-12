"use client";

import { useMemo } from "react";

import { buildContacts, getMappingError, getTemplateError } from "@/lib/campaign-draft";
import { toSchedulePayload } from "@/lib/schedule";
import { useCampaignStore } from "@/stores/campaign-store";

const scrollToStep = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const CampaignStepper = () => {
  const rows = useCampaignStore((state) => state.rows);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const campaignName = useCampaignStore((state) => state.campaignName);
  const subjectTemplate = useCampaignStore((state) => state.subjectTemplate);
  const bodyTemplate = useCampaignStore((state) => state.bodyTemplate);
  const schedule = useCampaignStore((state) => state.schedule);

  const steps = useMemo(() => {
    const uploaded = rows.length > 0;
    const mapped = uploaded && getMappingError(emailColumn, tokenBindings) === null;
    const composed = mapped && getTemplateError(subjectTemplate, bodyTemplate) === null;
    const scheduled =
      composed &&
      campaignName.trim().length > 0 &&
      toSchedulePayload(schedule).ok &&
      buildContacts(rows, emailColumn, tokenBindings).length > 0;

    return [
      { id: "upload", label: "Upload", complete: uploaded },
      { id: "preview", label: "Preview", complete: uploaded },
      { id: "map", label: "Map", complete: mapped },
      { id: "compose", label: "Compose", complete: composed },
      { id: "schedule", label: "Schedule", complete: scheduled },
    ];
  }, [
    rows,
    emailColumn,
    tokenBindings,
    campaignName,
    subjectTemplate,
    bodyTemplate,
    schedule,
  ]);

  const currentIndex = steps.findIndex((step) => !step.complete);
  const activeIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;

  return (
    <nav aria-label="Campaign steps" className="lg:sticky lg:top-6">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => scrollToStep(step.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="font-medium">{index + 1}</span>
                <span>{step.label}</span>
                {step.complete ? <span className="ml-auto text-xs">Done</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
