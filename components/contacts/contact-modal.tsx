"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Person, ContactStatus } from "@/types/campaigns";

interface ContactModalProps {
  contact: Person | null;
  onClose: () => void;
  onSave: () => void;
}

const statuses: { value: ContactStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
  { value: "inactive", label: "Inactive" },
];

export const ContactModal = ({ contact, onClose, onSave }: ContactModalProps) => {
  const [formData, setFormData] = useState({
    email: contact?.email ?? "",
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    phone: contact?.phone ?? "",
    company: contact?.company ?? "",
    jobTitle: contact?.jobTitle ?? "",
    status: (contact?.status ?? "active") as ContactStatus,
    source: contact?.source ?? "",
    notes: contact?.notes ?? "",
    tags: contact?.tags?.join(", ") ?? "",
    advertiser: contact?.advertiser ?? "",
    jobBoard: contact?.jobBoard ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tagsArray = formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim() || null,
        lastName: formData.lastName.trim() || null,
        phone: formData.phone.trim() || null,
        company: formData.company.trim() || null,
        jobTitle: formData.jobTitle.trim() || null,
        status: formData.status,
        source: formData.source.trim() || null,
        notes: formData.notes.trim() || null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        advertiser: formData.advertiser.trim() || null,
        jobBoard: formData.jobBoard.trim() || null,
      };

      const url = contact ? `/api/contacts/${contact.id}` : "/api/contacts";
      const method = contact ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSave();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-[20px] font-bold text-gray-900">
            {contact ? "Edit Contact" : "Add New Contact"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>
          )}
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">First Name</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="John" />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Last Name</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="john@example.com" />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2">Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="+1 (555) 123-4567" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Company</label>
                <input type="text" name="company" value={formData.company} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="Acme Inc." />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Job Title</label>
                <input type="text" name="jobTitle" value={formData.jobTitle} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="Marketing Manager" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Status</label>
                <select name="status" value={formData.status} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all">
                  {statuses.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Source</label>
                <input type="text" name="source" value={formData.source} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="Website, Referral, etc." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Advertiser</label>
                <input type="text" name="advertiser" value={formData.advertiser} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-gray-700 mb-2">Job Board</label>
                <input type="text" name="jobBoard" value={formData.jobBoard} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2">Tags</label>
              <input type="text" name="tags" value={formData.tags} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" placeholder="tag1, tag2, tag3 (comma-separated)" />
              <p className="text-[12px] text-gray-500 mt-1">Separate multiple tags with commas</p>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all resize-none" placeholder="Additional notes..." />
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-[14px] font-medium text-gray-700 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving..." : contact ? "Update Contact" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
};
