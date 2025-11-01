import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { ApiError, getStructures } from "../shared/api";
import {
  CostBand,
  FirePolicy,
  Season,
  StructureOpenPeriodSeason,
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
const firePolicies: FirePolicy[] = ["allowed", "with_permit", "forbidden"];
const accessOptions = [
  { key: "access_car", value: "car", labelKey: "structures.filters.access.car" },
  { key: "access_coach", value: "coach", labelKey: "structures.filters.access.coach" },
  { key: "access_pt", value: "pt", labelKey: "structures.filters.access.pt" },
] as const;
type FilterChipKey = keyof FilterFormState | "access";
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

type SeasonLike = Season | StructureOpenPeriodSeason;

const getStructureTypeLabel = (t: TFunction, type: StructureType) =>
  t(`structures.types.${type}`, type);

const getSeasonLabel = (t: TFunction, season: SeasonLike) =>
  t(`structures.form.openPeriods.season.${season}`, season);

const getUnitLabel = (t: TFunction, unit: Unit) =>
  t(`structures.form.openPeriods.unitsOptions.${unit}`, unit);

const getCostBandLabel = (t: TFunction, costBand: CostBand) =>
  t(`structures.costBands.${costBand}`, costBand);

const getFirePolicyLabel = (t: TFunction, policy: FirePolicy) =>
  t(`structures.filters.firePolicy.options.${policy}`, policy);

const formatDateForDisplay = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale).format(parsed);
};

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
  fire: string;
  min_land_area: string;
  access_car: boolean;
  access_coach: boolean;
  access_pt: boolean;
  hot_water: boolean;
  open_in_season: string;
  open_on_date: string;
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
  fire: "",
  min_land_area: "",
  access_car: false,
  access_coach: false,
  access_pt: false,
  hot_water: false,
  open_in_season: "",
  open_on_date: "",
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
  fire: "fire",
  min_land_area: "min_land_area",
  hot_water: "hot_water",
  open_in_season: "open_in_season",
  open_on_date: "open_on_date",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );

const StructureCard = ({ item, t }: { item: StructureSearchItem; t: TFunction }) => {
  const hasSeasons = item.seasons.length > 0;
  const hasUnits = item.units.length > 0;
  const typeLabel = getStructureTypeLabel(t, item.type);
  const costBandLabel = item.cost_band ? getCostBandLabel(t, item.cost_band) : null;
  const fireLabel = item.fire_policy ? t(`structures.cards.icons.fire.${item.fire_policy}`) : null;
  const quickIcons: Array<{ icon: string; label: string }> = [];
  if (fireLabel) {
    quickIcons.push({ icon: "🔥", label: fireLabel });
  }
  if (item.access_by_coach) {
    quickIcons.push({ icon: "🚌", label: t("structures.cards.icons.coach") });
  }
  if (item.access_by_public_transport) {
    quickIcons.push({ icon: "🚆", label: t("structures.cards.icons.pt") });
  }
  if (item.has_kitchen) {
    quickIcons.push({ icon: "🍳", label: t("structures.cards.icons.kitchen") });
  }
  if (item.hot_water) {
    quickIcons.push({ icon: "♨️", label: t("structures.cards.icons.hotWater") });
  }

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
          {item.pit_latrine_allowed && (
            <div className="badge-group" aria-label={t("structures.cards.badges.pitLatrineLabel")}>
              <span className="badge badge-feature">
                {t("structures.cards.badges.pitLatrineAllowed")}
              </span>
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

      {quickIcons.length > 0 && (
        <div className="structure-card__icons" aria-label={t("structures.cards.icons.label")}>
          {quickIcons.map(({ icon, label }) => (
            <span key={`${item.id}-${label}`} className="structure-card__icon" role="img" aria-label={label} title={label}>
              {icon}
            </span>
          ))}
        </div>
      )}

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
  const { t, i18n } = useTranslation();
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

    if (form.fire) {
      nextFilters.fire = form.fire as FirePolicy;
    }

    if (form.min_land_area) {
      const numeric = Number.parseFloat(form.min_land_area);
      if (!Number.isNaN(numeric)) {
        nextFilters.min_land_area = numeric;
      }
    }

    if (form.open_in_season) {
      nextFilters.open_in_season = form.open_in_season as StructureOpenPeriodSeason;
    }

    if (form.open_on_date) {
      nextFilters.open_on_date = form.open_on_date;
    }

    const accessSelections: string[] = [];
    if (form.access_car) {
      accessSelections.push("car");
    }
    if (form.access_coach) {
      accessSelections.push("coach");
    }
    if (form.access_pt) {
      accessSelections.push("pt");
    }
    if (accessSelections.length > 0) {
      nextFilters.access = accessSelections.join("|");
    }

    if (form.hot_water) {
      nextFilters.hot_water = true;
    }

    setFilters(nextFilters);
    setPage(1);
  };

  const handleReset = () => {
    setForm(initialFormState);
    setFilters({ sort: initialFormState.sort, order: initialFormState.order });
    setPage(1);
  };

  const handleRemoveFilter = (key: FilterChipKey) => {
    if (key === "access") {
      setForm((prev) => ({
        ...prev,
        access_car: false,
        access_coach: false,
        access_pt: false,
      }));
      setFilters((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        delete next.access;
        if (!next.sort) {
          next.sort = initialFormState.sort;
        }
        if (!next.order) {
          next.order = initialFormState.order;
        }
        return next as StructureSearchParams;
      });
      setPage(1);
      return;
    }

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
    const chips: Array<{ key: FilterChipKey; label: string }> = [];
    if (filters.q) {
      chips.push({ key: "q", label: t("structures.filters.active.search", { value: filters.q }) });
    }
    if (filters.province) {
      chips.push({ key: "province", label: t("structures.filters.active.province", { value: filters.province }) });
    }
    if (filters.type) {
      chips.push({
        key: "type",
        label: t("structures.filters.active.type", { value: getStructureTypeLabel(t, filters.type) }),
      });
    }
    if (filters.season) {
      chips.push({
        key: "season",
        label: t("structures.filters.active.season", { value: getSeasonLabel(t, filters.season) }),
      });
    }
    if (filters.unit) {
      chips.push({
        key: "unit",
        label: t("structures.filters.active.unit", { value: getUnitLabel(t, filters.unit) }),
      });
    }
    if (filters.cost_band) {
      chips.push({
        key: "cost_band",
        label: t("structures.filters.active.costBand", { value: getCostBandLabel(t, filters.cost_band) }),
      });
    }
    if (typeof filters.max_km === "number") {
      chips.push({ key: "max_km", label: t("structures.filters.active.maxDistance", { value: filters.max_km }) });
    }
    if (filters.fire) {
      chips.push({
        key: "fire",
        label: t("structures.filters.active.fire", { value: getFirePolicyLabel(t, filters.fire) }),
      });
    }
    if (typeof filters.min_land_area === "number") {
      chips.push({ key: "min_land_area", label: t("structures.filters.active.minLandArea", { value: filters.min_land_area }) });
    }
    if (filters.access) {
      const accessLabels = filters.access.split("|")
        .map((token) => t(`structures.filters.access.${token as "car" | "coach" | "pt"}`, token))
        .join(", ");
      chips.push({ key: "access", label: t("structures.filters.active.access", { value: accessLabels }) });
    }
    if (filters.hot_water) {
      chips.push({ key: "hot_water", label: t("structures.filters.active.hotWater") });
    }
    if (filters.open_in_season) {
      chips.push({
        key: "open_in_season",
        label: t("structures.filters.active.openIn", { value: getSeasonLabel(t, filters.open_in_season) }),
      });
    }
    if (filters.open_on_date) {
      chips.push({
        key: "open_on_date",
        label: t("structures.filters.active.openOn", {
          value: formatDateForDisplay(filters.open_on_date, i18n.language),
        }),
      });
    }
    return chips;
  }, [filters, t, i18n.language]);

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
                    {getStructureTypeLabel(t, structureType)}
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
                    {getSeasonLabel(t, season)}
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
                    {getUnitLabel(t, unit)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.openInSeason.label")}
              <select
                value={form.open_in_season}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, open_in_season: event.target.value }))
                }
              >
                <option value="">{allOptionLabel}</option>
                {seasons.map((season) => (
                  <option key={`open-${season}`} value={season}>
                    {getSeasonLabel(t, season)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.openOnDate.label")}
              <input
                type="date"
                value={form.open_on_date}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, open_on_date: event.target.value }))
                }
              />
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
                    {getCostBandLabel(t, band)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.firePolicy.label")}
              <select
                value={form.fire}
                onChange={(event) => setForm((prev) => ({ ...prev, fire: event.target.value }))}
              >
                <option value="">{allOptionLabel}</option>
                {firePolicies.map((policy) => (
                  <option key={policy} value={policy}>
                    {t(`structures.filters.firePolicy.options.${policy}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("structures.filters.minLandArea.label")}
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.min_land_area}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, min_land_area: event.target.value }))
                }
                placeholder={t("structures.filters.minLandArea.placeholder")}
              />
            </label>
          </ToolbarSection>

          <ToolbarSection>
            <fieldset className="filter-fieldset">
              <legend>{t("structures.filters.access.title")}</legend>
              {accessOptions.map((option) => (
                <label key={option.key} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={form[option.key]}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [option.key]: event.target.checked }))
                    }
                  />
                  {t(option.labelKey)}
                </label>
              ))}
            </fieldset>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={form.hot_water}
                onChange={(event) => setForm((prev) => ({ ...prev, hot_water: event.target.checked }))}
              />
              {t("structures.filters.hotWater.label")}
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
