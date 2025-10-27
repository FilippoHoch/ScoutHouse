import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Layout } from "../shared/ui/Layout";
import { EventDetailsPage } from "../pages/EventDetails";
import { ForgotPasswordPage } from "../pages/ForgotPassword";
import { LandingPage } from "../pages/Landing";
import { ResetPasswordPage } from "../pages/ResetPassword";
import { StructuresPage } from "../pages/Structures";
import { StructureCreatePage } from "../pages/StructureCreate";
import { ensureSession, restoreSession, useAuth } from "../shared/auth";

const EventsPage = lazy(() => import("../pages/Events").then((module) => ({ default: module.EventsPage })));
const StructureDetailsPage = lazy(() =>
  import("../pages/StructureDetails").then((module) => ({ default: module.StructureDetailsPage }))
);
const LoginPage = lazy(() => import("../pages/Login").then((module) => ({ default: module.LoginPage })));

const ProtectedRoute = () => {
  const auth = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (auth.status === "idle") {
      void ensureSession().catch(() => undefined);
    }
  }, [auth.status]);

  if (auth.status === "loading" || auth.status === "idle") {
    return (
      <section>
        <div className="card">
          <p>{t("auth.verifying")}</p>
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
  const { t } = useTranslation();

  useEffect(() => {
    void restoreSession().catch(() => undefined);
  }, []);

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <section>
            <div className="card" role="status" aria-live="polite">
              <p>{t("common.loading")}</p>
            </div>
          </section>
        }
      >
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
      </Suspense>
    </BrowserRouter>
  );
};
