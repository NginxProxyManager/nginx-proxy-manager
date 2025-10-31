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
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Box
        component="aside"
        sx={{
          width: 280,
          bgcolor: "background.paper",
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          p: 3
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: 0.4 }}>
            Caddy Proxy Manager
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {user.name ?? user.email}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

        <List component="nav" sx={{ flexGrow: 1, display: "grid", gap: 0.5 }}>
          {NAV_ITEMS.map((item) => {
            const selected = pathname === item.href;
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={selected}
                sx={{
                  borderRadius: 2,
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "common.black",
                    "&:hover": { bgcolor: "primary.light" }
                  }
                }}
              >
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: selected ? 600 : 500 }} />
              </ListItemButton>
            );
          })}
        </List>

        <form action="/api/auth/logout" method="POST">
          <Button type="submit" variant="outlined" fullWidth>
            Sign out
          </Button>
        </form>
      </Box>

      <Stack component="main" sx={{ flex: 1, p: { xs: 3, md: 5 }, gap: 4, bgcolor: "background.default" }}>
        {children}
      </Stack>
    </Box>
  );
}
