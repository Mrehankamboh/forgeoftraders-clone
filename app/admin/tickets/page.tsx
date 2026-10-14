import { loadAdmin } from "@/lib/admin";
import { TicketDesk } from "../ticket-desk";

export const metadata = { title: "Tickets - Forge Admin" };

export default async function TicketsPage() {
  const { db } = await loadAdmin();
  const rows = await db`
    SELECT t.id, t.subject, t.status, t.visitor_name, t.visitor_email, t.created_at,
      coalesce(u.first_name || ' ' || u.last_name, '') AS account_name,
      (SELECT body FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
      (SELECT author FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_author,
      t.updated_at
    FROM tickets t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.updated_at DESC
    LIMIT 200
  `;

  const tickets = rows.map((row) => ({
    id: String(row.id),
    subject: String(row.subject),
    status: String(row.status),
    name: String(row.account_name || row.visitor_name || "Visitor").trim(),
    email: String(row.visitor_email || ""),
    lastMessage: String(row.last_message || ""),
    lastAuthor: String(row.last_author || ""),
    createdAt: String(row.created_at),
    updatedAt: new Date(String(row.updated_at || row.created_at)).toISOString(),
  }));

  return (
    <>
      <h1>Tickets</h1>
      <p className="lead">Replies sent here show up in the visitor support chat.</p>
      <TicketDesk initial={tickets} />
    </>
  );
}
