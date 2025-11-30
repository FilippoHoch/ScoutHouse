import { useId } from "react";

import type { GoogleMapType } from "../utils/googleMaps";

type MapTypeToggleProps = {
  mapType: GoogleMapType;
  label: string;
  optionLabels: Record<GoogleMapType, string>;
  onChange: (mapType: GoogleMapType) => void;
  className?: string;
};

export const MapTypeToggle = ({
  mapType,
  label,
  optionLabels,
  onChange,
  className,
}: MapTypeToggleProps) => {
  const baseId = useId();

  return (
    <fieldset className={`map-type-toggle${className ? ` ${className}` : ""}`}>
      <legend className="map-type-toggle__label">{label}</legend>
      <div className="map-type-toggle__options" role="radiogroup" aria-label={label}>
        {(["roadmap", "satellite"] as const).map((type) => {
          const id = `${baseId}-${type}`;
          return (
            <label className="map-type-toggle__option" key={type} htmlFor={id}>
              <input
                type="radio"
                id={id}
                name={baseId}
                value={type}
                checked={mapType === type}
                onChange={() => onChange(type)}
              />
              <span>{optionLabels[type]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
