"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  { id: "all", label: "All chats" },
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

function mark(ticket: Ticket) {
  const date = new Date(ticket.updatedAt || ticket.createdAt);
  const time = Number.isNaN(date.getTime()) ? "" : date.toISOString();
  return `${ticket.status}|${ticket.lastAuthor}|${ticket.lastMessage}|${time}`;
}

function ring(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  const start = context.currentTime;
  [880, 1175].forEach((frequency, index) => {
    const tone = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.16;
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.24);
  });
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
  const seen = useRef(new Map(initial.map((ticket) => [ticket.id, mark(ticket)])));
  const sound = useRef<AudioContext | null>(null);
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
    function unlock() {
      const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      if (!sound.current) sound.current = new Context();
      sound.current.resume().catch(() => {});
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
              arrived.push(ticket.id);
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
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" aria-label="Search tickets" />
        <select value={filter} aria-label="Filter tickets" onChange={(event) => setFilter(event.target.value)}>
          {filters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {visible.length === 0 ? <p className="empty">No tickets in this list.</p> : visible.map((ticket) => (
          <button key={ticket.id} type="button" className={["ticket-row", ticket.id === selected ? "is-selected" : "", fresh.includes(ticket.id) ? "is-fresh" : ""].filter(Boolean).join(" ")} onClick={() => setSelected(ticket.id)}>
            <strong>{ticket.subject}</strong>
            <span>{ticket.name}{ticket.email ? ` \u00b7 ${ticket.email}` : ""}</span>
            <em>{ticket.status.replace("_", " ")} \u00b7 {stamp(ticket.createdAt)}</em>
          </button>
        ))}
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
                  <time>{message.author === "admin" ? "Support" : "Trader"} \u00b7 {stamp(message.createdAt)}</time>
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
      <style>{".ticket-toast{position:fixed;top:16px;right:16px;z-index:80;max-width:min(320px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#121618;color:#f4f1ea;border:1px solid rgba(194,150,53,.45);box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:14px}.ticket-row.is-fresh{border-color:#c29635;animation:ticket-pulse 1.1s ease 2}@keyframes ticket-pulse{50%{background:rgba(194,150,53,.24)}}"}</style>
    </div>
  );
}
