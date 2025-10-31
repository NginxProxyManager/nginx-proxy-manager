import { listStreamHosts } from "@/src/lib/models/stream-hosts";
import { createStreamAction, deleteStreamAction, updateStreamAction } from "./actions";

export default function StreamsPage() {
  const streams = listStreamHosts();

  return (
    <div className="page">
      <header>
        <h1>Streams</h1>
        <p>Forward raw TCP/UDP connections through Caddy&apos;s layer4 module.</p>
      </header>

      <section className="grid">
        {streams.map((stream) => (
          <div className="card" key={stream.id}>
            <div className="header">
              <div>
                <h2>{stream.name}</h2>
                <p>
                  Listens on :{stream.listen_port} ({stream.protocol.toUpperCase()}) ➜ {stream.upstream}
                </p>
              </div>
              <span className={stream.enabled ? "status online" : "status offline"}>{stream.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <details>
              <summary>Edit</summary>
              <form action={(formData) => updateStreamAction(stream.id, formData)} className="form">
                <label>
                  Name
                  <input name="name" defaultValue={stream.name} />
                </label>
                <label>
                  Listen port
                  <input type="number" name="listen_port" defaultValue={stream.listen_port} min={1} max={65535} />
                </label>
                <label>
                  Protocol
                  <select name="protocol" defaultValue={stream.protocol}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </label>
                <label>
                  Upstream
                  <input name="upstream" defaultValue={stream.upstream} />
                </label>
                <label className="toggle">
                  <input type="hidden" name="enabled_present" value="1" />
                  <input type="checkbox" name="enabled" defaultChecked={stream.enabled} /> Enabled
                </label>
                <div className="actions">
                  <button type="submit" className="primary">
                    Save
                  </button>
                </div>
              </form>
            </details>
            <form action={() => deleteStreamAction(stream.id)}>
              <button type="submit" className="danger">
                Delete
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="create">
        <h2>Create stream</h2>
        <form action={createStreamAction} className="form">
          <label>
            Name
            <input name="name" placeholder="SSH tunnel" required />
          </label>
          <label>
            Listen port
            <input type="number" name="listen_port" placeholder="2222" min={1} max={65535} required />
          </label>
          <label>
            Protocol
            <select name="protocol" defaultValue="tcp">
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </label>
          <label>
            Upstream
            <input name="upstream" placeholder="10.0.0.12:22" required />
          </label>
          <label className="toggle">
            <input type="checkbox" name="enabled" defaultChecked /> Enabled
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Create Stream
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
        select {
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
