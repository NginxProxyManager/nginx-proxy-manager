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
import type { RedirectHost } from "@/src/lib/models/redirect-hosts";
import { createRedirectAction, deleteRedirectAction, updateRedirectAction } from "./actions";

type Props = {
  redirects: RedirectHost[];
};

export default function RedirectsClient({ redirects }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Redirects
        </Typography>
        <Typography color="text.secondary">Return HTTP 301/302 responses to guide clients toward canonical hosts.</Typography>
      </Stack>

      <Stack spacing={3}>
        {redirects.map((redirect) => (
          <Card key={redirect.id}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    {redirect.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {redirect.domains.join(", ")}
                  </Typography>
                </Box>
                <Chip
                  label={redirect.enabled ? "Enabled" : "Disabled"}
                  color={redirect.enabled ? "success" : "warning"}
                  variant={redirect.enabled ? "filled" : "outlined"}
                />
              </Box>

              <Accordion elevation={0} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography fontWeight={600}>Edit</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  <Stack component="form" action={(formData) => updateRedirectAction(redirect.id, formData)} spacing={2}>
                    <TextField name="name" label="Name" defaultValue={redirect.name} fullWidth />
                    <TextField
                      name="domains"
                      label="Domains"
                      defaultValue={redirect.domains.join("\n")}
                      multiline
                      minRows={2}
                      fullWidth
                    />
                    <TextField name="destination" label="Destination URL" defaultValue={redirect.destination} fullWidth />
                    <TextField
                      name="status_code"
                      label="Status code"
                      type="number"
                      inputProps={{ min: 200, max: 399 }}
                      defaultValue={redirect.status_code}
                      fullWidth
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
                      <HiddenCheckboxField
                        name="preserve_query"
                        defaultChecked={redirect.preserve_query}
                        label="Preserve path/query"
                      />
                      <HiddenCheckboxField name="enabled" defaultChecked={redirect.enabled} label="Enabled" />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained">
                        Save
                      </Button>
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Box component="form" action={deleteRedirectAction.bind(null, redirect.id)}>
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
          Create redirect
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createRedirectAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="Example redirect" required fullWidth />
              <TextField
                name="domains"
                label="Domains"
                placeholder="old.example.com"
                multiline
                minRows={2}
                required
                fullWidth
              />
              <TextField name="destination" label="Destination URL" placeholder="https://new.example.com" required fullWidth />
              <TextField
                name="status_code"
                label="Status code"
                type="number"
                inputProps={{ min: 200, max: 399 }}
                defaultValue={302}
                fullWidth
              />
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
                <FormControlLabel control={<Checkbox name="preserve_query" defaultChecked />} label="Preserve path/query" />
                <FormControlLabel control={<Checkbox name="enabled" defaultChecked />} label="Enabled" />
              </Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create Redirect
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
