import type { Metadata } from "next";

import { DirectSendForm } from "@/components/direct-send/direct-send-form";

export const metadata: Metadata = {
  title: "Direct send",
};

const DirectSendPage = () => {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <section className="space-y-1">
        <h2 className="text-base font-semibold">Send with Cloudflare</h2>
        <p className="text-sm text-muted-foreground">
          This page sends through Cloudflare Email Sending. It does not use n8n. The from address
          must be on a domain you already onboarded, such as hello@novachkidev.com. hi@goodmedias.com
          works after goodmedias.com is onboarded on the same Cloudflare account.
        </p>
      </section>
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <DirectSendForm />
      </section>
    </div>
  );
};

export default DirectSendPage;
