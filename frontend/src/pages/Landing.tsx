import { Link } from "react-router-dom";

export const LandingPage = () => {
  return (
    <section className="landing">
      <div className="landing__container">
        <div className="landing__hero">
          <span className="landing__badge">Benvenuto su ScoutHouse</span>
          <h1>Il registro operativo delle strutture scout</h1>
          <p>
            Qui trovi i dati reali delle 21 strutture censite e degli eventi in
            pianificazione. Tutte le informazioni sono verificate e condivise, senza
            testi promozionali, per aiutarti a prendere decisioni rapide e documentate.
          </p>
          <ul className="landing__highlights">
            <li>
              <span aria-hidden="true">✔</span>
              Consulta schede dettagliate con indirizzi, posti letto, servizi e note
              operative di ogni struttura.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Segui lo stato dei 2 eventi aperti e abbina rapidamente le strutture
              disponibili.
            </li>
            <li>
              <span aria-hidden="true">✔</span>
              Condividi note essenziali e contatti in modo che ogni capo abbia le
              stesse informazioni.
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
              <dd>21</dd>
            </div>
            <div>
              <dt>Eventi in calendario</dt>
              <dd>2</dd>
            </div>
            <div>
              <dt>Province coperte</dt>
              <dd>16</dd>
            </div>
          </dl>
        </div>

        <aside className="landing__showcase" aria-label="Platform snapshot">
          <div className="landing__showcase-card">
            <h2>Panoramica operativa</h2>
            <p>
              La bacheca mostra disponibilità, richieste e documenti utili per le
              decisioni quotidiane. Tutto è aggiornato ai dati inseriti dalle unità.
            </p>
            <ul className="landing__showcase-list">
              <li>
                <strong>Disponibilità reale</strong>
                <span>
                  Ogni struttura riporta capacità, servizi e note tecniche esatte dal
                  censimento condiviso.
                </span>
              </li>
              <li>
                <strong>Richieste centralizzate</strong>
                <span>
                  Lo stato dei 2 eventi aperti indica subito cosa manca per confermare
                  ogni attività.
                </span>
              </li>
              <li>
                <strong>Documenti condivisi</strong>
                <span>
                  Note, contatti e allegati sono salvati in un'unica vista per ridurre le
                  comunicazioni disperse.
                </span>
              </li>
            </ul>
          </div>

          <div className="landing__panel">
            <h3>Link rapidi</h3>
            <ul>
              <li>
                <Link to="/structures">Catalogo strutture</Link>
              </li>
              <li>
                <Link to="/events">Calendario eventi</Link>
              </li>
              <li>
                <Link to="/admin">Gestione team</Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
};
