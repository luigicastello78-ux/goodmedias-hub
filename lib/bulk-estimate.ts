export interface BulkEstimate {
  totalSeconds: number;
  finishAt: string;
  windowMayExtend: boolean;
  label: string;
}

const formatRoughDuration = (totalSeconds: number): string => {
  const roundedMinutes = Math.round(totalSeconds / 60);
  if (roundedMinutes <= 0) {
    return "less than a minute";
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  return parts.join(" ");
};

export const estimateBulkDuration = (input: {
  contactCount: number;
  intervalMinutes: number;
  pauseMin: number;
  pauseMax: number;
  sendWindowEnabled: boolean;
  now?: Date;
}): BulkEstimate => {
  const contactCount = Math.max(0, input.contactCount);
  const averagePause = (input.pauseMin + input.pauseMax) / 2;
  const totalSeconds =
    contactCount === 0 ? 0 : (contactCount - 1) * input.intervalMinutes * 60 + contactCount * averagePause;
  const now = input.now ?? new Date();
  const finishAt = new Date(now.getTime() + totalSeconds * 1000);
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(finishAt);
  const noun = contactCount === 1 ? "email" : "emails";

  return {
    totalSeconds,
    finishAt: finishAt.toISOString(),
    windowMayExtend: input.sendWindowEnabled,
    label: `About ${formatRoughDuration(totalSeconds)} for ${contactCount} ${noun}, finishing around ${when}`,
  };
};
