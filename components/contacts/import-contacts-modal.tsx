"use client";

import { useState } from "react";
import { X, Upload, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import Papa from "papaparse";

interface ImportContactsModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = "upload" | "mapping" | "duplicates" | "importing" | "complete";

interface Mapping {
  csvColumn: string;
  dbField: string;
}

const dbFields = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "jobTitle", label: "Job Title" },
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
  { value: "advertiser", label: "Advertiser" },
  { value: "jobBoard", label: "Job Board" },
  { value: "notes", label: "Notes" },
];

export const ImportContactsModal = ({ onClose, onImportComplete }: ImportContactsModalProps) => {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [batchName, setBatchName] = useState("");
  const [importResults, setImportResults] = useState({ success: 0, failed: 0, skipped: 0 });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;
    setFile(uploaded);
    Papa.parse<Record<string, string>>(uploaded, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        setCsvHeaders(headers);
        setCsvData(results.data);
        const auto: Mapping[] = headers.map((header) => {
          const norm = header.toLowerCase().replace(/[^a-z]/g, "");
          let field = "";
          if (norm.includes("firstname") || norm === "first") field = "firstName";
          else if (norm.includes("lastname") || norm === "last") field = "lastName";
          else if (norm.includes("email") || norm === "mail") field = "email";
          else if (norm.includes("phone") || norm === "mobile") field = "phone";
          else if (norm.includes("company") || norm === "organization") field = "company";
          else if (norm.includes("jobtitle") || norm === "title" || norm === "position") field = "jobTitle";
          else if (norm.includes("status")) field = "status";
          else if (norm.includes("source")) field = "source";
          else if (norm.includes("advertiser")) field = "advertiser";
          else if (norm.includes("jobboard")) field = "jobBoard";
          return { csvColumn: header, dbField: field };
        });
        setMappings(auto);
        setStep("mapping");
      },
      error: () => alert("Error parsing CSV file."),
    });
  };

  const handleMappingChange = (csvColumn: string, dbField: string) => {
    setMappings((prev) => prev.map((m) => (m.csvColumn === csvColumn ? { ...m, dbField } : m)));
  };

  const handleImport = async () => {
    const emailMapping = mappings.find((m) => m.dbField === "email");
    if (!emailMapping) {
      alert("Please map at least one column to Email.");
      return;
    }
    setStep("importing");
    let success = 0;
    let failed = 0;
    let skipped = 0;

    const contacts = csvData
      .map((row) => {
        const mapped: Record<string, string | null> = {};
        for (const m of mappings) {
          if (m.dbField && row[m.csvColumn]) {
            mapped[m.dbField] = row[m.csvColumn].trim() || null;
          }
        }
        return mapped;
      })
      .filter((c) => c.email);

    const batchSize = 50;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize).map((c) => ({
        email: c.email!,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        company: c.company || null,
        phone: c.phone || null,
        jobTitle: c.jobTitle || null,
        source: c.source || "import",
        advertiser: c.advertiser || null,
        jobBoard: c.jobBoard || null,
        tags: batchName.trim() ? [batchName.trim()] : null,
      }));
      try {
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: batch }),
        });
        const data = await res.json();
        if (res.ok) {
          success += data.imported ?? batch.length;
          skipped += data.skipped ?? 0;
        } else {
          failed += batch.length;
        }
      } catch {
        failed += batch.length;
      }
    }

    setImportResults({ success, failed, skipped });
    setStep("complete");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-[20px] font-bold text-gray-900">Import Contacts</h2>
            <p className="text-[14px] text-gray-600 mt-0.5">
              {step === "upload" && "Upload a CSV file with your contacts"}
              {step === "mapping" && "Map CSV columns to contact fields"}
              {step === "duplicates" && "Review potential duplicates"}
              {step === "importing" && "Importing contacts..."}
              {step === "complete" && "Import complete"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "upload" && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
                <Upload size={48} className="text-gray-400 mx-auto mb-4" />
                <p className="text-[15px] text-gray-700 mb-2">Drop your CSV file here or click to browse</p>
                <p className="text-[13px] text-gray-500 mb-4">Supported format: CSV (Max 10MB)</p>
                <label className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all cursor-pointer">
                  <Upload size={16} />
                  Choose File
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-[14px] text-blue-900 font-medium mb-2">CSV Format Guidelines:</p>
                <ul className="text-[13px] text-blue-800 space-y-1 list-disc list-inside">
                  <li>Include headers in the first row</li>
                  <li>Email is required for each contact</li>
                  <li>Common columns: First Name, Last Name, Email, Phone, Company, Job Title</li>
                </ul>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[14px] text-gray-700">
                  <strong>{csvData.length}</strong> rows found in <strong>{file?.name}</strong>
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <label className="block text-[14px] font-semibold text-gray-900 mb-2">Batch Name (Optional)</label>
                <p className="text-[13px] text-gray-600 mb-3">All imported contacts will be tagged with this batch name.</p>
                <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g., Q1 2024 Leads" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all" />
              </div>
              <div className="space-y-3">
                <p className="text-[15px] font-semibold text-gray-900">Map CSV Columns to Fields</p>
                {csvHeaders.map((header) => {
                  const mapping = mappings.find((m) => m.csvColumn === header);
                  return (
                    <div key={header} className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-gray-900">{header}</p>
                        <p className="text-[13px] text-gray-500">Sample: {csvData[0]?.[header] ?? "-"}</p>
                      </div>
                      <ArrowRight size={20} className="text-gray-400" />
                      <div className="flex-1">
                        <select value={mapping?.dbField ?? ""} onChange={(e) => handleMappingChange(header, e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="">Skip this column</option>
                          {dbFields.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="text-center py-12">
              <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-[15px] text-gray-700">Importing contacts...</p>
              <p className="text-[14px] text-gray-500 mt-2">This may take a moment</p>
            </div>
          )}

          {step === "complete" && (
            <div className="text-center py-8">
              <CheckCircle size={64} className="text-green-500 mx-auto mb-6" />
              <h3 className="text-[20px] font-bold text-gray-900 mb-4">Import Complete!</h3>
              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-[24px] font-bold text-green-600">{importResults.success}</p>
                  <p className="text-[13px] text-green-700">Imported</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-[24px] font-bold text-yellow-600">{importResults.skipped}</p>
                  <p className="text-[13px] text-yellow-700">Skipped</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-[24px] font-bold text-red-600">{importResults.failed}</p>
                  <p className="text-[13px] text-red-700">Failed</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-[14px] font-medium text-gray-700 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {step === "mapping" && (
              <button onClick={handleImport}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all">
                Import ({csvData.length} contacts)
              </button>
            )}
            {step === "complete" && (
              <button onClick={() => { onImportComplete(); onClose(); }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
