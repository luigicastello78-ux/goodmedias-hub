"use client";

import { useEffect, useRef, useState } from "react";
import {
  Megaphone,
  Plus,
  Search,
  Play,
  Pause,
  Edit,
  Trash2,
  Mail,
  Clock,
  Users,
  TrendingUp,
  ArrowLeft,
  X,
  Archive,
  MoreVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { StatusAlert } from "@/components/status-alert";
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
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const personLabel = (count: number): string => (count === 1 ? "1 person" : `${count} people`);

const sequenceProblem = (name: string, senderEmail: string, steps: EditorStep[]): string | null => {
  if (name.trim().length === 0) return "Give the campaign a name.";
  if (!isEmail(senderEmail)) return "Enter a valid from address.";
  if (!steps.some((step) => step.itemType === "message")) return "Add at least one email step.";
  const lastMessage = steps.findLastIndex((step) => step.itemType === "message");
  if (steps.some((step, index) => step.itemType === "delay" && index > lastMessage)) return "A wait needs an email after it.";
  for (const step of steps) {
    if (step.itemType === "message" && (step.subject.trim().length === 0 || step.bodyText.trim().length === 0))
      return "Each email step needs a subject and a body.";
  }
  return null;
};

const getStatusBadge = (status: CampaignStatus) => {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-gray-100", text: "text-gray-700", label: "Draft" },
    active: { bg: "bg-green-100", text: "text-green-700", label: "Active" },
    paused: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Paused" },
    completed: { bg: "bg-blue-100", text: "text-blue-700", label: "Completed" },
  };
  const badge = badges[status] ?? badges.draft;
  return <span className={`px-3 py-1 rounded-full text-[12px] font-semibold ${badge.bg} ${badge.text}`}>{badge.label}</span>;
};

export const SequenceCampaigns = () => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | CampaignStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Editor state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
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

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (openMenuId) {
        const el = menuRefs.current[openMenuId];
        if (el && !el.contains(event.target as Node)) setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  const loadList = async (): Promise<void> => {
    const data = await requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns");
    setCampaigns(data.campaigns);
  };

  const applyDetail = (
    campaignId: string,
    token: number,
    campaign: CampaignDetail,
    people: EnrolledContact[],
    batches: DistributionSummary[],
  ): void => {
    if (requestId.current !== token) return;
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
    setShowEditor(true);
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
    setShowEditor(true);
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

  const handleBackToList = (): void => {
    setShowEditor(false);
    setSelectedId(null);
    setDetail(null);
    setError(null);
    setNotice(null);
    void loadList();
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
      if (target < 0 || target >= next.length) return current;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleCsv = async (file: File | undefined): Promise<void> => {
    if (!file) return;
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
      if (oneEmail.trim().length === 0) return "Enter an email address to add.";
      if (!isEmail(oneEmail)) return "That recipient address is not valid.";
      return null;
    }
    if (csvPeople.length === 0) return "Upload a CSV with at least one valid email address.";
    if (executionType === "drip" && (dripCount < 1 || dripMinutes < 1)) return "Drip size and interval must be at least 1.";
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
      if (result.skipped > 0 && result.enrolled === 0) return "That address is already in this campaign or is suppressed.";
      return sending ? "The address was added. Due mail was posted to the n8n webhook." : "The address was added. Sending starts when you resume.";
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
    if (batch.executionType === "drip" && batch.processedContacts < batch.totalContacts)
      return `Released ${batch.processedContacts} of ${batch.totalContacts}. The rest follow the drip schedule.`;
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
    if (problem) { setError(problem); setNotice(null); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const campaignId = await saveCurrent();
      await refresh(campaignId);
      setNotice("Campaign saved.");
    } catch (saveError) { setError(getErrorMessage(saveError)); } finally { setBusy(false); }
  };

  const handleActivate = async (): Promise<void> => {
    const problem = sequenceProblem(name, senderEmail, steps);
    if (problem) { setError(problem); setNotice(null); return; }
    const adding = audience === "csv" || oneEmail.trim().length > 0;
    if (adding) { const audienceError = audienceProblem(); if (audienceError) { setError(audienceError); setNotice(null); return; } }
    setBusy(true); setError(null); setNotice(null);
    try {
      const campaignId = await saveCurrent();
      await requestJson(`/api/campaigns/${campaignId}/activate`, { method: "POST" });
      const message = adding ? await enrollAudience(campaignId, true) : "Campaign is active. Add a person when you are ready to send.";
      clearAudience();
      await refresh(campaignId);
      setNotice(message);
    } catch (startError) { setError(getErrorMessage(startError)); } finally { setBusy(false); }
  };

  const handleAddPeople = async (): Promise<void> => {
    if (!selectedId) return;
    const audienceError = audienceProblem();
    if (audienceError) { setError(audienceError); setNotice(null); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const message = await enrollAudience(selectedId, detail?.status === "active");
      clearAudience();
      await refresh(selectedId);
      setNotice(message);
    } catch (addError) { setError(getErrorMessage(addError)); } finally { setBusy(false); }
  };

  const handleStatus = async (action: "pause" | "resume" | "process"): Promise<void> => {
    if (!selectedId) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await requestJson<{ ok: true; processed?: number; released?: number }>(`/api/campaigns/${selectedId}/${action}`, { method: "POST" });
      await refresh(selectedId);
      if (action === "process") {
        const posted = result.processed ?? 0;
        const released = result.released ?? 0;
        if (posted === 0 && released === 0) setNotice("Nothing is due yet.");
        else {
          const parts = [
            posted > 0 ? `Posted ${posted} due email${posted === 1 ? "" : "s"} to n8n.` : "",
            released > 0 ? `Released ${released} drip contact${released === 1 ? "" : "s"}.` : "",
          ].filter(Boolean);
          setNotice(parts.join(" "));
        }
      }
    } catch (statusError) { setError(getErrorMessage(statusError)); } finally { setBusy(false); }
  };

  const handleDistribution = async (id: string, action: "pause" | "resume"): Promise<void> => {
    setBusy(true); setError(null);
    try {
      await requestJson(`/api/distribution/${id}/${action}`, { method: "POST" });
      if (selectedId) await refresh(selectedId);
    } catch (distributionError) { setError(getErrorMessage(distributionError)); } finally { setBusy(false); }
  };

  const handleArchive = async (): Promise<void> => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await requestJson(`/api/campaigns/${selectedId}`, { method: "DELETE" });
      handleBackToList();
    } catch (archiveError) { setError(getErrorMessage(archiveError)); } finally { setBusy(false); setConfirmArchive(false); }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleSelectAll = () => {
    const visibleIds = filteredCampaigns.map((c) => c.id);
    if (selectedIds.size === visibleIds.length && visibleIds.every((id) => selectedIds.has(id))) setSelectedIds(new Set());
    else setSelectedIds(new Set(visibleIds));
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} campaign(s)?`)) return;
    for (const id of selectedIds) {
      try { await requestJson(`/api/campaigns/${id}`, { method: "DELETE" }); } catch { /* skip */ }
    }
    setSelectedIds(new Set());
    void loadList();
  };

  const filteredCampaigns = (campaigns ?? []).filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || campaign.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Loading state
  if (!campaigns) {
    return (
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // Editor view
  if (showEditor) {
    return (
      <div className="space-y-6 p-4 md:p-8 max-w-[1000px] mx-auto">
        <button onClick={handleBackToList} className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Back to Campaigns
        </button>

        <div aria-live="polite" className="space-y-3">
          {error ? <StatusAlert variant="destructive" title="Could not update the campaign" message={error} /> : null}
          {notice ? <StatusAlert title="Campaign updated" message={notice} /> : null}
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-6">
          <div>
            <h2 className="text-[22px] font-bold text-foreground">{selectedId ? name || "Campaign" : "New Campaign"}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">
              One email step sends once. Add a wait, then another email, for a follow-up. Tags like [first_name|there] are filled in before n8n sends.
            </p>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : null}

          {/* Campaign Settings */}
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={locked || busy}>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-[14px] font-medium text-foreground">Campaign name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium text-foreground">From email</label>
              <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium text-foreground">From name</label>
              <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all" />
            </div>
          </fieldset>

          {/* Steps */}
          <div className="space-y-3">
            <h3 className="text-[15px] font-semibold text-foreground">Sequence Steps</h3>
            {steps.map((step, index) => (
              <div key={step.key} className="bg-muted/50 rounded-lg p-4 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-foreground">
                    {step.itemType === "delay" ? "Wait" : `Email ${steps.slice(0, index + 1).filter((s) => s.itemType === "message").length}`}
                  </p>
                  <div className="flex items-center gap-1">
                    <button disabled={locked || index === 0} onClick={() => handleMoveStep(index, -1)}
                      className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded transition-colors"><ChevronUp size={16} /></button>
                    <button disabled={locked || index === steps.length - 1} onClick={() => handleMoveStep(index, 1)}
                      className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded transition-colors"><ChevronDown size={16} /></button>
                    <button disabled={locked || steps.length === 1} onClick={() => handleRemoveStep(step.key)}
                      className="p-1.5 text-red-500 hover:text-red-700 disabled:opacity-30 rounded transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
                {step.itemType === "delay" ? (
                  <div className="grid grid-cols-3 gap-3">
                    {(["delayDays", "delayHours", "delayMinutes"] as const).map((field) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[13px] text-muted-foreground">{field === "delayDays" ? "Days" : field === "delayHours" ? "Hours" : "Minutes"}</label>
                        <input type="number" min={0} max={field === "delayDays" ? 365 : field === "delayHours" ? 23 : 59}
                          disabled={locked} value={step[field]}
                          onChange={(e) => handleStepChange(step.key, { [field]: clampInt(e.target.value, 0, field === "delayDays" ? 365 : field === "delayHours" ? 23 : 59) })}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[13px] text-muted-foreground">Subject</label>
                      <input type="text" value={step.subject} disabled={locked} placeholder="Hi [first_name|there]"
                        onChange={(e) => handleStepChange(step.key, { subject: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[13px] text-muted-foreground">Body</label>
                      <textarea value={step.bodyText} disabled={locked} rows={4}
                        onChange={(e) => handleStepChange(step.key, { bodyText: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {locked ? null : (
              <div className="flex gap-2">
                <button onClick={() => handleAddStep("message")}
                  className="px-4 py-2 bg-card border border-border rounded-lg text-[13px] font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
                  <Mail size={14} /> Add Email
                </button>
                <button onClick={() => handleAddStep("delay")}
                  className="px-4 py-2 bg-card border border-border rounded-lg text-[13px] font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
                  <Clock size={14} /> Add Wait
                </button>
              </div>
            )}
          </div>

          {/* Audience */}
          {locked ? (
            <p className="text-[14px] text-muted-foreground">This campaign is finished. The sequence can no longer be changed.</p>
          ) : (
            <div className="border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-[15px] font-semibold text-foreground">
                {detail?.status === "active" || detail?.status === "paused" ? "Add People" : "Audience"}
              </h3>
              <div className="flex gap-2">
                <button onClick={() => setAudience("one")}
                  className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${audience === "one" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}>
                  One email
                </button>
                <button onClick={() => setAudience("csv")}
                  className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${audience === "csv" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}>
                  CSV upload
                </button>
              </div>
              {audience === "one" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><label className="text-[13px] text-muted-foreground">Email</label>
                    <input type="email" value={oneEmail} onChange={(e) => setOneEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                  </div>
                  <div className="space-y-1"><label className="text-[13px] text-muted-foreground">Name</label>
                    <input type="text" value={oneName} onChange={(e) => setOneName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[13px] text-muted-foreground">CSV file</label>
                    <input key={csvInputKey} type="file" accept=".csv,text/csv"
                      onChange={(e) => { const file = e.target.files?.[0]; void handleCsv(file); }}
                      className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-[14px] text-foreground" />
                    <p className="text-[12px] text-muted-foreground">Use a header row. Email is required. First name, last name, company, phone, and job title are optional.</p>
                  </div>
                  <p className="text-[14px] text-muted-foreground">
                    {csvPeople.length === 0 ? "No file loaded." : `${csvPeople.length} valid addresses${csvSkipped > 0 ? `, ${csvSkipped} skipped` : ""}.`}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setExecutionType("immediate")}
                      className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${executionType === "immediate" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}>
                      Send all now
                    </button>
                    <button onClick={() => setExecutionType("drip")}
                      className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${executionType === "drip" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"}`}>
                      Drip
                    </button>
                  </div>
                  {executionType === "drip" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1"><label className="text-[13px] text-muted-foreground">Contacts each release</label>
                        <input type="number" min={1} value={dripCount} onChange={(e) => setDripCount(clampInt(e.target.value, 1, 500))}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      </div>
                      <div className="space-y-1"><label className="text-[13px] text-muted-foreground">Minutes between releases</label>
                        <input type="number" min={1} value={dripMinutes} onChange={(e) => setDripMinutes(clampInt(e.target.value, 1, 1440))}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <input type="checkbox" checked={windowEnabled} onChange={(e) => setWindowEnabled(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                        <label className="text-[13px] text-foreground">Only weekdays, 9:00–17:00 Europe/Skopje</label>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {locked ? null : (
              <button disabled={busy} onClick={() => void handleSave()}
                className="px-5 py-2.5 bg-card border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors">
                {selectedId ? "Save Changes" : "Save Draft"}
              </button>
            )}
            {detail?.status === "draft" || !selectedId ? (
              <button disabled={busy} onClick={() => void handleActivate()}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                Activate
              </button>
            ) : null}
            {detail?.status === "active" || detail?.status === "paused" ? (
              <button disabled={busy} onClick={() => void handleAddPeople()}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                Add People
              </button>
            ) : null}
            {detail?.status === "active" ? (
              <button disabled={busy} onClick={() => void handleStatus("pause")}
                className="px-5 py-2.5 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-lg text-[14px] font-medium hover:bg-yellow-200 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                <Pause size={14} /> Pause
              </button>
            ) : null}
            {detail?.status === "paused" ? (
              <button disabled={busy} onClick={() => void handleStatus("resume")}
                className="px-5 py-2.5 bg-green-100 text-green-700 border border-green-200 rounded-lg text-[14px] font-medium hover:bg-green-200 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                <Play size={14} /> Resume
              </button>
            ) : null}
            {detail?.status === "active" ? (
              <button disabled={busy} onClick={() => void handleStatus("process")}
                className="px-5 py-2.5 bg-card border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors">
                Process Due Now
              </button>
            ) : null}
            {selectedId && !confirmArchive ? (
              <button disabled={busy} onClick={() => setConfirmArchive(true)}
                className="px-5 py-2.5 bg-red-100 text-red-700 border border-red-200 rounded-lg text-[14px] font-medium hover:bg-red-200 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                <Archive size={14} /> Archive
              </button>
            ) : null}
            {confirmArchive ? (
              <>
                <button disabled={busy} onClick={() => void handleArchive()}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-[14px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                  Confirm Archive
                </button>
                <button disabled={busy} onClick={() => setConfirmArchive(false)}
                  className="px-5 py-2.5 bg-card border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors">
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Enrolled contacts */}
        {detail ? (
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-foreground">People in this campaign</h3>
              {detail.nextSendAt ? <p className="text-[13px] text-muted-foreground">Next send {formatTimestamp(detail.nextSendAt)}</p> : null}
            </div>
            {enrolled.length === 0 ? <p className="text-[14px] text-muted-foreground">Nobody is enrolled yet.</p> : null}
            <ul className="space-y-2">
              {enrolled.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3 text-[14px]">
                  <span>
                    <span className="block font-medium text-foreground">{person.name}</span>
                    <span className="text-[13px] text-muted-foreground">{person.email}</span>
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {person.status}{person.nextSendAt ? ` · next ${formatTimestamp(person.nextSendAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {distributions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-[15px] font-semibold text-foreground">Distribution</h3>
                <ul className="space-y-2">
                  {distributions.map((batch) => (
                    <li key={batch.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3 text-[14px]">
                      <span className="text-foreground">{batch.processedContacts} of {batch.totalContacts} · {batch.executionType} · {batch.status}</span>
                      {batch.status === "pending" || batch.status === "processing" ? (
                        <button disabled={busy} onClick={() => void handleDistribution(batch.id, "pause")}
                          className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-[13px] font-medium hover:bg-yellow-200 disabled:opacity-50 transition-colors">
                          Pause drip
                        </button>
                      ) : null}
                      {batch.status === "paused" ? (
                        <button disabled={busy} onClick={() => void handleDistribution(batch.id, "resume")}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-[13px] font-medium hover:bg-green-200 disabled:opacity-50 transition-colors">
                          Resume drip
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Campaign list view
  return (
    <div className="space-y-6 p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Megaphone className="text-muted-foreground" size={28} />
            <h1 className="text-[28px] font-bold text-foreground">Campaigns</h1>
          </div>
          <p className="text-[15px] text-muted-foreground mt-1">Create and manage email automation sequences</p>
        </div>
        <button onClick={handleNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all shadow-sm">
          <Plus size={18} /> New Campaign
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Total Campaigns</p>
              <p className="text-[28px] font-bold text-foreground mt-1">{campaigns.length}</p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Megaphone className="text-primary" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Active</p>
              <p className="text-[28px] font-bold text-green-600 mt-1">{campaigns.filter((c) => c.status === "active").length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Play className="text-green-600" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Draft</p>
              <p className="text-[28px] font-bold text-muted-foreground mt-1">{campaigns.filter((c) => c.status === "draft").length}</p>
            </div>
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
              <Edit className="text-muted-foreground" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Completed</p>
              <p className="text-[28px] font-bold text-blue-600 mt-1">{campaigns.filter((c) => c.status === "completed").length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-blue-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input type="search" placeholder="Search campaigns..." value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(new Set()); }}
              className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all" />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { value: "all" as const, label: "All" },
            { value: "active" as const, label: "Active" },
            { value: "paused" as const, label: "Inactive" },
            { value: "draft" as const, label: "Draft" },
            { value: "completed" as const, label: "Completed" },
          ]).map(({ value, label }) => (
            <button key={value} onClick={() => { setFilterStatus(value); setSelectedIds(new Set()); }}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                filterStatus === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              {label}
            </button>
          ))}
          {filterStatus !== "all" && (
            <button onClick={() => { setFilterStatus("all"); setSelectedIds(new Set()); }}
              className="px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1">
              <X size={14} /> Clear
            </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
            <span className="text-[13px] font-medium text-foreground">{selectedIds.size} selected</span>
            <div className="h-5 w-px bg-border" />
            <button onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-[13px] font-medium hover:bg-red-200 transition-colors flex items-center gap-1.5">
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              className="ml-auto px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground font-medium">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Select All */}
      {filteredCampaigns.length > 0 && (
        <div className="flex items-center gap-3 px-2">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground cursor-pointer">
            <input type="checkbox"
              checked={filteredCampaigns.length > 0 && filteredCampaigns.every((c) => selectedIds.has(c.id))}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            Select all ({filteredCampaigns.length})
          </label>
        </div>
      )}

      {/* Campaign Cards */}
      {filteredCampaigns.length === 0 ? (
        <div className="bg-card rounded-xl border-2 border-dashed border-border p-12 text-center">
          <Megaphone className="mx-auto text-muted-foreground/30 mb-4" size={48} />
          <h3 className="text-[18px] font-semibold text-foreground mb-2">
            {searchQuery || filterStatus !== "all" ? "No campaigns found" : "No campaigns yet"}
          </h3>
          <p className="text-[14px] text-muted-foreground mb-6">
            {searchQuery || filterStatus !== "all" ? "Try adjusting your search or filters" : "Create your first automated campaign to start engaging with leads"}
          </p>
          {!searchQuery && filterStatus === "all" && (
            <button onClick={handleNew}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all inline-flex items-center gap-2">
              <Plus size={18} /> Create Campaign
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns.map((campaign) => (
            <div key={campaign.id}
              className={`bg-card rounded-xl border p-5 hover:shadow-lg transition-shadow ${
                selectedIds.has(campaign.id) ? "border-primary ring-1 ring-primary/20" : "border-border"
              }`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 pt-1">
                  <input type="checkbox" checked={selectedIds.has(campaign.id)} onChange={() => handleToggleSelect(campaign.id)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[18px] font-bold text-foreground truncate">{campaign.name}</h3>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Users size={14} /><span>{personLabel(campaign.enrolledCount)}</span></div>
                    <div className="flex items-center gap-1.5"><Mail size={14} /><span>{campaign.sentCount} sent</span></div>
                    <div className="flex items-center gap-1.5"><Clock size={14} /><span>{campaign.stepCount} steps</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleSelect(campaign.id)}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-[13px] font-medium flex items-center gap-1.5">
                    <Edit size={14} /> Edit
                  </button>
                  <div className="relative" ref={(el) => { menuRefs.current[campaign.id] = el; }}>
                    <button onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                      <MoreVertical size={18} />
                    </button>
                    {openMenuId === campaign.id && (
                      <div className="absolute right-0 mt-1 w-48 bg-card rounded-lg shadow-lg border border-border py-1 z-20">
                        <button onClick={() => { setOpenMenuId(null); handleSelect(campaign.id); }}
                          className="w-full text-left px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors flex items-center gap-2">
                          <Edit size={14} /> Edit Campaign
                        </button>
                        <button onClick={async () => {
                          setOpenMenuId(null);
                          if (confirm("Archive this campaign?")) {
                            try { await requestJson(`/api/campaigns/${campaign.id}`, { method: "DELETE" }); void loadList(); } catch { /* skip */ }
                          }
                        }}
                          className="w-full text-left px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                          <Archive size={14} /> Archive Campaign
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
