"use client";

import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import type { CloudflareSettings, GeneralSettings, OAuthSettings } from "@/src/lib/settings";
import {
  updateCloudflareSettingsAction,
  updateGeneralSettingsAction,
  updateOAuthSettingsAction
} from "./actions";

type Props = {
  general: GeneralSettings | null;
  oauth: OAuthSettings | null;
  cloudflare: CloudflareSettings | null;
};

export default function SettingsClient({ general, oauth, cloudflare }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Settings
        </Typography>
        <Typography color="text.secondary">Configure organization-wide defaults, authentication, and DNS automation.</Typography>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            General
          </Typography>
          <Stack component="form" action={updateGeneralSettingsAction} spacing={2}>
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
            OAuth2 Authentication
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
            Provide the OAuth 2.0 endpoints and client credentials issued by your identity provider. Scopes should include profile and
            email data.
          </Typography>
          <Stack component="form" action={updateOAuthSettingsAction} spacing={2}>
            <TextField name="authorizationUrl" label="Authorization URL" defaultValue={oauth?.authorizationUrl ?? ""} required fullWidth />
            <TextField name="tokenUrl" label="Token URL" defaultValue={oauth?.tokenUrl ?? ""} required fullWidth />
            <TextField name="userInfoUrl" label="User info URL" defaultValue={oauth?.userInfoUrl ?? ""} required fullWidth />
            <TextField name="clientId" label="Client ID" defaultValue={oauth?.clientId ?? ""} required fullWidth />
            <TextField name="clientSecret" label="Client secret" defaultValue={oauth?.clientSecret ?? ""} required fullWidth />
            <TextField name="scopes" label="Scopes" defaultValue={oauth?.scopes ?? "openid email profile"} fullWidth />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField name="emailClaim" label="Email claim" defaultValue={oauth?.emailClaim ?? "email"} fullWidth />
              <TextField name="nameClaim" label="Name claim" defaultValue={oauth?.nameClaim ?? "name"} fullWidth />
              <TextField name="avatarClaim" label="Avatar claim" defaultValue={oauth?.avatarClaim ?? "picture"} fullWidth />
            </Stack>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="contained">
                Save OAuth settings
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
          <Stack component="form" action={updateCloudflareSettingsAction} spacing={2}>
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
