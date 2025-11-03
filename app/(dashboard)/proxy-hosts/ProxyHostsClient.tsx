"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import { useFormState } from "react-dom";
import type { AccessList } from "@/src/lib/models/access-lists";
import type { Certificate } from "@/src/lib/models/certificates";
import type { ProxyHost } from "@/src/lib/models/proxy-hosts";
import { INITIAL_ACTION_STATE, type ActionState } from "@/src/lib/actions";
import { createProxyHostAction, deleteProxyHostAction, updateProxyHostAction } from "./actions";

type Props = {
  hosts: ProxyHost[];
  certificates: Certificate[];
  accessLists: AccessList[];
};

const AUTHENTIK_DEFAULT_HEADERS = [
  "X-Authentik-Username",
  "X-Authentik-Groups",
  "X-Authentik-Entitlements",
  "X-Authentik-Email",
  "X-Authentik-Name",
  "X-Authentik-Uid",
  "X-Authentik-Jwt",
  "X-Authentik-Meta-Jwks",
  "X-Authentik-Meta-Outpost",
  "X-Authentik-Meta-Provider",
  "X-Authentik-Meta-App",
  "X-Authentik-Meta-Version"
];

const AUTHENTIK_DEFAULT_TRUSTED_PROXIES = ["private_ranges"];

export default function ProxyHostsClient({ hosts, certificates, accessLists }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editHost, setEditHost] = useState<ProxyHost | null>(null);
  const [deleteHost, setDeleteHost] = useState<ProxyHost | null>(null);

  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Stack spacing={1}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "rgba(255, 255, 255, 0.95)"
            }}
          >
            Proxy Hosts
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 600 }}>
            Define HTTP(S) reverse proxies orchestrated by Caddy with automated certificates.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{
            bgcolor: "rgba(99, 102, 241, 0.9)",
            "&:hover": { bgcolor: "rgba(99, 102, 241, 1)" }
          }}
        >
          Create Host
        </Button>
      </Stack>

      <TableContainer
        component={Card}
        sx={{
          background: "rgba(20, 20, 22, 0.6)",
          border: "0.5px solid rgba(255, 255, 255, 0.08)"
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(255, 255, 255, 0.02)" }}>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Domains</TableCell>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Upstreams</TableCell>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hosts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: "text.secondary" }}>
                  No proxy hosts configured. Click "Create Host" to add one.
                </TableCell>
              </TableRow>
            ) : (
              hosts.map((host) => (
                <TableRow
                  key={host.id}
                  sx={{
                    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.02)" }
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(255, 255, 255, 0.9)" }}>
                      {host.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.8125rem" }}>
                      {host.domains.slice(0, 2).join(", ")}
                      {host.domains.length > 2 && ` +${host.domains.length - 2} more`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.8125rem" }}>
                      {host.upstreams.slice(0, 2).join(", ")}
                      {host.upstreams.length > 2 && ` +${host.upstreams.length - 2} more`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={host.enabled ? "Enabled" : "Disabled"}
                      size="small"
                      sx={{
                        bgcolor: host.enabled ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                        color: host.enabled ? "rgba(34, 197, 94, 1)" : "rgba(148, 163, 184, 0.8)",
                        border: "1px solid",
                        borderColor: host.enabled ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.3)",
                        fontWeight: 500,
                        fontSize: "0.75rem"
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => setEditHost(host)}
                          sx={{
                            color: "rgba(99, 102, 241, 0.8)",
                            "&:hover": { bgcolor: "rgba(99, 102, 241, 0.1)" }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => setDeleteHost(host)}
                          sx={{
                            color: "rgba(239, 68, 68, 0.8)",
                            "&:hover": { bgcolor: "rgba(239, 68, 68, 0.1)" }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <CreateHostDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        certificates={certificates}
        accessLists={accessLists}
      />

      {editHost && (
        <EditHostDialog
          open={!!editHost}
          host={editHost}
          onClose={() => setEditHost(null)}
          certificates={certificates}
          accessLists={accessLists}
        />
      )}

      {deleteHost && (
        <DeleteHostDialog
          open={!!deleteHost}
          host={deleteHost}
          onClose={() => setDeleteHost(null)}
        />
      )}
    </Stack>
  );
}

function CreateHostDialog({
  open,
  onClose,
  certificates,
  accessLists
}: {
  open: boolean;
  onClose: () => void;
  certificates: Certificate[];
  accessLists: AccessList[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(createProxyHostAction, INITIAL_ACTION_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      setTimeout(onClose, 1000);
    }
  }, [state.status, router, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "rgba(20, 20, 22, 0.98)",
          border: "0.5px solid rgba(255, 255, 255, 0.1)",
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Create Proxy Host
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="create-form" action={formAction} spacing={2.5}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"}>
              {state.message}
            </Alert>
          )}
          <TextField name="name" label="Name" placeholder="My Service" required fullWidth />
          <TextField
            name="domains"
            label="Domains"
            placeholder="app.example.com"
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            required
            fullWidth
          />
          <TextField
            name="upstreams"
            label="Upstreams"
            placeholder="http://10.0.0.5:8080"
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            required
            fullWidth
          />
          <TextField select name="certificate_id" label="Certificate" defaultValue="" fullWidth>
            <MenuItem value="">Managed by Caddy (Auto)</MenuItem>
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
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <HiddenCheckboxField name="hsts_subdomains" defaultChecked={false} label="HSTS Subdomains" />
            <HiddenCheckboxField name="skip_https_hostname_validation" defaultChecked={false} label="Skip HTTPS Validation" />
            <HiddenCheckboxField name="enabled" defaultChecked={true} label="Enabled" />
          </Stack>
          <TextField
            name="custom_pre_handlers_json"
            label="Custom Pre-Handlers (JSON)"
            placeholder='[{"handler": "headers", ...}]'
            helperText="Optional JSON array of Caddy handlers"
            multiline
            minRows={3}
            fullWidth
          />
          <TextField
            name="custom_reverse_proxy_json"
            label="Custom Reverse Proxy (JSON)"
            placeholder='{"headers": {"request": {...}}}'
            helperText="Deep-merge into reverse_proxy handler"
            multiline
            minRows={3}
            fullWidth
          />
          <AuthentikFields />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: "rgba(255, 255, 255, 0.6)" }}>
          Cancel
        </Button>
        <Button type="submit" form="create-form" variant="contained">
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditHostDialog({
  open,
  host,
  onClose,
  certificates,
  accessLists
}: {
  open: boolean;
  host: ProxyHost;
  onClose: () => void;
  certificates: Certificate[];
  accessLists: AccessList[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(updateProxyHostAction.bind(null, host.id), INITIAL_ACTION_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      setTimeout(onClose, 1000);
    }
  }, [state.status, router, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "rgba(20, 20, 22, 0.98)",
          border: "0.5px solid rgba(255, 255, 255, 0.1)",
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Edit Proxy Host
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="edit-form" action={formAction} spacing={2.5}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"}>
              {state.message}
            </Alert>
          )}
          <TextField name="name" label="Name" defaultValue={host.name} required fullWidth />
          <TextField
            name="domains"
            label="Domains"
            defaultValue={host.domains.join("\n")}
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            name="upstreams"
            label="Upstreams"
            defaultValue={host.upstreams.join("\n")}
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            fullWidth
          />
          <TextField select name="certificate_id" label="Certificate" defaultValue={host.certificate_id ?? ""} fullWidth>
            <MenuItem value="">Managed by Caddy (Auto)</MenuItem>
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
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <HiddenCheckboxField name="hsts_subdomains" defaultChecked={host.hsts_subdomains} label="HSTS Subdomains" />
            <HiddenCheckboxField name="skip_https_hostname_validation" defaultChecked={host.skip_https_hostname_validation} label="Skip HTTPS Validation" />
            <HiddenCheckboxField name="enabled" defaultChecked={host.enabled} label="Enabled" />
          </Stack>
          <TextField
            name="custom_pre_handlers_json"
            label="Custom Pre-Handlers (JSON)"
            defaultValue={host.custom_pre_handlers_json ?? ""}
            helperText="Optional JSON array of Caddy handlers"
            multiline
            minRows={3}
            fullWidth
          />
          <TextField
            name="custom_reverse_proxy_json"
            label="Custom Reverse Proxy (JSON)"
            defaultValue={host.custom_reverse_proxy_json ?? ""}
            helperText="Deep-merge into reverse_proxy handler"
            multiline
            minRows={3}
            fullWidth
          />
          <AuthentikFields authentik={host.authentik} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: "rgba(255, 255, 255, 0.6)" }}>
          Cancel
        </Button>
        <Button type="submit" form="edit-form" variant="contained">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteHostDialog({
  open,
  host,
  onClose
}: {
  open: boolean;
  host: ProxyHost;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(deleteProxyHostAction.bind(null, host.id), INITIAL_ACTION_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      setTimeout(onClose, 1000);
    }
  }, [state.status, router, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      PaperProps={{
        sx: {
          bgcolor: "rgba(20, 20, 22, 0.98)",
          border: "0.5px solid rgba(239, 68, 68, 0.3)",
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: "rgba(239, 68, 68, 1)" }}>
          Delete Proxy Host
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"}>
              {state.message}
            </Alert>
          )}
          <Typography variant="body1">
            Are you sure you want to delete the proxy host <strong>{host.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This will remove the configuration for:
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body2" color="text.secondary">
              • Domains: {host.domains.join(", ")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Upstreams: {host.upstreams.join(", ")}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: "rgba(239, 68, 68, 0.9)", fontWeight: 500 }}>
            This action cannot be undone.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: "rgba(255, 255, 255, 0.6)" }}>
          Cancel
        </Button>
        <form action={formAction} style={{ display: 'inline' }}>
          <Button
            type="submit"
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </form>
      </DialogActions>
    </Dialog>
  );
}

function AuthentikFields({ authentik }: { authentik?: ProxyHost["authentik"] | null }) {
  const initial = authentik ?? null;
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);

  const copyHeadersValue =
    initial && initial.copyHeaders.length > 0 ? initial.copyHeaders.join("\n") : AUTHENTIK_DEFAULT_HEADERS.join("\n");
  const trustedProxiesValue =
    initial && initial.trustedProxies.length > 0
      ? initial.trustedProxies.join("\n")
      : AUTHENTIK_DEFAULT_TRUSTED_PROXIES.join("\n");
  const setHostHeaderDefault = initial?.setOutpostHostHeader ?? true;

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid rgba(99, 102, 241, 0.2)",
        background: "rgba(99, 102, 241, 0.05)",
        p: 2.5
      }}
    >
      <input type="hidden" name="authentik_present" value="1" />
      <input type="hidden" name="authentik_enabled_present" value="1" />
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Authentik Forward Auth
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
              Proxy authentication via Authentik outpost
            </Typography>
          </Box>
          <Switch
            name="authentik_enabled"
            checked={enabled}
            onChange={(_, checked) => setEnabled(checked)}
          />
        </Stack>

        <Collapse in={enabled} timeout="auto" unmountOnExit>
          <Stack spacing={2}>
            <TextField
              name="authentik_outpost_domain"
              label="Outpost Domain"
              placeholder="outpost.goauthentik.io"
              defaultValue={initial?.outpostDomain ?? ""}
              required={enabled}
              disabled={!enabled}
              size="small"
              fullWidth
            />
            <TextField
              name="authentik_outpost_upstream"
              label="Outpost Upstream URL"
              placeholder="https://outpost.internal:9000"
              defaultValue={initial?.outpostUpstream ?? ""}
              required={enabled}
              disabled={!enabled}
              size="small"
              fullWidth
            />
            <TextField
              name="authentik_auth_endpoint"
              label="Auth Endpoint (Optional)"
              placeholder="/outpost.goauthentik.io/auth/caddy"
              defaultValue={initial?.authEndpoint ?? ""}
              disabled={!enabled}
              size="small"
              fullWidth
            />
            <TextField
              name="authentik_copy_headers"
              label="Headers to Copy"
              defaultValue={copyHeadersValue}
              disabled={!enabled}
              multiline
              minRows={3}
              size="small"
              fullWidth
            />
            <TextField
              name="authentik_trusted_proxies"
              label="Trusted Proxies"
              defaultValue={trustedProxiesValue}
              disabled={!enabled}
              size="small"
              fullWidth
            />
            <HiddenCheckboxField
              name="authentik_set_host_header"
              defaultChecked={setHostHeaderDefault}
              label="Set Host Header"
              disabled={!enabled}
            />
          </Stack>
        </Collapse>
      </Stack>
    </Box>
  );
}

function HiddenCheckboxField({
  name,
  defaultChecked,
  label,
  disabled
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Box>
      <input type="hidden" name={`${name}_present`} value="1" />
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            defaultChecked={defaultChecked}
            disabled={disabled}
            size="small"
            sx={{
              color: "rgba(148, 163, 184, 0.6)",
              "&.Mui-checked": { color: "#6366f1" }
            }}
          />
        }
        label={<Typography variant="body2">{label}</Typography>}
        disabled={disabled}
      />
    </Box>
  );
}
