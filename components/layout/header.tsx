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
  "/inbox": "Inbox",
  "/campaigns": "Campaigns",
  "/direct-send": "Direct send",
};

export const Header = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = PAGE_TITLES[pathname] ?? "goodmedias hub";

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
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
