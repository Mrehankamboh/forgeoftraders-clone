import { loadAdmin } from "@/lib/admin";
import { UserDirectory } from "../user-directory";

export const metadata = { title: "Users - Forge Admin" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q = "", view } = await searchParams;
  const { user } = await loadAdmin();

  return (
    <>
      <h1>Users</h1>
      <p className="lead">Everyone who has signed up. Paid means they have taken a challenge.</p>
      <UserDirectory basePath="/admin/users" query={q.trim().slice(0, 80)} view={view} selfId={user.id} />
    </>
  );
}
