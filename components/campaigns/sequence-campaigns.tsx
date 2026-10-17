"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { fieldByNormalizedName } from "@/lib/bulk-contacts";
import { parseCsvFile } from "@/lib/csv";
import { isEmail } from "@/lib/email";
import { formatTimestamp } from "@/lib/format";
import type { CampaignDetail, CampaignStatus, CampaignStepInput, CampaignSummary, DistributionSummary, EnrolledContact } from "@/types/campaigns";

interface PersonInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  jobTitle?: string;
}

const emptyStep = (): CampaignStepInput => ({
  itemType: "message",
  delayDays: 0,
  delayHours: 0,
  delayMinutes: 0,
  subject: "",
  bodyText: "",
  bodyHtml: "",
});

const statusVariant = (status: CampaignStatus): "default" | "secondary" | "destructive" => {
  if (status === "active") {
    return "default";
  }
  if (status === "paused") {
    return "destructive";
  }
  return "secondary";
};

export const SequenceCampaigns = () => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [enrolled, setEnrolled] = useState<EnrolledContact[]>([]);
  const [distributions, setDistributions] = useState<DistributionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [steps, setSteps] = useState<CampaignStepInput[]>([emptyStep()]);
  const [audience, setAudience] = useState<"one" | "csv">("one");
  const [oneEmail, setOneEmail] = useState("");
  const [oneName, setOneName] = useState("");
  const [csvPeople, setCsvPeople] = useState<PersonInput[]>([]);
  const [executionType, setExecutionType] = useState<"immediate" | "drip">("drip");
  const [dripCount, setDripCount] = useState(10);
  const [dripMinutes, setDripMinutes] = useState(5);
  const [windowEnabled, setWindowEnabled] = useState(false);

  const loadList = async (): Promise<void> => {
    const data = await requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns");
    setCampaigns(data.campaigns);
  };

  const loadDetail = async (campaignId: string): Promise<void> => {
    const [campaignData, contactData] = await Promise.all([
      requestJson<{ ok: true; campaign: CampaignDetail; distributions: DistributionSummary[] }>(`/api/campaigns/${campaignId}`),
      requestJson<{ ok: true; contacts: EnrolledContact[] }>(`/api/campaigns/${campaignId}/contacts`),
    ]);
    setDetail(campaignData.campaign);
    setDistributions(campaignData.distributions);
    setEnrolled(contactData.contacts);
    setName(campaignData.campaign.name);
    setSenderEmail(campaignData.campaign.senderEmail);
    setSenderName(campaignData.campaign.senderName ?? "");
    setSteps(
      campaignData.campaign.steps.map((step) => ({
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

  const handleSelect = (campaignId: string): void => {
    setSelectedId(campaignId);
    setError(null);
    void loadDetail(campaignId).catch((loadError: unknown) => setError(getErrorMessage(loadError)));
  };

  const handleNew = (): void => {
    setSelectedId(null);
    setDetail(null);
    setEnrolled([]);
    setDistributions([]);
    setName("");
    setSenderEmail("");
    setSenderName("");
    setSteps([emptyStep()]);
    setCsvPeople([]);
    setOneEmail("");
    setNotice(null);
    setError(null);
  };

  const handleAddStep = (itemType: "message" | "delay"): void => {
    setSteps((current) => [
      ...current,
      itemType === "delay"
        ? { ...emptyStep(), itemType: "delay", delayDays: 1, subject: "", bodyText: "" }
        : emptyStep(),
    ]);
  };

  const handleRemoveStep = (index: number): void => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
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
      setError(parsed.message);
      return;
    }
    const people: PersonInput[] = [];
    for (const row of parsed.rows) {
      const email = fieldByNormalizedName(row, "email").toLowerCase();
      if (!isEmail(email)) {
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
    setError(people.length === 0 ? "The CSV has no valid email addresses." : null);
  };

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name,
        description: "",
        senderEmail,
        senderName,
        mergeTagFallbacks: {},
        steps,
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
      const campaignId = saved.campaign.id;
      setSelectedId(campaignId);
      await loadList();
      await loadDetail(campaignId);
      setNotice("Campaign saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = { name, description: "", senderEmail, senderName, mergeTagFallbacks: {}, steps };
      const saved = selectedId
        ? await requestJson<{ ok: true; campaign: CampaignDetail }>(`/api/campaigns/${selectedId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...payload, id: selectedId }),
          })
        : await requestJson<{ ok: true; campaign: CampaignDetail }>("/api/campaigns", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      const campaignId = saved.campaign.id;
      await requestJson(`/api/campaigns/${campaignId}/activate`, { method: "POST" });
      if (audience === "one" && isEmail(oneEmail)) {
        const [firstName, ...rest] = oneName.trim().split(/\s+/);
        await requestJson(`/api/campaigns/${campaignId}/enroll`, {
          method: "POST",
          body: JSON.stringify({ people: [{ email: oneEmail, firstName, lastName: rest.join(" ") }] }),
        });
      }
      if (audience === "csv" && csvPeople.length > 0) {
        await requestJson(`/api/campaigns/${campaignId}/enroll`, {
          method: "POST",
          body: JSON.stringify({
            distribution: {
              name,
              executionType,
              contacts: csvPeople,
              dripContactsPerBatch: dripCount,
              dripIntervalMinutes: dripMinutes,
              sendWindowEnabled: windowEnabled,
              sendWindowDays: [1, 2, 3, 4, 5],
              sendWindowStartHour: 9,
              sendWindowEndHour: 17,
              sendWindowTimezone: "Europe/Skopje",
            },
          }),
        });
      }
      setSelectedId(campaignId);
      await loadList();
      await loadDetail(campaignId);
      setNotice("Campaign is active. Due emails were posted to the n8n webhook.");
    } catch (startError) {
      setError(getErrorMessage(startError));
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
    try {
      await requestJson(`/api/campaigns/${selectedId}/${action}`, { method: "POST" });
      await loadList();
      await loadDetail(selectedId);
    } catch (statusError) {
      setError(getErrorMessage(statusError));
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
    } catch (archiveError) {
      setError(getErrorMessage(archiveError));
    } finally {
      setBusy(false);
    }
  };

  if (!campaigns) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading campaigns</span>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
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
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">No campaigns yet.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(campaign.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-card p-3 text-left ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-current={selectedId === campaign.id ? "true" : undefined}
                >
                  <span>
                    <span className="block text-sm font-medium">{campaign.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {campaign.enrolledCount} people · {campaign.sentCount} sent
                    </span>
                  </span>
                  <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-5">
        {error ? <StatusAlert variant="destructive" title="Campaigns" message={error} /> : null}
        {notice ? <StatusAlert title="Campaigns" message={notice} /> : null}
        <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="text-base font-semibold">{selectedId ? "Edit sequence" : "New sequence"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-email">From email</Label>
              <Input id="sender-email" type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-name">From name</Label>
              <Input id="sender-name" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
            </div>
          </div>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={`${step.itemType}-${index}`} className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{step.itemType === "delay" ? `Wait ${index + 1}` : `Email ${index + 1}`}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleMoveStep(index, -1)}>
                      Up
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleMoveStep(index, 1)}>
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => handleRemoveStep(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {step.itemType === "delay" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`days-${index}`}>Days</Label>
                      <Input
                        id={`days-${index}`}
                        type="number"
                        min={0}
                        value={step.delayDays}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, delayDays: Number(event.target.value) } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`hours-${index}`}>Hours</Label>
                      <Input
                        id={`hours-${index}`}
                        type="number"
                        min={0}
                        value={step.delayHours}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, delayHours: Number(event.target.value) } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`minutes-${index}`}>Minutes</Label>
                      <Input
                        id={`minutes-${index}`}
                        type="number"
                        min={0}
                        value={step.delayMinutes}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, delayMinutes: Number(event.target.value) } : item,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor={`subject-${index}`}>Subject</Label>
                      <Input
                        id={`subject-${index}`}
                        value={step.subject}
                        placeholder="Hi [first_name|there]"
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, subject: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`body-${index}`}>Body</Label>
                      <Textarea
                        id={`body-${index}`}
                        value={step.bodyText}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, bodyText: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => handleAddStep("message")}>
              Add email
            </Button>
            <Button type="button" variant="outline" onClick={() => handleAddStep("delay")}>
              Add wait
            </Button>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Audience</legend>
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
                    id="csv-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void handleCsv(event.target.files?.[0])}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{csvPeople.length} valid addresses.</p>
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
                      <Input id="drip-count" type="number" min={1} value={dripCount} onChange={(event) => setDripCount(Number(event.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="drip-minutes">Minutes between releases</Label>
                      <Input id="drip-minutes" type="number" min={1} value={dripMinutes} onChange={(event) => setDripMinutes(Number(event.target.value))} />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" checked={windowEnabled} onChange={(event) => setWindowEnabled(event.target.checked)} />
                      Weekdays 9:00–17:00 Europe/Skopje
                    </label>
                  </div>
                ) : null}
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void handleSave()}>
              Save draft
            </Button>
            <Button type="button" disabled={busy} onClick={() => void handleStart()}>
              Activate
            </Button>
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
            {selectedId ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleStatus("process")}>
                Process due now
              </Button>
            ) : null}
            {selectedId ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void handleArchive()}>
                Archive
              </Button>
            ) : null}
          </div>
        </div>

        {detail ? (
          <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h3 className="text-sm font-semibold">People in this campaign</h3>
            {detail.nextSendAt ? (
              <p className="text-sm text-muted-foreground">Next send {formatTimestamp(detail.nextSendAt)}</p>
            ) : null}
            {enrolled.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is enrolled yet.</p> : null}
            <ul className="space-y-2">
              {enrolled.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {person.name} · {person.email}
                  </span>
                  <span className="text-muted-foreground">
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
                    <li key={batch.id} className="text-sm text-muted-foreground">
                      {batch.name}: {batch.processedContacts}/{batch.totalContacts} {batch.status} · {batch.executionType}
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
