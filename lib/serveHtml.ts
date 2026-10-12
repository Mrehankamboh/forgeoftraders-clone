import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const PAGE_FILES: Record<string, string> = {
  "": "index.html",
  affiliate: "affiliate.html",
  careers: "careers.html",
  contact: "contact.html",
  evaluation: "evaluation.html",
  faqs: "faqs.html",
  "privacy-policy": "privacy-policy.html",
  symbols: "symbols.html",
  "terms-conditions": "terms-conditions.html",
  "compare-programs": "compare-programs.html",
  "sign-in": "sign-in.html",
  "sign-up": "sign-up.html",
  "forgot-password": "forgot-password.html",
  "reset-password": "reset-password.html",
  dashboard: "dashboard.html",
  checkout: "checkout.html",
  "my-challenges": "my-challenges.html",
  competitions: "competitions.html",
  "advanced-chart": "advanced-chart.html",
  certificates: "certificates.html",
  achievements: "achievements.html",
  profile: "profile.html",
  security: "security.html",
  billing: "billing.html",
  "affiliate-suite": "affiliate-suite.html",
};

/** Serve the original full HTML document so layout/CSS/JS match 1:1. */
export function serveHtmlPage(slug: string): NextResponse {
  const file = PAGE_FILES[slug];
  if (!file) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fullPath = path.join(process.cwd(), "html-pages", file);
  if (!fs.existsSync(fullPath)) {
    return new NextResponse("Page missing", { status: 404 });
  }

  const html = fs.readFileSync(fullPath, "utf8");
  const withChat = html.includes("/support-chat.js")
    ? html
    : html.replace("</body>", '<script src="/support-chat.js" defer></script></body>');
  return new NextResponse(withChat, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
