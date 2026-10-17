"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Mail, Megaphone, UserRound, Users } from "lucide-react";

import { cn } from "cn";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/sent", label: "Sent", icon: Mail },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/account", label: "Account", icon: UserRound },
] as const;

export const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.href === "/account" ? false : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export const Sidebar = () => {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          G
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight">goodmedias hub</p>
          <p className="text-xs text-muted-foreground">Outreach operations</p>
        </div>
      </div>
      <div className="px-3 py-2">
        <SidebarNav />
      </div>
    </aside>
  );
};
