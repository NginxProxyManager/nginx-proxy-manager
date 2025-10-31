import { listCertificates } from "@/src/lib/models/certificates";
import { createCertificateAction, deleteCertificateAction, updateCertificateAction } from "./actions";

export default function CertificatesPage() {
  const certificates = listCertificates();

  return (
    <div className="page">
      <header>
        <h1>Certificates</h1>
        <p>Manage ACME-managed certificates or import your own PEM files for custom deployments.</p>
      </header>

      <section className="grid">
        {certificates.map((cert) => (
          <div className="card" key={cert.id}>
            <details>
              <summary>
                <div className="summary">
                  <div>
                    <h2>{cert.name}</h2>
                    <p>{cert.domain_names.join(", ")}</p>
                  </div>
                  <span className="badge">{cert.type === "managed" ? "Managed" : "Imported"}</span>
                </div>
              </summary>
              <form action={(formData) => updateCertificateAction(cert.id, formData)} className="form">
                <label>
                  Name
                  <input name="name" defaultValue={cert.name} />
                </label>
                <label>
                  Domains
                  <textarea name="domain_names" defaultValue={cert.domain_names.join("\n")} rows={3} />
                </label>
                <label>
                  Type
                  <select name="type" defaultValue={cert.type}>
                    <option value="managed">Managed (ACME)</option>
                    <option value="imported">Imported</option>
                  </select>
                </label>
                {cert.type === "managed" ? (
                  <label className="toggle">
                    <input type="hidden" name="auto_renew_present" value="1" />
                    <input type="checkbox" name="auto_renew" defaultChecked={cert.auto_renew} /> Auto renew
                  </label>
                ) : (
                  <>
                    <label>
                      Certificate PEM
                      <textarea name="certificate_pem" placeholder="-----BEGIN CERTIFICATE-----" rows={6} />
                    </label>
                    <label>
                      Private key PEM
                      <textarea name="private_key_pem" placeholder="-----BEGIN PRIVATE KEY-----" rows={6} />
                    </label>
                  </>
                )}
                <div className="actions">
                  <button type="submit" className="primary">
                    Save certificate
                  </button>
                </div>
              </form>
            </details>
            <form action={() => deleteCertificateAction(cert.id)}>
              <button type="submit" className="danger">
                Delete
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="create">
        <h2>Create certificate</h2>
        <form action={createCertificateAction} className="form">
          <label>
            Name
            <input name="name" placeholder="Wildcard certificate" required />
          </label>
          <label>
            Domains
            <textarea name="domain_names" placeholder="example.com" rows={3} required />
          </label>
          <label>
            Type
            <select name="type" defaultValue="managed">
              <option value="managed">Managed (ACME)</option>
              <option value="imported">Imported</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" name="auto_renew" defaultChecked /> Auto renew (managed only)
          </label>
          <label>
            Certificate PEM
            <textarea name="certificate_pem" placeholder="Paste PEM content for imported certificates" rows={5} />
          </label>
          <label>
            Private key PEM
            <textarea name="private_key_pem" placeholder="Paste PEM key for imported certificates" rows={5} />
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Create certificate
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
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
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
        .summary {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .summary h2 {
          margin: 0 0 0.35rem;
        }
        .summary p {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
        }
        .badge {
          padding: 0.3rem 0.8rem;
          border-radius: 999px;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(0, 198, 255, 0.15);
          color: #5be7ff;
        }
        details summary {
          list-style: none;
          cursor: pointer;
        }
        details summary::-webkit-details-marker {
          display: none;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          margin-top: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
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
        .toggle {
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
          align-self: flex-start;
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
