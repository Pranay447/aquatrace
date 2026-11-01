"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Droplets,
  LayoutDashboard,
  Map,
  Radio,
  GitCompareArrows,
  ChartNoAxesColumnIncreasing,
  Bell,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Wifi,
  Menu,
  X,
} from "lucide-react";
import type { UserDTO } from "@/lib/domain";
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["map", "Live Map", Map],
  ["sensors", "Sensors", Radio],
  ["compare", "Compare Sensors", GitCompareArrows],
  ["leaderboard", "Leaderboard", ChartNoAxesColumnIncreasing],
  ["alerts", "Alerts", Bell],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["settings", "Settings", Settings],
] as const;
export default function Workspace({
  user,
  children,
  localMode = false,
}: {
  user: UserDTO;
  children: React.ReactNode;
  localMode?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const active = nav.find((n) => path.startsWith("/" + n[0]));
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  async function logout() {
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      router.push("/login");
      router.refresh();
    } catch {
      setError("Could not log out. Try again.");
    }
  }
  return (
    <div className="workspace">
      <aside
        id="workspace-navigation"
        className={"sidebar " + (open ? "open" : "")}
      >
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Droplets />
          </span>
          AquaTrace
        </Link>
        <div className="network-label">MONITORING WORKSPACE</div>
        <div className="network-name">
          {localMode ? "Local demonstration" : "East River network"}
        </div>
        <nav>
          {nav.map(([slug, label, Icon]) => (
            <Link
              key={slug}
              onClick={() => setOpen(false)}
              className={active?.[0] === slug ? "active" : ""}
              href={"/" + slug}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="uplink">
            <Wifi size={16} /> ESP32 monitoring network
            <small>Live telemetry · Protected workspace</small>
          </div>
          <div className="profile">
            <span className="avatar">{initials}</span>
            <div>
              <b>{user.name}</b>
              <small>
                {user.role === "ADMIN"
                  ? "Administrator"
                  : "Environmental analyst"}
              </small>
            </div>
          </div>
          <button onClick={logout} className="logout">
            <LogOut size={17} />
            Logout
          </button>
          {error && <small role="alert">{error}</small>}
        </div>
      </aside>
      {open && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="workspace-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <span className="muted">Workspace &nbsp; / &nbsp;</span>{" "}
            {active?.[1] ?? "Sensor detail"}
          </div>
          <div className="row">
            <Link
              href="/alerts"
              className="icon-button"
              aria-label="View alerts"
            >
              <Bell size={20} />
            </Link>
            <span className="avatar">{initials}</span>
            <div className="top-profile">
              <b>{user.name}</b>
              <small>
                {user.role === "ADMIN"
                  ? "Administrator"
                  : "Environmental analyst"}
              </small>
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
