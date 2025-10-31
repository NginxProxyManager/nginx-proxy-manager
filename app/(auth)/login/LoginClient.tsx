"use client";

import Link from "next/link";
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { signIn } from "next-auth/react";

export default function LoginClient({ oauthConfigured, providerId }: { oauthConfigured: boolean; providerId: string }) {
  const handleSignIn = async () => {
    await signIn(providerId, { callbackUrl: "/" });
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
      <Card sx={{ maxWidth: 420, width: "100%", p: 1.5 }} elevation={6}>
        <CardContent>
          <Stack spacing={3} textAlign="center">
            <Stack spacing={1}>
              <Typography variant="h5" fontWeight={600}>
                Caddy Proxy Manager
              </Typography>
              <Typography color="text.secondary">
                Sign in with your organization&apos;s OAuth2 provider to continue.
              </Typography>
            </Stack>

            {oauthConfigured ? (
              <Button onClick={handleSignIn} variant="contained" size="large" fullWidth>
                Sign in with OAuth2
              </Button>
            ) : (
              <Alert severity="warning">
                The system administrator needs to configure OAuth2 settings before logins are allowed. If this is a fresh installation,
                start with the <Link href="/setup/oauth">OAuth setup wizard</Link>.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
