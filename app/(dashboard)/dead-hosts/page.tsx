import { listDeadHosts } from "@/src/lib/models/dead-hosts";
import { createDeadHostAction, deleteDeadHostAction, updateDeadHostAction } from "./actions";

export default function DeadHostsPage() {
  const hosts = listDeadHosts();

  return (
    <div className="page">
      <header>
        <h1>Dead Hosts</h1>
        <p>Serve friendly status pages for domains without upstreams.</p>
      </header>

      <section className="grid">
        {hosts.map((host) => (
          <div className="card" key={host.id}>
            <div className="header">
              <div>
                <h2>{host.name}</h2>
                <p>{host.domains.join(", ")}</p>
              </div>
              <span className={host.enabled ? "status online" : "status offline"}>{host.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <details>
              <summary>Edit</summary>
              <form action={(formData) => updateDeadHostAction(host.id, formData)} className="form">
                <label>
                  Name
                  <input name="name" defaultValue={host.name} />
                </label>
                <label>
                  Domains
                  <textarea name="domains" defaultValue={host.domains.join("\n")} rows={2} />
                </label>
                <label>
                  Status code
                  <input type="number" name="status_code" defaultValue={host.status_code} min={200} max={599} />
                </label>
                <label>
                  Response body (optional)
                  <textarea name="response_body" defaultValue={host.response_body ?? ""} rows={3} />
                </label>
                <label className="toggle">
                  <input type="hidden" name="enabled_present" value="1" />
                  <input type="checkbox" name="enabled" defaultChecked={host.enabled} /> Enabled
                </label>
                <div className="actions">
                  <button type="submit" className="primary">
                    Save
                  </button>
                </div>
              </form>
            </details>
            <form action={() => deleteDeadHostAction(host.id)}>
              <button type="submit" className="danger">
                Delete
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="create">
        <h2>Create dead host</h2>
        <form action={createDeadHostAction} className="form">
          <label>
            Name
            <input name="name" placeholder="Maintenance page" required />
          </label>
          <label>
            Domains
            <textarea name="domains" placeholder="offline.example.com" rows={2} required />
          </label>
          <label>
            Status code
            <input type="number" name="status_code" defaultValue={503} min={200} max={599} />
          </label>
          <label>
            Response body
            <textarea name="response_body" placeholder="Service unavailable" rows={3} />
          </label>
          <label className="toggle">
            <input type="checkbox" name="enabled" defaultChecked /> Enabled
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Create Dead Host
            </button>
          </div>
        </form>
      </section>

      <style jsx>{`
        .page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
        }
        header p {
          color: rgba(255, 255, 255, 0.6);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.75rem;
        }
        .card {
          background: rgba(16, 24, 38, 0.95);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .header h2 {
          margin: 0 0 0.35rem;
        }
        .header p {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
        }
        .status {
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .status.online {
          background: rgba(0, 200, 83, 0.15);
          color: #51ff9d;
        }
        .status.offline {
          background: rgba(255, 91, 91, 0.15);
          color: #ff6b6b;
        }
        details summary {
          cursor: pointer;
          font-weight: 600;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          margin-top: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .toggle {
          flex-direction: row;
          align-items: center;
          gap: 0.45rem;
        }
        input,
        textarea {
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
        }
        .primary {
          padding: 0.6rem 1.4rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          cursor: pointer;
        }
        .danger {
          background: transparent;
          border: 1px solid rgba(255, 91, 91, 0.6);
          color: #ff5b5b;
          padding: 0.5rem 1rem;
          border-radius: 999px;
          cursor: pointer;
        }
        .create {
          background: rgba(16, 24, 38, 0.95);
          border-radius: 16px;
          padding: 1.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </div>
  );
}
