import { createProxyHostAction, deleteProxyHostAction, updateProxyHostAction } from "./actions";
import { listProxyHosts } from "@/src/lib/models/proxy-hosts";
import { listCertificates } from "@/src/lib/models/certificates";
import { listAccessLists } from "@/src/lib/models/access-lists";

export default function ProxyHostsPage() {
  const hosts = listProxyHosts();
  const certificates = listCertificates();
  const accessLists = listAccessLists();

  return (
    <div className="page">
      <header>
        <h1>Proxy Hosts</h1>
        <p>Define HTTP(S) reverse proxies managed by Caddy with built-in TLS orchestration.</p>
      </header>

      <section className="grid">
        {hosts.map((host) => (
          <div className="host-card" key={host.id}>
            <div className="host-header">
              <div>
                <h2>{host.name}</h2>
                <p>{host.domains.join(", ")}</p>
              </div>
              <span className={host.enabled ? "status online" : "status offline"}>{host.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <details>
              <summary>Edit configuration</summary>
              <form action={(formData) => updateProxyHostAction(host.id, formData)} className="form">
                <label>
                  Name
                  <input name="name" defaultValue={host.name} required />
                </label>
                <label>
                  Domains (comma or newline separated)
                  <textarea name="domains" defaultValue={host.domains.join("\n")} required rows={3} />
                </label>
                <label>
                  Upstreams (e.g. 127.0.0.1:3000)
                  <textarea name="upstreams" defaultValue={host.upstreams.join("\n")} required rows={3} />
                </label>
                <label>
                  Certificate
                  <select name="certificate_id" defaultValue={host.certificate_id ?? ""}>
                    <option value="">Managed by Caddy</option>
                    {certificates.map((cert) => (
                      <option value={cert.id} key={cert.id}>
                        {cert.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Access List
                  <select name="access_list_id" defaultValue={host.access_list_id ?? ""}>
                    <option value="">None</option>
                    {accessLists.map((list) => (
                      <option value={list.id} key={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="toggles">
                  <label>
                    <input type="hidden" name="ssl_forced_present" value="1" />
                    <input type="checkbox" name="ssl_forced" defaultChecked={host.ssl_forced} /> Force HTTPS
                  </label>
                  <label>
                    <input type="hidden" name="hsts_enabled_present" value="1" />
                    <input type="checkbox" name="hsts_enabled" defaultChecked={host.hsts_enabled} /> HSTS
                  </label>
                  <label>
                    <input type="hidden" name="hsts_subdomains_present" value="1" />
                    <input type="checkbox" name="hsts_subdomains" defaultChecked={host.hsts_subdomains} /> Include subdomains in HSTS
                  </label>
                  <label>
                    <input type="hidden" name="allow_websocket_present" value="1" />
                    <input type="checkbox" name="allow_websocket" defaultChecked={host.allow_websocket} /> Allow WebSocket
                  </label>
                  <label>
                    <input type="hidden" name="preserve_host_header_present" value="1" />
                    <input type="checkbox" name="preserve_host_header" defaultChecked={host.preserve_host_header} /> Preserve host header
                  </label>
                  <label>
                    <input type="hidden" name="enabled_present" value="1" />
                    <input type="checkbox" name="enabled" defaultChecked={host.enabled} /> Enabled
                  </label>
                </div>
                <div className="actions">
                  <button type="submit" className="primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </details>
            <form action={() => deleteProxyHostAction(host.id)}>
              <button type="submit" className="danger">
                Delete
              </button>
            </form>
          </div>
        ))}
      </section>

      <section>
        <h2>Create proxy host</h2>
        <form action={createProxyHostAction} className="form create">
          <label>
            Name
            <input name="name" placeholder="Internal service" required />
          </label>
          <label>
            Domains
            <textarea name="domains" placeholder="app.example.com" rows={2} required />
          </label>
          <label>
            Upstreams
            <textarea name="upstreams" placeholder="http://10.0.0.5:8080" rows={2} required />
          </label>
          <label>
            Certificate
            <select name="certificate_id" defaultValue="">
              <option value="">Managed by Caddy</option>
              {certificates.map((cert) => (
                <option value={cert.id} key={cert.id}>
                  {cert.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access List
            <select name="access_list_id" defaultValue="">
              <option value="">None</option>
              {accessLists.map((list) => (
                <option value={list.id} key={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <div className="toggles">
            <label>
              <input type="checkbox" name="ssl_forced" defaultChecked /> Force HTTPS
            </label>
            <label>
              <input type="checkbox" name="hsts_enabled" defaultChecked /> HSTS
            </label>
            <label>
              <input type="checkbox" name="allow_websocket" defaultChecked /> Allow WebSocket
            </label>
            <label>
              <input type="checkbox" name="preserve_host_header" defaultChecked /> Preserve host header
            </label>
            <label>
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Create Host
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
        header h1 {
          margin: 0;
        }
        header p {
          color: rgba(255, 255, 255, 0.6);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.75rem;
        }
        .host-card {
          background: rgba(16, 24, 38, 0.95);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .host-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .host-header h2 {
          margin: 0 0 0.4rem;
        }
        .host-header p {
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
          font-size: 0.9rem;
        }
        input,
        textarea,
        select {
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .toggles {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.6rem;
        }
        .toggles label {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        .primary {
          padding: 0.65rem 1.5rem;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          font-weight: 600;
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
