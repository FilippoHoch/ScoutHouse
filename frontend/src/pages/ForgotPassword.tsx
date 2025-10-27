import { FormEvent, useState } from "react";

import { ApiError, forgotPassword } from "../shared/api";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message ?? "Impossibile avviare il reset della password.");
      } else {
        setError("Errore inatteso. Riprova più tardi.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="card">
        <h2>Reset password</h2>
        <p>Inserisci il tuo indirizzo email. Riceverai un link (nel log della console) per impostare una nuova password.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Email
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          {success && (
            <p className="muted">
              Se l'indirizzo è registrato riceverai un link di reset. In ambiente di sviluppo controlla la console backend.
            </p>
          )}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Invio…" : "Invia link"}
          </button>
        </form>
      </div>
    </section>
  );
};
