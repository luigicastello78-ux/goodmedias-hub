import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api-error";

const CLOUDFLARE_ERROR_HINTS: Record<number, string> = {
  10001: "Cloudflare rejected the email format.",
  10101: "The Cloudflare API token was rejected.",
  10102: "The Cloudflare API token is not allowed to send email.",
  10105: "This Cloudflare account is not enabled for Email Sending.",
  10200: "The email is larger than Cloudflare allows.",
  10202: "Cloudflare rejected the email content.",
  10203: "Email sending is turned off for this domain. Onboard it in Cloudflare Email Sending.",
  10204: "That from address is not set up in Cloudflare Email Sending. Onboard the domain, then try again.",
  10004: "Cloudflare rate-limited this send. Wait a moment and try again.",
};

export const directSendRequestSchema = z.object({
  fromEmail: z.email("Enter a valid from address."),
  fromName: z.string().trim().max(120, "From name is too long.").optional(),
  toEmail: z.email("Enter a valid recipient address."),
  subject: z.string().trim().min(1, "Subject is required.").max(200, "Subject is too long."),
  bodyText: z.string().trim().min(1, "Message is required.").max(50000, "Message is too long."),
});

export type DirectSendRequest = z.infer<typeof directSendRequestSchema>;

export interface DirectSendResult {
  ok: true;
  delivered: string[];
  queued: string[];
  permanentBounces: string[];
}

interface CloudflareErrorItem {
  code?: number;
  message?: string;
}

interface CloudflareSendResponse {
  success?: boolean;
  errors?: CloudflareErrorItem[];
  result?: {
    delivered?: string[];
    permanent_bounces?: string[];
    queued?: string[];
    suppressed_recipients?: string[];
  } | null;
}

const readConfig = (): { token: string; accountId: string } => {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  if (!token || !accountId) {
    throw new ApiError(500, "UPSTREAM", "Cloudflare Email Sending is not configured.", false);
  }
  return { token, accountId };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toHtml = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

const formatFrom = (fromEmail: string, fromName: string | undefined): string => {
  const name = fromName?.trim();
  if (!name) {
    return fromEmail;
  }
  const safeName = name.replace(/[<>"]/g, "").trim();
  if (!safeName) {
    return fromEmail;
  }
  return `${safeName} <${fromEmail}>`;
};

const cloudflareMessage = (body: CloudflareSendResponse | null, status: number): string => {
  const first = body?.errors?.[0];
  if (first?.code && CLOUDFLARE_ERROR_HINTS[first.code]) {
    return CLOUDFLARE_ERROR_HINTS[first.code];
  }
  if (first?.message) {
    return first.message;
  }
  if (status === 401 || status === 403) {
    return "Cloudflare refused this send. Check that the from domain is onboarded for Email Sending.";
  }
  return "Cloudflare did not accept the email.";
};

export const sendDirectEmail = async (input: DirectSendRequest): Promise<DirectSendResult> => {
  const { token, accountId } = readConfig();

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: formatFrom(input.fromEmail, input.fromName),
          to: input.toEmail,
          subject: input.subject,
          text: input.bodyText,
          html: toHtml(input.bodyText),
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch {
    throw new ApiError(502, "UPSTREAM", "Could not reach Cloudflare Email Sending.", true);
  }

  const json = (await response.json().catch(() => null)) as CloudflareSendResponse | null;
  if (!response.ok || json?.success === false) {
    const retryable = response.status >= 500 || response.status === 429;
    throw new ApiError(response.status || 502, retryable ? "UPSTREAM" : "VALIDATION", cloudflareMessage(json, response.status), retryable);
  }

  const delivered = json?.result?.delivered ?? [];
  const queued = json?.result?.queued ?? [];
  const permanentBounces = json?.result?.permanent_bounces ?? [];
  const suppressed = json?.result?.suppressed_recipients ?? [];

  if (delivered.length === 0 && queued.length === 0) {
    const detail = permanentBounces.length > 0
      ? `Cloudflare permanently bounced ${permanentBounces.join(", ")}.`
      : suppressed.length > 0
        ? `Cloudflare suppressed ${suppressed.join(", ")}.`
        : "Cloudflare accepted the request but did not deliver the email.";
    throw new ApiError(502, "UPSTREAM", detail, false);
  }

  return {
    ok: true,
    delivered,
    queued,
    permanentBounces,
  };
};
