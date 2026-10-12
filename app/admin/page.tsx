import { loadAdmin } from "@/lib/admin";
import { countOf, money, when } from "./format";
import { UserDirectory } from "./user-directory";

export const metadata = { title: "Overview - Forge Admin" };

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q = "", view } = await searchParams;
  const { db, user } = await loadAdmin();
  const [users, challenges, active, today, fees, latest] = await Promise.all([
    db`SELECT count(*)::int AS count FROM users`,
    db`SELECT count(*)::int AS count FROM challenges`,
    db`SELECT count(*)::int AS count FROM challenges WHERE status = 'active'`,
    db`SELECT count(*)::int AS count FROM users WHERE created_at >= date_trunc('day', now())`,
    db`SELECT coalesce(sum(fee), 0) AS total FROM challenges`,
    db`
      SELECT c.evaluation_type, c.account_size, c.fee, c.status, c.created_at, u.first_name, u.last_name
      FROM challenges c
      JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC
      LIMIT 5
    `,
  ]);

  const stats = [
    { label: "Users", value: String(countOf(users)) },
    { label: "Challenges", value: String(countOf(challenges)) },
    { label: "Active", value: String(countOf(active)) },
    { label: "New today", value: String(countOf(today)) },
    { label: "Fees", value: money(fees[0]?.total) },
  ];

  return (
    <>
      <h1>Overview</h1>
      <section className="stats">
        {stats.map((item) => (
          <article className="stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>
      <UserDirectory basePath="/admin" query={q.trim().slice(0, 80)} view={view} selfId={user.id} />
      <section className="panel" style={{ marginTop: 22 }}>
        <div className="panel__head">
          <h2>Latest challenges</h2>
        </div>
        {latest.length === 0 ? (
          <p className="empty">No challenges yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Trader</th>
                <th>Challenge</th>
                <th>Size</th>
                <th>Fee</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((row, index) => (
                <tr key={index}>
                  <td>{`${row.first_name} ${row.last_name}`.trim()}</td>
                  <td>{String(row.evaluation_type)}</td>
                  <td>{money(row.account_size)}</td>
                  <td>{money(row.fee)}</td>
                  <td><span className="pill">{String(row.status)}</span></td>
                  <td>{when(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
