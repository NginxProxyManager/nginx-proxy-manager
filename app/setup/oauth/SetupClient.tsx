"use client";

import { Box, Button, Card, CardContent, Grid, Stack, TextField, Typography } from "@mui/material";

export default function OAuthSetupClient({ startSetup }: { startSetup: (formData: FormData) => void }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
      <Card sx={{ width: { xs: "90vw", sm: 640 }, p: { xs: 2, sm: 3 } }}>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h4" fontWeight={600}>
                Configure OAuth2
              </Typography>
              <Typography color="text.secondary">
                Provide the OAuth configuration for your identity provider to finish setting up Caddy Proxy Manager. The first user who
                signs in becomes the administrator.
              </Typography>
            </Stack>

            <Stack component="form" action={startSetup} spacing={2}>
              <TextField
                name="authorizationUrl"
                label="Authorization URL"
                placeholder="https://id.example.com/oauth2/authorize"
                required
                fullWidth
              />
              <TextField name="tokenUrl" label="Token URL" placeholder="https://id.example.com/oauth2/token" required fullWidth />
              <TextField
                name="userInfoUrl"
                label="User info URL"
                placeholder="https://id.example.com/oauth2/userinfo"
                required
                fullWidth
              />
              <TextField name="clientId" label="Client ID" placeholder="client-id" required fullWidth />
              <TextField name="clientSecret" label="Client secret" placeholder="client-secret" required fullWidth />
              <TextField name="scopes" label="Scopes" defaultValue="openid email profile" fullWidth />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField name="emailClaim" label="Email claim" defaultValue="email" fullWidth />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField name="nameClaim" label="Name claim" defaultValue="name" fullWidth />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField name="avatarClaim" label="Avatar claim" defaultValue="picture" fullWidth />
                </Grid>
              </Grid>
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained" size="large">
                  Save OAuth configuration
                </Button>
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
