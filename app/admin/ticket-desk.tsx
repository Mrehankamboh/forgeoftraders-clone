"use client";

import { useEffect, useMemo, useState } from "react";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  name: string;
  email: string;
  lastMessage: string;
  createdAt: string;
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
    const timer = window.setInterval(() => {
      fetch("/api/admin/tickets")
        .then((response) => response.json())
        .then((data) => {
          if (Array.isArray(data.tickets)) setTickets(data.tickets);
        })
        .catch(() => {});
    }, 8000);
    return () => window.clearInterval(timer);
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
          ticket.id === current.id ? { ...ticket, status: nextStatus, lastMessage: message || ticket.lastMessage } : ticket
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
          <button key={ticket.id} type="button" className={ticket.id === selected ? "ticket-row is-selected" : "ticket-row"} onClick={() => setSelected(ticket.id)}>
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
    </div>
  );
}
