"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { fieldByNormalizedName } from "@/lib/bulk-contacts";
import { parseCsvFile } from "@/lib/csv";
import { isEmail } from "@/lib/email";
import type { CampaignSummary, ContactStatus, Person } from "@/types/campaigns";

const statuses: ContactStatus[] = ["active", "inactive", "lead", "customer"];

const emptyForm = {
  email: "",
  firstName: "",
  lastName: "",
  company: "",
  phone: "",
  jobTitle: "",
  status: "active" as ContactStatus,
  source: "",
  notes: "",
};

export const ContactsWorkspace = () => {
  const [contacts, setContacts] = useState<Person[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importKey, setImportKey] = useState(0);

  const load = async (search = query): Promise<void> => {
    const [people, campaignData] = await Promise.all([
      requestJson<{ ok: true; contacts: Person[] }>(`/api/contacts?q=${encodeURIComponent(search)}`),
      requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns"),
    ]);
    setContacts(people.contacts);
    setCampaigns(campaignData.campaigns.filter((campaign) => campaign.status === "active" || campaign.status === "paused"));
    setSearched(search.trim());
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [people, campaignData] = await Promise.all([
          requestJson<{ ok: true; contacts: Person[] }>("/api/contacts?q="),
          requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns"),
        ]);
        if (!cancelled) {
          setContacts(people.contacts);
          setCampaigns(campaignData.campaigns.filter((campaign) => campaign.status === "active" || campaign.status === "paused"));
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

  const handleSearch = (): void => {
    setError(null);
    void load(query).catch((loadError: unknown) => setError(getErrorMessage(loadError)));
  };

  const handleEdit = (person: Person): void => {
    setEditingId(person.id);
    setNotice(null);
    setError(null);
    setForm({
      email: person.email,
      firstName: person.firstName ?? "",
      lastName: person.lastName ?? "",
      company: person.company ?? "",
      phone: person.phone ?? "",
      jobTitle: person.jobTitle ?? "",
      status: person.status,
      source: person.source ?? "",
      notes: person.notes ?? "",
    });
  };

  const handleCancelEdit = (): void => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async (): Promise<void> => {
    if (!isEmail(form.email)) {
      setError("Enter a valid email address.");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await requestJson(`/api/contacts/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await requestJson("/api/contacts", { method: "POST", body: JSON.stringify(form) });
      }
      setForm(emptyForm);
      setEditingId(null);
      await load(searched);
      setNotice("Contact saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    setError(null);
    setNotice(null);
    const parsed = await parseCsvFile(file);
    setImportKey((current) => current + 1);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const imported = parsed.rows
      .map((row) => ({
        email: fieldByNormalizedName(row, "email").toLowerCase(),
        firstName: fieldByNormalizedName(row, "firstName"),
        lastName: fieldByNormalizedName(row, "lastName"),
        company: fieldByNormalizedName(row, "company"),
        phone: fieldByNormalizedName(row, "phone"),
        jobTitle: fieldByNormalizedName(row, "jobTitle"),
        source: "import",
      }))
      .filter((row) => isEmail(row.email));
    if (imported.length === 0) {
      setError("The CSV has no valid email addresses.");
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/contacts/import", { method: "POST", body: JSON.stringify({ contacts: imported }) });
      await load(searched);
      setNotice(`${imported.length} contacts imported. Import does not start a campaign.`);
    } catch (importError) {
      setError(getErrorMessage(importError));
    } finally {
      setBusy(false);
    }
  };

  const handleEnroll = async (contact: Person): Promise<void> => {
    if (!campaignId) {
      setError("Choose a campaign first.");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<{ ok: true; enrolled: number; skipped: number }>(`/api/campaigns/${campaignId}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          people: [
            {
              email: contact.email,
              firstName: contact.firstName,
              lastName: contact.lastName,
              company: contact.company,
              phone: contact.phone,
              jobTitle: contact.jobTitle,
            },
          ],
        }),
      });
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (result.enrolled === 0) {
        setNotice(`${contact.email} is already in that campaign or is suppressed.`);
      } else if (campaign?.status === "paused") {
        setNotice(`${contact.email} was added. Sending starts when the campaign resumes.`);
      } else {
        setNotice(`${contact.email} was added to ${campaign?.name ?? "the campaign"}.`);
      }
    } catch (enrollError) {
      setError(getErrorMessage(enrollError));
    } finally {
      setBusy(false);
    }
  };

  if (!contacts) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8" aria-busy="true">
        <span className="sr-only">Loading contacts</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-3 md:p-6">
        <form
          className="space-y-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
        >
          <Label htmlFor="contact-search">Search</Label>
          <div className="flex gap-2">
            <Input
              id="contact-search"
              value={query}
              placeholder="Name, email, or company"
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </div>
        </form>
        <div className="space-y-1.5">
          <Label htmlFor="contact-import">Import CSV</Label>
          <Input
            key={importKey}
            id="contact-import"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
          <p className="text-xs text-muted-foreground">Header row required. Import saves contacts only.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="enroll-campaign">Campaign</Label>
          <Select value={campaignId || undefined} onValueChange={setCampaignId} disabled={campaigns.length === 0}>
            <SelectTrigger id="enroll-campaign" className="w-full">
              <SelectValue placeholder={campaigns.length === 0 ? "No active campaigns" : "Choose a campaign"} />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "paused" ? " (paused)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        {error ? <StatusAlert variant="destructive" title="Could not update contacts" message={error} /> : null}
        {notice ? <StatusAlert title="Contacts updated" message={notice} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="space-y-2">
          {contacts.length === 0 ? (
            <li className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
              {searched.length > 0 ? `No contacts match "${searched}".` : "No contacts yet. Add one, or import a CSV."}
            </li>
          ) : null}
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="min-w-0">
                <p className="truncate font-medium">{contact.displayName || contact.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {contact.email}
                  {contact.company ? ` · ${contact.company}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{contact.status}</Badge>
                <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(contact)}>
                  Edit
                </Button>
                <Button type="button" size="sm" disabled={busy || !campaignId} onClick={() => void handleEnroll(contact)}>
                  Add to campaign
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <h2 className="text-sm font-semibold">{editingId ? "Edit contact" : "New contact"}</h2>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-first">First name</Label>
            <Input id="contact-first" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-last">Last name</Label>
            <Input id="contact-last" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-company">Company</Label>
            <Input id="contact-company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input id="contact-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-title">Job title</Label>
            <Input id="contact-title" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-status">Status</Label>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ContactStatus })}>
              <SelectTrigger id="contact-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea id="contact-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {editingId ? "Save changes" : "Save contact"}
            </Button>
            {editingId ? (
              <Button type="button" variant="outline" disabled={busy} onClick={handleCancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
};
