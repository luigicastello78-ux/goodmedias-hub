"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const PAGE_TITLES: Record<string, string> = {
  "/campaigns": "Campaigns",
  "/contacts": "Contacts",
  "/sent": "Sent",
  "/distribution": "Distribution",
  "/account": "Account",
};

const titleForPath = (pathname: string): string => {
  if (pathname.startsWith("/bulk-send/jobs/")) {
    return "Bulk job";
  }
  if (pathname.startsWith("/bulk-send")) {
    return "Bulk send";
  }
  if (pathname.startsWith("/sent/")) {
    return "Sent message";
  }
  if (pathname.startsWith("/campaigns/batches/")) {
    return "Campaign batch";
  }
  if (pathname.startsWith("/campaigns/batches")) {
    return "Campaign batches";
  }
  return PAGE_TITLES[pathname] ?? "goodmedias hub";
};

export const Header = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = titleForPath(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>goodmedias hub</SheetTitle>
            <SheetDescription>Outreach operations</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase md:hidden">
          goodmedias hub
        </p>
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
      </div>
    </header>
  );
};
