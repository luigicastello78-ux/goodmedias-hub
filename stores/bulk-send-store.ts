"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ClientRequestError, getErrorMessage, isRetryableError, requestJson } from "@/lib/api-client";
import { bulkSendRequestSchema } from "@/lib/bulk-schema";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { BulkJob } from "@/types/bulk-send";

export interface BulkDraft {
  fileName: string | null;
  headers: string[];
  rows: Array<Record<string, string>>;
  parseWarnings: string[];
  emailColumn: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  cc: string;
  bcc: string;
  previewIndex: number;
  jobName: string;
  intervalMinutes: number;
  jitterSeconds: number;
  pauseMin: number;
  pauseMax: number;
  sendWindowEnabled: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
  timezoneCustomized: boolean;
  jobId: string | null;
  dispatchStatus: "idle" | "sending" | "error";
  dispatchError: string | null;
  dispatchRetryable: boolean;
}

const createInitialDraft = (): BulkDraft => ({
  fileName: null,
  headers: [],
  rows: [],
  parseWarnings: [],
  emailColumn: "",
  fromEmail: "",
  fromName: "",
  subject: "",
  bodyText: "",
  bodyHtml: "",
  cc: "",
  bcc: "",
  previewIndex: 0,
  jobName: "",
  intervalMinutes: 5,
  jitterSeconds: 45,
  pauseMin: 4,
  pauseMax: 22,
  sendWindowEnabled: false,
  timezone: "Europe/Skopje",
  startHour: 9,
  endHour: 17,
  weekdaysOnly: true,
  timezoneCustomized: false,
  jobId: null,
  dispatchStatus: "idle",
  dispatchError: null,
  dispatchRetryable: false,
});

interface BulkSendState extends BulkDraft {
  hasHydrated: boolean;
  setHydrated: (value: boolean) => void;
  applyCsv: (fileName: string, headers: string[], rows: Array<Record<string, string>>, warnings: string[]) => void;
  clearCsv: () => void;
  setEmailColumn: (column: string) => void;
  setFromEmail: (value: string) => void;
  setFromName: (value: string) => void;
  setSubject: (value: string) => void;
  setBodyText: (value: string) => void;
  setBodyHtml: (value: string) => void;
  setCc: (value: string) => void;
  setBcc: (value: string) => void;
  setPreviewIndex: (index: number) => void;
  setJobName: (value: string) => void;
  setIntervalMinutes: (value: number) => void;
  setJitterSeconds: (value: number) => void;
  setPauseMin: (value: number) => void;
  setPauseMax: (value: number) => void;
  setSendWindowEnabled: (value: boolean) => void;
  setTimezone: (value: string) => void;
  setStartHour: (value: number) => void;
  setEndHour: (value: number) => void;
  setWeekdaysOnly: (value: boolean) => void;
  submitBulkJob: () => Promise<BulkJob | null>;
}

const buildRequest = (state: BulkDraft, jobId: string) => ({
  jobId,
  name: state.jobName.trim(),
  from: {
    email: state.fromEmail.trim(),
    ...(state.fromName.trim() ? { name: state.fromName.trim() } : {}),
  },
  emailColumn: state.emailColumn,
  rows: state.rows,
  drip: {
    intervalMinutes: state.intervalMinutes,
    jitterSeconds: state.jitterSeconds,
    preSendPauseSeconds: { min: state.pauseMin, max: state.pauseMax },
  },
  sendWindow: state.sendWindowEnabled
    ? {
        timezone: state.timezone,
        startHour: state.startHour,
        endHour: state.endHour,
        weekdaysOnly: state.weekdaysOnly,
      }
    : null,
  template: {
    subject: state.subject,
    bodyText: state.bodyText,
    ...(state.bodyHtml.trim() ? { bodyHtml: state.bodyHtml } : {}),
  },
  cc: state.cc,
  bcc: state.bcc,
});

const clearAfterSuccess = (state: BulkDraft): Partial<BulkDraft> => ({
  fileName: null,
  headers: [],
  rows: [],
  parseWarnings: [],
  emailColumn: "",
  subject: "",
  bodyText: "",
  bodyHtml: "",
  cc: "",
  bcc: "",
  previewIndex: 0,
  jobName: "",
  jobId: null,
  dispatchStatus: "idle",
  dispatchError: null,
  dispatchRetryable: false,
  fromEmail: state.fromEmail,
  fromName: state.fromName,
});

export const useBulkSendStore = create<BulkSendState>()(
  persist(
    (set, get) => ({
      ...createInitialDraft(),
      hasHydrated: false,
      setHydrated: (hasHydrated) => set({ hasHydrated }),
      applyCsv: (fileName, headers, rows, parseWarnings) =>
        set((state) => ({
          fileName,
          headers,
          rows,
          parseWarnings,
          previewIndex: 0,
          jobName: state.jobName || fileName.replace(/\.csv$/i, ""),
          dispatchStatus: state.dispatchStatus === "error" ? "idle" : state.dispatchStatus,
          dispatchError: null,
          jobId: state.dispatchRetryable ? state.jobId : null,
        })),
      clearCsv: () =>
        set({
          fileName: null,
          headers: [],
          rows: [],
          parseWarnings: [],
          emailColumn: "",
          previewIndex: 0,
        }),
      setEmailColumn: (emailColumn) => set({ emailColumn, previewIndex: 0 }),
      setFromEmail: (fromEmail) => set({ fromEmail }),
      setFromName: (fromName) => set({ fromName }),
      setSubject: (subject) => set({ subject }),
      setBodyText: (bodyText) => set({ bodyText }),
      setBodyHtml: (bodyHtml) => set({ bodyHtml }),
      setCc: (cc) => set({ cc }),
      setBcc: (bcc) => set({ bcc }),
      setPreviewIndex: (previewIndex) => set({ previewIndex }),
      setJobName: (jobName) => set({ jobName }),
      setIntervalMinutes: (intervalMinutes) => set({ intervalMinutes }),
      setJitterSeconds: (jitterSeconds) => set({ jitterSeconds }),
      setPauseMin: (pauseMin) => set({ pauseMin }),
      setPauseMax: (pauseMax) => set({ pauseMax }),
      setSendWindowEnabled: (sendWindowEnabled) => set({ sendWindowEnabled }),
      setTimezone: (timezone) => set({ timezone, timezoneCustomized: true }),
      setStartHour: (startHour) => set({ startHour }),
      setEndHour: (endHour) => set({ endHour }),
      setWeekdaysOnly: (weekdaysOnly) => set({ weekdaysOnly }),
      submitBulkJob: async () => {
        const state = get();
        if (state.dispatchStatus === "sending") {
          return null;
        }

        const key = state.dispatchRetryable && state.jobId ? state.jobId : (state.jobId ?? createIdempotencyKey());
        const parsed = bulkSendRequestSchema.safeParse(buildRequest(state, key));
        if (!parsed.success) {
          set({
            dispatchStatus: "error",
            dispatchError: parsed.error.issues[0]?.message ?? "Check the form and try again.",
            dispatchRetryable: false,
            jobId: null,
          });
          return null;
        }

        set({ jobId: key, dispatchStatus: "sending", dispatchError: null });

        const createJob = () =>
          requestJson<{ ok: true; job: BulkJob }>("/api/n8n/bulk-send", {
            method: "POST",
            body: JSON.stringify(parsed.data),
          });
        const retryJob = () =>
          requestJson<{ ok: true; job: BulkJob }>(`/api/n8n/bulk-send/${key}/retry`, { method: "POST" });
        const loadJob = () => requestJson<{ ok: true; job: BulkJob }>(`/api/n8n/bulk-send/${key}`);

        try {
          let result: { job: BulkJob };
          if (state.dispatchRetryable && state.jobId) {
            try {
              result = await retryJob();
            } catch (error) {
              const message = getErrorMessage(error);
              if (message.includes("not found")) {
                result = await createJob();
              } else if (message.includes("only available")) {
                result = await loadJob();
              } else {
                throw error;
              }
            }
          } else {
            try {
              result = await createJob();
            } catch (error) {
              if (error instanceof ClientRequestError && error.message.includes("Use Retry submit")) {
                result = await retryJob();
              } else {
                throw error;
              }
            }
          }

          set(clearAfterSuccess(get()));
          return result.job;
        } catch (error) {
          const retryable = isRetryableError(error);
          set({
            dispatchStatus: "error",
            dispatchError: getErrorMessage(error),
            dispatchRetryable: retryable,
            jobId: retryable ? key : null,
          });
          return null;
        }
      },
    }),
    {
      name: "goodmedias-bulk-send-draft",
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: (state) => ({
        fileName: state.fileName,
        headers: state.headers,
        rows: state.rows,
        parseWarnings: state.parseWarnings,
        emailColumn: state.emailColumn,
        fromEmail: state.fromEmail,
        fromName: state.fromName,
        subject: state.subject,
        bodyText: state.bodyText,
        bodyHtml: state.bodyHtml,
        cc: state.cc,
        bcc: state.bcc,
        previewIndex: state.previewIndex,
        jobName: state.jobName,
        intervalMinutes: state.intervalMinutes,
        jitterSeconds: state.jitterSeconds,
        pauseMin: state.pauseMin,
        pauseMax: state.pauseMax,
        sendWindowEnabled: state.sendWindowEnabled,
        timezone: state.timezone,
        startHour: state.startHour,
        endHour: state.endHour,
        weekdaysOnly: state.weekdaysOnly,
        timezoneCustomized: state.timezoneCustomized,
        jobId: state.jobId,
        dispatchStatus: state.dispatchStatus === "sending" ? "idle" : state.dispatchStatus,
        dispatchError: state.dispatchError,
        dispatchRetryable: state.dispatchRetryable,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          useBulkSendStore.setState({ hasHydrated: true });
          return;
        }
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        useBulkSendStore.setState((current) => ({
          hasHydrated: true,
          timezone: !current.timezoneCustomized && detected ? detected : current.timezone,
        }));
      },
    },
  ),
);
