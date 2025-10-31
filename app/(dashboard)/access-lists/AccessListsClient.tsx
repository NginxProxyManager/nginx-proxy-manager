"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { AccessList } from "@/src/lib/models/access-lists";
import {
  addAccessEntryAction,
  createAccessListAction,
  deleteAccessEntryAction,
  deleteAccessListAction,
  updateAccessListAction
} from "./actions";

type Props = {
  lists: AccessList[];
};

export default function AccessListsClient({ lists }: Props) {
  return (
    <Stack spacing={4} sx={{ width: "100%" }}>
      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={600}>
          Access Lists
        </Typography>
        <Typography color="text.secondary">Protect proxy hosts with HTTP basic authentication credentials.</Typography>
      </Stack>

      <Stack spacing={3}>
        {lists.map((list) => (
          <Card key={list.id}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Stack component="form" action={(formData) => updateAccessListAction(list.id, formData)} spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  Access List
                </Typography>
                <TextField name="name" label="Name" defaultValue={list.name} fullWidth />
                <TextField
                  name="description"
                  label="Description"
                  defaultValue={list.description ?? ""}
                  multiline
                  minRows={2}
                  fullWidth
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                  <Button type="submit" variant="contained">
                    Save
                  </Button>
                  <Button
                    type="submit"
                    formAction={deleteAccessListAction.bind(null, list.id)}
                    variant="outlined"
                    color="error"
                  >
                    Delete list
                  </Button>
                </Box>
              </Stack>

              <Divider sx={{ my: 1 }} />

              <Stack spacing={1.5}>
                <Typography fontWeight={600}>Accounts</Typography>
                {list.entries.length === 0 ? (
                  <Typography color="text.secondary">No credentials configured.</Typography>
                ) : (
                  <List dense disablePadding>
                    {list.entries.map((entry) => (
                      <ListItem key={entry.id} sx={{ bgcolor: "background.default", borderRadius: 2, mb: 1 }}>
                        <ListItemText primary={entry.username} secondary={`Created ${new Date(entry.created_at).toLocaleDateString()}`} />
                        <ListItemSecondaryAction>
                          <form action={deleteAccessEntryAction.bind(null, list.id, entry.id)}>
                            <IconButton type="submit" edge="end" color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </form>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Stack>

              <Divider sx={{ my: 1 }} />

              <Stack component="form" action={(formData) => addAccessEntryAction(list.id, formData)} spacing={1.5} direction={{ xs: "column", sm: "row" }}>
                <TextField name="username" label="Username" required fullWidth />
                <TextField name="password" label="Password" type="password" required fullWidth />
                <Button type="submit" variant="contained">
                  Add
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack spacing={2} component="section">
        <Typography variant="h6" fontWeight={600}>
          Create access list
        </Typography>
        <Card>
          <CardContent>
            <Stack component="form" action={createAccessListAction} spacing={2}>
              <TextField name="name" label="Name" placeholder="Internal users" required fullWidth />
              <TextField name="description" label="Description" placeholder="Optional description" multiline minRows={2} fullWidth />
              <TextField
                name="users"
                label="Seed members"
                helperText="One per line, username:password"
                multiline
                minRows={3}
                fullWidth
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="contained">
                  Create Access List
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
