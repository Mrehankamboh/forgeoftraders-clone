import Link from "next/link";
import { sql } from "@/lib/db";
import { money, when } from "./format";
import { ResetButton } from "./reset-button";
import { UserActions } from "./user-actions";

const views = [
  { id: "all", label: "All users" },
  { id: "paid", label: "Paid users" },
  { id: "signed", label: "Signed up" },
  { id: "failed", label: "Failed users" },
  { id: "blocked", label: "Blocked" },
] as const;

type View = (typeof views)[number]["id"];

function viewOf(value: string | undefined): View {
  return views.some((item) => item.id === value) ? (value as View) : "all";
}

function directoryHref(basePath: string, view: View, query: string) {
  const params = new URLSearchParams();
  if (view !== "all") params.set("view", view);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function statusOf(row: { blocked: unknown; challenge_count: unknown; failed_count: unknown }) {
  if (row.blocked) return "Blocked";
  if (Number(row.failed_count) > 0) return "Failed";
  if (Number(row.challenge_count) > 0) return "Paid";
  return "Signed up";
}

export async function UserDirectory({
  basePath,
  query,
  view,
  selfId,
}: {
  basePath: string;
  query: string;
  view: string | undefined;
  selfId: string;
}) {
  const selected = viewOf(view);
  const like = `%${query.toLowerCase().replace(/[%_]/g, "")}%`;
  const db = sql();
  const rows = await db`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.blocked, u.created_at,
      (u.password_hash IS NOT NULL) AS has_password,
      (SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login,
      (SELECT count(*)::int FROM challenges c WHERE c.user_id = u.id) AS challenge_count,
      (SELECT count(*)::int FROM challenges c WHERE c.user_id = u.id AND c.status = 'failed') AS failed_count,
      (SELECT coalesce(sum(c.fee), 0) FROM challenges c WHERE c.user_id = u.id) AS spent
    FROM users u
    WHERE (
      ${query} = ''
      OR lower(u.first_name || ' ' || u.last_name) LIKE ${like}
      OR lower(u.email) LIKE ${like}
    )
    AND (
      ${selected} = 'all'
      OR (${selected} = 'paid' AND EXISTS (SELECT 1 FROM challenges c WHERE c.user_id = u.id))
      OR (${selected} = 'signed' AND NOT EXISTS (SELECT 1 FROM challenges c WHERE c.user_id = u.id))
      OR (${selected} = 'failed' AND EXISTS (SELECT 1 FROM challenges c WHERE c.user_id = u.id AND c.status = 'failed'))
      OR (${selected} = 'blocked' AND u.blocked)
    )
    ORDER BY u.created_at DESC
  `;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{rows.length} users</h2>
        <form className="toolbar" action={basePath}>
          {selected !== "all" ? <input type="hidden" name="view" value={selected} /> : null}
          <input name="q" defaultValue={query} placeholder="Search name or email" />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="filters filters--pad">
        {views.map((item) => (
          <Link
            key={item.id}
            href={directoryHref(basePath, item.id, query)}
            aria-current={item.id === selected ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty">No users in this list.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Role</th>
              <th>Challenges</th>
              <th>Spent</th>
              <th>Last login</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row.id);
              const role = String(row.role || "user");
              const status = statusOf({
                blocked: row.blocked,
                challenge_count: row.challenge_count,
                failed_count: row.failed_count,
              });
              return (
                <tr key={id}>
                  <td>
                    <Link href={`/admin/users/${id}`}>{`${row.first_name} ${row.last_name}`.trim()}</Link>
                    <div className="hint">{row.has_password ? "Password set" : "No password"}</div>
                  </td>
                  <td>{String(row.email)}</td>
                  <td>
                    <span className={status === "Blocked" || status === "Failed" ? "pill pill--user" : "pill"}>{status}</span>
                  </td>
                  <td><span className={role === "admin" ? "pill" : "pill pill--user"}>{role}</span></td>
                  <td>{Number(row.challenge_count)}</td>
                  <td>{money(row.spent)}</td>
                  <td>{row.last_login ? when(row.last_login) : "—"}</td>
                  <td>{when(row.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <ResetButton userId={id} />
                      <UserActions userId={id} role={role} blocked={Boolean(row.blocked)} self={id === selfId} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
