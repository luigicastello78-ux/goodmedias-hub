"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIMEZONE_OPTIONS, WEEKDAYS } from "@/lib/constants";
import { toSchedulePayload } from "@/lib/schedule";
import { requestJson, getErrorMessage } from "@/lib/api-client";
import { useCampaignStore } from "@/stores/campaign-store";
import type { SendersResponse } from "@/types/inbox";

const parseInteger = (value: string): number | null => {
  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }
  return Number(value);
};

export const ScheduleForm = () => {
  const campaignName = useCampaignStore((state) => state.campaignName);
  const schedule = useCampaignStore((state) => state.schedule);
  const senderPool = useCampaignStore((state) => state.senderPool);
  const setCampaignName = useCampaignStore((state) => state.setCampaignName);
  const updateSchedule = useCampaignStore((state) => state.updateSchedule);
  const toggleDay = useCampaignStore((state) => state.toggleDay);
  const toggleSender = useCampaignStore((state) => state.toggleSender);
  const [senders, setSenders] = useState<SendersResponse["senders"]>([]);
  const [sendersError, setSendersError] = useState<string | null>(null);
  const [sendersLoading, setSendersLoading] = useState(true);
  const scheduleResult = toSchedulePayload(schedule);

  const loadSenders = async () => {
    setSendersLoading(true);
    setSendersError(null);
    try {
      const data = await requestJson<SendersResponse>("/api/n8n/senders");
      setSenders(data.senders);
    } catch (error) {
      setSendersError(getErrorMessage(error));
    } finally {
      setSendersLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await requestJson<SendersResponse>("/api/n8n/senders");
        if (!cancelled) {
          setSenders(data.senders);
        }
      } catch (error) {
        if (!cancelled) {
          setSendersError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setSendersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNumber =
    (key: "startHour" | "endHour" | "minDelaySeconds" | "maxDelaySeconds" | "maxPerDay") =>
    (value: string) => {
      const parsed = parseInteger(value);
      if (parsed === null) {
        return;
      }
      updateSchedule({ [key]: parsed });
    };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="campaign-name">Campaign name</Label>
        <Input
          id="campaign-name"
          value={campaignName}
          onChange={(event) => setCampaignName(event.target.value)}
          placeholder="October Northwind outreach"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            list="timezone-options"
            value={schedule.timezone}
            onChange={(event) => updateSchedule({ timezone: event.target.value })}
          />
          <datalist id="timezone-options">
            {TIMEZONE_OPTIONS.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start-at">Start time</Label>
          <div className="flex gap-2">
            <Input
              id="start-at"
              type="datetime-local"
              value={schedule.startAtLocal}
              onChange={(event) => updateSchedule({ startAtLocal: event.target.value })}
            />
            {schedule.startAtLocal ? (
              <Button type="button" variant="outline" onClick={() => updateSchedule({ startAtLocal: "" })}>
                Clear
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Leave empty to start when n8n accepts the batch.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Send days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => {
            const pressed = schedule.daysOfWeek.includes(day.value);
            return (
              <Button
                key={day.label}
                type="button"
                variant={pressed ? "default" : "outline"}
                aria-pressed={pressed}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["start-hour", "Start hour", "startHour", schedule.startHour],
            ["end-hour", "End hour", "endHour", schedule.endHour],
            ["min-delay", "Min delay (sec)", "minDelaySeconds", schedule.minDelaySeconds],
            ["max-delay", "Max delay (sec)", "maxDelaySeconds", schedule.maxDelaySeconds],
            ["daily-cap", "Daily cap", "maxPerDay", schedule.maxPerDay],
          ] as const
        ).map(([id, label, key, value]) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              inputMode="numeric"
              value={String(value)}
              onChange={(event) => handleNumber(key)(event.target.value)}
            />
          </div>
        ))}
      </div>

      {!scheduleResult.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {scheduleResult.error}
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sender pool</legend>
        <p className="text-xs text-muted-foreground">
          Leave this empty and n8n uses its configured rotation. Selected addresses are an allow-list only.
        </p>
        {sendersLoading ? <p className="text-sm text-muted-foreground">Loading sender addresses…</p> : null}
        {sendersError ? (
          <StatusAlert
            variant="destructive"
            title="Senders unavailable"
            message={sendersError}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => void loadSenders()}>
                Retry
              </Button>
            }
          />
        ) : null}
        <div className="space-y-2">
          {senders.map((sender) => {
            const id = `sender-${sender.email}`;
            return (
              <div key={sender.email} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={senderPool.includes(sender.email)}
                  onCheckedChange={(checked) => {
                    const selected = senderPool.includes(sender.email);
                    if (checked === true && !selected) {
                      toggleSender(sender.email);
                    }
                    if (checked !== true && selected) {
                      toggleSender(sender.email);
                    }
                  }}
                />
                <Label htmlFor={id}>
                  {sender.name ? `${sender.name} · ${sender.email}` : sender.email}
                </Label>
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
};
