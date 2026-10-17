"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { fieldByNormalizedName } from "@/lib/bulk-contacts";
import { parseCsvFile } from "@/lib/csv";
import { isEmail } from "@/lib/email";
import type { CampaignSummary, ContactStatus, Person } from "@/types/campaigns";

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
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (search = query): Promise<void> => {
    const [people, campaignData] = await Promise.all([
      requestJson<{ ok: true; contacts: Person[] }>(`/api/contacts?q=${encodeURIComponent(search)}`),
      requestJson<{ ok: true; campaigns: CampaignSummary[] }>("/api/campaigns"),
    ]);
    setContacts(people.contacts);
    setCampaigns(campaignData.campaigns.filter((campaign) => campaign.status === "active"));
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
          setCampaigns(campaignData.campaigns.filter((campaign) => campaign.status === "active"));
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
    void load(query).catch((loadError: unknown) => setError(getErrorMessage(loadError)));
  };

  const handleEdit = (person: Person): void => {
    setEditingId(person.id);
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

  const handleSave = async (): Promise<void> => {
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
      await load();
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
    const parsed = await parseCsvFile(file);
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
      await load();
      setNotice(`${imported.length} contacts imported. Import does not start a campaign.`);
    } catch (importError) {
      setError(getErrorMessage(importError));
    } finally {
      setBusy(false);
    }
  };

  const handleEnroll = async (contact: Person): Promise<void> => {
    if (!campaignId) {
      setError("Choose an active campaign first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/campaigns/${campaignId}/enroll`, {
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
      setNotice(`${contact.email} was added to the campaign.`);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="contact-search">Search</Label>
          <div className="flex gap-2">
            <Input id="contact-search" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button type="button" variant="outline" onClick={handleSearch}>
              Search
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-import">Import CSV</Label>
          <Input id="contact-import" type="file" accept=".csv,text/csv" onChange={(event) => void handleImport(event.target.files?.[0])} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="enroll-campaign">Add to campaign</Label>
          <select
            id="enroll-campaign"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            <option value="">Choose an active campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <StatusAlert variant="destructive" title="Contacts" message={error} /> : null}
      {notice ? <StatusAlert title="Contacts" message={notice} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="space-y-2">
          {contacts.length === 0 ? (
            <li className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">No contacts yet.</li>
          ) : null}
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div>
                <p className="font-medium">{contact.displayName || contact.email}</p>
                <p className="text-xs text-muted-foreground">
                  {contact.email}
                  {contact.company ? ` · ${contact.company}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(contact)}>
                  Edit
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => void handleEnroll(contact)}>
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
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea id="contact-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <Button type="submit" disabled={busy}>
            Save contact
          </Button>
        </form>
      </div>
    </div>
  );
};
