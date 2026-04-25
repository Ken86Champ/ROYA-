"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/dashboard",              label: "Dashboard",      icon: "⬡" },
  { href: "/dashboard/campaigns",    label: "Kampagnen",      icon: "◎" },
  { href: "/dashboard/contacts",     label: "Kontakte",       icon: "◉" },
  { href: "/dashboard/conversations",label: "Gespräche",      icon: "◬" },
  { href: "/dashboard/escalations",  label: "Eskalationen",   icon: "⚠" },
  { href: "/dashboard/clients",      label: "Endkunden",      icon: "◈" },
  { href: "/dashboard/appointments", label: "Termine",        icon: "◇" },
  { href: "/dashboard/setup",         label: "Agent Setup",    icon: "✦" },
  { href: "/dashboard/simulation",   label: "Simulation",     icon: "▷" },
  { href: "/dashboard/settings",     label: "Einstellungen",  icon: "⚙" },
];

function getPageTitle(pathname: string): string {
  const match = navItems.find((item) =>
    pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );
  return match?.label || "Uebersicht";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  const [planInfo, setPlanInfo] = useState<{
    planLabel: string; contactsPercent: number;
    usage: { contacts: number }; limits: { maxContacts: number };
    subscriptionStatus: string;
  } | null>(null);

  useEffect(() => {
    // Acquire dashboard session cookie FIRST, then load data
    fetch("/api/auth/session", { method: "POST" }).then(() => {
      fetch("/api/billing/status").then(r => r.json()).then(setPlanInfo).catch(() => {});
    }).catch(() => {
      // Fallback: try loading anyway (dev mode localhost bypass)
      fetch("/api/billing/status").then(r => r.json()).then(setPlanInfo).catch(() => {});
    });
  }, []);

  return (
    <div className="flex h-screen bg-[#0A0A0F]">
      {/* Sidebar — hell */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-violet-200">
              R
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">ROYA</h1>
              <p className="text-[11px] text-slate-400 font-medium">Revenue Reactivation</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="px-3 mb-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Navigation
            </span>
          </div>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive ? "nav-item-active" :
                  (item as any).highlight ? "nav-item bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100" :
                  "nav-item"
                }
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-3">
          <div className="mx-2 p-3 rounded-xl bg-violet-50 border border-violet-100">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">{planInfo?.planLabel || "Starter"} Plan</span>
              <span className="badge bg-violet-100 text-violet-600 text-[10px]">
                {planInfo?.subscriptionStatus === "active" ? "Aktiv" : planInfo?.subscriptionStatus === "past_due" ? "Offen" : "Aktiv"}
              </span>
            </div>
            <div className="w-full h-1.5 bg-violet-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all"
                style={{ width: `${planInfo?.contactsPercent ?? 33}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {planInfo
                ? `${planInfo.usage.contacts.toLocaleString()} / ${planInfo.limits.maxContacts === Infinity ? "∞" : planInfo.limits.maxContacts.toLocaleString()} Kontakte`
                : "Lädt…"}
            </p>
          </div>

          <Link href="/dashboard/settings" className="mx-2 flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 font-medium truncate">Agentur Demo</p>
              <p className="text-[11px] text-slate-400 truncate">admin@roya.ch</p>
            </div>
            <span className="text-slate-300 text-xs">···</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar — hell */}
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{pageTitle}</h2>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-400">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="status-dot-green" />
              <span>System Online</span>
            </div>
            <Link href="/dashboard/settings" className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all">
              <span className="text-sm">⚙</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
