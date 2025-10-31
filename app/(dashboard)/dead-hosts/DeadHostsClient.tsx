"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  Checkbox
} from "@mui/material";
import type { DeadHost } from "@/src/lib/models/dead-hosts";
import { createDeadHostAction, deleteDeadHostAction, updateDeadHostAction } from "./actions";

type Props = {
  hosts: DeadHost[];
};

export default function DeadHostsClient({ hosts }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Dead Hosts
        </Typography>
        <Typography color="text.secondary">Serve friendly status pages for domains without upstreams.</Typography>
      </Stack>

      <Stack spacing={3}>
        {hosts.map((host) => (
          <Card key={host.id}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    {host.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {host.domains.join(", ")}
                  </Typography>
                </Box>
                <Chip
                  label={host.enabled ? "Enabled" : "Disabled"}
                  color={host.enabled ? "success" : "warning"}
                  variant={host.enabled ? "filled" : "outlined"}
                />
              </Box>

              <Accordion elevation={0} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography fontWeight={600}>Edit</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  <Stack component="form" action={(formData) => updateDeadHostAction(host.id, formData)} spacing={2}>
                    <TextField name="name" label="Name" defaultValue={host.name} fullWidth />
                    <TextField
                      name="domains"
                      label="Domains"
                      defaultValue={host.domains.join("\n")}
                      multiline
                      minRows={2}
                      fullWidth
                    />
                    <TextField
                      name="status_code"
                      label="Status code"
                      type="number"
                      inputProps={{ min: 200, max: 599 }}
                      defaultValue={host.status_code}
                      fullWidth
                    />
                    <TextField
                      name="response_body"
                      label="Response body"
                      defaultValue={host.response_body ?? ""}
                      multiline
                      minRows={3}
                      fullWidth
                    />
                    <Box>
                      <input type="hidden" name="enabled_present" value="1" />
                      <FormControlLabel control={<Checkbox name="enabled" defaultChecked={host.enabled} />} label="Enabled" />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained">
                        Save
                      </Button>
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Box component="form" action={deleteDeadHostAction.bind(null, host.id)}>
                <Button type="submit" variant="outlined" color="error">
                  Delete
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack spacing={2} component="section">
        <Typography variant="h6" fontWeight={600}>
          Create dead host
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createDeadHostAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="Maintenance page" required fullWidth />
              <TextField
                name="domains"
                label="Domains"
                placeholder="offline.example.com"
                multiline
                minRows={2}
                required
                fullWidth
              />
              <TextField
                name="status_code"
                label="Status code"
                type="number"
                inputProps={{ min: 200, max: 599 }}
                defaultValue={503}
                fullWidth
              />
              <TextField
                name="response_body"
                label="Response body"
                placeholder="Service unavailable"
                multiline
                minRows={3}
                fullWidth
              />
              <FormControlLabel control={<Checkbox name="enabled" defaultChecked />} label="Enabled" />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create Dead Host
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
