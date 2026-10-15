import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { ensureAppSchema } from "@/lib/schema";

export const runtime = "nodejs";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

export async function GET(request: Request) {
  const { db, error } = await requireAdmin(request);
  if (error || !db) return error;
  await ensureAppSchema(db);

  const id = new URL(request.url).searchParams.get("id") || "";
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const messages = await db`
      SELECT id, author, body, created_at
      FROM ticket_messages
      WHERE ticket_id = ${id}
      ORDER BY created_at ASC
    `;
    return NextResponse.json({
      messages: messages.map((row) => ({
        id: String(row.id),
        author: String(row.author),
        body: String(row.body),
        createdAt: row.created_at,
      })),
    });
  }

  const tickets = await db`
    SELECT t.id, t.subject, t.status, t.visitor_name, t.visitor_email, t.created_at, t.updated_at,
      coalesce(u.first_name || ' ' || u.last_name, '') AS account_name,
      (SELECT body FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
      (SELECT author FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_author
    FROM tickets t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.updated_at DESC
    LIMIT 200
  `;
  return NextResponse.json({
    tickets: tickets.map((row) => ({
      id: String(row.id),
      subject: String(row.subject),
      status: String(row.status),
      name: String(row.account_name || row.visitor_name || "Visitor").trim(),
      email: String(row.visitor_email || ""),
      lastMessage: String(row.last_message || ""),
      lastAuthor: String(row.last_author || ""),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const { db, error } = await requireAdmin(request);
  if (error || !db) return error;
  await ensureAppSchema(db);

  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  const message = String(body?.message || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  const status = STATUSES.includes(String(body?.status)) ? String(body.status) : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Choose a ticket." }, { status: 400 });
  }
  const ticket = await db`SELECT id FROM tickets WHERE id = ${id} LIMIT 1`;
  if (!ticket[0]) return NextResponse.json({ error: "Ticket was not found." }, { status: 404 });

  const action = String(body?.action || "");
  const messageId = String(body?.messageId || "");
  if (action === "delete") {
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) {
      return NextResponse.json({ error: "Choose a message." }, { status: 400 });
    }
    const removed = await db`
      DELETE FROM ticket_messages
      WHERE id = ${messageId} AND ticket_id = ${id} AND author = 'admin'
      RETURNING id
    `;
    if (!removed[0]) return NextResponse.json({ error: "That reply could not be removed." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (message) {
    await db`
      INSERT INTO ticket_messages (ticket_id, author, body)
      VALUES (${id}, 'admin', ${message})
    `;
  }
  await db`
    UPDATE tickets
    SET updated_at = now(),
        status = ${status || "open"}
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true });
}
