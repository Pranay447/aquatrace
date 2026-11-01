"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Droplets, ArrowRight, Eye, EyeOff, Radio } from "lucide-react";
export default function AuthForm({
  mode,
}: {
  mode: "user" | "admin" | "register";
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    if (register && f.get("password") !== f.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        "/api/auth/" + (register ? "register" : "login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            register
              ? {
                  name: f.get("name"),
                  email: f.get("email"),
                  password: f.get("password"),
                  adminRequested: f.get("accountType") === "admin",
                }
              : {
                  email: f.get("email"),
                  password: f.get("password"),
                  admin: mode === "admin",
                  remember: f.get("remember") === "on",
                },
          ),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Droplets />
          </span>
          AquaTrace
        </Link>
        <div>
          <span className="eyebrow">
            <Radio size={15} /> CONNECTED WATER. CLEARER INSIGHT.
          </span>
          <h1>
            Track pollution.
            <br />
            Trace the source.
          </h1>
          <p>
            Real-time water quality monitoring powered by distributed ESP32
            sensors.
          </p>
          <small>━━ &nbsp; Better data for healthier waterways.</small>
        </div>
      </section>
      <section className="auth-content">
        <header>
          <Link href="/">AquaTrace monitoring platform</Link>
          <Link href="/help">Need help?</Link>
        </header>
        <div className="auth-form">
          {!register && (
            <div className="segmented">
              <Link className={mode === "user" ? "selected" : ""} href="/login">
                User Login
              </Link>
              <Link
                className={mode === "admin" ? "selected" : ""}
                href="/admin/login"
              >
                Admin Login
              </Link>
            </div>
          )}
          <span className="badge safe">
            ●{" "}
            {register
              ? "JOIN THE NETWORK"
              : mode === "admin"
                ? "ADMINISTRATOR ACCESS"
                : "WELCOME TO AQUATRACE"}
          </span>
          <h2>
            {register
              ? "Create your account"
              : mode === "admin"
                ? "Manage your network."
                : "Welcome back."}
          </h2>
          <p className="muted">
            {register
              ? "Start monitoring the waterways that matter to you."
              : mode === "admin"
                ? "Sign in to access sensor management and system controls."
                : "Sign in to monitor water quality across your network."}
          </p>
          <form method="post" onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Maya Chen"
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={
                  mode === "admin"
                    ? "admin@aquatrace.io"
                    : "maya.chen@aquatrace.io"
                }
              />
            </label>
            <label>
              Password
              <div className="password-wrap">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  required
                  placeholder={
                    register ? "At least 12 characters" : "Enter your password"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register ? (
              <>
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label>
                  Account type
                  <select name="accountType">
                    <option value="user">Standard User</option>
                    <option value="admin">
                      Administrator (approval required)
                    </option>
                  </select>
                </label>
              </>
            ) : (
              <label className="checkbox">
                <input name="remember" type="checkbox" /> Remember me for 30
                days
              </label>
            )}
            {error && (
              <div role="alert" className="notice danger">
                {error}
              </div>
            )}
            <button className="primary button" disabled={busy}>
              {busy ? "Connecting…" : register ? "Create account" : "Login"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Login" : "Register"}
            </Link>
          </p>
          {mode === "admin" && (
            <small className="muted">
              Restricted access. Administrator accounts can add, configure and
              remove ESP32 devices.
            </small>
          )}
          {register && (
            <small className="muted">
              Administrator requests are reviewed by an existing administrator.
              Registration initially creates a standard user account.
            </small>
          )}
        </div>
        <footer>
          © 2026 AquaTrace <span>Environmental monitoring platform</span>
        </footer>
      </section>
    </main>
  );
}
