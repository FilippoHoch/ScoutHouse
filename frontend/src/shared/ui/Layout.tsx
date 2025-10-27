import { Link, Outlet } from "react-router-dom";

import { logout, useAuth } from "../auth";

export const Layout = () => {
  const auth = useAuth();

  const handleLogout = () => {
    void logout().catch(() => undefined);
  };

  return (
    <div>
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/structures">Structures</Link>
          <Link to="/events">Events</Link>
          {auth.user && <Link to="/structures/new">New structure</Link>}
          {auth.user ? (
            <button type="button" onClick={handleLogout} className="link-button">
              Logout ({auth.user.name})
            </button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
};
