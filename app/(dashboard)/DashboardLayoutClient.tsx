"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, Divider, List, ListItemButton, ListItemText, Stack, Typography } from "@mui/material";
import type { UserRecord } from "@/src/lib/auth/session";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/proxy-hosts", label: "Proxy Hosts" },
  { href: "/redirects", label: "Redirects" },
  { href: "/dead-hosts", label: "Dead Hosts" },
  { href: "/streams", label: "Streams" },
  { href: "/access-lists", label: "Access Lists" },
  { href: "/certificates", label: "Certificates" },
  { href: "/settings", label: "Settings" },
  { href: "/audit-log", label: "Audit Log" }
] as const;

export default function DashboardLayoutClient({ user, children }: { user: UserRecord; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <Box
        component="aside"
        sx={{
          width: 280,
          bgcolor: "rgba(10, 15, 25, 0.9)",
          backdropFilter: "blur(18px)",
          borderRight: "1px solid rgba(99, 102, 241, 0.2)",
          boxShadow: "24px 0 60px rgba(2, 6, 23, 0.45)",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          p: 3
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography
            variant="body2"
            sx={{ textTransform: "uppercase", letterSpacing: 4, color: "rgba(148, 163, 184, 0.5)" }}
          >
            Caddy
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              letterSpacing: -0.4,
              background: "linear-gradient(120deg, #7f5bff 0%, #22d3ee 70%)",
              WebkitBackgroundClip: "text",
              color: "transparent"
            }}
          >
            Proxy Manager
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.name ?? user.email}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: "rgba(148, 163, 184, 0.1)" }} />

        <List component="nav" sx={{ flexGrow: 1, display: "grid", gap: 0.5 }}>
          {NAV_ITEMS.map((item) => {
            const selected = pathname === item.href;
            return (
              <ListItemButton key={item.href} component={Link} href={item.href} selected={selected} sx={{ borderRadius: 2 }}>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 600 : 500 }} />
              </ListItemButton>
            );
          })}
        </List>

        <form action="/api/auth/logout" method="POST">
          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{
              background: "linear-gradient(135deg, rgba(127, 91, 255, 0.9), rgba(34, 211, 238, 0.9))",
              color: "#05030a",
              "&:hover": {
                background: "linear-gradient(135deg, rgba(127, 91, 255, 0.8), rgba(34, 211, 238, 0.8))",
                boxShadow: "0 18px 44px rgba(34, 211, 238, 0.35)"
              }
            }}
          >
            Sign out
          </Button>
        </form>
      </Box>

      <Stack
        component="main"
        sx={{
          flex: 1,
          position: "relative",
          p: { xs: 3, md: 6 },
          gap: 4,
          bgcolor: "transparent"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 20% -10%, rgba(56, 189, 248, 0.18), transparent 40%), radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.15), transparent 45%)"
          }}
        />
        <Stack sx={{ position: "relative", gap: 4 }}>{children}</Stack>
      </Stack>
    </Box>
  );
}
