import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../shared/api";
import { login, useAuth } from "../shared/auth";

interface LocationState {
  from?: { pathname: string };
}

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  const redirectTo = useMemo(() => {
    const state = location.state as LocationState | undefined;
    return state?.from?.pathname ?? "/events";
  }, [location.state]);

  useEffect(() => {
    if (auth.user) {
      navigate(redirectTo, { replace: true });
    }
  }, [auth.user, navigate, redirectTo]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (typeof err.body === "object" && err.body !== null && "detail" in err.body) {
          setError(String((err.body as { detail?: unknown }).detail ?? "Invalid credentials"));
        } else if (err.status === 0) {
          setError(err.message);
        } else {
          setError("Unable to log in with the provided credentials.");
        }
      } else {
        setError("Unexpected error while logging in. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <div className="auth-card__intro">
          <span className="auth-badge">Bentornato 👋</span>
          <h2>Accedi a ScoutHouse</h2>
          <p>
            Gestisci eventi, strutture e comunicazioni con un&apos;esperienza pensata per i team
            scout.
          </p>
          <ul className="auth-highlights" aria-label="Cosa puoi fare con ScoutHouse">
            <li>📆 Agenda integrata e sempre aggiornata</li>
            <li>🔔 Notifiche in tempo reale per il tuo staff</li>
            <li>🛡️ Accesso sicuro con credenziali dedicate</li>
          </ul>
        </div>
        <form onSubmit={handleSubmit} className="form-grid auth-form">
          <div>
            <label>
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          </div>
          <div>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Accesso in corso…" : "Accedi"}
          </button>
          <p className="auth-links">
            <Link to="/forgot-password">Password dimenticata?</Link>
            <span>
              Non hai un account? <Link to="/register" state={location.state}>Registrati</Link>
            </span>
          </p>
        </form>
      </div>
    </section>
  );
};
