"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { notifySrc } from "./notify-src";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  name: string;
  email: string;
  lastMessage: string;
  lastAuthor: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

const filters = [
  { id: "all", label: "All Chats" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

const statuses = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

function stamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} at ${time}`;
}

function statusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  if (status === "resolved") return "Resolved";
  if (status === "closed") return "Closed";
  return "Open";
}

function mark(ticket: Ticket) {
  const date = new Date(ticket.updatedAt || ticket.createdAt);
  const time = Number.isNaN(date.getTime()) ? "" : date.toISOString();
  return `${ticket.status}|${ticket.lastAuthor}|${ticket.lastMessage}|${time}`;
}

function ring(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.muted = false;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function TicketDesk({ initial }: { initial: Ticket[] }) {
  const [tickets, setTickets] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const seen = useRef(new Map(initial.map((ticket) => [ticket.id, mark(ticket)])));
  const openRef = useRef("");
  openRef.current = selected;
  const sound = useRef<HTMLAudioElement | null>(null);
  const primed = useRef(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (filter !== "all" && ticket.status !== filter) return false;
      if (!needle) return true;
      return `${ticket.subject} ${ticket.name} ${ticket.email}`.toLowerCase().includes(needle);
    });
  }, [tickets, filter, query]);

  const current = tickets.find((ticket) => ticket.id === selected) || null;

  useEffect(() => {
    const audio = new Audio(notifySrc);
    audio.preload = "auto";
    sound.current = audio;
    function unlock() {
      if (audio.dataset.ready === "1") return;
      audio.muted = true;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.dataset.ready = "1";
      }).catch(() => {});
    }
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let stop = false;
    function pull() {
      fetch("/api/admin/tickets")
        .then((response) => response.json())
        .then((data) => {
          if (stop || !Array.isArray(data.tickets)) return;
          const next = data.tickets as Ticket[];
          if (!primed.current) {
            primed.current = true;
            seen.current = new Map(next.map((ticket) => [ticket.id, mark(ticket)]));
            setTickets(next);
            return;
          }
          const arrived: string[] = [];
          let shouldRing = false;
          let listChanged = next.length !== seen.current.size;
          const ids = new Set<string>();
          for (const ticket of next) {
            ids.add(ticket.id);
            const previous = seen.current.get(ticket.id);
            const currentMark = mark(ticket);
            if (previous !== currentMark) listChanged = true;
            const previousMessage = previous?.split("|").slice(1).join("|");
            const currentMessage = currentMark.split("|").slice(1).join("|");
            if (previousMessage !== currentMessage && ticket.lastAuthor === "user") {
              shouldRing = true;
              if (ticket.id !== openRef.current) arrived.push(ticket.id);
            }
            seen.current.set(ticket.id, currentMark);
          }
          for (const id of seen.current.keys()) {
            if (!ids.has(id)) {
              seen.current.delete(id);
              listChanged = true;
            }
          }
          if (listChanged) setTickets(next);
          if (!shouldRing) return;
          ring(sound.current);
          setFresh(arrived);
          setCounts((current) => {
            const next = { ...current };
            for (const id of arrived) next[id] = (next[id] || 0) + 1;
            return next;
          });
          setToast("New ticket message received");
        })
        .catch(() => {});
    }
    pull();
    const timer = window.setInterval(pull, 5000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    const ticket = tickets.find((item) => item.id === selected);
    if (ticket) setStatus(ticket.status);
    fetch(`/api/admin/tickets?id=${selected}`)
      .then((response) => response.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]));
  }, [selected, tickets]);

  function send(nextStatus = status, message = reply) {
    if (!current || busy) return;
    setBusy(true);
    setNote("");
    fetch("/api/admin/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id, message, status: nextStatus }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setNote(data.error || "Could not send");
          return;
        }
        if (message) setReply("");
        setTickets((list) => list.map((ticket) => (
          ticket.id === current.id ? { ...ticket, status: nextStatus, lastMessage: message || ticket.lastMessage, lastAuthor: message ? "admin" : ticket.lastAuthor } : ticket
        )));
        setStatus(nextStatus);
        setNote(message ? "Reply sent" : "Status saved");
      })
      .catch(() => setNote("Could not send"))
      .finally(() => setBusy(false));
  }

  return (
    <div className={selected ? "ticket-desk is-open" : "ticket-desk"}>
      <aside className="ticket-list">
        <div className="ticket-list__head">
          <h2>Tickets</h2>
          <label className="ticket-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" aria-label="Search tickets" />
          </label>
          <select value={filter} aria-label="All Chats" onChange={(event) => setFilter(event.target.value)}>
            {filters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="ticket-rows">
        {visible.length === 0 ? <p className="empty">No tickets in this list.</p> : visible.map((ticket) => {
          const count = counts[ticket.id] || 0;
          const done = ticket.status === "closed";
          return (
            <button key={ticket.id} type="button" className={["ticket-row", ticket.id === selected ? "is-selected" : "", fresh.includes(ticket.id) ? "is-fresh" : ""].filter(Boolean).join(" ")} onClick={() => {
              setSelected(ticket.id);
              setCounts((current) => {
                if (!current[ticket.id]) return current;
                const next = { ...current };
                delete next[ticket.id];
                return next;
              });
            }}>
              <span className="ticket-row__title">
                <strong>{ticket.subject}</strong>
                {count > 0 ? <i className="ticket-count" aria-label={`${count} new`}>{count}</i> : null}
              </span>
                <span className="ticket-row__meta">
                  <em className="ticket-chip">Support</em>
                </span>
                <span className="ticket-row__line">
                  <em className="ticket-id">{ticket.id.slice(0, 18)}</em>
                  <em className={done ? "ticket-status is-closed" : "ticket-status"}>{done ? "\u00d7 " : ""}{statusLabel(ticket.status)}</em>
                </span>
                <span className="ticket-row__foot">
                  <em>{when(ticket.updatedAt || ticket.createdAt)}</em>
                  <em className="ticket-person">{ticket.name}</em>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="ticket-thread">
        {!current ? <p className="empty">Select a ticket to view messages.</p> : (
          <>
            <header className="ticket-thread__head">
              <button type="button" className="ticket-back" onClick={() => setSelected("")}>Back</button>
              <div>
                <h2>{current.subject}</h2>
                <p>{current.name}{current.email ? ` \u00b7 ${current.email}` : ""}</p>
              </div>
              <select value={status} onChange={(event) => send(event.target.value, "")}>
                {statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </header>
            <div className="ticket-messages">
              {messages.map((message) => (
                <article key={message.id} className={message.author === "admin" ? "bubble bubble--admin" : "bubble"}>
                  <p>{message.body}</p>
                  <time>{(message.author === "admin" ? "Support" : "Trader") + " " + String.fromCharCode(183) + " " + stamp(message.createdAt)}</time>
                </article>
              ))}
            </div>
            <form className="ticket-reply" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply" rows={4} />
              <div className="row-actions">
                <button type="submit" disabled={busy || !reply.trim()}>Send message</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => send("closed", "")}>Close chat</button>
                {note ? <span className="hint">{note}</span> : null}
              </div>
            </form>
          </>
        )}
      </section>
      {toast ? <p className="ticket-toast" role="status">{toast}</p> : null}
      <style>{".admin__main:has(.ticket-desk){padding:0;background:#0c1011;color:#f4f1ea}.admin__main:has(.ticket-desk) .admin__top{margin:0;min-height:57px;padding:0 16px;border-bottom:1px solid rgba(194,150,53,.22)}.ticket-desk{grid-template-columns:320px minmax(0,1fr);height:calc(100dvh - 57px);border:0;border-radius:0;background:#0c1011}.ticket-list{gap:0;padding:0;overflow:hidden;background:#0c1011;border-right:1px solid rgba(194,150,53,.22)}.ticket-list__head{padding:16px;border-bottom:1px solid rgba(194,150,53,.22)}.ticket-list__head h2{margin:0 0 16px;color:#f4f1ea;font-size:18px;font-weight:600}.ticket-search{position:relative;display:block;margin-bottom:12px}.ticket-search svg{position:absolute;left:14px;top:13px;width:16px;height:16px;color:#9aa3a7;pointer-events:none}.ticket-rows{flex:1;min-height:0;overflow:auto}.ticket-list input,.ticket-list select{height:42px;padding:10px 16px;border-radius:8px;border-color:rgba(194,150,53,.35);background:#121618;color:#f4f1ea;font-size:14px}.ticket-search input{padding-left:40px}.ticket-list select{height:40px}.ticket-row{display:grid;gap:8px;padding:12px;border-radius:0;border:1px solid rgba(194,150,53,.28);background:#121618;color:#f4f1ea}.ticket-row.is-selected{border-color:#c29635;background:rgba(194,150,53,.16)}.ticket-row__title,.ticket-row__meta,.ticket-row__line,.ticket-row__foot{display:flex;align-items:center;gap:6px;min-width:0}.ticket-row__title strong{flex:1;color:#f4f1ea;font-size:14px;font-weight:600}.ticket-count{flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#c29635;color:#1a1204;font-style:normal;font-size:11px;font-weight:700;line-height:18px;text-align:center}.ticket-row .ticket-chip{padding:2px 8px;border:1px solid rgba(194,150,53,.45);border-radius:6px;background:rgba(194,150,53,.15);color:#c29635;font-size:11px}.ticket-row .ticket-id,.ticket-row .ticket-status.is-closed,.ticket-row .ticket-row__foot>em:first-child{color:#9aa3a7;font-size:12px}.ticket-row .ticket-status{margin-left:auto;color:#c29635;font-size:12px}.ticket-row .ticket-person{margin-left:auto;color:#f4f1ea;font-size:12px}.ticket-thread{background:#0c1011}.ticket-thread>.empty{margin:auto;padding:0;color:#9aa3a7;font-size:16px}.ticket-toast{position:fixed;top:16px;right:16px;z-index:80;max-width:min(320px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#121618;color:#f4f1ea;border:1px solid rgba(194,150,53,.45);box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:14px}@media(max-width:767px){.ticket-desk{grid-template-columns:1fr;height:calc(100dvh - 57px)}}"}</style>
    </div>
  );
}
