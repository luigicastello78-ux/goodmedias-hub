# goodmedias hub

Outreach operations hub. It validates requests and hands them to n8n. The hub does not send mail itself.

## Setup

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
| --- | --- |
| `N8N_MODE` | `fixture` simulates webhooks. `live` calls n8n. |
| `N8N_WEBHOOK_SECRET` | Sent as `X-Webhook-Secret`. Same secret for manual send, bulk send, and progress callbacks. |
| `N8N_MANUAL_SEND_URL` | Manual send webhook. |
| `N8N_BULK_INGEST_URL` | Existing campaign queue webhook. |
| `N8N_BULK_SEND_URL` | Bulk drip webhook. Required only when someone starts a bulk job. |
| `N8N_INBOX_URL`, `N8N_THREAD_URL`, `N8N_SENDERS_URL` | Inbox and sender pool. |
| `N8N_TIMEOUT_MS` | Timeout for the existing webhooks. Bulk drip uses its own 20 second timeout. |
| `BULK_DB_PATH` | Optional SQLite file. Defaults to `data/goodmedias.sqlite`. |

```bash
npm install
npm run dev
```

Bulk jobs are stored in SQLite on this machine. Run one Node server (`npm run dev` or `npm start`). Do not run several instances against the same file.

## Bulk drip send

`POST /api/n8n/bulk-send` validates the list, stores one job id, and posts that id to `N8N_BULK_SEND_URL`. A retry uses the same job id. n8n refuses a duplicate for 30 days.

n8n sends the emails. This hub cannot cancel or pause a running job. Stop it by cancelling the execution in n8n.

### Progress callbacks

n8n posts progress to `POST /api/n8n/bulk-progress` with the same `X-Webhook-Secret`. The URL is not sent in the bulk payload. Set `CALLBACK_URL` in the n8n **Parse & Plan Job** node to:

```text
https://<public-host>/api/n8n/bulk-progress
```

`localhost` is not reachable from n8n. For local development, expose the hub with a tunnel such as ngrok or Cloudflare Tunnel, then put that public HTTPS URL in `CALLBACK_URL`.

Until the first callback arrives, the job page stays on **Queued in n8n** and says live progress is unavailable.

There is no unsubscribe list in the hub. Put an unsubscribe or opt-out line in the template.

Lists over 5,000 contacts are rejected. Split the file into another job.

### Try the n8n test webhook

Listen for a test event in n8n, then send two or three of your own addresses with a one-minute interval:

```bash
curl -X POST "https://<n8n-host>/webhook-test/goodmedias/bulk-send" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <N8N_WEBHOOK_SECRET>" \
  -d '{
    "jobId": "11111111-1111-4111-8111-111111111111",
    "from": { "email": "alex@goodmedias.com", "name": "Alex" },
    "drip": {
      "intervalMinutes": 1,
      "jitterSeconds": 0,
      "preSendPauseSeconds": { "min": 4, "max": 8 }
    },
    "template": {
      "subject": "Quick question, {{firstName|there}}",
      "bodyText": "Hi {{firstName|there}},\n\nReply stop if you would rather not hear from us."
    },
    "cc": "",
    "bcc": "",
    "contacts": [
      { "email": "you@example.com", "firstName": "Sam" },
      { "email": "colleague@example.com", "firstName": "Lee" }
    ]
  }'
```

Use a new `jobId` for each real test. Reusing a job id returns `status: "duplicate"` and does not send again.

Production URL: `https://<n8n-host>/webhook/goodmedias/bulk-send`.

## Scripts

```bash
npm run dev
npm test
npm run lint
npx tsc --noEmit
```
