import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hype Machine",
  description: "Persona-first AI content creation and publishing",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/personas", label: "Personas" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/queue", label: "Content Queue" },
  { href: "/approvals", label: "Approvals" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="logo">⚡ Hype Machine</div>
            <nav>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
