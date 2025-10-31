"use client";

import Link from "next/link";
import { Card, CardActionArea, CardContent, Grid, Paper, Stack, Typography } from "@mui/material";

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
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Welcome back, {userName}
        </Typography>
        <Typography color="text.secondary">
          Manage your Caddy reverse proxies, TLS certificates, and services with confidence.
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        {stats.map((stat) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={stat.label}>
            <Card elevation={3}>
              <CardActionArea component={Link} href={stat.href} sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    {stat.icon}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 1, mb: 0.5 }} fontWeight={600}>
                    {stat.count}
                  </Typography>
                  <Typography color="text.secondary">{stat.label}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={600}>
          Recent Activity
        </Typography>
        {recentEvents.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, textAlign: "center", color: "text.secondary", bgcolor: "background.paper" }}>
            No activity recorded yet.
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {recentEvents.map((event, index) => (
              <Paper
                key={`${event.created_at}-${index}`}
                elevation={0}
                sx={{ p: 2.5, display: "flex", justifyContent: "space-between", bgcolor: "background.paper" }}
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
