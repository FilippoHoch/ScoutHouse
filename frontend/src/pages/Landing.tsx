import { Link } from "react-router-dom";

export const LandingPage = () => {
  return (
    <section>
      <div className="card">
        <h1>Welcome to ScoutHouse</h1>
        <p>
          ScoutHouse is your operational hub for managing scout structures, events,
          and collaborations. Explore the catalog, track events, and streamline
          your community engagement.
        </p>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Link className="button" to="/structures">
            Explore structures
          </Link>
          <Link className="button" to="/events">
            Upcoming events
          </Link>
        </div>
      </div>
    </section>
  );
};
