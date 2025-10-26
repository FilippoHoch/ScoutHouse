import { Link, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/structures", label: "Structures" },
  { to: "/events", label: "Events" },
  { to: "/login", label: "Login" }
];

export const Layout = () => {
  return (
    <div>
      <header>
        <nav>
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
};
