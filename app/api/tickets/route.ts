import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureAppSchema } from "@/lib/schema";
import { userFromSession } from "@/lib/session";

export const runtime = "nodejs";

function clean(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function GET(request: Request) {
  const key = clean(new URL(request.url).searchParams.get("key"), 80);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(key)) {
    return NextResponse.json({ tickets: [] });
  }
  const db = sql();
  await ensureAppSchema(db);
  const rows = await db`
    SELECT t.id, t.subject, t.status, t.created_at, t.updated_at,
      m.id AS message_id, m.author, m.body, m.created_at AS message_at
    FROM tickets t
    LEFT JOIN ticket_messages m ON m.ticket_id = t.id
    WHERE t.visitor_key = ${key}
    ORDER BY t.updated_at DESC, m.created_at ASC
  `;
  const tickets = [];
  const seen = new Map();
  for (const row of rows) {
    const id = String(row.id);
    if (!seen.has(id)) {
      const ticket = {
        id,
        subject: String(row.subject),
        status: String(row.status),
        createdAt: row.created_at,
        messages: [],
      };
      seen.set(id, ticket);
      tickets.push(ticket);
    }
    if (row.message_id) {
      seen.get(id).messages.push({
        id: String(row.message_id),
        author: String(row.author),
        body: String(row.body),
        createdAt: row.message_at,
      });
    }
  }
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const key = clean(body?.key, 80);
  const message = clean(body?.message, 4000);
  const subject = clean(body?.subject, 120) || "Support request";
  const name = clean(body?.name, 80);
  const email = clean(body?.email, 120);
  const ticketId = clean(body?.ticketId, 40);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(key) || message.length < 1) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }

  const db = sql();
  await ensureAppSchema(db);
  const user = await userFromSession(db, request);
  let visitorName = name;
  let visitorEmail = email;
  if (user) {
    if (!visitorName) visitorName = `${user.firstName} ${user.lastName}`.trim();
    const account = await db`SELECT email FROM users WHERE id = ${user.id} LIMIT 1`;
    if (!visitorEmail) visitorEmail = String(account[0]?.email || "");
  }

  if (/^[0-9a-f-]{36}$/i.test(ticketId)) {
    const existing = await db`
      SELECT id, status FROM tickets
      WHERE id = ${ticketId} AND visitor_key = ${key}
      LIMIT 1
    `;
    if (!existing[0]) return NextResponse.json({ error: "Ticket was not found." }, { status: 404 });
    if (String(existing[0].status) === "closed") {
      return NextResponse.json({ error: "This ticket is closed." }, { status: 400 });
    }
    await db`
      INSERT INTO ticket_messages (ticket_id, author, body)
      VALUES (${ticketId}, 'user', ${message})
    `;
    await db`UPDATE tickets SET updated_at = now(), status = 'open' WHERE id = ${ticketId}`;
    return NextResponse.json({ ok: true, id: ticketId });
  }

  const created = await db`
    INSERT INTO tickets (user_id, visitor_key, visitor_name, visitor_email, subject)
    VALUES (${user?.id || null}, ${key}, ${visitorName}, ${visitorEmail}, ${subject})
    RETURNING id
  `;
  const id = String(created[0].id);
  await db`
    INSERT INTO ticket_messages (ticket_id, author, body)
    VALUES (${id}, 'user', ${message})
  `;
  return NextResponse.json({ ok: true, id });
}
