import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
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

  const navItems = [
    { to: "/structures", label: t("layout.nav.structures") },
    { to: "/events", label: t("layout.nav.events") },
  ];

  if (auth.user?.is_admin) {
    navItems.push({ to: "/admin", label: t("layout.nav.admin") });
    navItems.push({ to: "/import-export", label: t("layout.nav.importExport") });
  }

  if (auth.user) {
    navItems.push({ to: "/structures/new", label: t("layout.nav.newStructure") });
  }

  return (
    <div>
      <a className="skip-link" href="#main-content">
        {t("layout.skipLink")}
      </a>
      <header>
        <nav aria-label={t("layout.navigationLabel")}>
          <div className="nav-links">
            <Link to="/" aria-label={t("layout.nav.home")} className="nav-home">
              <img src="/logo.svg" alt="" className="nav-logo" aria-hidden="true" />
              <span className="sr-only">ScoutHouse</span>
            </Link>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-links">
            {auth.user ? (
              <button type="button" onClick={handleLogout} className="link-button">
                {t("layout.nav.logout", { name: auth.user.name })}
              </button>
            ) : (
              <NavLink to="/login">{t("layout.nav.login")}</NavLink>
            )}
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
};
