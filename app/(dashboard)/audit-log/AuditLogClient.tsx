"use client";

import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

type EventRow = {
  id: number;
  created_at: string;
  user: string;
  summary: string;
};

export default function AuditLogClient({ events }: { events: EventRow[] }) {
  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="h4" fontWeight={600}>
        Audit Log
      </Typography>
      <Typography color="text.secondary">Review configuration changes and user activity.</Typography>
      <TableContainer component={Paper} sx={{ bgcolor: "background.paper" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Summary</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id} hover>
                <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                <TableCell>{event.user}</TableCell>
                <TableCell>{event.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
