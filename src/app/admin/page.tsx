"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Link = {
  token: string;
  label: string;
  note?: string;
  createdAt: string;
  expiresAt?: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  views: number;
  lastViewedAt?: string | null;
  status: "active" | "revoked" | "expired";
  url: string;
  urlAr: string;
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPage() {
  const router = useRouter();
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/links", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setLinks(data.links ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, note, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the link");
      return;
    }
    setLabel("");
    setNote("");
    setExpiresAt("");
    setNotice(`Link created for ${data.link.label}. Copy it from the list below.`);
    await load();
  }

  async function act(token: string, action: "revoke" | "restore") {
    setError(null);
    const res = await fetch(`/api/admin/links/${token}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) setError("Action failed");
    await load();
  }

  async function remove(token: string, lbl: string) {
    if (!confirm(`Delete the link for "${lbl}" permanently? Anyone holding it will see "link not available".`)) return;
    const res = await fetch(`/api/admin/links/${token}`, { method: "DELETE" });
    if (!res.ok) setError("Delete failed");
    await load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Link copied to the clipboard.");
    } catch {
      setNotice(text);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  const active = links.filter((l) => l.status === "active").length;
  const views = links.reduce((s, l) => s + (l.views ?? 0), 0);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          HR<span>360</span> · business plan share links
        </div>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </header>
      <main className="wrap">
        <div className="kpis">
          <div className="kpi"><span>Active links</span><b>{active}</b></div>
          <div className="kpi"><span>All links</span><b>{links.length}</b></div>
          <div className="kpi"><span>Total views</span><b>{views}</b></div>
        </div>

        <form className="card" onSubmit={create}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Create a new share link</h2>
          <div className="grid">
            <div>
              <label htmlFor="label">For (investor, fund or person)</label>
              <input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sarah · Berytech" required />
            </div>
            <div>
              <label htmlFor="expires">Expires (optional)</label>
              <input id="expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div>
              <label htmlFor="note">Note (optional)</label>
              <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context, meeting date…" />
            </div>
            <div>
              <button className="btn primary" type="submit" disabled={creating}>{creating ? "Creating…" : "Create link"}</button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          {notice && <p className="ok">{notice}</p>}
          <p className="muted" style={{ marginTop: 10 }}>
            Each link is a private, unguessable address. Revoke it to stop access immediately; restore it to reopen; delete it to remove the record.
            Every link also has an Arabic version.
          </p>
        </form>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>For</th>
                <th>Status</th>
                <th>Views</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="muted">Loading…</td></tr>
              )}
              {!loading && links.length === 0 && (
                <tr><td colSpan={7} className="muted">No links yet. Create the first one above.</td></tr>
              )}
              {links.map((l) => (
                <tr key={l.token}>
                  <td>
                    <b>{l.label}</b>
                    {l.note && <div className="muted">{l.note}</div>}
                  </td>
                  <td><span className={`pill ${l.status}`}>{l.status}</span></td>
                  <td>
                    {l.views ?? 0}
                    <div className="muted">last {fmt(l.lastViewedAt)}</div>
                  </td>
                  <td>{fmt(l.createdAt)}</td>
                  <td>{l.expiresAt ? fmt(l.expiresAt) : "never"}</td>
                  <td>
                    <div className="mono">{l.url}</div>
                    <div className="actions" style={{ marginTop: 6 }}>
                      <button className="btn sm" type="button" onClick={() => copy(l.url)}>Copy EN</button>
                      <button className="btn sm" type="button" onClick={() => copy(l.urlAr)}>Copy AR</button>
                      <a className="btn sm" href={l.url} target="_blank" rel="noreferrer">Open</a>
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      {l.status === "revoked" ? (
                        <button className="btn sm" type="button" onClick={() => act(l.token, "restore")}>Restore</button>
                      ) : (
                        <button className="btn sm danger" type="button" onClick={() => act(l.token, "revoke")}>Revoke</button>
                      )}
                      <button className="btn sm danger" type="button" onClick={() => remove(l.token, l.label)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
