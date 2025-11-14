import { Link } from "react-router-dom";

const STRUCTURES_COUNT = 21;
const PROVINCES_COUNT = 16;
const TOTAL_BEDS = 776;
const EVENTS_COUNT = 2;
const TOTAL_PARTICIPANTS = 52;

const structureSamples = [
  { name: "Casa Alpina", province: "BS", beds: 52 },
  { name: "Campo Bosco San Francesco", province: "BS", beds: 120 },
  { name: "Centro Scout del Garda", province: "VR", beds: 80 },
];

const eventSamples = [
  {
    title: "Campi Invernali",
    range: "1-4 febbraio 2025",
    participants: 30,
    status: "pianificazione",
  },
  {
    title: "Route Estiva",
    range: "12-20 luglio 2025",
    participants: 22,
    status: "bozza",
  },
];

export const LandingPage = () => {
  return (
    <section className="landing">
      <div className="landing__container">
        <div className="landing__hero">
          <span className="landing__badge">Benvenuto su ScoutHouse</span>
          <h1>Situazione aggiornata delle strutture scout</h1>
          <p>
            Questa pagina riassume i dati presenti nel registro condiviso: {STRUCTURES_COUNT}{" "}
            strutture attive, {PROVINCES_COUNT} province coperte, {TOTAL_BEDS} posti letto descritti
            e {EVENTS_COUNT} eventi in preparazione con {TOTAL_PARTICIPANTS} partecipanti previsti.
          </p>
          <ul className="landing__highlights">
            <li>
              <span aria-hidden="true">✔</span>
              Schede con indirizzi completi, servizi e note logistiche utili alle pattuglie di zona.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Situazione posti letto e cucine aggiornata dai censimenti locali, compresi i periodi di
              indisponibilità.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Stato degli eventi con numero di partecipanti e responsabili assegnati, senza testi
              promozionali.
            </li>
          </ul>
          <div className="landing__actions">
            <Link className="button" to="/structures">
              Vai alle strutture
            </Link>
            <Link className="button ghost" to="/events">
              Vai agli eventi
            </Link>
          </div>
          <dl className="landing__stats">
            <div>
              <dt>Strutture censite</dt>
              <dd>{STRUCTURES_COUNT}</dd>
            </div>
            <div>
              <dt>Province coperte</dt>
              <dd>{PROVINCES_COUNT}</dd>
            </div>
            <div>
              <dt>Posti letto registrati</dt>
              <dd>{TOTAL_BEDS}</dd>
            </div>
            <div>
              <dt>Eventi pianificati</dt>
              <dd>{EVENTS_COUNT}</dd>
            </div>
            <div>
              <dt>Partecipanti previsti</dt>
              <dd>{TOTAL_PARTICIPANTS}</dd>
            </div>
          </dl>
        </div>

        <aside className="landing__showcase" aria-label="Dati riepilogativi">
          <div className="landing__showcase-card">
            <h2>Strutture registrate</h2>
            <p>I dati sono caricati dalle pattuglie logistiche e riportano valori reali.</p>
            <ul className="landing__showcase-list">
              {structureSamples.map((structure) => (
                <li key={structure.name}>
                  <strong>{structure.name}</strong>
                  <span>
                    Provincia {structure.province} · {structure.beds} posti letto disponibili
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing__panel">
            <h3>Eventi in lavorazione</h3>
            <ul>
              {eventSamples.map((event) => (
                <li key={event.title}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {event.range} · {event.participants} partecipanti · stato {event.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
};
