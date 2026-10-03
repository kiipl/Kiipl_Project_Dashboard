"use client";
import { useEffect, useState } from "react";

type Info = { name: string | null; business: string; timezone: string; minutes: number; slots: { start: string; day: string; time: string }[] };

/* Public page behind the signed link in outreach emails: pick a slot → calendar invite. */
export default function BookingPage({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ label: string; meetLink: string | null } | null>(null);

  useEffect(() => {
    fetch(`/api/book?token=${encodeURIComponent(token)}`).then(async (r) => {
      const d = await r.json();
      r.ok ? setInfo(d) : setError(d.error);
    }).catch(() => setError("Could not load available times."));
  }, [token]);

  const book = async () => {
    setSaving(true);
    setError("");
    const r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, start: picked }) });
    const d = await r.json();
    setSaving(false);
    r.ok ? setDone(d) : setError(d.error);
  };

  // Group slots by day ("Monday, 6 October") for a compact picker.
  const days = new Map<string, { start: string; time: string }[]>();
  info?.slots.forEach((s) => days.set(s.day, [...(days.get(s.day) ?? []), { start: s.start, time: s.time }]));

  return (
    <main className="login-shell">
      <section className="login-card booking-card">
        <div className="login-brand">
          <div className="login-logo">K</div>
          <h1>{done ? "You're booked!" : `Book a call${info?.business ? ` with ${info.business}` : ""}`}</h1>
        </div>
        {done ? (
          <p className="login-loading">
            {done.label}. A calendar invite is on its way.
            {done.meetLink && <><br /><a href={done.meetLink}>Join link</a></>}
          </p>
        ) : !info ? (
          <p className="login-loading">{error || "Loading available times…"}</p>
        ) : (
          <>
            <p className="login-loading">{info.name ? `Hi ${info.name}, pick` : "Pick"} a {info.minutes}-minute slot ({info.timezone}).</p>
            {info.slots.length === 0 && <p className="login-loading">No open slots right now — just reply to our email and we'll find a time.</p>}
            <div className="slot-days">
              {[...days].map(([day, times]) => (
                <div key={day}>
                  <p className="slot-day">{day}</p>
                  <div className="slot-grid">
                    {times.map((t) => (
                      <button key={t.start} type="button" className={`slot ${picked === t.start ? "picked" : ""}`} onClick={() => setPicked(t.start)}>{t.time}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="notice">{error}</p>}
            <button className="login-btn" disabled={!picked || saving} onClick={book}>{saving ? "Booking…" : "Confirm booking"}</button>
          </>
        )}
      </section>
    </main>
  );
}
