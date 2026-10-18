"use client";

import { useEffect, useRef, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { fieldByNormalizedName } from "@/lib/bulk-contacts";
import { parseCsvFile } from "@/lib/csv";
import { isEmail } from "@/lib/email";
import { formatTimestamp } from "@/lib/format";
import type {
  CampaignDetail,
  CampaignStatus,
  CampaignStepInput,
  CampaignSummary,
  DistributionSummary,
  EnrolledContact,
} from "@/types/campaigns";

interface PersonInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  jobTitle?: string;
}

interface EditorStep extends CampaignStepInput {
  key: string;
}

const emptyStep = (itemType: "message" | "delay" = "message"): EditorStep => ({
  key: crypto.randomUUID(),
  itemType,
  delayDays: itemType === "delay" ? 1 : 0,
  delayHours: 0,
  delayMinutes: 0,
  subject: "",
  bodyText: "",
  bodyHtml: "",
});

const clampInt = (raw: string, min: number, max: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const personLabel = (count: number): string => (count === 1 ? "1 person" : `${count} people`);

const statusVariant = (status: CampaignStatus): "default" | "secondary" | "outline" | "destructive" => {
  if (status === "active") {
    return "default";
  }
  if (status === "paused") {
    return "outline";
  }
  if (status === "completed") {
    return "secondary";
  }
  return "secondary";
};

const sequenceProblem = (name: string, senderEmail: string, steps: EditorStep[]): string | null => {
  if (name.trim().length === 0) {
    return "Give the campaign a name.";
  }
  if (!isEmail(senderEmail)) {
    return "Enter a valid from address.";
  }
  if (!steps.some((step) => step.itemType === "message")) {
    return "Add at least one email step.";
  }
  const lastMessage = steps.findLastIndex((step) => step.itemType === "message");
  if (steps.some((step, index) => step.itemType === "delay" && index > lastMessage)) {
    return "A wait needs an email after it.";
  }
  for (const step of steps) {
    if (step.itemType === "message" && (step.subject.trim().length === 0 || step.bodyText.trim().length === 0)) {
      return "Each email step needs a subject and a body.";
    }
  }
  return null;
};

export const SequenceCampaigns = () => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [enrolled, setEnrolled] = useState<EnrolledContact[]>([]);
  const [distributions, setDistributions] = useState<DistributionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [name, setName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [steps, setSteps] = useState<EditorStep[]>([emptyStep()]);
  const [audience, setAudience] = useState<"one" | "csv">("one");
  const [oneEmail, setOneEmail] = useState("");
  const [oneName, setOneName] = useState("");
  const [csvPeople, setCsvPeople] = useState<PersonInput[]>([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [executionType, setExecutionType] = useState<"immediate" | "drip">("drip");
  const [dripCount, setDripCount] = useState(10);
  const [dripMinutes, setDripMinutes] = useState(5);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const requestId = useRef(0);

  const locked = detail?.status === "completed";

  const loadList = async (): Promise<void> => {
    const data = await requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns");
    setCampaigns(data.campaigns);
  };

  const applyDetail = (campaignId: string, token: number, campaign: CampaignDetail, people: EnrolledContact[], batches: DistributionSummary[]): void => {
    if (requestId.current !== token) {
      return;
    }
    setDetail(campaign);
    setDistributions(batches);
    setEnrolled(people);
    setName(campaign.name);
    setSenderEmail(campaign.senderEmail);
    setSenderName(campaign.senderName ?? "");
    setSteps(
      campaign.steps.map((step) => ({
        key: step.id,
        id: step.id,
        itemType: step.itemType,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        delayMinutes: step.delayMinutes,
        subject: step.subject ?? "",
        bodyText: step.bodyText ?? "",
        bodyHtml: step.bodyHtml ?? "",
      })),
    );
    setDetailLoading(false);
  };

  const loadDetail = async (campaignId: string, token: number): Promise<void> => {
    const [campaignData, contactData] = await Promise.all([
      requestJson<{ ok: true; campaign: CampaignDetail; distributions: DistributionSummary[] }>(`/api/campaigns/${campaignId}`),
      requestJson<{ ok: true; contacts: EnrolledContact[] }>(`/api/campaigns/${campaignId}/contacts`),
    ]);
    applyDetail(campaignId, token, campaignData.campaign, contactData.contacts, campaignData.distributions);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns");
        if (!cancelled) {
          setCampaigns(data.campaigns);
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

  const clearAudience = (): void => {
    setOneEmail("");
    setOneName("");
    setCsvPeople([]);
    setCsvSkipped(0);
    setCsvInputKey((current) => current + 1);
  };

  const handleSelect = (campaignId: string): void => {
    const token = requestId.current + 1;
    requestId.current = token;
    setSelectedId(campaignId);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    setConfirmArchive(false);
    clearAudience();
    void loadDetail(campaignId, token).catch((loadError: unknown) => {
      if (requestId.current === token) {
        setDetailLoading(false);
        setError(getErrorMessage(loadError));
      }
    });
  };

  const handleNew = (): void => {
    requestId.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailLoading(false);
    setEnrolled([]);
    setDistributions([]);
    setName("");
    setSenderEmail("");
    setSenderName("");
    setSteps([emptyStep()]);
    setNotice(null);
    setError(null);
    setConfirmArchive(false);
    clearAudience();
  };

  const handleStepChange = (key: string, patch: Partial<EditorStep>): void => {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  };

  const handleAddStep = (itemType: "message" | "delay"): void => {
    setSteps((current) => [...current, emptyStep(itemType)]);
  };

  const handleRemoveStep = (key: string): void => {
    setSteps((current) => (current.length === 1 ? current : current.filter((step) => step.key !== key)));
  };

  const handleMoveStep = (index: number, direction: -1 | 1): void => {
    setSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleCsv = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    const parsed = await parseCsvFile(file);
    if (!parsed.ok) {
      setCsvPeople([]);
      setError(parsed.message);
      return;
    }
    const people: PersonInput[] = [];
    let skipped = 0;
    for (const row of parsed.rows) {
      const email = fieldByNormalizedName(row, "email").toLowerCase();
      if (!isEmail(email)) {
        skipped += 1;
        continue;
      }
      people.push({
        email,
        firstName: fieldByNormalizedName(row, "firstName"),
        lastName: fieldByNormalizedName(row, "lastName"),
        company: fieldByNormalizedName(row, "company"),
        phone: fieldByNormalizedName(row, "phone"),
        jobTitle: fieldByNormalizedName(row, "jobTitle"),
      });
    }
    setCsvPeople(people);
    setCsvSkipped(skipped);
    setError(people.length === 0 ? "The CSV has no valid email addresses." : null);
  };

  const payloadSteps = (): CampaignStepInput[] =>
    steps.map((step) => ({
      id: step.id,
      itemType: step.itemType,
      delayDays: clampInt(String(step.delayDays), 0, 365),
      delayHours: clampInt(String(step.delayHours), 0, 23),
      delayMinutes: clampInt(String(step.delayMinutes), 0, 59),
      subject: step.subject,
      bodyText: step.bodyText,
      bodyHtml: step.bodyHtml,
    }));

  const saveCurrent = async (): Promise<string> => {
    const payload = {
      name: name.trim(),
      description: "",
      senderEmail: senderEmail.trim(),
      senderName: senderName.trim(),
      mergeTagFallbacks: detail?.mergeTagFallbacks ?? {},
      steps: payloadSteps(),
    };
    const saved = selectedId
      ? await requestJson<{ ok: true; campaign: CampaignDetail }>(`/api/campaigns/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, id: selectedId }),
        })
      : await requestJson<{ ok: true; campaign: CampaignDetail }>("/api/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    return saved.campaign.id;
  };

  const audienceProblem = (): string | null => {
    if (audience === "one") {
      if (oneEmail.trim().length === 0) {
        return "Enter an email address to add.";
      }
      if (!isEmail(oneEmail)) {
        return "That recipient address is not valid.";
      }
      return null;
    }
    if (csvPeople.length === 0) {
      return "Upload a CSV with at least one valid email address.";
    }
    if (executionType === "drip" && (dripCount < 1 || dripMinutes < 1)) {
      return "Drip size and interval must be at least 1.";
    }
    return null;
  };

  const enrollAudience = async (campaignId: string, sending: boolean): Promise<string> => {
    if (audience === "one") {
      const [firstName, ...rest] = oneName.trim().split(/\s+/);
      const result = await requestJson<{ ok: true; enrolled: number; skipped: number }>(`/api/campaigns/${campaignId}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          people: [{ email: oneEmail.trim(), firstName: firstName || null, lastName: rest.join(" ") || null }],
        }),
      });
      if (result.skipped > 0 && result.enrolled === 0) {
        return "That address is already in this campaign or is suppressed.";
      }
      return sending
        ? "The address was added. Due mail was posted to the n8n webhook."
        : "The address was added. Sending starts when you resume.";
    }
    const distribution = await requestJson<{ ok: true; distribution: DistributionSummary }>(`/api/campaigns/${campaignId}/enroll`, {
      method: "POST",
      body: JSON.stringify({
        distribution: {
          name: name.trim() || "Distribution",
          executionType,
          contacts: csvPeople,
          dripContactsPerBatch: clampInt(String(dripCount), 1, 500),
          dripIntervalMinutes: clampInt(String(dripMinutes), 1, 1440),
          sendWindowEnabled: windowEnabled,
          sendWindowDays: [1, 2, 3, 4, 5],
          sendWindowStartHour: 9,
          sendWindowEndHour: 17,
          sendWindowTimezone: "Europe/Skopje",
        },
      }),
    });
    const batch = distribution.distribution;
    if (batch.executionType === "drip" && batch.processedContacts < batch.totalContacts) {
      return `Released ${batch.processedContacts} of ${batch.totalContacts}. The rest follow the drip schedule.`;
    }
    return `Released ${batch.processedContacts} of ${batch.totalContacts}.`;
  };

  const refresh = async (campaignId: string): Promise<void> => {
    const token = requestId.current;
    setSelectedId(campaignId);
    await loadList();
    await loadDetail(campaignId, token);
  };

  const handleSave = async (): Promise<void> => {
    const problem = sequenceProblem(name, senderEmail, steps);
    if (problem) {
      setError(problem);
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const campaignId = await saveCurrent();
      await refresh(campaignId);
      setNotice("Campaign saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (): Promise<void> => {
    const problem = sequenceProblem(name, senderEmail, steps);
    if (problem) {
      setError(problem);
      setNotice(null);
      return;
    }
    const adding = audience === "csv" || oneEmail.trim().length > 0;
    if (adding) {
      const audienceError = audienceProblem();
      if (audienceError) {
        setError(audienceError);
        setNotice(null);
        return;
      }
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const campaignId = await saveCurrent();
      await requestJson(`/api/campaigns/${campaignId}/activate`, { method: "POST" });
      const message = adding ? await enrollAudience(campaignId, true) : "Campaign is active. Add a person when you are ready to send.";
      clearAudience();
      await refresh(campaignId);
      setNotice(message);
    } catch (startError) {
      setError(getErrorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  const handleAddPeople = async (): Promise<void> => {
    if (!selectedId) {
      return;
    }
    const audienceError = audienceProblem();
    if (audienceError) {
      setError(audienceError);
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await enrollAudience(selectedId, detail?.status === "active");
      clearAudience();
      await refresh(selectedId);
      setNotice(message);
    } catch (addError) {
      setError(getErrorMessage(addError));
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (action: "pause" | "resume" | "process"): Promise<void> => {
    if (!selectedId) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<{ ok: true; processed?: number; released?: number }>(`/api/campaigns/${selectedId}/${action}`, { method: "POST" });
      await refresh(selectedId);
      if (action === "process") {
        const posted = result.processed ?? 0;
        const released = result.released ?? 0;
        if (posted === 0 && released === 0) {
          setNotice("Nothing is due yet.");
        } else {
          const parts = [
            posted > 0 ? `Posted ${posted} due email${posted === 1 ? "" : "s"} to n8n.` : "",
            released > 0 ? `Released ${released} drip contact${released === 1 ? "" : "s"}.` : "",
          ].filter((part) => part.length > 0);
          setNotice(parts.join(" "));
        }
      }
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setBusy(false);
    }
  };

  const handleDistribution = async (id: string, action: "pause" | "resume"): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/distribution/${id}/${action}`, { method: "POST" });
      if (selectedId) {
        await refresh(selectedId);
      }
    } catch (distributionError) {
      setError(getErrorMessage(distributionError));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (): Promise<void> => {
    if (!selectedId) {
      return;
    }
    setBusy(true);
    try {
      await requestJson(`/api/campaigns/${selectedId}`, { method: "DELETE" });
      handleNew();
      await loadList();
      setNotice("Campaign archived.");
    } catch (archiveError) {
      setError(getErrorMessage(archiveError));
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  if (!campaigns) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading campaigns</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[280px_1fr] md:p-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Campaigns</h2>
          <Button type="button" size="sm" onClick={handleNew}>
            New
          </Button>
        </div>
        {campaigns.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            No campaigns yet. Create a sequence, then add one address or a CSV.
          </p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((campaign) => {
              const selected = selectedId === campaign.id;
              return (
                <li key={campaign.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(campaign.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left ring-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                      selected ? "bg-muted ring-primary" : "bg-card ring-foreground/10"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{campaign.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {personLabel(campaign.enrolledCount)} · {campaign.sentCount} sent
                      </span>
                    </span>
                    <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-5" aria-busy={detailLoading}>
        <div aria-live="polite" className="space-y-3">
          {error ? <StatusAlert variant="destructive" title="Could not update the campaign" message={error} /> : null}
          {notice ? <StatusAlert title="Campaign updated" message={notice} /> : null}
        </div>

        <div className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{selectedId ? name || "Campaign" : "New campaign"}</h2>
            <p className="text-sm text-muted-foreground">
              One email step sends once. Add a wait, then another email, for a follow-up. Tags like [first_name|there] are filled in before n8n sends.
            </p>
          </div>

          {detailLoading ? <Skeleton className="h-24 w-full" /> : null}

          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={locked || busy}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-email">From email</Label>
              <Input id="sender-email" type="email" autoComplete="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-name">From name</Label>
              <Input id="sender-name" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
            </div>
          </fieldset>

          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.key} className="space-y-3 rounded-lg bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{step.itemType === "delay" ? "Wait" : `Email ${steps.slice(0, index + 1).filter((item) => item.itemType === "message").length}`}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={locked || index === 0} onClick={() => handleMoveStep(index, -1)}>
                      Up
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={locked || index === steps.length - 1} onClick={() => handleMoveStep(index, 1)}>
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={locked || steps.length === 1} onClick={() => handleRemoveStep(step.key)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {step.itemType === "delay" ? (
                  <div className="grid grid-cols-3 gap-2">
                    {(["delayDays", "delayHours", "delayMinutes"] as const).map((field) => (
                      <div key={field} className="space-y-1">
                        <Label htmlFor={`${field}-${step.key}`}>{field === "delayDays" ? "Days" : field === "delayHours" ? "Hours" : "Minutes"}</Label>
                        <Input
                          id={`${field}-${step.key}`}
                          type="number"
                          min={0}
                          max={field === "delayDays" ? 365 : field === "delayHours" ? 23 : 59}
                          disabled={locked}
                          value={step[field]}
                          onChange={(event) =>
                            handleStepChange(step.key, {
                              [field]: clampInt(event.target.value, 0, field === "delayDays" ? 365 : field === "delayHours" ? 23 : 59),
                            })
                          }
                        />
                      </div>
                    ))}
                    {step.delayDays + step.delayHours + step.delayMinutes === 0 ? (
                      <p className="col-span-3 text-xs text-muted-foreground">A wait of 0 sends the next email immediately.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor={`subject-${step.key}`}>Subject</Label>
                      <Input
                        id={`subject-${step.key}`}
                        value={step.subject}
                        disabled={locked}
                        placeholder="Hi [first_name|there]"
                        onChange={(event) => handleStepChange(step.key, { subject: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`body-${step.key}`}>Body</Label>
                      <Textarea
                        id={`body-${step.key}`}
                        value={step.bodyText}
                        disabled={locked}
                        onChange={(event) => handleStepChange(step.key, { bodyText: event.target.value })}
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {locked ? null : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => handleAddStep("message")}>
                Add email
              </Button>
              <Button type="button" variant="outline" onClick={() => handleAddStep("delay")}>
                Add wait
              </Button>
            </div>
          )}

          {locked ? (
            <p className="text-sm text-muted-foreground">This campaign is finished. The sequence can no longer be changed.</p>
          ) : (
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">{detail?.status === "active" || detail?.status === "paused" ? "Add people" : "Audience"}</legend>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={audience === "one" ? "default" : "outline"} onClick={() => setAudience("one")}>
                  One email
                </Button>
                <Button type="button" size="sm" variant={audience === "csv" ? "default" : "outline"} onClick={() => setAudience("csv")}>
                  CSV upload
                </Button>
              </div>
              {audience === "one" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="one-email">Email</Label>
                    <Input id="one-email" type="email" value={oneEmail} onChange={(event) => setOneEmail(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="one-name">Name</Label>
                    <Input id="one-name" value={oneName} onChange={(event) => setOneName(event.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="csv-file">CSV file</Label>
                    <Input
                      key={csvInputKey}
                      id="csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void handleCsv(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Use a header row. Email is required. First name, last name, company, phone, and job title are optional.</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {csvPeople.length === 0 ? "No file loaded." : `${csvPeople.length} valid addresses${csvSkipped > 0 ? `, ${csvSkipped} skipped` : ""}.`}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={executionType === "immediate" ? "default" : "outline"} onClick={() => setExecutionType("immediate")}>
                      Send all now
                    </Button>
                    <Button type="button" size="sm" variant={executionType === "drip" ? "default" : "outline"} onClick={() => setExecutionType("drip")}>
                      Drip
                    </Button>
                  </div>
                  {executionType === "drip" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="drip-count">Contacts each release</Label>
                        <Input id="drip-count" type="number" min={1} value={dripCount} onChange={(event) => setDripCount(clampInt(event.target.value, 1, 500))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="drip-minutes">Minutes between releases</Label>
                        <Input id="drip-minutes" type="number" min={1} value={dripMinutes} onChange={(event) => setDripMinutes(clampInt(event.target.value, 1, 1440))} />
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <Checkbox id="send-window" checked={windowEnabled} onCheckedChange={(checked) => setWindowEnabled(checked === true)} />
                        <Label htmlFor="send-window">Only weekdays, 9:00–17:00 Europe/Skopje</Label>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            {locked ? null : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleSave()}>
                {selectedId ? "Save changes" : "Save draft"}
              </Button>
            )}
            {detail?.status === "draft" || !selectedId ? (
              <Button type="button" disabled={busy} onClick={() => void handleActivate()}>
                Activate
              </Button>
            ) : null}
            {detail?.status === "active" || detail?.status === "paused" ? (
              <Button type="button" disabled={busy} onClick={() => void handleAddPeople()}>
                Add people
              </Button>
            ) : null}
            {detail?.status === "active" ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleStatus("pause")}>
                Pause
              </Button>
            ) : null}
            {detail?.status === "paused" ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleStatus("resume")}>
                Resume
              </Button>
            ) : null}
            {detail?.status === "active" ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleStatus("process")}>
                Process due now
              </Button>
            ) : null}
            {selectedId && !confirmArchive ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            ) : null}
            {confirmArchive ? (
              <>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleArchive()}>
                  Confirm archive
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmArchive(false)}>
                  Cancel
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {detail ? (
          <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">People in this campaign</h3>
              {detail.nextSendAt ? <p className="text-sm text-muted-foreground">Next send {formatTimestamp(detail.nextSendAt)}</p> : null}
            </div>
            {enrolled.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is enrolled yet.</p> : null}
            <ul className="space-y-2">
              {enrolled.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{person.name}</span>
                    <span className="text-xs text-muted-foreground">{person.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {person.status}
                    {person.nextSendAt ? ` · next ${formatTimestamp(person.nextSendAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {distributions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Distribution</h3>
                <ul className="space-y-2">
                  {distributions.map((batch) => (
                    <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span>
                        {batch.processedContacts} of {batch.totalContacts} · {batch.executionType} · {batch.status}
                      </span>
                      {batch.status === "pending" || batch.status === "processing" ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleDistribution(batch.id, "pause")}>
                          Pause drip
                        </Button>
                      ) : null}
                      {batch.status === "paused" ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleDistribution(batch.id, "resume")}>
                          Resume drip
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};
