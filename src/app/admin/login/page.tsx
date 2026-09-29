"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
    }
  }

  return (
    <main className="wrap">
      <form className="card login" onSubmit={submit}>
        <h1 style={{ fontSize: 22 }}>
          HR<span style={{ color: "var(--blue)" }}>360</span> · share links
        </h1>
        <p className="muted" style={{ margin: "6px 0 16px" }}>Sign in to create or close investor links.</p>
        <label htmlFor="password">Admin password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
