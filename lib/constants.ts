export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 1000;
export const PREVIEW_ROW_COUNT = 20;
export const MAX_JSON_BYTES = 3 * 1024 * 1024;
export const BULK_MAX_CONTACTS = 5000;
export const BULK_MAX_CSV_BYTES = 8 * 1024 * 1024;
export const BULK_MAX_JSON_BYTES = 12 * 1024 * 1024;
export const BULK_SUBMIT_TIMEOUT_MS = 20_000;
export const BULK_POLL_INTERVAL_MS = 12_000;

export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

export const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Belgrade",
  "Europe/Skopje",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;
