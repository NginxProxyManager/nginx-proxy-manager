"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Grid from "@mui/material/Grid";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography, Checkbox } from "@mui/material";
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
    <Stack spacing={5} sx={{ width: "100%" }}>
      <Stack spacing={1.5}>
        <Typography variant="overline" sx={{ color: "rgba(148, 163, 184, 0.6)", letterSpacing: 4 }}>
          HTTP Edge
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
          Proxy Hosts
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
          Define HTTP(S) reverse proxies orchestrated by Caddy with automated certificates, shields, and zero-downtime
          reloads.
        </Typography>
      </Stack>

      <Grid container spacing={3} alignItems="stretch">
        {hosts.map((host) => (
          <Grid key={host.id} size={{ xs: 12, md: 6 }}>
            <Card
              sx={{
                height: "100%",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                background: "linear-gradient(160deg, rgba(17, 25, 40, 0.95), rgba(12, 18, 30, 0.78))"
              }}
            >
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 2
                  }}
                >
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={600} sx={{ letterSpacing: -0.2 }}>
                      {host.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {host.domains.join(", ")}
                    </Typography>
                  </Box>
                  <Chip
                    label={host.enabled ? "Enabled" : "Disabled"}
                    color={host.enabled ? "success" : "default"}
                    sx={{
                      fontWeight: 600,
                      borderRadius: 999,
                      background: host.enabled
                        ? "linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(52, 211, 153, 0.32))"
                        : "rgba(148, 163, 184, 0.1)",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      color: host.enabled ? "#4ade80" : "rgba(148,163,184,0.8)"
                    }}
                  />
                </Box>

                <Accordion
                  elevation={0}
                  disableGutters
                  sx={{
                    bgcolor: "transparent",
                    borderRadius: 3,
                    border: "1px solid rgba(148,163,184,0.12)",
                    overflow: "hidden",
                    "&::before": { display: "none" }
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ color: "rgba(226, 232, 240, 0.6)" }} />}
                    sx={{ px: 2, bgcolor: "rgba(15, 23, 42, 0.45)" }}
                  >
                    <Typography fontWeight={600}>Edit configuration</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2, py: 3 }}>
                    <Stack component="form" action={(formData) => updateProxyHostAction(host.id, formData)} spacing={2.5}>
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

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 1.5,
                          mt: 1
                        }}
                      >
                        <HiddenCheckboxField
                          name="hsts_subdomains"
                          defaultChecked={host.hsts_subdomains}
                          label="Include subdomains in HSTS"
                        />
                        <HiddenCheckboxField
                          name="skip_https_hostname_validation"
                          defaultChecked={host.skip_https_hostname_validation}
                          label="Skip HTTPS hostname validation"
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
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Create proxy host
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Deploy a new reverse proxy route powered by Caddy.
          </Typography>
        </Box>
        <Card
          sx={{
            border: "1px solid rgba(148, 163, 184, 0.12)",
            background: "linear-gradient(160deg, rgba(19, 28, 45, 0.95), rgba(12, 18, 30, 0.78))"
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack component="form" action={createProxyHostAction} spacing={2.5}>
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
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 1.5,
                  mt: 1
                }}
              >
                <Box sx={{ p: 1, borderRadius: 2, border: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "rgba(9, 13, 23, 0.6)" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="hsts_subdomains"
                        sx={{
                          color: "rgba(148, 163, 184, 0.6)",
                          "&.Mui-checked": { color: "#7f5bff" }
                        }}
                      />
                    }
                    label="Include subdomains in HSTS"
                    sx={{ width: "100%", m: 0 }}
                  />
                </Box>
                <Box sx={{ p: 1, borderRadius: 2, border: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "rgba(9, 13, 23, 0.6)" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="skip_https_hostname_validation"
                        sx={{
                          color: "rgba(148, 163, 184, 0.6)",
                          "&.Mui-checked": { color: "#7f5bff" }
                        }}
                      />
                    }
                    label="Skip HTTPS hostname validation"
                    sx={{ width: "100%", m: 0 }}
                  />
                </Box>
                <Box sx={{ p: 1, borderRadius: 2, border: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "rgba(9, 13, 23, 0.6)" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        name="enabled"
                        defaultChecked
                        sx={{
                          color: "rgba(148, 163, 184, 0.6)",
                          "&.Mui-checked": { color: "#7f5bff" }
                        }}
                      />
                    }
                    label="Enabled"
                    sx={{ width: "100%", m: 0 }}
                  />
                </Box>
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
    <Box sx={{ p: 1, borderRadius: 2, border: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "rgba(9, 13, 23, 0.6)" }}>
      <input type="hidden" name={`${name}_present`} value="1" />
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            defaultChecked={defaultChecked}
            sx={{
              color: "rgba(148, 163, 184, 0.6)",
              "&.Mui-checked": {
                color: "#7f5bff"
              }
            }}
          />
        }
        label={label}
        sx={{ width: "100%", m: 0 }}
      />
    </Box>
  );
}
