"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/certificates", label: "Certificates" },
  { href: "/admin/achievements", label: "Achievements" },
  { href: "/admin/competitions", label: "Competitions" },
  { href: "/admin/affiliate", label: "Affiliate" },
];

export function AdminNav() {
  const path = usePathname();

  return (
    <nav className="admin__nav">
      {links.map((link) => {
        const current = link.href === "/admin" ? path === "/admin" : path.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            onClick={() => {
              const menu = document.getElementById("admin-menu");
              if (menu instanceof HTMLInputElement) menu.checked = false;
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
