import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation, type TFunction } from "react-i18next";

import { ApiError, getStructures } from "../shared/api";
import {
  CostBand,
  Season,
  StructureSearchItem,
  StructureSearchParams,
  StructureSearchResponse,
  StructureType,
  Unit,
} from "../shared/types";
import {
  Button,
  EmptyState,
  FilterChip,
  LinkButton,
  SectionHeader,
  Surface,
  ToolbarSection,
} from "../shared/ui/designSystem";

const structureTypes: StructureType[] = ["house", "land", "mixed"];
const seasons: Season[] = ["winter", "spring", "summer", "autumn"];
const units: Unit[] = ["LC", "EG", "RS", "ALL"];
const costBands: CostBand[] = ["cheap", "medium", "expensive"];
const sortOptions: Array<{ value: StructureSearchParams["sort"]; labelKey: string }> = [
  { value: "distance", labelKey: "structures.filters.sort.distance" },
  { value: "name", labelKey: "structures.filters.sort.name" },
  { value: "created_at", labelKey: "structures.filters.sort.created" },
];
const orderOptions: Array<{ value: StructureSearchParams["order"]; labelKey: string }> = [
  { value: "asc", labelKey: "structures.filters.order.asc" },
  { value: "desc", labelKey: "structures.filters.order.desc" },
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
  order: "asc",
};

const filterToParam: Partial<Record<keyof FilterFormState, keyof StructureSearchParams>> = {
  q: "q",
  province: "province",
  type: "type",
  max_km: "max_km",
  season: "season",
  unit: "unit",
  cost_band: "cost_band",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );

const StructureCard = ({ item, t }: { item: StructureSearchItem; t: TFunction }) => {
  const hasSeasons = item.seasons.length > 0;
  const hasUnits = item.units.length > 0;
  const typeLabel = t(`structures.types.${item.type}`, item.type);
  const costBandLabel = item.cost_band ? t(`structures.costBands.${item.cost_band}`, item.cost_band) : null;

  return (
    <li className="structure-card">
      <header>
        <h3>
          <Link to={`/structures/${item.slug}`}>{item.name}</Link>
        </h3>
        <div className="structure-card__meta">
          <span>{typeLabel}</span>
          <span>· {item.province ?? t("structures.cards.notAvailable")}</span>
          {item.address && <span>· {item.address}</span>}
        </div>
      </header>

      {(hasSeasons || hasUnits) && (
        <div className="structure-card__badges">
          {hasSeasons && (
            <div className="badge-group" aria-label={t("structures.cards.seasonsLabel")}> 
              {item.seasons.map((season) => (
                <span key={`${item.id}-season-${season}`} className="badge badge-season">
                  {season}
                </span>
              ))}
            </div>
          )}
          {hasUnits && (
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

      <div className="structure-card__meta">
        {item.distance_km !== null && (
          <span>{t("structures.cards.distance", { value: item.distance_km.toFixed(1) })}</span>
        )}
        {item.estimated_cost !== null && (
          <span>
            {t("structures.cards.estimatedCost", { value: formatCurrency(item.estimated_cost) })}
            {costBandLabel && ` ${t("structures.cards.costBand", { value: costBandLabel })}`}
          </span>
        )}
      </div>

      <div className="structure-card__actions">
        <LinkButton to={`/structures/${item.slug}`} variant="ghost" size="sm">
          {t("structures.cards.viewDetails")}
        </LinkButton>
        {item.latitude && item.longitude && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=13/${item.latitude}/${item.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("structures.cards.openMap")}
          </a>
        )}
      </div>
    </li>
  );
};

export const StructuresPage = () => {
  const { t } = useTranslation();
  const [form, setForm] = useState<FilterFormState>(initialFormState);
  const [filters, setFilters] = useState<StructureSearchParams>({
    sort: initialFormState.sort,
    order: initialFormState.order,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);

  const queryKey = ["structures", filters, page, pageSize];

  const fetchStructures = async (): Promise<StructureSearchResponse> =>
    getStructures({ ...filters, page, page_size: pageSize });

  const { data, isLoading, isError, error, isFetching } = useQuery<StructureSearchResponse, Error>({
    queryKey,
    queryFn: fetchStructures,
    placeholderData: keepPreviousData,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters: StructureSearchParams = {
      sort: form.sort,
      order: form.order,
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

  const handleRemoveFilter = (key: keyof FilterFormState) => {
    setForm((prev) => ({ ...prev, [key]: initialFormState[key] }));
    setFilters((prev) => {
      const next = { ...prev } as Record<string, unknown>;
      const paramKey = filterToParam[key];
      if (paramKey) {
        delete next[paramKey];
      }
      if (!next.sort) {
        next.sort = initialFormState.sort;
      }
      if (!next.order) {
        next.order = initialFormState.order;
      }
      return next as StructureSearchParams;
    });
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

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof FilterFormState; label: string }> = [];
    if (filters.q) {
      chips.push({ key: "q", label: t("structures.filters.active.search", { value: filters.q }) });
    }
    if (filters.province) {
      chips.push({ key: "province", label: t("structures.filters.active.province", { value: filters.province }) });
    }
    if (filters.type) {
      chips.push({ key: "type", label: t("structures.filters.active.type", { value: filters.type }) });
    }
    if (filters.season) {
      chips.push({ key: "season", label: t("structures.filters.active.season", { value: filters.season }) });
    }
    if (filters.unit) {
      chips.push({ key: "unit", label: t("structures.filters.active.unit", { value: filters.unit }) });
    }
    if (filters.cost_band) {
      chips.push({ key: "cost_band", label: t("structures.filters.active.costBand", { value: filters.cost_band }) });
    }
    if (typeof filters.max_km === "number") {
      chips.push({ key: "max_km", label: t("structures.filters.active.maxDistance", { value: filters.max_km }) });
    }
    return chips;
  }, [filters, t]);

  const summaryText = useMemo(() => {
    if (!data) {
      return "";
    }
    return t("structures.meta.summary", {
      count: data.total,
      page,
      totalPages,
      lat: baseCoords.lat.toFixed(4),
      lon: baseCoords.lon.toFixed(4),
    });
  }, [data, t, page, totalPages, baseCoords.lat, baseCoords.lon]);

  const isInitialLoading = isLoading && !data;

  if (isError) {
    const message = error instanceof ApiError ? error.message : t("structures.states.error");
    return (
      <section>
        <Surface>
          <SectionHeader>
            <h2>{t("structures.title")}</h2>
          </SectionHeader>
          <p className="error" role="alert">
            {message}
          </p>
        </Surface>
      </section>
    );
  }

  return (
    <section>
      <Surface>
        <SectionHeader>
          <h2>{t("structures.title")}</h2>
          <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
            {t("structures.filters.actions.reset")}
          </Button>
        </SectionHeader>
        <form className="toolbar" onSubmit={handleSubmit}>
          <ToolbarSection>
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
          </ToolbarSection>

          <ToolbarSection>
            <label>
              {t("structures.filters.maxDistance.label")}
              <input
                type="number"
                min="0"
                step="1"
                value={form.max_km}
                onChange={(event) => setForm((prev) => ({ ...prev, max_km: event.target.value }))}
                placeholder={t("structures.filters.maxDistance.placeholder")}
                inputMode="numeric"
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
            <div className="toolbar-actions">
              <Button type="submit" size="sm">
                {t("structures.filters.actions.apply")}
              </Button>
              <Button type="button" variant="subtle" size="sm" onClick={handleReset}>
                {t("structures.filters.actions.reset")}
              </Button>
            </div>
          </ToolbarSection>
        </form>

        {activeFilterChips.length > 0 && (
          <ul className="filter-chips" aria-label={t("structures.filters.active.title")}>
            {activeFilterChips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                onRemove={() => handleRemoveFilter(chip.key)}
                aria-label={t("structures.filters.active.remove", { label: chip.label })}
              />
            ))}
          </ul>
        )}

        <p className="summary" aria-live="polite">
          {summaryText}
          {isFetching && <span> · {t("structures.meta.updating")}</span>}
        </p>

        {isInitialLoading ? (
          <div aria-busy="true" aria-live="polite">
            <div className="loading-skeleton" style={{ width: "60%" }} />
            <div className="loading-skeleton" style={{ height: "160px", marginTop: "1.5rem" }} />
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={t("structures.states.empty")}
            description={t("structures.filters.emptyHint")}
            action={
              <Button type="button" variant="ghost" onClick={handleReset}>
                {t("structures.filters.actions.reset")}
              </Button>
            }
          />
        ) : (
          <ul className="structure-grid">
            {data?.items.map((item) => (
              <StructureCard key={item.id} item={item} t={t} />
            ))}
          </ul>
        )}

        <nav className="pagination" aria-label={t("structures.pagination.label")}>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPage((prev) => prev - 1)} disabled={!canGoPrev}>
            {t("structures.pagination.previous")}
          </Button>
          <span>{t("structures.pagination.page", { page, totalPages })}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext}>
            {t("structures.pagination.next")}
          </Button>
        </nav>
      </Surface>
    </section>
  );
};
