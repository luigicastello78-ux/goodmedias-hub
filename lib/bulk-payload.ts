import type { BulkJob, BulkN8nPayload, BulkPreparedContact, BulkSendWindow } from "@/types/bulk-send";

export interface BulkPayloadSource {
  jobId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  cc: string;
  bcc: string;
  intervalMinutes: number;
  jitterSeconds: number;
  pauseMin: number;
  pauseMax: number;
  sendWindow: BulkSendWindow | null;
  contacts: BulkPreparedContact[];
}

export const buildBulkPayload = (source: BulkPayloadSource): BulkN8nPayload => {
  const payload: BulkN8nPayload = {
    jobId: source.jobId,
    from: source.fromName
      ? { email: source.fromEmail, name: source.fromName }
      : { email: source.fromEmail },
    drip: {
      intervalMinutes: source.intervalMinutes,
      jitterSeconds: source.jitterSeconds,
      preSendPauseSeconds: { min: source.pauseMin, max: source.pauseMax },
    },
    template: {
      subject: source.subject,
      bodyText: source.bodyText,
      ...(source.bodyHtml ? { bodyHtml: source.bodyHtml } : {}),
    },
    cc: source.cc,
    bcc: source.bcc,
    contacts: source.contacts.map((contact) => ({
      email: contact.email,
      ...contact.fields,
    })),
  };

  if (source.sendWindow) {
    payload.sendWindow = source.sendWindow;
  }

  return payload;
};

export const payloadSourceFromJob = (
  job: BulkJob,
  contacts: BulkPreparedContact[],
): BulkPayloadSource => ({
  jobId: job.jobId,
  fromEmail: job.fromEmail,
  fromName: job.fromName,
  subject: job.subject,
  bodyText: job.bodyText,
  bodyHtml: job.bodyHtml,
  cc: job.cc,
  bcc: job.bcc,
  intervalMinutes: job.intervalMinutes,
  jitterSeconds: job.jitterSeconds,
  pauseMin: job.pauseMin,
  pauseMax: job.pauseMax,
  sendWindow: job.sendWindow,
  contacts,
});
