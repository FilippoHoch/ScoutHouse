import { createGoogleMapsEmbedUrl } from "../utils/googleMaps";

export type GoogleMapEmbedCoordinates = {
  lat: number;
  lng: number;
};

type GoogleMapEmbedProps = {
  coordinates: GoogleMapEmbedCoordinates | null;
  title: string;
  ariaLabel?: string;
  emptyLabel: string;
  className?: string;
};

const combineClassNames = (...classNames: (string | false | null | undefined)[]) =>
  classNames.filter(Boolean).join(" ");

export const GoogleMapEmbed = ({
  coordinates,
  title,
  ariaLabel,
  emptyLabel,
  className
}: GoogleMapEmbedProps) => {
  const baseClassName = combineClassNames(
    "google-map-embed",
    className,
    coordinates ? "google-map-embed--ready" : "google-map-embed--empty"
  );

  if (!coordinates) {
    return (
      <div className={baseClassName} data-state="empty" role="status">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const embedUrl = createGoogleMapsEmbedUrl(coordinates);

  return (
    <div className={baseClassName} data-state="ready">
      <iframe
        src={embedUrl}
        title={title}
        aria-label={ariaLabel ?? title}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
};
