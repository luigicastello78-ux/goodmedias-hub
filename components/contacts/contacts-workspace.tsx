"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Search,
  Plus,
  Trash2,
  Edit,
  Filter,
  Download,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import type { Person } from "@/types/campaigns";
import { ContactModal } from "./contact-modal";
import { ImportContactsModal } from "./import-contacts-modal";
import { AddToCampaignModal } from "./add-to-campaign-modal";

export const ContactsWorkspace = () => {
  const [contacts, setContacts] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Person | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddToCampaignModal, setShowAddToCampaignModal] = useState(false);
  const [showBulkAddToCampaignModal, setShowBulkAddToCampaignModal] = useState(false);
  const [selectedContactForCampaign, setSelectedContactForCampaign] = useState<Person | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const totalPages = Math.max(1, Math.ceil(totalContacts / pageSize));

  useEffect(() => {
    void fetchContacts();
  }, [filterStatus, searchQuery, pageSize, currentPage]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        q: searchQuery,
        status: filterStatus,
        page: String(currentPage),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      if (data.ok) {
        setContacts(data.contacts ?? []);
        setTotalContacts(data.total ?? 0);
      } else {
        setContacts([]);
        setTotalContacts(0);
      }
    } catch {
      setContacts([]);
      setTotalContacts(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
    setSelectedContacts(new Set());
  };

  const escapeCsv = (v: string | null | undefined) => {
    const s = v ?? "";
    return `"${s.replace(/"/g, '""')}"`;
  };

  const buildCsv = (rows: Person[]) => {
    const header = ["First Name", "Last Name", "Email", "Phone", "Company", "Job Title", "Advertiser", "Job Board", "Source"];
    const lines = rows.map((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.company, c.jobTitle, c.advertiser, c.jobBoard, c.source]
        .map(escapeCsv)
        .join(","),
    );
    return [header.map(escapeCsv).join(","), ...lines].join("\n");
  };

  const downloadCsv = (csv: string, prefix: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectContact = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedContacts.size === contacts.length && contacts.length > 0) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedContacts.size} contact(s)?`)) return;
    try {
      await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedContacts) }),
      });
      setSelectedContacts(new Set());
      void fetchContacts();
    } catch {
      /* ignore */
    }
  };

  const handleEdit = (contact: Person) => {
    setEditingContact(contact);
    setShowContactModal(true);
  };

  const handleAddNew = () => {
    setEditingContact(null);
    setShowContactModal(true);
  };

  const handleAddToCampaign = (contact: Person) => {
    setSelectedContactForCampaign(contact);
    setShowAddToCampaignModal(true);
    setOpenMenuId(null);
  };

  const handleExportCurrentView = () => downloadCsv(buildCsv(contacts), "contacts-current-view");

  const handleExportSelected = () => {
    const rows = contacts.filter((c) => selectedContacts.has(c.id));
    if (rows.length > 0) downloadCsv(buildCsv(rows), "contacts-selected");
  };

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

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-[28px] font-bold text-foreground">Contacts</h1>
            <span className="px-3 py-1 bg-muted rounded-lg text-[14px] font-semibold text-muted-foreground">
              {totalContacts} Total
            </span>
          </div>
          <p className="text-[15px] text-muted-foreground mt-1">Manage and organize your contact database</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportCurrentView}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted transition-colors">
            <Download size={16} /> Export
          </button>
          <button onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted transition-colors">
            <Upload size={16} /> Import
          </button>
          <button onClick={handleAddNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all shadow-sm">
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input type="search" placeholder="Search contacts..." value={searchQuery} onChange={handleSearch}
              className="w-full px-4 py-2 pl-10 bg-muted border border-border rounded-lg text-[15px] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all" />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-muted-foreground" />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); setSelectedContacts(new Set()); }}
              className="px-3 py-2 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-muted-foreground">Show</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); setSelectedContacts(new Set()); }}
              className="px-3 py-2 bg-muted border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all">
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedContacts.size > 0 && (
        <div className="bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between">
          <span className="text-[15px] font-medium">{selectedContacts.size} contact(s) selected</span>
          <div className="flex items-center gap-3">
            <button onClick={handleExportSelected}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[14px] font-medium transition-colors">
              <Download size={16} /> Export Selected
            </button>
            <button onClick={() => setShowBulkAddToCampaignModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[14px] font-medium transition-colors">
              <Plus size={16} /> Add All to Campaign
            </button>
            <button onClick={handleDeleteSelected}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-[14px] font-medium transition-colors">
              <Trash2 size={16} /> Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-[15px]">Loading contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle size={48} className="text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-[15px] text-muted-foreground">No contacts found</p>
            <button onClick={handleAddNew} className="mt-4 text-[14px] text-primary hover:text-primary/80 font-medium">
              Add your first contact
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox"
                      checked={contacts.length > 0 && contacts.every((c) => selectedContacts.has(c.id))}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold text-muted-foreground">Name</th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold text-muted-foreground">Email</th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold text-muted-foreground">Phone</th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold text-muted-foreground">Company</th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold text-muted-foreground">Source</th>
                  <th className="px-6 py-4 text-right text-[13px] font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedContacts.has(contact.id)}
                        onChange={() => handleSelectContact(contact.id)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-semibold text-[14px] flex-shrink-0">
                          {(contact.firstName?.[0] ?? contact.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[15px] font-medium text-foreground">
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="text-[13px] text-muted-foreground">{contact.jobTitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[14px] text-foreground">{contact.email}</td>
                    <td className="px-6 py-4 text-[14px] text-foreground">{contact.phone || "-"}</td>
                    <td className="px-6 py-4 text-[14px] text-foreground">{contact.company || "-"}</td>
                    <td className="px-6 py-4 text-[14px] text-muted-foreground">{contact.source || "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(contact)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-foreground hover:text-primary transition-colors">
                          <Edit size={14} /> Edit
                        </button>
                        <div className="relative" ref={(el) => { menuRefs.current[contact.id] = el; }}>
                          <button onClick={() => setOpenMenuId(openMenuId === contact.id ? null : contact.id)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            aria-label="More options">
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === contact.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-card rounded-lg shadow-lg border border-border py-1 z-10">
                              <button onClick={() => handleAddToCampaign(contact)}
                                className="w-full text-left px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors flex items-center gap-2">
                                <Plus size={14} /> Add to Campaign
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted-foreground">
          Showing {totalContacts === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
          {Math.min(currentPage * pageSize, totalContacts)} of {totalContacts}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); setSelectedContacts(new Set()); }}
            disabled={currentPage <= 1}
            className="px-3 py-2 rounded-lg border border-border bg-card text-[14px] text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed">
            Previous
          </button>
          <span className="px-3 py-2 text-[14px] text-foreground">Page {currentPage} of {totalPages}</span>
          <button onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); setSelectedContacts(new Set()); }}
            disabled={currentPage >= totalPages}
            className="px-3 py-2 rounded-lg border border-border bg-card text-[14px] text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      </div>

      {/* Modals */}
      {showImportModal && <ImportContactsModal onClose={() => setShowImportModal(false)} onImportComplete={() => void fetchContacts()} />}

      {showContactModal && (
        <ContactModal
          contact={editingContact}
          onClose={() => { setShowContactModal(false); setEditingContact(null); }}
          onSave={() => void fetchContacts()}
        />
      )}

      {showAddToCampaignModal && selectedContactForCampaign && (
        <AddToCampaignModal
          isOpen={showAddToCampaignModal}
          onClose={() => { setShowAddToCampaignModal(false); setSelectedContactForCampaign(null); }}
          contactId={selectedContactForCampaign.id}
          contacts={[selectedContactForCampaign]}
          onSuccess={() => void fetchContacts()}
        />
      )}

      {showBulkAddToCampaignModal && (
        <AddToCampaignModal
          isOpen={showBulkAddToCampaignModal}
          onClose={() => { setShowBulkAddToCampaignModal(false); setSelectedContacts(new Set()); }}
          contactIds={Array.from(selectedContacts)}
          contacts={contacts.filter((c) => selectedContacts.has(c.id))}
          onSuccess={() => { void fetchContacts(); setSelectedContacts(new Set()); }}
        />
      )}
    </div>
  );
};
