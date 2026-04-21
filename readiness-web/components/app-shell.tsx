"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList, LineChart, Plug, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark, Wordmark } from "./logo";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: Activity },
  { href: "/history", label: "Trends", icon: LineChart },
  { href: "/check-in", label: "Check-In", icon: ClipboardList },
  { href: "/integrations", label: "Sync", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isLogin = pathname.startsWith("/login");

  if (isLogin) {
    return <div className="min-h-dvh">{children}</div>;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 px-5 py-8 backdrop-blur md:flex">
        <div className="mb-10 flex items-center gap-2.5">
          <LogoMark className="text-[var(--color-accent)]" size={28} />
          <Wordmark />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <p className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Your daily edge
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Track. Understand. Recover.
          </p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/85 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-xl items-stretch">
          {NAV.map((item) => (
            <MobileLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        active
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-white",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "text-[var(--color-accent)]")} />
      <span>{item.label}</span>
    </Link>
  );
}

function MobileLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider",
        active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
      )}
    >
      <Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}
