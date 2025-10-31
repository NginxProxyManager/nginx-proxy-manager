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
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Checkbox
} from "@mui/material";
import type { AccessList } from "@/src/lib/models/access-lists";
import type { Certificate } from "@/src/lib/models/certificates";
import type { ProxyHost } from "@/src/lib/models/proxy-hosts";
import { createProxyHostAction, deleteProxyHostAction, updateProxyHostAction } from "./actions";

type Props = {
  hosts: ProxyHost[];
  certificates: Certificate[];
  accessLists: AccessList[];
};

export default function ProxyHostsClient({ hosts, certificates, accessLists }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Proxy Hosts
        </Typography>
        <Typography color="text.secondary">
          Define HTTP(S) reverse proxies managed by Caddy with built-in TLS orchestration.
        </Typography>
      </Stack>

      <Grid container spacing={3} alignItems="stretch">
        {hosts.map((host) => (
          <Grid item xs={12} md={6} key={host.id}>
            <Card sx={{ height: "100%" }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
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
                    <Typography fontWeight={600}>Edit configuration</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0 }}>
                    <Stack component="form" action={(formData) => updateProxyHostAction(host.id, formData)} spacing={2}>
                      <TextField name="name" label="Name" defaultValue={host.name} required fullWidth />
                      <TextField
                        name="domains"
                        label="Domains"
                        helperText="Comma or newline separated"
                        defaultValue={host.domains.join("\n")}
                        multiline
                        minRows={3}
                        fullWidth
                      />
                      <TextField
                        name="upstreams"
                        label="Upstreams"
                        helperText="Comma or newline separated"
                        defaultValue={host.upstreams.join("\n")}
                        multiline
                        minRows={3}
                        fullWidth
                      />
                      <TextField select name="certificate_id" label="Certificate" defaultValue={host.certificate_id ?? ""} fullWidth>
                        <MenuItem value="">Managed by Caddy</MenuItem>
                        {certificates.map((cert) => (
                          <MenuItem key={cert.id} value={cert.id}>
                            {cert.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField select name="access_list_id" label="Access List" defaultValue={host.access_list_id ?? ""} fullWidth>
                        <MenuItem value="">None</MenuItem>
                        {accessLists.map((list) => (
                          <MenuItem key={list.id} value={list.id}>
                            {list.name}
                          </MenuItem>
                        ))}
                      </TextField>

                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
                        <HiddenCheckboxField name="ssl_forced" defaultChecked={host.ssl_forced} label="Force HTTPS" />
                        <HiddenCheckboxField name="hsts_enabled" defaultChecked={host.hsts_enabled} label="HSTS" />
                        <HiddenCheckboxField
                          name="hsts_subdomains"
                          defaultChecked={host.hsts_subdomains}
                          label="Include subdomains in HSTS"
                        />
                        <HiddenCheckboxField
                          name="allow_websocket"
                          defaultChecked={host.allow_websocket}
                          label="Allow WebSocket"
                        />
                        <HiddenCheckboxField
                          name="preserve_host_header"
                          defaultChecked={host.preserve_host_header}
                          label="Preserve host header"
                        />
                        <HiddenCheckboxField name="enabled" defaultChecked={host.enabled} label="Enabled" />
                      </Box>

                      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
                        <Button type="submit" variant="contained">
                          Save Changes
                        </Button>
                      </Box>
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Box component="form" action={deleteProxyHostAction.bind(null, host.id)}>
                  <Button type="submit" variant="outlined" color="error">
                    Delete
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={2} component="section">
        <Typography variant="h6" fontWeight={600}>
          Create proxy host
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createProxyHostAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="Internal service" required fullWidth />
              <TextField
                name="domains"
                label="Domains"
                placeholder="app.example.com"
                multiline
                minRows={2}
                required
                fullWidth
              />
              <TextField
                name="upstreams"
                label="Upstreams"
                placeholder="http://10.0.0.5:8080"
                multiline
                minRows={2}
                required
                fullWidth
              />
              <TextField select name="certificate_id" label="Certificate" defaultValue="" fullWidth>
                <MenuItem value="">Managed by Caddy</MenuItem>
                {certificates.map((cert) => (
                  <MenuItem key={cert.id} value={cert.id}>
                    {cert.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select name="access_list_id" label="Access List" defaultValue="" fullWidth>
                <MenuItem value="">None</MenuItem>
                {accessLists.map((list) => (
                  <MenuItem key={list.id} value={list.id}>
                    {list.name}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
                <FormControlLabel control={<Checkbox name="ssl_forced" defaultChecked />} label="Force HTTPS" />
                <FormControlLabel control={<Checkbox name="hsts_enabled" defaultChecked />} label="HSTS" />
                <FormControlLabel control={<Checkbox name="allow_websocket" defaultChecked />} label="Allow WebSocket" />
                <FormControlLabel control={<Checkbox name="preserve_host_header" defaultChecked />} label="Preserve host header" />
                <FormControlLabel control={<Checkbox name="enabled" defaultChecked />} label="Enabled" />
              </Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create Host
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}

function HiddenCheckboxField({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <Box>
      <input type="hidden" name={`${name}_present`} value="1" />
      <FormControlLabel control={<Checkbox name={name} defaultChecked={defaultChecked} />} label={label} />
    </Box>
  );
}
