import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TransportAccessPointType } from "../types";
import { Button } from "./designSystem";
import { GoogleMapEmbed, type GoogleMapEmbedCoordinates } from "./GoogleMapEmbed";
import { MapTypeToggle } from "./MapTypeToggle";
import type { GoogleMapType } from "../utils/googleMaps";

export type TransportAccessPointFormValue = {
  id: string;
  type: TransportAccessPointType;
  note: string;
  coordinates: GoogleMapEmbedCoordinates | null;
};

type TransportAccessPointsFieldProps = {
  points: TransportAccessPointFormValue[];
  onChange: (points: TransportAccessPointFormValue[]) => void;
  selectedCoordinates: GoogleMapEmbedCoordinates | null;
  mapType: GoogleMapType;
  onMapTypeChange: (mapType: GoogleMapType) => void;
  error?: string;
};

export const TransportAccessPointsField = ({
  points,
  onChange,
  selectedCoordinates,
  mapType,
  onMapTypeChange,
  error
}: TransportAccessPointsFieldProps) => {
  const { t } = useTranslation();
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [modalSelection, setModalSelection] = useState<GoogleMapEmbedCoordinates | null>(null);

  const typeOptions = useMemo(
    () => [
      { value: "bus", label: t("structures.create.form.transportAccessPoints.typeOptions.bus") },
      { value: "car", label: t("structures.create.form.transportAccessPoints.typeOptions.car") },
      { value: "4x4", label: t("structures.create.form.transportAccessPoints.typeOptions.4x4") }
    ],
    [t]
  );

  const mapTypeLabels = useMemo(
    () => ({
      label: t("structures.map.type.label"),
      roadmap: t("structures.map.type.options.roadmap"),
      satellite: t("structures.map.type.options.satellite"),
    }),
    [t]
  );

  const updatePoint = (id: string, updater: (point: TransportAccessPointFormValue) => TransportAccessPointFormValue) => {
    onChange(points.map((point) => (point.id === id ? updater(point) : point)));
  };

  const handleTypeChange = (id: string, value: TransportAccessPointType) => {
    updatePoint(id, (point) => ({ ...point, type: value }));
  };

  const handleNoteChange = (id: string, value: string) => {
    updatePoint(id, (point) => ({ ...point, note: value }));
  };

  const handleAddPoint = () => {
    onChange([
      ...points,
      {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        type: "bus",
        note: "",
        coordinates: null
      }
    ]);
  };

  const handleRemovePoint = (id: string) => {
    onChange(points.filter((point) => point.id !== id));
  };

  const handleCoordinatesOpen = (point: TransportAccessPointFormValue) => {
    setActivePointId(point.id);
    setModalSelection(point.coordinates ?? selectedCoordinates ?? null);
  };

  const handleCoordinatesConfirm = () => {
    if (!activePointId || !modalSelection) {
      return;
    }
    updatePoint(activePointId, (point) => ({ ...point, coordinates: modalSelection }));
    setActivePointId(null);
    setModalSelection(null);
  };

  const handleCoordinatesClear = (id: string) => {
    updatePoint(id, (point) => ({ ...point, coordinates: null }));
  };

  const activePoint = activePointId ? points.find((point) => point.id === activePointId) : null;

  return (
    <div className="transport-access-points" data-span="full" id="structure-transport_access_points">
      <div className="transport-access-points__header">
        <div>
          <div className="field-label">{t("structures.create.form.transportAccessPoints.label")}</div>
          <p className="helper-text">
            {t("structures.create.form.transportAccessPoints.hint")}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handleAddPoint}>
          {t("structures.create.form.transportAccessPoints.add")}
        </Button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {points.length === 0 ? (
        <p className="helper-text">
          {t("structures.create.form.transportAccessPoints.empty")}
        </p>
      ) : (
        <div className="transport-access-points__list">
          {points.map((point, index) => {
            const coordinatesLabel = point.coordinates
              ? t("structures.create.form.transportAccessPoints.coordinatesPreview", {
                  lat: point.coordinates.lat.toFixed(6),
                  lon: point.coordinates.lng.toFixed(6)
                })
              : null;

            return (
              <div className="transport-access-point" key={point.id}>
                <div className="transport-access-point__row">
                  <label htmlFor={`transport-point-type-${point.id}`} className="transport-access-point__label">
                    {t("structures.create.form.transportAccessPoints.pointLabel", { index: index + 1 })}
                    <select
                      id={`transport-point-type-${point.id}`}
                      value={point.type}
                      onChange={(event) => handleTypeChange(point.id, event.target.value as TransportAccessPointType)}
                    >
                      {typeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label htmlFor={`transport-point-note-${point.id}`} className="transport-access-point__label">
                    {t("structures.create.form.transportAccessPoints.noteLabel")}
                    <textarea
                      id={`transport-point-note-${point.id}`}
                      value={point.note}
                      rows={4}
                      onChange={(event) => handleNoteChange(point.id, event.target.value)}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.transportAccessPoints.noteHelper")}
                    </span>
                  </label>
                </div>

                <div className="transport-access-point__actions">
                  <div className="transport-access-point__coordinates">
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleCoordinatesOpen(point)}>
                      {t("structures.create.form.transportAccessPoints.coordinatesButton")}
                    </Button>
                    {coordinatesLabel && (
                      <p className="helper-text transport-access-point__coordinates-label">
                        {coordinatesLabel}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCoordinatesClear(point.id)}
                        >
                          {t("structures.create.form.transportAccessPoints.coordinatesClear")}
                        </Button>
                      </p>
                    )}
                    <p className="helper-text">
                      {t("structures.create.form.transportAccessPoints.coordinatesHelper")}
                    </p>
                  </div>

                  <Button type="button" variant="ghost" size="sm" onClick={() => handleRemovePoint(point.id)}>
                    {t("structures.create.form.transportAccessPoints.remove")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activePoint && (
        <div className="modal" role="presentation">
          <div
            className="modal-content modal-content--full-width"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transport-access-point-modal-title"
          >
            <header className="modal-header">
              <h3 id="transport-access-point-modal-title">
                {t("structures.create.form.transportAccessPoints.modal.title")}
              </h3>
            </header>
            <div className="modal-body">
              <p>{t("structures.create.form.transportAccessPoints.modal.description")}</p>
              <MapTypeToggle
                mapType={mapType}
                onChange={onMapTypeChange}
                label={mapTypeLabels.label}
                optionLabels={{
                  roadmap: mapTypeLabels.roadmap,
                  satellite: mapTypeLabels.satellite,
                }}
              />
              <GoogleMapEmbed
                coordinates={modalSelection ?? activePoint.coordinates ?? selectedCoordinates}
                title={t("structures.create.form.transportAccessPoints.modal.mapLabel")}
                ariaLabel={t("structures.create.form.transportAccessPoints.modal.mapLabel")}
                emptyLabel={t("structures.create.form.transportAccessPoints.modal.empty")}
                mapType={mapType}
                onCoordinatesChange={setModalSelection}
              />
              <p className="helper-text">
                {t("structures.create.form.transportAccessPoints.modal.hint")}
              </p>
            </div>
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setActivePointId(null)}>
                {t("structures.create.form.transportAccessPoints.modal.cancel")}
              </Button>
              <Button type="button" onClick={handleCoordinatesConfirm} disabled={!modalSelection}>
                {t("structures.create.form.transportAccessPoints.modal.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
