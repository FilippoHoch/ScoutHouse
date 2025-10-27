import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError, resetPassword } from "../shared/api";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <section>
        <div className="card">
          <p>Token di reset non valido. Assicurati di utilizzare il link corretto.</p>
        </div>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Le password non coincidono.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail =
          typeof err.body === "object" && err.body !== null && "detail" in err.body
            ? String((err.body as { detail?: unknown }).detail ?? "Token non valido")
            : err.message;
        setError(detail ?? "Impossibile completare il reset.");
      } else {
        setError("Errore inatteso durante il reset della password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="card">
        <h2>Imposta nuova password</h2>
        {success ? (
          <div>
            <p>Password aggiornata correttamente.</p>
            <p>
              <Link to="/login">Accedi con la nuova password</Link>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Nuova password
              <input
                type="password"
                name="password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Conferma password
              <input
                type="password"
                name="confirm"
                minLength={8}
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="button" type="submit" disabled={submitting}>
              {submitting ? "Aggiornamento…" : "Aggiorna password"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
