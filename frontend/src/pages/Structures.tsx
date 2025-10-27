import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiError, getStructures } from "../shared/api";
import {
  CostBand,
  Season,
  StructureSearchItem,
  StructureSearchParams,
  StructureSearchResponse,
  StructureType,
  Unit
} from "../shared/types";

const structureTypes: StructureType[] = ["house", "land", "mixed"];
const seasons: Season[] = ["winter", "spring", "summer", "autumn"];
const units: Unit[] = ["LC", "EG", "RS", "ALL"];
const costBands: CostBand[] = ["cheap", "medium", "expensive"];
const sortOptions: Array<{ value: StructureSearchParams["sort"]; labelKey: string }> = [
  { value: "distance", labelKey: "structures.filters.sort.distance" },
  { value: "name", labelKey: "structures.filters.sort.name" },
  { value: "created_at", labelKey: "structures.filters.sort.created" }
];
const orderOptions: Array<{ value: StructureSearchParams["order"]; labelKey: string }> = [
  { value: "asc", labelKey: "structures.filters.order.asc" },
  { value: "desc", labelKey: "structures.filters.order.desc" }
];
const pageSizeOptions = [6, 12, 20];

const envBaseCoords = (() => {
  const raw = import.meta.env.VITE_BASE_COORDS;
  if (typeof raw !== "string") {
    return null;
  }
  const [lat, lon] = raw.split(",").map((value) => Number.parseFloat(value.trim()));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon };
  }
  return null;
})();

interface FilterFormState {
  q: string;
  province: string;
  type: string;
  max_km: string;
  season: string;
  unit: string;
  cost_band: string;
  sort: StructureSearchParams["sort"];
  order: StructureSearchParams["order"];
}

const initialFormState: FilterFormState = {
  q: "",
  province: "",
  type: "",
  max_km: "",
  season: "",
  unit: "",
  cost_band: "",
  sort: "distance",
  order: "asc"
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const StructuresPage = () => {
  const { t } = useTranslation();
  const [form, setForm] = useState<FilterFormState>(initialFormState);
  const [filters, setFilters] = useState<StructureSearchParams>({
    sort: initialFormState.sort,
    order: initialFormState.order
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);

  const queryKey = ["structures", filters, page, pageSize];

  const fetchStructures = async (): Promise<StructureSearchResponse> =>
    getStructures({ ...filters, page, page_size: pageSize });

  const { data, isLoading, isError, error, isFetching } = useQuery<StructureSearchResponse, Error>({
    queryKey,
    queryFn: fetchStructures,
    placeholderData: keepPreviousData
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters: StructureSearchParams = {
      sort: form.sort,
      order: form.order
    };

    if (form.q.trim()) {
      nextFilters.q = form.q.trim();
    }

    if (form.province) {
      nextFilters.province = form.province;
    }

    if (form.type) {
      nextFilters.type = form.type as StructureType;
    }

    if (form.season) {
      nextFilters.season = form.season as Season;
    }

    if (form.unit) {
      nextFilters.unit = form.unit as Unit;
    }

    if (form.cost_band) {
      nextFilters.cost_band = form.cost_band as CostBand;
    }

    if (form.max_km) {
      const numeric = Number.parseFloat(form.max_km);
      if (!Number.isNaN(numeric)) {
        nextFilters.max_km = numeric;
      }
    }

    setFilters(nextFilters);
    setPage(1);
  };

  const handleReset = () => {
    setForm(initialFormState);
    setFilters({ sort: initialFormState.sort, order: initialFormState.order });
    setPage(1);
  };

  const provinces = useMemo(() => {
    const fromResponse = new Set<string>();
    data?.items.forEach((item) => {
      if (item.province) {
        fromResponse.add(item.province);
      }
    });
    if (form.province) {
      fromResponse.add(form.province);
    }
    return Array.from(fromResponse).sort();
  }, [data?.items, form.province]);

  const baseCoords = data?.base_coords ?? envBaseCoords ?? { lat: 45.5966, lon: 10.1655 };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const canGoPrev = page > 1;
  const canGoNext = data ? page < totalPages : false;
  const allOptionLabel = t("structures.filters.options.all");
  const metaText = t("structures.meta.summary", {
    page,
    totalPages,
    lat: baseCoords.lat.toFixed(4),
    lon: baseCoords.lon.toFixed(4)
  });

  if (isLoading && !data) {
    return (
      <section>
        <div className="card">
          <h2>{t("structures.title")}</h2>
          <p>{t("structures.states.loading")}</p>
        </div>
      </section>
    );
  }

  if (isError) {
    const message = error instanceof ApiError ? error.message : t("structures.states.error");
    return (
      <section>
        <div className="card">
          <h2>{t("structures.title")}</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>{t("structures.title")}</h2>
        <form className="filters" onSubmit={handleSubmit}>
          <div className="filters-row">
            <label>
              {t("structures.filters.search.label")}
              <input
                type="search"
                value={form.q}
                onChange={(event) => setForm((prev) => ({ ...prev, q: event.target.value }))}
                placeholder={t("structures.filters.search.placeholder")}
              />
            </label>
            <label>
              {t("structures.filters.province.label")}
              <select
                value={form.province}
                onChange={(event) => setForm((prev) => ({ ...prev, province: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.type.label")}
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {structureTypes.map((structureType) => (
                  <option key={structureType} value={structureType}>
                    {structureType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.season.label")}
              <select
                value={form.season}
                onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.unit.label")}
              <select
                value={form.unit}
                onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filters-row">
            <label>
              {t("structures.filters.maxDistance.label")}
              <input
                type="number"
                min="0"
                step="1"
                value={form.max_km}
                onChange={(event) => setForm((prev) => ({ ...prev, max_km: event.target.value }))}
                placeholder={t("structures.filters.maxDistance.placeholder")}
              />
            </label>
            <label>
              {t("structures.filters.costBand.label")}
              <select
                value={form.cost_band}
                onChange={(event) => setForm((prev) => ({ ...prev, cost_band: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {costBands.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.sort.label")}
              <select
                value={form.sort}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sort: event.target.value as FilterFormState["sort"] }))
                }
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value ?? ""}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.order.label")}
              <select
                value={form.order}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, order: event.target.value as FilterFormState["order"] }))
                }
              >
                {orderOptions.map((option) => (
                  <option key={option.value} value={option.value ?? ""}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.pageSize.label")}
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number.parseInt(event.target.value, 10);
                  setPageSize(nextSize);
                  setPage(1);
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="filters-actions">
              <button type="submit">{t("structures.filters.actions.apply")}</button>
              <button type="button" onClick={handleReset} className="secondary">
                {t("structures.filters.actions.reset")}
              </button>
            </div>
          </div>
        </form>

        <p className="meta">
          {metaText}
          {isFetching && <span> {t("structures.meta.updating")}</span>}
        </p>

        {data && data.items.length === 0 ? (
          <p>{t("structures.states.empty")}</p>
        ) : (
          <ul className="structure-results">
            {data?.items.map((item: StructureSearchItem) => (
              <li key={item.id} className="card structure-card">
                <h3>
                  <Link to={`/structures/${item.slug}`}>{item.name}</Link>
                </h3>
                <p>
                  <strong>{item.type}</strong> · {item.province ?? t("structures.cards.notAvailable")}
                </p>
                {item.address && <p>{item.address}</p>}
                {(item.seasons.length > 0 || item.units.length > 0) && (
                  <div className="structure-badges">
                    {item.seasons.length > 0 && (
                      <div className="badge-group" aria-label={t("structures.cards.seasonsLabel")}>
                        {item.seasons.map((season) => (
                          <span key={`${item.id}-season-${season}`} className="badge badge-season">
                            {season}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.units.length > 0 && (
                      <div className="badge-group" aria-label={t("structures.cards.unitsLabel")}>
                        {item.units.map((unit) => (
                          <span key={`${item.id}-unit-${unit}`} className="badge badge-unit">
                            {unit}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {item.distance_km !== null && (
                  <p>{t("structures.cards.distance", { value: item.distance_km.toFixed(1) })}</p>
                )}
                {item.estimated_cost !== null && (
                  <p>
                    {t("structures.cards.estimatedCost", { value: item.estimated_cost.toFixed(2) })}
                    {item.cost_band && ` ${t("structures.cards.costBand", { value: capitalize(item.cost_band) })}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="pagination">
          <button type="button" onClick={() => setPage((prev) => prev - 1)} disabled={!canGoPrev}>
            {t("structures.pagination.previous")}
          </button>
          <span>
            {t("structures.pagination.page", { page, totalPages })}
          </span>
          <button type="button" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext}>
            {t("structures.pagination.next")}
          </button>
        </div>
      </div>
    </section>
  );
};
