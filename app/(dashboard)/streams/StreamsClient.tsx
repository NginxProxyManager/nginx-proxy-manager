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
  MenuItem,
  Stack,
  TextField,
  Typography,
  Checkbox
} from "@mui/material";
import type { StreamHost } from "@/src/lib/models/stream-hosts";
import { createStreamAction, deleteStreamAction, updateStreamAction } from "./actions";

type Props = {
  streams: StreamHost[];
};

export default function StreamsClient({ streams }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Streams
        </Typography>
        <Typography color="text.secondary">Forward raw TCP/UDP connections through Caddy&apos;s layer4 module.</Typography>
      </Stack>

      <Stack spacing={3}>
        {streams.map((stream) => (
          <Card key={stream.id}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    {stream.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Listens on :{stream.listen_port} ({stream.protocol.toUpperCase()}) → {stream.upstream}
                  </Typography>
                </Box>
                <Chip
                  label={stream.enabled ? "Enabled" : "Disabled"}
                  color={stream.enabled ? "success" : "warning"}
                  variant={stream.enabled ? "filled" : "outlined"}
                />
              </Box>

              <Accordion elevation={0} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography fontWeight={600}>Edit</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  <Stack component="form" action={(formData) => updateStreamAction(stream.id, formData)} spacing={2}>
                    <TextField name="name" label="Name" defaultValue={stream.name} fullWidth />
                    <TextField
                      name="listen_port"
                      label="Listen port"
                      type="number"
                      inputProps={{ min: 1, max: 65535 }}
                      defaultValue={stream.listen_port}
                      fullWidth
                    />
                    <TextField select name="protocol" label="Protocol" defaultValue={stream.protocol} fullWidth>
                      <MenuItem value="tcp">TCP</MenuItem>
                      <MenuItem value="udp">UDP</MenuItem>
                    </TextField>
                    <TextField name="upstream" label="Upstream" defaultValue={stream.upstream} fullWidth />
                    <Box>
                      <input type="hidden" name="enabled_present" value="1" />
                      <FormControlLabel control={<Checkbox name="enabled" defaultChecked={stream.enabled} />} label="Enabled" />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained">
                        Save
                      </Button>
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Box component="form" action={deleteStreamAction.bind(null, stream.id)}>
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
          Create stream
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createStreamAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="SSH tunnel" required fullWidth />
              <TextField
                name="listen_port"
                label="Listen port"
                type="number"
                inputProps={{ min: 1, max: 65535 }}
                placeholder="2222"
                required
                fullWidth
              />
              <TextField select name="protocol" label="Protocol" defaultValue="tcp" fullWidth>
                <MenuItem value="tcp">TCP</MenuItem>
                <MenuItem value="udp">UDP</MenuItem>
              </TextField>
              <TextField name="upstream" label="Upstream" placeholder="10.0.0.12:22" required fullWidth />
              <FormControlLabel control={<Checkbox name="enabled" defaultChecked />} label="Enabled" />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create Stream
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
