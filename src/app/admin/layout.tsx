"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) {
      setChecked(false);
      return;
    }
    let cancelled = false;
    setChecked(false);
    async function check() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/admin/login");
        return;
      }
      const { data } = await supabase.from("users").select("role").eq("id", session.user.id).single();
      if (cancelled) return;
      if (data?.role?.toLowerCase() !== "admin") {
        router.replace("/admin/login");
        return;
      }
      setChecked(true);
    }
    void check().catch(() => {
      if (!cancelled) {
        setChecked(false);
        router.replace("/admin/login");
      }
    });
    return () => { cancelled = true; };
  }, [isLogin, router]);

  async function handleLogout() {
    setChecked(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  if (!checked && !isLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-zinc-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-700">
          <Link href="/admin/dashboard" className="font-bold text-lg">
            JUHD Dash
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink href="/admin/dashboard" icon="📊" label="Dashboard" active={pathname === "/admin/dashboard"} />
          <NavLink
            href="/admin/analytics-dashboard"
            icon="📈"
            label="Growth analytics"
            active={pathname === "/admin/analytics-dashboard"}
          />
          <NavLink href="/admin/users" icon="👥" label="Users" active={pathname === "/admin/users"} />
          <NavLink href="/admin/analytics" icon="📈" label="Analytics" active={pathname === "/admin/analytics"} />
          <NavLink href="/admin/insights" icon="📋" label="Insights" active={pathname === "/admin/insights"} />
          {process.env.NEXT_PUBLIC_RELEASE_CONTROLS_ENABLED === "1" && <NavLink href="/admin/releases" icon="📣" label="Updates & banners" active={pathname === "/admin/releases"} />}
          <NavLink href="/admin/notifications" icon="📢" label="Notifications" active={pathname === "/admin/notifications"} />
          <NavLink href="/admin/reports" icon="🚩" label="Reports" active={pathname === "/admin/reports"} />
          <NavLink href="/admin/bug-reports" icon="🐛" label="Bug Reports" active={pathname === "/admin/bug-reports"} />
          <NavLink href="/admin/error-logs" icon="⚠️" label="Error Logs" active={pathname === "/admin/error-logs"} />
        </nav>
        <div className="p-4 border-t border-zinc-700">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-zinc-100 dark:bg-zinc-900 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
