"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Megaphone, Upload, UserRound, Users } from "lucide-react";

import { cn } from "cn";

const NAV_ITEMS = [
  { href: "/sent", label: "Sent", icon: Mail },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/distribution", label: "Distribution", icon: Upload },
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
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export const Sidebar = () => {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
          G
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight">Goodmedias Hub</p>
          <p className="text-[11px] text-muted-foreground">Outreach operations</p>
        </div>
      </div>
      <div className="flex-1 px-3 py-3">
        <SidebarNav />
      </div>
    </aside>
  );
};
