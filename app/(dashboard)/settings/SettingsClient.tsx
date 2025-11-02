"use client";

import { useFormState } from "react-dom";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import type { CloudflareSettings, GeneralSettings } from "@/src/lib/settings";
import {
  updateCloudflareSettingsAction,
  updateGeneralSettingsAction
} from "./actions";

type Props = {
  general: GeneralSettings | null;
  cloudflare: CloudflareSettings | null;
};

export default function SettingsClient({ general, cloudflare }: Props) {
  const [generalState, generalFormAction] = useFormState(updateGeneralSettingsAction, null);
  const [cloudflareState, cloudflareFormAction] = useFormState(updateCloudflareSettingsAction, null);

  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Settings
        </Typography>
        <Typography color="text.secondary">Configure organization-wide defaults and DNS automation.</Typography>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            General
          </Typography>
          <Stack component="form" action={generalFormAction} spacing={2}>
            {generalState?.message && (
              <Alert severity={generalState.success ? "success" : "error"}>
                {generalState.message}
              </Alert>
            )}
            <TextField
              name="primaryDomain"
              label="Primary domain"
              defaultValue={general?.primaryDomain ?? "caddyproxymanager.com"}
              required
              fullWidth
            />
            <TextField
              name="acmeEmail"
              label="ACME contact email"
              type="email"
              defaultValue={general?.acmeEmail ?? ""}
              fullWidth
            />
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="contained">
                Save general settings
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Cloudflare DNS
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
            Configure a Cloudflare API token with Zone.DNS Edit permissions to enable DNS-01 challenges for wildcard certificates.
          </Typography>
          <Stack component="form" action={cloudflareFormAction} spacing={2}>
            {cloudflareState?.message && (
              <Alert severity={cloudflareState.success ? "success" : "warning"}>
                {cloudflareState.message}
              </Alert>
            )}
            <TextField name="apiToken" label="API token" defaultValue={cloudflare?.apiToken ?? ""} fullWidth />
            <TextField name="zoneId" label="Zone ID" defaultValue={cloudflare?.zoneId ?? ""} fullWidth />
            <TextField name="accountId" label="Account ID" defaultValue={cloudflare?.accountId ?? ""} fullWidth />
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="contained">
                Save Cloudflare settings
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
