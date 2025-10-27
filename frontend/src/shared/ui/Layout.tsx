import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { logout, useAuth } from "../auth";

export const Layout = () => {
  const auth = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  const handleLogout = () => {
    void logout().catch(() => undefined);
  };

  useEffect(() => {
    const selectors = ["img", "iframe"]; // include future media elements
    selectors.forEach((selector) => {
      document
        .querySelectorAll<HTMLImageElement | HTMLIFrameElement>(`${selector}:not([loading])`)
        .forEach((element) => {
          element.setAttribute("loading", "lazy");
        });
    });
  }, [location.pathname]);

  return (
    <div>
      <a className="skip-link" href="#main-content">
        {t("layout.skipLink")}
      </a>
      <header>
        <nav aria-label={t("layout.navigationLabel")}>
          <Link to="/">{t("layout.nav.home")}</Link>
          <Link to="/structures">{t("layout.nav.structures")}</Link>
          <Link to="/events">{t("layout.nav.events")}</Link>
          {auth.user && <Link to="/structures/new">{t("layout.nav.newStructure")}</Link>}
          {auth.user ? (
            <button type="button" onClick={handleLogout} className="link-button">
              {t("layout.nav.logout", { name: auth.user.name })}
            </button>
          ) : (
            <Link to="/login">{t("layout.nav.login")}</Link>
          )}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
};
