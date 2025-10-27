import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "../shared/ui/Layout";
import { EventsPage } from "../pages/Events";
import { EventDetailsPage } from "../pages/EventDetails";
import { ForgotPasswordPage } from "../pages/ForgotPassword";
import { LandingPage } from "../pages/Landing";
import { LoginPage } from "../pages/Login";
import { ResetPasswordPage } from "../pages/ResetPassword";
import { StructureDetailsPage } from "../pages/StructureDetails";
import { StructuresPage } from "../pages/Structures";
import { StructureCreatePage } from "../pages/StructureCreate";
import { ensureSession, restoreSession, useAuth } from "../shared/auth";

const ProtectedRoute = () => {
  const auth = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (auth.status === "idle") {
      void ensureSession().catch(() => undefined);
    }
  }, [auth.status]);

  if (auth.status === "loading" || auth.status === "idle") {
    return (
      <section>
        <div className="card">
          <p>Verifying your session…</p>
        </div>
      </section>
    );
  }

  if (auth.user) {
    return <Outlet />;
  }

  return <Navigate to="/login" replace state={{ from: location }} />;
};

export const AppRouter = () => {
  useEffect(() => {
    void restoreSession().catch(() => undefined);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/structures" element={<StructuresPage />} />
          <Route path="/structures/:slug" element={<StructureDetailsPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventDetailsPage />} />
            <Route path="/structures/new" element={<StructureCreatePage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
