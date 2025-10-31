"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/proxy-hosts", label: "Proxy Hosts" },
  { href: "/redirects", label: "Redirects" },
  { href: "/dead-hosts", label: "Dead Hosts" },
  { href: "/streams", label: "Streams" },
  { href: "/access-lists", label: "Access Lists" },
  { href: "/certificates", label: "Certificates" },
  { href: "/settings", label: "Settings" },
  { href: "/audit-log", label: "Audit Log" }
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav>
      {NAV_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link href={link.href} key={link.href} className={`nav-link${isActive ? " active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
      <style jsx>{`
        nav {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .nav-link {
          padding: 0.6rem 0.9rem;
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.75);
          transition: background 0.2s ease, color 0.2s ease;
        }
        .nav-link:hover,
        .nav-link.active {
          background: rgba(0, 198, 255, 0.15);
          color: #fff;
        }
      `}</style>
    </nav>
  );
}
