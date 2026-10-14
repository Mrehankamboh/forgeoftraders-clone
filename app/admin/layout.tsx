import Link from "next/link";
import "./admin.css";
import { loadAdmin } from "@/lib/admin";
import { AdminNav } from "./admin-nav";
import { SignOutButton } from "./sign-out";

export const metadata = { title: "Admin - Forge of Traders" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await loadAdmin();
  const name = `${user.firstName} ${user.lastName}`.trim() || "Admin";

  return (
    <div className="admin">
      <input id="admin-menu" className="admin-menu" type="checkbox" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
      <aside className="admin__side">
        <div className="admin__brand">
          <span>Forge of Traders</span>
          <strong>Admin</strong>
        </div>
        <AdminNav />
        <div className="admin__side-foot">
          <Link href="/">Visit website</Link>
        </div>
      </aside>
      <div className="admin__main">
        <header className="admin__top">
          <label htmlFor="admin-menu" className="admin-menu-btn" aria-label="Open menu">
            <span />
            <span />
            <span />
          </label>
          <p className="admin__who">{name}</p>
          <SignOutButton />
        </header>
        {children}
      </div>
      <label htmlFor="admin-menu" className="admin-menu-backdrop" aria-label="Close menu" />
    </div>
  );
}
