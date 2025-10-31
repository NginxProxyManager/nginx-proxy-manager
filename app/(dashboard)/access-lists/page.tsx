import { listAccessLists } from "@/src/lib/models/access-lists";
import { addAccessEntryAction, createAccessListAction, deleteAccessEntryAction, deleteAccessListAction, updateAccessListAction } from "./actions";

export default function AccessListsPage() {
  const lists = listAccessLists();

  return (
    <div className="page">
      <header>
        <h1>Access Lists</h1>
        <p>Protect proxy hosts with HTTP basic authentication credentials.</p>
      </header>

      <section className="grid">
        {lists.map((list) => (
          <div className="card" key={list.id}>
            <form action={(formData) => updateAccessListAction(list.id, formData)} className="header">
              <div>
                <input name="name" defaultValue={list.name} />
                <textarea name="description" defaultValue={list.description ?? ""} rows={2} placeholder="Description" />
              </div>
              <button type="submit" className="primary small">
                Save
              </button>
            </form>
            <div className="entries">
              <h3>Accounts</h3>
              {list.entries.length === 0 ? (
                <p className="empty">No credentials configured.</p>
              ) : (
                <ul>
                  {list.entries.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.username}</span>
                      <form action={() => deleteAccessEntryAction(list.id, entry.id)}>
                        <button type="submit" className="ghost">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form action={(formData) => addAccessEntryAction(list.id, formData)} className="add-entry">
              <input name="username" placeholder="Username" required />
              <input type="password" name="password" placeholder="Password" required />
              <button type="submit" className="primary small">
                Add
              </button>
            </form>
            <form action={() => deleteAccessListAction(list.id)}>
              <button type="submit" className="danger">
                Delete list
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="create">
        <h2>Create access list</h2>
        <form action={createAccessListAction} className="form">
          <label>
            Name
            <input name="name" placeholder="Internal users" required />
          </label>
          <label>
            Description
            <textarea name="description" placeholder="Optional description" rows={2} />
          </label>
          <label>
            Seed members (one per line, username:password)
            <textarea name="users" placeholder="alice:password123" rows={4} />
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Create Access List
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
        .header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .header input,
        .header textarea {
          width: 100%;
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .entries ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .entries li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(8, 12, 20, 0.9);
          border-radius: 10px;
          padding: 0.6rem 0.8rem;
        }
        .entries span {
          font-weight: 500;
        }
        .empty {
          color: rgba(255, 255, 255, 0.5);
        }
        .add-entry {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 0.6rem;
        }
        .add-entry input {
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .primary {
          padding: 0.6rem 1.3rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          cursor: pointer;
        }
        .primary.small {
          padding: 0.45rem 1rem;
        }
        .ghost {
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
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
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .form input,
        .form textarea {
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
      `}</style>
    </div>
  );
}
