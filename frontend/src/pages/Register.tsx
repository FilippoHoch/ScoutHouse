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
    <section>
      <div className="card">
        <h2>Create your account</h2>
        <p>Register to start managing ScoutHouse events and structures.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Name
            <input
              type="text"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
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
          {error && <p className="error-text">{error}</p>}
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p>
          Already have an account? <Link to="/login" state={location.state}>Sign in</Link>
        </p>
      </div>
    </section>
  );
};
