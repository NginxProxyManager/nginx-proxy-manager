import { listAuditEvents } from "@/src/lib/models/audit";
import { listUsers } from "@/src/lib/models/user";

export default function AuditLogPage() {
  const events = listAuditEvents(200);
  const users = new Map(listUsers().map((user) => [user.id, user]));

  return (
    <div className="page">
      <header>
        <h1>Audit Log</h1>
        <p>Review configuration changes and user activity.</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>User</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const user = event.user_id ? users.get(event.user_id) : null;
            return (
              <tr key={event.id}>
                <td>{new Date(event.created_at).toLocaleString()}</td>
                <td>{user ? user.name ?? user.email : "System"}</td>
                <td>{event.action}</td>
                <td>{event.entity_type}</td>
                <td>{event.summary ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <style jsx>{`
        .page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        header p {
          color: rgba(255, 255, 255, 0.6);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          border-radius: 16px;
          overflow: hidden;
        }
        thead {
          background: rgba(16, 24, 38, 0.95);
        }
        th,
        td {
          padding: 0.9rem 1.1rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        tbody tr:nth-child(even) {
          background: rgba(8, 12, 20, 0.9);
        }
        tbody tr:hover {
          background: rgba(0, 114, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
