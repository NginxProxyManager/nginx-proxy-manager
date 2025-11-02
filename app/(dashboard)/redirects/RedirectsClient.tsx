"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
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
import type { RedirectHost } from "@/src/lib/models/redirect-hosts";
import { INITIAL_ACTION_STATE } from "@/src/lib/actions";
import { createRedirectAction, deleteRedirectAction, updateRedirectAction } from "./actions";

type Props = {
  redirects: RedirectHost[];
};

export default function RedirectsClient({ redirects }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editRedirect, setEditRedirect] = useState<RedirectHost | null>(null);
  const [deleteRedirect, setDeleteRedirect] = useState<RedirectHost | null>(null);

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
            Redirects
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 600 }}>
            Return HTTP 301/302 responses to guide clients toward canonical hosts.
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
          Create Redirect
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
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Destination</TableCell>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Status Code</TableCell>
              <TableCell sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {redirects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6, color: "text.secondary" }}>
                  No redirects configured. Click "Create Redirect" to add one.
                </TableCell>
              </TableRow>
            ) : (
              redirects.map((redirect) => (
                <TableRow
                  key={redirect.id}
                  sx={{
                    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.02)" }
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(255, 255, 255, 0.9)" }}>
                      {redirect.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.8125rem" }}>
                      {redirect.domains.join(", ")}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.8125rem" }}>
                      {redirect.destination}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={redirect.status_code}
                      size="small"
                      sx={{
                        bgcolor: "rgba(99, 102, 241, 0.15)",
                        color: "rgba(99, 102, 241, 1)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        fontWeight: 500,
                        fontSize: "0.75rem"
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={redirect.enabled ? "Enabled" : "Disabled"}
                      size="small"
                      sx={{
                        bgcolor: redirect.enabled ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                        color: redirect.enabled ? "rgba(34, 197, 94, 1)" : "rgba(148, 163, 184, 0.8)",
                        border: "1px solid",
                        borderColor: redirect.enabled ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.3)",
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
                          onClick={() => setEditRedirect(redirect)}
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
                          onClick={() => setDeleteRedirect(redirect)}
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

      <CreateRedirectDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {editRedirect && (
        <EditRedirectDialog
          open={!!editRedirect}
          redirect={editRedirect}
          onClose={() => setEditRedirect(null)}
        />
      )}

      {deleteRedirect && (
        <DeleteRedirectDialog
          open={!!deleteRedirect}
          redirect={deleteRedirect}
          onClose={() => setDeleteRedirect(null)}
        />
      )}
    </Stack>
  );
}

function CreateRedirectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction] = useFormState(createRedirectAction, INITIAL_ACTION_STATE);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
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
          Create Redirect
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="create-form" action={formAction} spacing={2.5}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"} onClose={() => state.status === "success" && onClose()}>
              {state.message}
            </Alert>
          )}
          <TextField name="name" label="Name" placeholder="Example redirect" required fullWidth />
          <TextField
            name="domains"
            label="Domains"
            placeholder="old.example.com"
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            required
            fullWidth
          />
          <TextField
            name="destination"
            label="Destination URL"
            placeholder="https://new.example.com"
            required
            fullWidth
          />
          <TextField
            name="status_code"
            label="Status Code"
            type="number"
            inputProps={{ min: 200, max: 399 }}
            defaultValue={302}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <HiddenCheckboxField name="preserve_query" defaultChecked={true} label="Preserve Path/Query" />
            <HiddenCheckboxField name="enabled" defaultChecked={true} label="Enabled" />
          </Stack>
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

function EditRedirectDialog({
  open,
  redirect,
  onClose
}: {
  open: boolean;
  redirect: RedirectHost;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(updateRedirectAction.bind(null, redirect.id), INITIAL_ACTION_STATE);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
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
          Edit Redirect
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack component="form" id="edit-form" action={formAction} spacing={2.5}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"} onClose={() => state.status === "success" && onClose()}>
              {state.message}
            </Alert>
          )}
          <TextField name="name" label="Name" defaultValue={redirect.name} fullWidth />
          <TextField
            name="domains"
            label="Domains"
            defaultValue={redirect.domains.join("\n")}
            helperText="One per line or comma-separated"
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            name="destination"
            label="Destination URL"
            defaultValue={redirect.destination}
            fullWidth
          />
          <TextField
            name="status_code"
            label="Status Code"
            type="number"
            inputProps={{ min: 200, max: 399 }}
            defaultValue={redirect.status_code}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <HiddenCheckboxField name="preserve_query" defaultChecked={redirect.preserve_query} label="Preserve Path/Query" />
            <HiddenCheckboxField name="enabled" defaultChecked={redirect.enabled} label="Enabled" />
          </Stack>
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

function DeleteRedirectDialog({
  open,
  redirect,
  onClose
}: {
  open: boolean;
  redirect: RedirectHost;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(deleteRedirectAction.bind(null, redirect.id), INITIAL_ACTION_STATE);

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
          Delete Redirect
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {state.status !== "idle" && state.message && (
            <Alert severity={state.status === "error" ? "error" : "success"} onClose={() => state.status === "success" && onClose()}>
              {state.message}
            </Alert>
          )}
          <Typography variant="body1">
            Are you sure you want to delete the redirect <strong>{redirect.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This will remove the redirect from:
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body2" color="text.secondary">
              • Domains: {redirect.domains.join(", ")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • To: {redirect.destination}
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

function HiddenCheckboxField({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <Box>
      <input type="hidden" name={`${name}_present`} value="1" />
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            defaultChecked={defaultChecked}
            size="small"
            sx={{
              color: "rgba(148, 163, 184, 0.6)",
              "&.Mui-checked": { color: "#6366f1" }
            }}
          />
        }
        label={<Typography variant="body2">{label}</Typography>}
      />
    </Box>
  );
}
