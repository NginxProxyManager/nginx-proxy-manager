"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { signIn } from "next-auth/react";

export default function LoginClient() {
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setLoginPending(true);

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!username || !password) {
      setLoginError("Username and password are required.");
      setLoginPending(false);
      return;
    }

    const result = await signIn("credentials", {
      redirect: false,
      callbackUrl: "/",
      username,
      password
    });

    if (!result || result.error) {
      setLoginError("Invalid username or password.");
      setLoginPending(false);
      return;
    }

    router.replace(result.url ?? "/");
    router.refresh();
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
      <Card sx={{ maxWidth: 440, width: "100%", p: 1.5 }} elevation={6}>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={1} textAlign="center">
              <Typography variant="h5" fontWeight={600}>
                Caddy Proxy Manager
              </Typography>
              <Typography color="text.secondary">Sign in with your credentials</Typography>
            </Stack>

            {loginError && <Alert severity="error">{loginError}</Alert>}

            <Stack component="form" onSubmit={handleSignIn} spacing={2}>
              <TextField name="username" label="Username" required fullWidth autoComplete="username" autoFocus />
              <TextField name="password" label="Password" type="password" required fullWidth autoComplete="current-password" />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loginPending}>
                {loginPending ? "Signing in…" : "Sign in"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
