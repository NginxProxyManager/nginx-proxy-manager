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
import type { Certificate } from "@/src/lib/models/certificates";
import { createCertificateAction, deleteCertificateAction, updateCertificateAction } from "./actions";

type Props = {
  certificates: Certificate[];
};

export default function CertificatesClient({ certificates }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Certificates
        </Typography>
        <Typography color="text.secondary">
          Manage ACME-managed certificates or import your own PEM files for custom deployments.
        </Typography>
      </Stack>

      <Stack spacing={3}>
        {certificates.map((cert) => (
          <Card key={cert.id}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    {cert.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {cert.domain_names.join(", ")}
                  </Typography>
                </Box>
                <Chip label={cert.type === "managed" ? "Managed" : "Imported"} color="primary" variant="outlined" />
              </Box>

              <Accordion elevation={0} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography fontWeight={600}>Edit</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  <Stack component="form" action={(formData) => updateCertificateAction(cert.id, formData)} spacing={2}>
                    <TextField name="name" label="Name" defaultValue={cert.name} fullWidth />
                    <TextField
                      name="domain_names"
                      label="Domains"
                      defaultValue={cert.domain_names.join("\n")}
                      multiline
                      minRows={3}
                      fullWidth
                    />
                    <TextField select name="type" label="Type" defaultValue={cert.type} fullWidth>
                      <MenuItem value="managed">Managed (ACME)</MenuItem>
                      <MenuItem value="imported">Imported</MenuItem>
                    </TextField>
                    {cert.type === "managed" ? (
                      <Box>
                        <input type="hidden" name="auto_renew_present" value="1" />
                        <FormControlLabel control={<Checkbox name="auto_renew" defaultChecked={cert.auto_renew} />} label="Auto renew" />
                      </Box>
                    ) : (
                      <>
                        <TextField
                          name="certificate_pem"
                          label="Certificate PEM"
                          placeholder="-----BEGIN CERTIFICATE-----"
                          multiline
                          minRows={6}
                          fullWidth
                        />
                        <TextField
                          name="private_key_pem"
                          label="Private key PEM"
                          placeholder="-----BEGIN PRIVATE KEY-----"
                          multiline
                          minRows={6}
                          fullWidth
                        />
                      </>
                    )}
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                      <Button type="submit" variant="contained">
                        Save certificate
                      </Button>
                      <Button
                        type="submit"
                        formAction={deleteCertificateAction.bind(null, cert.id)}
                        variant="outlined"
                        color="error"
                      >
                        Delete
                      </Button>
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack spacing={2} component="section">
        <Typography variant="h6" fontWeight={600}>
          Create certificate
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createCertificateAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="Wildcard certificate" required fullWidth />
              <TextField
                name="domain_names"
                label="Domains"
                placeholder="example.com"
                multiline
                minRows={3}
                required
                fullWidth
              />
              <TextField select name="type" label="Type" defaultValue="managed" fullWidth>
                <MenuItem value="managed">Managed (ACME)</MenuItem>
                <MenuItem value="imported">Imported</MenuItem>
              </TextField>
              <FormControlLabel control={<Checkbox name="auto_renew" defaultChecked />} label="Auto renew (managed only)" />
              <TextField
                name="certificate_pem"
                label="Certificate PEM"
                placeholder="Paste PEM content for imported certificates"
                multiline
                minRows={5}
                fullWidth
              />
              <TextField
                name="private_key_pem"
                label="Private key PEM"
                placeholder="Paste PEM key for imported certificates"
                multiline
                minRows={5}
                fullWidth
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create certificate
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
