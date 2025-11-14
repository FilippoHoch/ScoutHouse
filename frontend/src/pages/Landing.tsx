import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ApiError, getLandingSnapshot } from "../shared/api";
import type { LandingSnapshot } from "../shared/types";

const numberFormatter = new Intl.NumberFormat("it-IT");

const statusLabels: Record<string, string> = {
  draft: "bozza",
  planning: "pianificazione",
  booked: "confermato",
  archived: "archiviato",
};

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} – ${end}`;
  }
  const formatter = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
};

const formatStatus = (status: string) => statusLabels[status] ?? status;

export const LandingPage = () => {
  const { data, isLoading, isError } = useQuery<LandingSnapshot, ApiError>({
    queryKey: ["landing-snapshot"],
    queryFn: () => getLandingSnapshot(),
  });

  const heroDescription = (() => {
    if (isLoading) {
      return "Caricamento dei dati reali dalle pattuglie logistiche…";
    }
    if (isError || !data) {
      return "Non è stato possibile caricare i dati aggiornati in questo momento.";
    }
    return `Questa pagina riporta ${numberFormatter.format(
      data.structures_total,
    )} strutture attive, ${numberFormatter.format(data.provinces_total)} province coperte e ${numberFormatter.format(
      data.beds_total,
    )} posti letto confermati dalle pattuglie locali.`;
  })();

  const stats = [
    { label: "Strutture censite", value: data?.structures_total ?? 0 },
    { label: "Province coperte", value: data?.provinces_total ?? 0 },
    { label: "Posti letto registrati", value: data?.beds_total ?? 0 },
    { label: "Eventi pianificati", value: data?.events_total ?? 0 },
    { label: "Partecipanti previsti", value: data?.participants_total ?? 0 },
  ];

  return (
    <section className="landing">
      <div className="landing__container">
        <div className="landing__hero">
          <span className="landing__badge">Benvenuto su ScoutHouse</span>
          <h1>Dati reali delle strutture scout</h1>
          <p>{heroDescription}</p>
          <div className="landing__actions">
            <Link className="button" to="/structures">
              Vai alle strutture
            </Link>
            <Link className="button ghost" to="/events">
              Vai agli eventi
            </Link>
          </div>
          <dl className="landing__stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{numberFormatter.format(stat.value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="landing__showcase" aria-label="Dati riepilogativi">
          <div className="landing__showcase-card">
            <h2>Strutture registrate</h2>
            <p>I dati sono caricati dalle pattuglie logistiche e riportano valori reali.</p>
            <ul className="landing__showcase-list">
              {isLoading && <li>Caricamento delle strutture…</li>}
              {!isLoading && (data?.structures.length ?? 0) === 0 && (
                <li>Nessuna struttura disponibile al momento.</li>
              )}
              {!isLoading &&
                data?.structures.map((structure) => {
                  const provinceLabel = structure.province
                    ? structure.province.toUpperCase()
                    : "n.d.";
                  const bedsLabel =
                    typeof structure.indoor_beds === "number"
                      ? `${numberFormatter.format(structure.indoor_beds)} posti letto`
                      : "Posti letto non indicati";
                  return (
                    <li key={structure.slug}>
                      <strong>{structure.name}</strong>
                      <span>
                        Provincia {provinceLabel} · {bedsLabel}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>

          <div className="landing__panel">
            <h3>Eventi in lavorazione</h3>
            <ul>
              {isLoading && <li>Caricamento degli eventi…</li>}
              {!isLoading && (data?.events.length ?? 0) === 0 && (
                <li>Nessun evento in pianificazione.</li>
              )}
              {!isLoading &&
                data?.events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <span>
                        {formatDateRange(event.start_date, event.end_date)} · {numberFormatter.format(
                          event.participants_total,
                        )}{" "}
                        partecipanti · stato {formatStatus(event.status)}
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
