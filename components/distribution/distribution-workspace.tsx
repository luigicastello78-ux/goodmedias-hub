"use client";

import { useMemo, useState } from "react";
import {
  Upload,
  Settings,
  ArrowRight,
  Play,
  CheckCircle,
  AlertTriangle,
  Megaphone,
  Clock,
  Zap,
  Users,
} from "lucide-react";
import Papa from "papaparse";

import type { CampaignSummary } from "@/types/campaigns";

type Step = "settings" | "upload" | "mapping" | "allocation" | "execution";

interface Mapping {
  csvColumn: string;
  dbField: string;
}

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "settings", label: "Settings", icon: Settings },
  { key: "upload", label: "Upload", icon: Upload },
  { key: "mapping", label: "Mapping", icon: ArrowRight },
  { key: "allocation", label: "Allocation", icon: Users },
  { key: "execution", label: "Execution", icon: Play },
];

const DB_FIELDS = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "jobTitle", label: "Job Title" },
  { value: "source", label: "Source" },
  { value: "advertiser", label: "Advertiser" },
  { value: "jobBoard", label: "Job Board" },
];

export const DistributionWorkspace = () => {
  const [currentStep, setCurrentStep] = useState<Step>("settings");

  // Settings step
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignLoaded, setCampaignLoaded] = useState(false);

  // Upload step
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  // Mapping step
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [batchName, setBatchName] = useState("");

  // Allocation step
  const [contactCount, setContactCount] = useState(0);

  // Execution step
  const [executionType, setExecutionType] = useState<"immediate" | "drip">("drip");
  const [dripCount, setDripCount] = useState(10);
  const [dripMinutes, setDripMinutes] = useState(5);
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedContacts = useMemo(() => {
    const emailMapping = mappings.find((m) => m.dbField === "email");
    if (!emailMapping) return [];
    const seen = new Set<string>();
    const contacts: Record<string, string | null>[] = [];
    for (const row of csvData) {
      const mapped: Record<string, string | null> = {};
      for (const m of mappings) {
        if (m.dbField && row[m.csvColumn]) {
          mapped[m.dbField] = row[m.csvColumn].trim() || null;
        }
      }
      const email = mapped.email?.toLowerCase();
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      contacts.push(mapped);
    }
    return contacts;
  }, [csvData, mappings]);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
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
      /* ignore */
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handleNextFromSettings = () => {
    if (!selectedCampaignId) {
      setError("Please select a campaign to distribute to.");
      return;
    }
    setError(null);
    setCampaignLoaded(true);
    setCurrentStep("upload");
  };

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
          else if (norm.includes("source")) field = "source";
          else if (norm.includes("advertiser")) field = "advertiser";
          else if (norm.includes("jobboard")) field = "jobBoard";
          return { csvColumn: header, dbField: field };
        });
        setMappings(auto);
        setCurrentStep("mapping");
      },
      error: () => setError("Error parsing CSV file."),
    });
  };

  const handleNextFromMapping = () => {
    const emailMapping = mappings.find((m) => m.dbField === "email");
    if (!emailMapping) {
      setError("Please map at least one column to Email.");
      return;
    }
    setError(null);
    setContactCount(resolvedContacts.length);
    setCurrentStep("allocation");
  };

  const handleNextFromAllocation = () => {
    if (resolvedContacts.length === 0) {
      setError("No valid contacts to distribute.");
      return;
    }
    setError(null);
    setCurrentStep("execution");
  };

  const handleExecute = async () => {
    if (!selectedCampaignId || resolvedContacts.length === 0) return;
    setIsExecuting(true);
    setError(null);
    setExecutionResult(null);
    try {
      const people = resolvedContacts.map((c) => ({
        email: c.email!,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        company: c.company || null,
        phone: c.phone || null,
        jobTitle: c.jobTitle || null,
        source: c.source || "distribution",
        advertiser: c.advertiser || null,
        jobBoard: c.jobBoard || null,
        tags: batchName.trim() ? [batchName.trim()] : null,
      }));

      const res = await fetch(`/api/campaigns/${selectedCampaignId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distribution: {
            name: batchName.trim() || "Distribution",
            executionType,
            contacts: people,
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Distribution failed");
      setExecutionResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Distribution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    setCurrentStep("settings");
    setSelectedCampaignId("");
    setCampaignLoaded(false);
    setFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setMappings([]);
    setBatchName("");
    setContactCount(0);
    setExecutionType("drip");
    setDripCount(10);
    setDripMinutes(5);
    setWindowEnabled(false);
    setIsExecuting(false);
    setExecutionResult(null);
    setError(null);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  // Load campaigns on first render of settings step
  if (!campaignLoaded && campaigns.length === 0 && !loadingCampaigns) {
    void loadCampaigns();
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Upload className="text-muted-foreground" size={28} />
          <h1 className="text-[28px] font-bold text-foreground">Distribution</h1>
        </div>
        <p className="text-[15px] text-muted-foreground mt-1">
          Upload contacts and distribute them to campaigns with drip or immediate execution
        </p>
      </div>

      {/* Step Indicator */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 ${isActive ? "text-primary" : isDone ? "text-green-600" : "text-muted-foreground"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${
                    isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? <CheckCircle size={16} /> : i + 1}
                  </div>
                  <span className="text-[13px] font-medium hidden sm:inline">{step.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${isDone ? "bg-green-300" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
          <p className="text-[14px] text-red-700">{error}</p>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-card rounded-xl border border-border">
        {/* SETTINGS STEP */}
        {currentStep === "settings" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-[20px] font-bold text-foreground">Campaign Selection</h2>
              <p className="text-[14px] text-muted-foreground mt-1">Choose which campaign to distribute contacts to</p>
            </div>

            {loadingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8">
                <Megaphone className="mx-auto text-muted-foreground/30 mb-4" size={48} />
                <p className="text-[15px] text-muted-foreground">No campaigns available. Create a campaign first.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <label key={campaign.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedCampaignId === campaign.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/50"
                    }`}>
                    <input type="radio" name="campaign" value={campaign.id}
                      checked={selectedCampaignId === campaign.id}
                      onChange={() => setSelectedCampaignId(campaign.id)}
                      className="w-4 h-4 text-primary focus:ring-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-medium text-foreground">{campaign.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          campaign.status === "active" ? "bg-green-100 text-green-700" :
                          campaign.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>{campaign.status}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {campaign.enrolledCount} enrolled · {campaign.sentCount} sent · {campaign.stepCount} steps
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={handleNextFromSettings} disabled={!selectedCampaignId}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                Next: Upload CSV <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* UPLOAD STEP */}
        {currentStep === "upload" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-[20px] font-bold text-foreground">Upload Contacts</h2>
              <p className="text-[14px] text-muted-foreground mt-1">
                Upload a CSV file with contacts to distribute to <strong>{selectedCampaign?.name}</strong>
              </p>
            </div>

            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
              <Upload size={48} className="text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-[15px] text-foreground mb-2">Drop your CSV file here or click to browse</p>
              <p className="text-[13px] text-muted-foreground mb-4">Supported format: CSV (Max 10MB)</p>
              <label className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all cursor-pointer">
                <Upload size={16} /> Choose File
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

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep("settings")}
                className="px-4 py-2 text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Back
              </button>
            </div>
          </div>
        )}

        {/* MAPPING STEP */}
        {currentStep === "mapping" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-[20px] font-bold text-foreground">Map Columns</h2>
              <p className="text-[14px] text-muted-foreground mt-1">
                Map CSV columns to contact fields. <strong>{csvData.length}</strong> rows found in <strong>{file?.name}</strong>
              </p>
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <label className="block text-[14px] font-semibold text-foreground mb-2">Batch Name (Optional)</label>
              <p className="text-[13px] text-muted-foreground mb-3">All imported contacts will be tagged with this name.</p>
              <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., Q4 2026 Leads"
                className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
            </div>

            <div className="space-y-3">
              <p className="text-[15px] font-semibold text-foreground">Column Mapping</p>
              {csvHeaders.map((header) => {
                const mapping = mappings.find((m) => m.csvColumn === header);
                return (
                  <div key={header} className="flex items-center gap-4 p-4 bg-muted/30 border border-border rounded-lg">
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-foreground">{header}</p>
                      <p className="text-[13px] text-muted-foreground">Sample: {csvData[0]?.[header] ?? "-"}</p>
                    </div>
                    <ArrowRight size={20} className="text-muted-foreground" />
                    <div className="flex-1">
                      <select value={mapping?.dbField ?? ""}
                        onChange={(e) => setMappings((prev) => prev.map((m) => (m.csvColumn === header ? { ...m, dbField: e.target.value } : m)))}
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all">
                        <option value="">Skip this column</option>
                        {DB_FIELDS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep("upload")}
                className="px-4 py-2 text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Back
              </button>
              <button onClick={handleNextFromMapping}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all">
                Next: Allocation <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ALLOCATION STEP */}
        {currentStep === "allocation" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-[20px] font-bold text-foreground">Allocation Summary</h2>
              <p className="text-[14px] text-muted-foreground mt-1">Review how contacts will be distributed</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-[13px] text-muted-foreground">Total Contacts</p>
                <p className="text-[28px] font-bold text-foreground">{resolvedContacts.length}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-[13px] text-muted-foreground">Target Campaign</p>
                <p className="text-[16px] font-semibold text-foreground truncate">{selectedCampaign?.name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-[13px] text-muted-foreground">Skipped (no email / duplicate)</p>
                <p className="text-[28px] font-bold text-muted-foreground">{csvData.length - resolvedContacts.length}</p>
              </div>
            </div>

            {batchName.trim() && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-[13px] text-blue-800">
                  All contacts will be tagged: <strong>{batchName.trim()}</strong>
                </p>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep("mapping")}
                className="px-4 py-2 text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Back
              </button>
              <button onClick={handleNextFromAllocation}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all">
                Next: Execution <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* EXECUTION STEP */}
        {currentStep === "execution" && (
          <div className="p-6 space-y-6">
            {executionResult ? (
              // Result
              <div className="text-center py-8">
                <CheckCircle size={64} className="text-green-500 mx-auto mb-6" />
                <h2 className="text-[24px] font-bold text-foreground mb-2">Distribution Complete!</h2>
                <p className="text-[15px] text-muted-foreground mb-6">
                  Contacts have been distributed to <strong>{selectedCampaign?.name}</strong>
                </p>
                {executionResult.distribution && (
                  <div className="max-w-md mx-auto bg-muted/50 rounded-lg p-4 border border-border text-left space-y-2">
                    <p className="text-[14px] text-foreground">
                      <strong>Total:</strong> {(executionResult.distribution as Record<string, number>).totalContacts ?? 0}
                    </p>
                    <p className="text-[14px] text-foreground">
                      <strong>Processed:</strong> {(executionResult.distribution as Record<string, number>).processedContacts ?? 0}
                    </p>
                    <p className="text-[14px] text-foreground">
                      <strong>Type:</strong> {(executionResult.distribution as Record<string, string>).executionType ?? executionType}
                    </p>
                  </div>
                )}
                <button onClick={handleReset}
                  className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all">
                  New Distribution
                </button>
              </div>
            ) : isExecuting ? (
              // Executing
              <div className="text-center py-12">
                <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <h2 className="text-[18px] font-bold text-foreground">Distributing contacts...</h2>
                <p className="text-[14px] text-muted-foreground mt-2">
                  Enrolling {resolvedContacts.length} contacts to {selectedCampaign?.name}
                </p>
              </div>
            ) : (
              // Settings
              <>
                <div>
                  <h2 className="text-[20px] font-bold text-foreground">Execution Settings</h2>
                  <p className="text-[14px] text-muted-foreground mt-1">
                    Configure how {resolvedContacts.length} contacts will be enrolled
                  </p>
                </div>

                <div className="space-y-4">
                  <p className="text-[15px] font-semibold text-foreground">Execution Type</p>
                  <div className="grid grid-cols-2 gap-4">
                    <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      executionType === "immediate" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/50"
                    }`}>
                      <input type="radio" name="executionType" value="immediate"
                        checked={executionType === "immediate"} onChange={() => setExecutionType("immediate")}
                        className="mt-0.5 w-4 h-4 text-primary focus:ring-primary" />
                      <div>
                        <div className="flex items-center gap-2">
                          <Zap size={16} className="text-primary" />
                          <p className="text-[14px] font-semibold text-foreground">Immediate</p>
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-1">Enroll all contacts at once</p>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      executionType === "drip" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/50"
                    }`}>
                      <input type="radio" name="executionType" value="drip"
                        checked={executionType === "drip"} onChange={() => setExecutionType("drip")}
                        className="mt-0.5 w-4 h-4 text-primary focus:ring-primary" />
                      <div>
                        <div className="flex items-center gap-2">
                          <Clock size={16} className="text-primary" />
                          <p className="text-[14px] font-semibold text-foreground">Drip</p>
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-1">Release contacts in batches over time</p>
                      </div>
                    </label>
                  </div>
                </div>

                {executionType === "drip" && (
                  <div className="space-y-4 bg-muted/30 rounded-lg p-4 border border-border">
                    <p className="text-[14px] font-semibold text-foreground">Drip Settings</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[13px] text-muted-foreground">Contacts per batch</label>
                        <input type="number" min={1} max={500} value={dripCount}
                          onChange={(e) => setDripCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[13px] text-muted-foreground">Minutes between batches</label>
                        <input type="number" min={1} max={1440} value={dripMinutes}
                          onChange={(e) => setDripMinutes(Math.min(1440, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={windowEnabled} onChange={(e) => setWindowEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                      <label className="text-[13px] text-foreground">Only weekdays, 9:00–17:00 Europe/Skopje</label>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-[13px] text-blue-800">
                        Estimated: {Math.ceil(resolvedContacts.length / dripCount)} batches over ~{Math.ceil((Math.ceil(resolvedContacts.length / dripCount) - 1) * dripMinutes)} minutes
                      </p>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-[14px] text-green-800 font-medium mb-2">Ready to distribute</p>
                  <ul className="text-[13px] text-green-700 space-y-1 list-disc list-inside">
                    <li><strong>{resolvedContacts.length}</strong> contacts will be enrolled</li>
                    <li>Campaign: <strong>{selectedCampaign?.name}</strong></li>
                    <li>Mode: <strong>{executionType === "immediate" ? "Immediate" : `Drip (${dripCount} per batch, every ${dripMinutes}m)`}</strong></li>
                  </ul>
                </div>

                <div className="flex justify-between">
                  <button onClick={() => setCurrentStep("allocation")}
                    className="px-4 py-2 text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Back
                  </button>
                  <button onClick={handleExecute}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-[14px] font-semibold hover:bg-green-700 transition-all shadow-sm">
                    <Play size={16} /> Execute Distribution
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
