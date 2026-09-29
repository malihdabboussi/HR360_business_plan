export default function Home() {
  return (
    <main className="wrap" style={{ maxWidth: 640, paddingTop: "12vh" }}>
      <div className="card">
        <h1 style={{ fontSize: 26 }}>
          HR<span style={{ color: "var(--blue)" }}>360</span> business plan
        </h1>
        <p style={{ color: "var(--ink2)", marginTop: 10 }}>
          This plan is shared privately. If you received a link from HR360, open that link directly: it contains your personal
          access code.
        </p>
        <p className="muted">Team access: <a href="/admin">manage share links</a>.</p>
        <div className="stripe">
          <i style={{ background: "var(--blue)" }} />
          <i style={{ background: "var(--cyan)" }} />
          <i style={{ background: "var(--amber)" }} />
          <i style={{ background: "var(--orange)" }} />
        </div>
      </div>
    </main>
  );
}
