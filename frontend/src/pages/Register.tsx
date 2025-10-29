import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../shared/api";
import { register as registerUser, useAuth } from "../shared/auth";

interface LocationState {
  from?: { pathname: string };
}

export const RegisterPage = () => {
  const [name, setName] = useState("");
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
      await registerUser(name, email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (typeof err.body === "object" && err.body !== null && "detail" in err.body) {
          setError(String((err.body as { detail?: unknown }).detail ?? "Unable to register"));
        } else if (err.status === 0) {
          setError(err.message);
        } else {
          setError("Unable to register with the provided information.");
        }
      } else {
        setError("Unexpected error while registering. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <div className="auth-card__intro">
          <span className="auth-badge">Nuovo su ScoutHouse?</span>
          <h2>Crea il tuo account</h2>
          <p>
            Collabora con il tuo staff, pianifica attività e monitora le prenotazioni con uno
            spazio condiviso e intuitivo.
          </p>
          <ul className="auth-highlights" aria-label="Vantaggi di ScoutHouse">
            <li>🤝 Coordinamento immediato con il tuo team</li>
            <li>🧭 Panoramica chiara sulle attività programmate</li>
            <li>⚙️ Strumenti pronti per la gestione quotidiana</li>
          </ul>
        </div>
        <form onSubmit={handleSubmit} className="form-grid auth-form">
          <div>
            <label>
              Nome e cognome
              <input
                type="text"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>
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
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creazione in corso…" : "Crea account"}
          </button>
          <p className="auth-links">
            Hai già un account? <Link to="/login" state={location.state}>Accedi</Link>
          </p>
        </form>
      </div>
    </section>
  );
};
