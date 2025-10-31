import { listRedirectHosts } from "@/src/lib/models/redirect-hosts";
import { createRedirectAction, deleteRedirectAction, updateRedirectAction } from "./actions";

export default function RedirectsPage() {
  const redirects = listRedirectHosts();

  return (
    <div className="page">
      <header>
        <h1>Redirects</h1>
        <p>Return HTTP 301/302 responses to guide clients toward canonical hosts.</p>
      </header>

      <section className="grid">
        {redirects.map((redirect) => (
          <div className="card" key={redirect.id}>
            <div className="header">
              <div>
                <h2>{redirect.name}</h2>
                <p>{redirect.domains.join(", ")}</p>
              </div>
              <span className={redirect.enabled ? "status online" : "status offline"}>{redirect.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <details>
              <summary>Edit</summary>
              <form action={(formData) => updateRedirectAction(redirect.id, formData)} className="form">
                <label>
                  Name
                  <input name="name" defaultValue={redirect.name} />
                </label>
                <label>
                  Domains
                  <textarea name="domains" defaultValue={redirect.domains.join("\n")} rows={2} />
                </label>
                <label>
                  Destination URL
                  <input name="destination" defaultValue={redirect.destination} />
                </label>
                <label>
                  Status code
                  <input type="number" name="status_code" defaultValue={redirect.status_code} min={200} max={399} />
                </label>
                <div className="toggles">
                  <label>
                    <input type="hidden" name="preserve_query_present" value="1" />
                    <input type="checkbox" name="preserve_query" defaultChecked={redirect.preserve_query} /> Preserve path/query
                  </label>
                  <label>
                    <input type="hidden" name="enabled_present" value="1" />
                    <input type="checkbox" name="enabled" defaultChecked={redirect.enabled} /> Enabled
                  </label>
                </div>
                <div className="actions">
                  <button type="submit" className="primary">
                    Save
                  </button>
                </div>
              </form>
            </details>
            <form action={() => deleteRedirectAction(redirect.id)}>
              <button type="submit" className="danger">
                Delete
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="create">
        <h2>Create redirect</h2>
        <form action={createRedirectAction} className="form">
          <label>
            Name
            <input name="name" placeholder="Example redirect" required />
          </label>
          <label>
            Domains
            <textarea name="domains" placeholder="old.example.com" rows={2} required />
          </label>
          <label>
            Destination URL
            <input name="destination" placeholder="https://new.example.com" required />
          </label>
          <label>
            Status code
            <input type="number" name="status_code" defaultValue={302} min={200} max={399} />
          </label>
          <div className="toggles">
            <label>
              <input type="checkbox" name="preserve_query" defaultChecked /> Preserve path/query
            </label>
            <label>
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Create Redirect
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
        input,
        textarea {
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .toggles {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .toggles label {
          flex-direction: row;
          align-items: center;
          gap: 0.4rem;
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
