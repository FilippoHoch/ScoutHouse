import { Link } from "react-router-dom";

export const LandingPage = () => {
  return (
    <section className="landing">
      <div className="landing__container">
        <div className="landing__hero">
          <span className="landing__badge">Welcome to ScoutHouse</span>
          <h1>Organize your scout network with confidence</h1>
          <p>
            ScoutHouse is your operational hub for coordinating structures, events, and
            collaborations. Discover verified locations, publish activities, and give
            your community a shared source of truth for everything you plan together.
          </p>
          <ul className="landing__highlights">
            <li>
              <span aria-hidden="true">✔</span>
              Map, filter, and compare structures with the amenities your unit needs.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Build a living event calendar, from early planning to on-the-day updates.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Share curated resources so every volunteer can jump in and help faster.
            </li>
          </ul>
          <div className="landing__actions">
            <Link className="button" to="/structures">
              Explore structures
            </Link>
            <Link className="button ghost" to="/events">
              Browse upcoming events
            </Link>
          </div>
          <dl className="landing__stats">
            <div>
              <dt>Verified structures</dt>
              <dd>140+</dd>
            </div>
            <div>
              <dt>Event requests tracked</dt>
              <dd>3200</dd>
            </div>
            <div>
              <dt>Active collaborators</dt>
              <dd>85</dd>
            </div>
          </dl>
        </div>

        <aside className="landing__showcase" aria-label="Platform snapshot">
          <div className="landing__showcase-card">
            <h2>All your planning tools in one clear view</h2>
            <p>
              Get instant visibility on which structures are available, which events need
              attention, and what resources teams are requesting.
            </p>
            <ul className="landing__showcase-list">
              <li>
                <strong>Smart availability</strong>
                <span>Surface the best structure matches based on capacity and services.</span>
              </li>
              <li>
                <strong>Centralized requests</strong>
                <span>Follow up on bookings, approvals, and logistics in one timeline.</span>
              </li>
              <li>
                <strong>Shared knowledge base</strong>
                <span>Store documents, checklists, and contacts where everyone can find them.</span>
              </li>
            </ul>
          </div>

          <div className="landing__panel">
            <h3>Quick links</h3>
            <ul>
              <li>
                <Link to="/structures">Structure catalog overview</Link>
              </li>
              <li>
                <Link to="/events">Upcoming events dashboard</Link>
              </li>
              <li>
                <Link to="/admin">Team administration</Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
};
