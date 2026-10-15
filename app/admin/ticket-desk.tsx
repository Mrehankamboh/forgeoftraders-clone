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
  const replyBox = useRef<HTMLTextAreaElement | null>(null);
  const [quoting, setQuoting] = useState("");
  const [menuId, setMenuId] = useState("");

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
        if (message) {
          setReply("");
          setQuoting("");
        }
        setTickets((list) => list.map((ticket) => (
          ticket.id === current.id ? { ...ticket, status: nextStatus, lastMessage: message || ticket.lastMessage, lastAuthor: message ? "admin" : ticket.lastAuthor } : ticket
        )));
        setStatus(nextStatus);
        setNote(message ? "Reply sent" : "Status saved");
      })
      .catch(() => setNote("Could not send"))
      .finally(() => setBusy(false));
  }

  function focusReply(text: string) {
    setQuoting(text.replace(/\s+/g, " ").trim().slice(0, 160));
    setMenuId("");
    window.setTimeout(() => replyBox.current?.focus(), 0);
  }

  function copyMessage(text: string) {
    setMenuId("");
    navigator.clipboard.writeText(text).then(() => setToast("Message copied")).catch(() => setToast("Could not copy"));
  }

  function suggestReply() {
    setReply("Thanks for your message. I am looking into this and will reply shortly.");
    setMenuId("");
    window.setTimeout(() => replyBox.current?.focus(), 0);
  }

  function translateMessage(message: Message) {
    setMenuId("");
    const text = message.body.replace(/\s+/g, " ").trim();
    const browser = window as Window & { Translator?: { create: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<{ translate: (value: string) => Promise<string> }> } };
    if (!browser.Translator || !text) {
      setToast("Translation is not available in this browser");
      return;
    }
    browser.Translator.create({ sourceLanguage: "en", targetLanguage: "es" })
      .then((translator) => translator.translate(text))
      .then((value) => {
        setReply(value);
        replyBox.current?.focus();
      })
      .catch(() => setToast("Could not translate"));
  }

  function removeMessage(message: Message) {
    if (!current || busy || message.author !== "admin") return;
    setMenuId("");
    setBusy(true);
    fetch("/api/admin/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id, action: "delete", messageId: message.id }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setNote(data.error || "Could not delete");
          return;
        }
        const next = messages.filter((item) => item.id !== message.id);
        const last = next[next.length - 1];
        setMessages(next);
        setTickets((tickets) => tickets.map((ticket) => (
          ticket.id === current.id ? { ...ticket, lastMessage: last?.body || "", lastAuthor: last?.author || "" } : ticket
        )));
        setToast("Reply deleted");
      })
      .catch(() => setNote("Could not delete"))
      .finally(() => setBusy(false));
  }

  function tools(message: Message, outgoing: boolean) {
    const replyIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8V5L3 12l7 7v-3c5.2 0 8.4 1.6 10 6-1.2-6.4-4.4-10-10-10z" fill="currentColor" /></svg>;
    const copyIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-9A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5V6" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>;
    return (
      <div className={menuId === message.id ? "msg-tools is-open" : "msg-tools"}>
        <button type="button" className="msg-tool" aria-label="Reply" onClick={() => focusReply(message.body)}>{replyIcon}</button>
        {outgoing ? <button type="button" className="msg-tool" aria-label="Translate" onClick={() => translateMessage(message)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 12h16M12 4c2.4 2.6 2.4 13.4 0 16M12 4c-2.4 2.6-2.4 13.4 0 16" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></button> : null}
        <button type="button" className="msg-tool" aria-label="Copy message" onClick={() => copyMessage(message.body)}>{copyIcon}</button>
        {outgoing ? <button type="button" className="msg-tool" aria-label="Delete message" onClick={() => removeMessage(message)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7.5 0 .6 12h7.8l.6-12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button> : <button type="button" className="msg-tool" aria-label="Suggest reply" onClick={suggestReply}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 13.4 8 18.2 9.4 13.4 10.8 12 15.6 10.6 10.8 5.8 9.4 10.6 8 12 3.2zM18 14.2l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z" fill="currentColor" /></svg></button>}
        {outgoing ? <span className="msg-more"><button type="button" className="msg-tool" aria-label="More" aria-expanded={menuId === message.id} onClick={() => setMenuId(menuId === message.id ? "" : message.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></svg></button>{menuId === message.id ? <span className="msg-menu"><button type="button" onClick={() => removeMessage(message)}>Delete message</button></span> : null}</span> : null}
      </div>
    );
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
              {messages.map((message) => {
                const outgoing = message.author === "admin";
                return (
                  <div key={message.id} className={outgoing ? "msg msg--out" : "msg"}>
                    {outgoing ? tools(message, true) : null}
                    <article className={outgoing ? "bubble bubble--admin" : "bubble"}>
                      <p>{message.body}</p>
                      <time>{(outgoing ? "Support" : "Trader") + " " + String.fromCharCode(183) + " " + stamp(message.createdAt)}</time>
                    </article>
                    {outgoing ? null : tools(message, false)}
                  </div>
                );
              })}
            </div>
            <form className="ticket-reply" onSubmit={(event) => { event.preventDefault(); send(); }}>
              {quoting ? <p className="ticket-quote"><span>{"Replying to: " + quoting}</span><button type="button" aria-label="Clear reply" onClick={() => setQuoting("")}>\u00d7</button></p> : null}
              <textarea ref={replyBox} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply" rows={4} />
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
      <style>{"html:has(.ticket-desk),body:has(.ticket-desk){margin:0;overflow:hidden}.admin:has(.ticket-desk){height:100dvh;overflow:hidden}.admin__main:has(.ticket-desk){height:100dvh;min-height:0;overflow:hidden;padding:0;background:#0c1011;color:#f4f1ea}.admin__main:has(.ticket-desk) .admin__top{margin:0;min-height:57px;padding:0 16px;border-bottom:1px solid rgba(194,150,53,.22)}.ticket-desk{grid-template-columns:320px minmax(0,1fr);height:calc(100dvh - 57px);min-height:0;overflow:hidden;border:0;border-radius:0;background:#0c1011}.ticket-list{gap:0;padding:0;min-height:0;overflow:hidden;background:#0c1011;border-right:1px solid rgba(194,150,53,.22)}.ticket-list__head{flex:none;padding:16px;border-bottom:1px solid rgba(194,150,53,.22)}.ticket-list__head h2{margin:0 0 16px;color:#f4f1ea;font-size:18px;font-weight:600}.ticket-search{position:relative;display:block;margin-bottom:12px}.ticket-search svg{position:absolute;left:14px;top:13px;width:16px;height:16px;color:#9aa3a7;pointer-events:none}.ticket-rows{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}.ticket-list input,.ticket-list select{height:42px;padding:10px 16px;border-radius:8px;border-color:rgba(194,150,53,.35);background:#121618;color:#f4f1ea;font-size:14px}.ticket-search input{padding-left:40px}.ticket-list select{height:40px}.ticket-row{display:grid;gap:8px;padding:12px;border-radius:0;border:1px solid rgba(194,150,53,.28);background:#121618;color:#f4f1ea}.ticket-row.is-selected{border-color:#c29635;background:rgba(194,150,53,.16)}.ticket-row__title,.ticket-row__meta,.ticket-row__line,.ticket-row__foot{display:flex;align-items:center;gap:6px;min-width:0}.ticket-row__title strong{flex:1;color:#f4f1ea;font-size:14px;font-weight:600}.ticket-count{flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#c29635;color:#1a1204;font-style:normal;font-size:11px;font-weight:700;line-height:18px;text-align:center}.ticket-row .ticket-chip{padding:2px 8px;border:1px solid rgba(194,150,53,.45);border-radius:6px;background:rgba(194,150,53,.15);color:#c29635;font-size:11px}.ticket-row .ticket-id,.ticket-row .ticket-status.is-closed,.ticket-row .ticket-row__foot>em:first-child{color:#9aa3a7;font-size:12px}.ticket-row .ticket-status{margin-left:auto;color:#c29635;font-size:12px}.ticket-row .ticket-person{margin-left:auto;color:#f4f1ea;font-size:12px}.ticket-thread{min-height:0;overflow:hidden;background:#0c1011}.ticket-thread__head,.ticket-reply{flex:none}.ticket-thread>.empty{margin:auto;padding:0;color:#9aa3a7;font-size:16px}.ticket-messages{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}.msg{display:flex;align-items:center;gap:6px;align-self:flex-start;width:fit-content;max-width:100%}.msg--out{align-self:flex-end}.msg .bubble,.msg .bubble--admin{align-self:center;max-width:min(520px,100%)}.msg-tools{display:flex;flex:none;align-items:center;gap:4px;opacity:0;pointer-events:none}.msg:hover .msg-tools,.msg:focus-within .msg-tools,.msg-tools.is-open{opacity:1;pointer-events:auto}.msg-tool{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:999px;background:#121618;color:#f4f1ea;cursor:pointer}.msg-tool svg{width:15px;height:15px}.msg-tool:hover{background:rgba(194,150,53,.22);color:#c29635}.msg-more{position:relative}.msg-menu{position:absolute;top:32px;right:0;z-index:5;min-width:140px;padding:6px;border:1px solid rgba(194,150,53,.35);border-radius:10px;background:#121618;box-shadow:0 12px 30px rgba(0,0,0,.35)}.msg-menu button{width:100%;height:32px;border:0;border-radius:8px;background:transparent;color:#f4f1ea;text-align:left;padding:0 10px;cursor:pointer;font:inherit;font-size:13px}.ticket-quote{display:flex;align-items:center;gap:8px;margin:0;color:#9aa3a7;font-size:12px}.ticket-quote span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ticket-quote button{flex:none;width:24px;height:24px;border:0;border-radius:999px;background:transparent;color:#f4f1ea;cursor:pointer}@media(hover:none){.msg-tools{opacity:1;pointer-events:auto}}.ticket-toast{position:fixed;top:16px;right:16px;z-index:80;max-width:min(320px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#121618;color:#f4f1ea;border:1px solid rgba(194,150,53,.45);box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:14px}@media(max-width:767px){.ticket-desk{grid-template-columns:1fr;height:calc(100dvh - 57px)}}"}</style>
    </div>
  );
}
