"use client";

import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";
import type { CampaignSummary, Person } from "@/types/campaigns";

interface AddToCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId?: string;
  contactIds?: string[];
  contacts?: Person[];
  onSuccess: () => void;
}

export const AddToCampaignModal = ({
  isOpen,
  onClose,
  contactId,
  contactIds,
  contacts,
  onSuccess,
}: AddToCampaignModalProps) => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const res = await fetch("/api/campaigns");
        const data = await res.json();
        if (data.ok) {
          setCampaigns(
            data.campaigns.filter(
              (c: CampaignSummary) => c.status === "active" || c.status === "paused" || c.status === "draft",
            ),
          );
        }
      } catch {
        setError("Failed to load campaigns");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedCampaignId) {
      setError("Please select a campaign");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ids = contactIds ?? (contactId ? [contactId] : []);
      const people =
        contacts ??
        (ids.length > 0
          ? await Promise.all(
              ids.map(async (id) => {
                const res = await fetch(`/api/contacts/${id}`);
                const data = await res.json();
                return data.contact as Person;
              }),
            )
          : []);

      const res = await fetch(`/api/campaigns/${selectedCampaignId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: people.map((p) => ({
            email: p.email,
            firstName: p.firstName,
            lastName: p.lastName,
            company: p.company,
            phone: p.phone,
            jobTitle: p.jobTitle,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enroll");
      setResult({ enrolled: data.enrolled ?? 0, skipped: data.skipped ?? 0 });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Megaphone size={20} className="text-primary" />
            <h2 className="text-[18px] font-bold text-gray-900">Add to Campaign</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}

          {result ? (
            <div className="text-center py-4">
              <p className="text-[15px] text-gray-900 font-medium">{result.enrolled} contact(s) enrolled</p>
              {result.skipped > 0 && (
                <p className="text-[13px] text-gray-500 mt-1">{result.skipped} already enrolled or suppressed</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-[14px] text-gray-600">
                Select a campaign to enroll {contactIds?.length ?? 1} contact(s)
              </p>
              {loading ? (
                <div className="py-4 text-center text-gray-500 text-sm">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="py-4 text-center text-gray-500 text-sm">
                  No campaigns available. Create one first.
                </div>
              ) : (
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-[14px] font-medium text-gray-700 hover:text-gray-900">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedCampaignId}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Enrolling..." : "Add to Campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
