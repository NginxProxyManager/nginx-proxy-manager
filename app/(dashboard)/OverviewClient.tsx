"use client";

import Link from "next/link";
import Grid from "@mui/material/Grid";
import { Card, CardActionArea, CardContent, Paper, Stack, Typography } from "@mui/material";

type StatCard = {
  label: string;
  icon: string;
  count: number;
  href: string;
};

type RecentEvent = {
  summary: string;
  created_at: string;
};

export default function OverviewClient({
  userName,
  stats,
  recentEvents
}: {
  userName: string;
  stats: StatCard[];
  recentEvents: RecentEvent[];
}) {
  return (
    <Stack spacing={5}>
      <Stack spacing={1.5}>
        <Typography variant="overline" sx={{ color: "rgba(148, 163, 184, 0.6)", letterSpacing: 4 }}>
          Control Center
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            background: "linear-gradient(120deg, rgba(127, 91, 255, 1) 0%, rgba(34, 211, 238, 0.9) 80%)",
            WebkitBackgroundClip: "text",
            color: "transparent"
          }}
        >
          Welcome back, {userName}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
          Everything you need to orchestrate Caddy proxies, certificates, and secure edge services lives here.
        </Typography>
      </Stack>

      <Grid container spacing={3}>
        {stats.map((stat) => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Card
              elevation={0}
              sx={{
                height: "100%",
                border: "1px solid rgba(148, 163, 184, 0.14)"
              }}
            >
              <CardActionArea
                component={Link}
                href={stat.href}
                sx={{
                  height: "100%",
                  p: 0,
                  "&:hover": {
                    background: "linear-gradient(135deg, rgba(127, 91, 255, 0.16), rgba(34, 211, 238, 0.08))"
                  }
                }}
              >
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1.2 }}>
                    {stat.icon}
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
                    {stat.count}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                    {stat.label}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={2}>
        <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: -0.2 }}>
          Recent Activity
        </Typography>
        {recentEvents.length === 0 ? (
          <Paper
            elevation={0}
            sx={{
              p: 4,
              textAlign: "center",
              color: "text.secondary",
              background: "rgba(12, 18, 30, 0.7)"
            }}
          >
            No activity recorded yet.
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {recentEvents.map((event, index) => (
              <Paper
                key={`${event.created_at}-${index}`}
                elevation={0}
                sx={{
                  p: 3,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  background: "linear-gradient(120deg, rgba(17, 25, 40, 0.9), rgba(15, 23, 42, 0.7))",
                  border: "1px solid rgba(148, 163, 184, 0.08)"
                }}
              >
                <Typography fontWeight={500}>{event.summary}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(event.created_at).toLocaleString()}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
