import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  createStructureContact,
  deleteStructureContact,
  getStructureBySlug,
  searchContacts,
  updateStructureContact
} from "../shared/api";
import type {
  Availability,
  CellSignalQuality,
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  CostOption,
  CostBand,
  FirePolicy,
  FieldSlope,
  FloodRiskLevel,
  PaymentMethod,
  Structure,
  StructureUsageRecommendation,
  StructureOpenPeriod,
  WaterSource
} from "../shared/types";
import { useAuth } from "../shared/auth";
import { AttachmentsSection } from "../shared/ui/AttachmentsSection";
import { StructurePhotosSection } from "../shared/ui/StructurePhotosSection";
import { Button, LinkButton } from "../shared/ui/designSystem";
import {
  createGoogleMapsEmbedUrl,
  createGoogleMapsViewUrl
} from "../shared/utils/googleMaps";

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

const formatCostBand = (band: CostBand | null | undefined) =>
  band ? band.charAt(0).toUpperCase() + band.slice(1) : null;

type ContactFormState = {
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  phone: string;
  preferred_channel: ContactPreferredChannel;
  is_primary: boolean;
  notes: string;
  contactId: number | null;
};

const initialContactForm: ContactFormState = {
  first_name: "",
  last_name: "",
  role: "",
  email: "",
  phone: "",
  preferred_channel: "email",
  is_primary: false,
  notes: "",
  contactId: null
};

type LogisticsDetail = {
  id: string;
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  isFull?: boolean;
};

const sortContacts = (items: Contact[]): Contact[] =>
  [...items].sort((a, b) => {
    if (a.is_primary !== b.is_primary) {
      return a.is_primary ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

export const StructureDetailsPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<
    "overview" | "availability" | "costs" | "contacts" | "photos" | "attachments"
  >("overview");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formState, setFormState] = useState<ContactFormState>(initialContactForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Contact[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const channelLabels = useMemo(
    () => ({
      email: t("structures.contacts.channels.email"),
      phone: t("structures.contacts.channels.phone"),
      other: t("structures.contacts.channels.other")
    }),
    [t]
  );

  const fallbackLabels = useMemo(
    () => ({
      yes: t("structures.details.common.yes"),
      no: t("structures.details.common.no"),
    }),
    [t]
  );

  const formatBoolean = (value: boolean | null | undefined) => {
    if (value === null || value === undefined) {
      return null;
    }
    return value ? fallbackLabels.yes : fallbackLabels.no;
  };

  const formatCount = (value: number | null | undefined) =>
    value === null || value === undefined
      ? null
      : new Intl.NumberFormat("it-IT").format(value);

  const formatLandArea = (value: number | null | undefined) =>
    value === null || value === undefined
      ? null
      : t("structures.details.overview.landAreaValue", {
          value: new Intl.NumberFormat("it-IT").format(value)
        });

  const formatOptionalText = (
    value: string | null | undefined,
    fallbackKey?: string
  ) => {
    if (value && value.trim().length > 0) {
      return value;
    }
    if (fallbackKey) {
      return null;
    }
    return null;
  };

  const formatWaterSources = (sources: WaterSource[] | null | undefined) => {
    if (!sources || sources.length === 0) {
      return null;
    }
    return sources
      .map((source) => t(`structures.create.form.waterSourceOptions.${source}`))
      .join(", ");
  };

  const formatFloodRisk = (risk: FloodRiskLevel | null | undefined) => {
    if (!risk) {
      return null;
    }
    return t(`structures.details.overview.floodRiskOptions.${risk}`);
  };

  const formatFirePolicy = (policy: FirePolicy | null | undefined) => {
    if (!policy) {
      return null;
    }
    return t(`structures.create.form.firePolicyOptions.${policy}`);
  };

  const formatFieldSlope = (value: FieldSlope | string | null | undefined) => {
    if (!value) {
      return null;
    }
    return t(`structures.create.form.fieldSlopeOptions.${value}`);
  };

  const formatAllowedAudiences = (audiences: string[] | null | undefined) => {
    if (!audiences || audiences.length === 0) {
      return null;
    }
    return audiences.join(", ");
  };

  const formatStringList = (items: string[] | null | undefined) => {
    if (!items || items.length === 0) {
      return null;
    }
    return items.join(", ");
  };

  const formatSignalQuality = (value: CellSignalQuality | null | undefined) => {
    if (!value) {
      return t("structures.details.overview.notAvailable");
    }
    return t(`structures.details.overview.connectivity.signal.${value}`);
  };

  const formatUsageRecommendation = (
    value: StructureUsageRecommendation | null | undefined
  ) => {
    if (!value) {
      return null;
    }
    return t(`structures.details.overview.usageRecommendation.values.${value}`);
  };

  const formatSeasonalAmenities = (
    amenities: Record<string, unknown> | null | undefined
  ): ReactNode => {
    if (!amenities || Object.keys(amenities).length === 0) {
      return null;
    }
    return (
      <ul className="structure-website-links">
        {Object.entries(amenities).map(([key, value]) => {
          const valueText = typeof value === "string" ? value : JSON.stringify(value);
          return (
            <li key={key}>
              <strong>{key}</strong>: {valueText}
            </li>
          );
        })}
      </ul>
    );
  };

  const isValuePresent = (value: ReactNode) => {
    if (value === null || value === undefined || value === false) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  };

  ;

  const filterVisibleDetails = (items: LogisticsDetail[]): LogisticsDetail[] =>
    items.filter(({ value }) => isValuePresent(value));

  const renderLogisticsDetails = (items: LogisticsDetail[]) => (
    <dl className="structure-logistics-grid">
      {items.map(({ id, label, value, icon, isFull }) => (
        <div
          key={id}
          className={`structure-logistics-item${isFull ? " structure-logistics-item--full" : ""}`}
        >
          <dt className="structure-logistics-item__label">
            {icon && (
              <span className="structure-logistics-item__icon" aria-hidden="true">
                {icon}
              </span>
            )}
            <span>{label}</span>
          </dt>
          <dd className="structure-logistics-item__value">{value}</dd>
        </div>
      ))}
    </dl>
  );

  const formatDate = (value: string | null | undefined) => {
    if (!value) {
      return t("structures.details.openPeriods.missingDate");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(parsed);
  };

  const describeOpenPeriod = (period: StructureOpenPeriod) => {
    const formatUnits = () => {
      if (!period.units || period.units.length === 0) {
        return null;
      }
      return t("structures.details.openPeriods.units", {
        value: period.units.join(", ")
      });
    };
    const noteSegments: string[] = [];
    const unitsLabel = formatUnits();
    if (unitsLabel) {
      noteSegments.push(unitsLabel);
    }
    if (period.notes) {
      noteSegments.push(period.notes);
    }
    const combinedNote = noteSegments.length > 0 ? noteSegments.join(" • ") : null;
    if (period.kind === "season") {
      const seasonLabel = period.season
        ? t(`structures.details.openPeriods.season.${period.season}`)
        : t("structures.details.openPeriods.seasonUnknown");
      return { main: seasonLabel, note: combinedNote };
    }
    const startLabel = formatDate(period.date_start);
    const endLabel = formatDate(period.date_end);
    return {
      main: t("structures.details.openPeriods.range", { start: startLabel, end: endLabel }),
      note: combinedNote,
    };
  };

  const { data, isLoading, isError, error, refetch } = useQuery<Structure, ApiError>({
    queryKey: ["structure", slug],
    queryFn: () => {
      if (!slug) {
        throw new Error("Missing slug");
      }
      return getStructureBySlug(slug, { include: "details" });
    },
    enabled: Boolean(slug),
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setContacts(sortContacts(data.contacts ?? []));
    }
  }, [data]);

  const structure = data ?? null;

  const locationDetails = useMemo(
    () => {
      if (!structure) {
        return [];
      }
      return [
        {
          label: t("structures.details.location.details.address"),
          value: structure.address
        },
        {
          label: t("structures.details.location.details.locality"),
          value: structure.locality
        },
        {
          label: t("structures.details.location.details.municipality"),
          value: structure.municipality
        },
        {
          label: t("structures.details.location.details.postalCode"),
          value: structure.postal_code
        },
        {
          label: t("structures.details.location.details.province"),
          value: structure.province
        },
        {
          label: t("structures.details.location.details.country"),
          value: structure.country
        }
      ].filter((item) => {
        if (item.value === null || item.value === undefined) {
          return false;
        }
        return String(item.value).trim().length > 0;
      });
    },
    [structure, t]
  );

  if (!slug) {
    return (
      <section>
        <div className="card">
          <h2>Structure not found</h2>
          <p>The requested structure does not exist.</p>
          <Link to="/structures">Back to catalog</Link>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section>
        <div className="card">
          <h2>Loading structure…</h2>
        </div>
      </section>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <section>
          <div className="card">
            <h2>Structure not found</h2>
            <p>The structure “{slug}” could not be located. It may have been removed.</p>
            <Link to="/structures">Back to catalog</Link>
          </div>
        </section>
      );
    }

    return (
      <section>
        <div className="card">
          <h2>Unable to load structure</h2>
          <p>Please try again later.</p>
          <Link to="/structures">Back to catalog</Link>
        </div>
      </section>
    );
  }

  if (!structure) {
    return null;
  }

  const createdAt = new Date(structure.created_at).toLocaleDateString();
  const hasCoordinates = structure.latitude !== null && structure.longitude !== null;
  const altitudeValue =
    structure.altitude !== null && structure.altitude !== undefined
      ? structure.altitude
      : null;
  const altitudeLabel =
    altitudeValue !== null
      ? t("structures.details.location.altitude", {
          alt: altitudeValue.toFixed(0)
        })
      : null;
  const mapDisplayName = structure.name ?? t("structures.details.location.title");
  const googleMapsCoordinates = hasCoordinates
    ? { lat: structure.latitude as number, lng: structure.longitude as number }
    : null;
  const googleMapsEmbedUrl = googleMapsCoordinates
    ? createGoogleMapsEmbedUrl(googleMapsCoordinates)
    : null;
  const googleMapsUrl = googleMapsCoordinates
    ? createGoogleMapsViewUrl(googleMapsCoordinates)
    : null;
  const googleMapsEmbedTitle = t("structures.details.location.mapTitle", {
    name: mapDisplayName
  });
  const googleMapsEmbedAriaLabel = t("structures.details.location.mapAriaLabel", {
    name: mapDisplayName
  });
  const kitchenLabel =
    structure.has_kitchen === true
      ? t("structures.details.overview.hasKitchen.yes")
      : structure.has_kitchen === false
        ? t("structures.details.overview.hasKitchen.no")
        : null;
  const structureTypeLabel = structure.type
    ? t(`structures.types.${structure.type}`, { defaultValue: structure.type })
    : null;
  const operationalStatusLabel = structure.operational_status
    ? t(`structures.details.meta.operationalStatus.${structure.operational_status}`)
    : null;
  const costBandLabel = formatCostBand(structure.cost_band);

  const availabilities = structure.availabilities ?? [];
  const costOptions = structure.cost_options ?? [];
  const activityEquipmentValue = formatStringList(structure.activity_equipment);

  const indoorDetails: LogisticsDetail[] = filterVisibleDetails([
    {
      id: "kitchen",
      label: t("structures.details.overview.hasKitchen.label"),
      value: kitchenLabel,
      icon: "🍳"
    },
    {
      id: "hotWater",
      label: t("structures.details.overview.hotWater"),
      value: formatBoolean(structure.hot_water),
      icon: "♨️"
    },
    {
      id: "beds",
      label: t("structures.details.overview.beds"),
      value: formatCount(structure.indoor_beds),
      icon: "🛏️"
    },
    {
      id: "bathrooms",
      label: t("structures.details.overview.bathrooms"),
      value: formatCount(structure.indoor_bathrooms),
      icon: "🚽"
    },
    {
      id: "showers",
      label: t("structures.details.overview.showers"),
      value: formatCount(structure.indoor_showers),
      icon: "🚿"
    },
    {
      id: "activityRooms",
      label: t("structures.details.overview.indoorActivityRooms"),
      value: formatCount(structure.indoor_activity_rooms),
      icon: "🎯"
    }
  ]);

  const outdoorDetails: LogisticsDetail[] = filterVisibleDetails([
    {
      id: "landArea",
      label: t("structures.details.overview.landArea"),
      value: formatLandArea(structure.land_area_m2),
      icon: "🌿"
    },
    {
      id: "fieldSlope",
      label: t("structures.details.overview.fieldSlope"),
      value: formatFieldSlope(structure.field_slope),
      icon: "⛰️"
    },
    {
      id: "pitchesTende",
      label: t("structures.details.overview.pitchesTende"),
      value: formatCount(structure.pitches_tende),
      icon: "🏕️"
    },
    {
      id: "waterAtField",
      label: t("structures.details.overview.waterAtField"),
      value: formatBoolean(structure.water_at_field),
      icon: "🚰"
    },
    {
      id: "shelterOnField",
      label: t("structures.details.overview.shelterOnField"),
      value: formatBoolean(structure.shelter_on_field),
      icon: "⛺"
    },
    {
      id: "fieldPoles",
      label: t("structures.details.overview.hasFieldPoles"),
      value: formatBoolean(structure.has_field_poles),
      icon: "🪢"
    },
    {
      id: "waterSources",
      label: t("structures.details.overview.waterSources.label"),
      value: formatWaterSources(structure.water_sources),
      icon: "💧"
    },
    {
      id: "pitLatrineAllowed",
      label: t("structures.details.overview.pitLatrineAllowed"),
      value: formatBoolean(structure.pit_latrine_allowed),
      icon: "🚾"
    },
    {
      id: "electricityAvailable",
      label: t("structures.details.overview.electricityAvailable"),
      value: formatBoolean(structure.electricity_available),
      icon: "⚡"
    },
    {
      id: "firePolicy",
      label: t("structures.details.overview.firePolicy"),
      value: formatFirePolicy(structure.fire_policy),
      icon: "🔥"
    }
  ]);

  const accessibilityDetails: LogisticsDetail[] = filterVisibleDetails([
    {
      id: "accessByCar",
      label: t("structures.details.overview.accessByCar"),
      value: formatBoolean(structure.access_by_car),
      icon: "🚗"
    },
    {
      id: "accessByCoach",
      label: t("structures.details.overview.accessByCoach"),
      value: formatBoolean(structure.access_by_coach),
      icon: "🚌"
    },
    {
      id: "coachTurningArea",
      label: t("structures.details.overview.coachTurningArea"),
      value: formatBoolean(structure.coach_turning_area),
      icon: "🔄"
    },
    {
      id: "publicTransport",
      label: t("structures.details.overview.accessByPublicTransport"),
      value: formatBoolean(structure.access_by_public_transport),
      icon: "🚉"
    },
    {
      id: "nearestBusStop",
      label: t("structures.details.overview.nearestBusStop"),
      value: formatOptionalText(structure.nearest_bus_stop),
      icon: "🚏"
    },
    {
      id: "wheelchairAccessible",
      label: t("structures.details.overview.wheelchairAccessible"),
      value: formatBoolean(structure.wheelchair_accessible),
      icon: "♿"
    },
    {
      id: "stepFreeAccess",
      label: t("structures.details.overview.stepFreeAccess"),
      value: formatBoolean(structure.step_free_access),
      icon: "🛤️"
    },
    {
      id: "parkingCarSlots",
      label: t("structures.details.overview.parkingCarSlots"),
      value: formatCount(structure.parking_car_slots),
      icon: "🅿️"
    },
    {
      id: "parkingBusSlots",
      label: t("structures.details.overview.parkingBusSlots"),
      value: formatCount(structure.parking_bus_slots),
      icon: "🚌"
    },
    {
      id: "parkingNotes",
      label: t("structures.details.overview.parkingNotes"),
      value: formatOptionalText(structure.parking_notes),
      icon: "📝",
      isFull: true
    },
    {
      id: "accessibilityNotes",
      label: t("structures.details.overview.accessibilityNotes"),
      value: formatOptionalText(structure.accessibility_notes),
      icon: "ℹ️",
      isFull: true
    }
  ]);

  const websiteValue = structure.website_urls.length > 0
    ? (
        <ul className="structure-website-links">
          {structure.website_urls.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
      )
    : null;

  const mapResourcesValue = structure.map_resources_urls.length > 0
    ? (
        <ul className="structure-website-links">
          {structure.map_resources_urls.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
      )
    : null;

  const documentsRequiredValue = formatStringList(structure.documents_required);
  const connectivityNotesValue = formatStringList(structure.communications_infrastructure);
  const activitySpacesValue = formatStringList(structure.activity_spaces);
  const inclusionServicesValue = formatStringList(structure.inclusion_services);
  const rawPaymentMethods = structure.payment_methods ?? [];
  const paymentMethodLabels =
    rawPaymentMethods.length > 0
      ? rawPaymentMethods.map((method: PaymentMethod) =>
          t(`structures.create.form.paymentMethodSelector.options.${method}`)
        )
      : [];
  const paymentMethodsValue =
    paymentMethodLabels.length > 0
      ? paymentMethodLabels.join(", ")
      : t("structures.details.overview.paymentMethodsFallback");
  const dataQualityFlagsValue = formatStringList(structure.data_quality_flags);

  const connectivityDetails: LogisticsDetail[] = filterVisibleDetails([
    {
      id: "cellDataQuality",
      label: t("structures.details.overview.cellDataQuality"),
      value: formatSignalQuality(structure.cell_data_quality),
      icon: "📶"
    },
    {
      id: "cellVoiceQuality",
      label: t("structures.details.overview.cellVoiceQuality"),
      value: formatSignalQuality(structure.cell_voice_quality),
      icon: "📱"
    },
    {
      id: "wifiAvailable",
      label: t("structures.details.overview.wifiAvailable"),
      value: formatBoolean(structure.wifi_available),
      icon: "📡"
    },
    {
      id: "landlineAvailable",
      label: t("structures.details.overview.landlineAvailable"),
      value: formatBoolean(structure.landline_available),
      icon: "☎️"
    },
    {
      id: "communicationsNotes",
      label: t("structures.details.overview.communicationsNotes"),
      value: connectivityNotesValue,
      icon: "📝",
      isFull: true
    }
  ]);

  const operationsDetails: LogisticsDetail[] = filterVisibleDetails([
    {
      id: "website",
      label: t("structures.details.overview.website"),
      value: websiteValue,
      icon: "🌐",
      isFull: true
    },
    {
      id: "mapResources",
      label: t("structures.details.overview.mapResources"),
      value: mapResourcesValue,
      icon: "🗺️",
      isFull: true
    },
    {
      id: "documentsRequired",
      label: t("structures.details.overview.documentsRequired"),
      value: documentsRequiredValue,
      icon: "📄",
      isFull: true
    },
    {
      id: "paymentMethods",
      label: t("structures.details.overview.paymentMethods"),
      value: paymentMethodsValue,
      icon: "💳",
      isFull: true
    },
    ...connectivityDetails,
    {
      id: "weekendOnly",
      label: t("structures.details.overview.weekendOnly"),
      value: formatBoolean(structure.weekend_only),
      icon: "📅"
    },
    {
      id: "usageRecommendation",
      label: t("structures.details.overview.usageRecommendation.label"),
      value: formatUsageRecommendation(structure.usage_recommendation),
      icon: "⭐",
      isFull: true
    },
    {
      id: "allowedAudiences",
      label: t("structures.details.overview.allowedAudiences"),
      value: formatAllowedAudiences(structure.allowed_audiences),
      icon: "🎯",
      isFull: true
    },
    {
      id: "activitySpaces",
      label: t("structures.details.overview.activitySpaces"),
      value: activitySpacesValue,
      icon: "🏕️",
      isFull: true
    },
    {
      id: "activityEquipment",
      label: t("structures.details.overview.activityEquipment"),
      value: activityEquipmentValue,
      icon: "🎒",
      isFull: true
    },
    {
      id: "inclusionServices",
      label: t("structures.details.overview.inclusionServices"),
      value: inclusionServicesValue,
      icon: "♿",
      isFull: true
    },
    {
      id: "usageRules",
      label: t("structures.details.overview.usageRules"),
      value: formatOptionalText(
        structure.usage_rules,
        "structures.details.overview.usageRulesFallback"
      ),
      icon: "📘",
      isFull: true
    },
    {
      id: "inAreaProtetta",
      label: t("structures.details.overview.inAreaProtetta"),
      value: formatBoolean(structure.in_area_protetta),
      icon: "🌳"
    },
    {
      id: "enteAreaProtetta",
      label: t("structures.details.overview.enteAreaProtetta"),
      value: formatOptionalText(structure.ente_area_protetta),
      icon: "🏛️"
    },
    {
      id: "floodRisk",
      label: t("structures.details.overview.floodRisk"),
      value: formatFloodRisk(structure.flood_risk),
      icon: "🌊"
    },
    {
      id: "environmentalNotes",
      label: t("structures.details.overview.environmentalNotes"),
      value: formatOptionalText(
        structure.environmental_notes,
        "structures.details.overview.environmentalNotesFallback"
      ),
      icon: "🌿",
      isFull: true
    },
    {
      id: "seasonalAmenities",
      label: t("structures.details.overview.seasonalAmenities"),
      value: formatSeasonalAmenities(structure.seasonal_amenities ?? null),
      icon: "📅",
      isFull: true
    },
    {
      id: "dataQualityFlags",
      label: t("structures.details.overview.dataQualityFlags"),
      value: dataQualityFlagsValue,
      icon: "🚩",
      isFull: true
    },
    {
      id: "notesLogistics",
      label: t("structures.details.overview.notesLogistics"),
      value: formatOptionalText(
        structure.notes_logistics,
        "structures.details.overview.notesLogisticsFallback"
      ),
      icon: "📝",
      isFull: true
    },
    {
      id: "notes",
      label: t("structures.details.overview.notes"),
      value: formatOptionalText(
        structure.notes,
        "structures.details.overview.notesFallback"
      ),
      icon: "💬",
      isFull: true
    }
  ]);

  const hasIndoorDetails = indoorDetails.length > 0;
  const hasOutdoorDetails = outdoorDetails.length > 0;
  const hasAccessibilityDetails = accessibilityDetails.length > 0;
  const hasOperationsDetails = operationsDetails.length > 0;
  const hasLogisticsDetails =
    hasIndoorDetails || hasOutdoorDetails || hasAccessibilityDetails || hasOperationsDetails;
  const hasOpenPeriods = (structure.open_periods?.length ?? 0) > 0;
  const shouldShowLogisticsCard = hasLogisticsDetails || hasOpenPeriods;

  const resetContactForm = () => {
    setEditingContact(null);
    setFormState(initialContactForm);
    setIsFormVisible(false);
    setFormError(null);
    setDuplicateMatches([]);
    setAllowDuplicate(false);
    setCheckingDuplicates(false);
  };

  const startCreateContact = () => {
    setActionError(null);
    setDuplicateMatches([]);
    setAllowDuplicate(false);
    setCheckingDuplicates(false);
    setEditingContact(null);
    setFormState({
      ...initialContactForm,
      is_primary: contacts.length === 0 || !contacts.some((item) => item.is_primary)
    });
    setIsFormVisible(true);
  };

  const startEditContact = (contact: Contact) => {
    setActionError(null);
    setEditingContact(contact);
    setFormState({
      first_name: contact.first_name ?? "",
      last_name: contact.last_name ?? "",
      role: contact.role ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      preferred_channel: contact.preferred_channel,
      is_primary: contact.is_primary,
      notes: contact.notes ?? "",
      contactId: contact.contact_id
    });
    setIsFormVisible(true);
    setFormError(null);
    setDuplicateMatches([]);
    setAllowDuplicate(false);
    setCheckingDuplicates(false);
  };

  const sanitizeField = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const preparePayload = (
    contactIdOverride: number | null = null
  ): ContactCreateDto => {
    const payload: ContactCreateDto = {
      contact_id: contactIdOverride ?? formState.contactId ?? undefined,
      first_name: sanitizeField(formState.first_name),
      last_name: sanitizeField(formState.last_name),
      preferred_channel: formState.preferred_channel,
      is_primary: formState.is_primary,
      role: sanitizeField(formState.role),
      email: sanitizeField(formState.email),
      phone: sanitizeField(formState.phone),
      notes: sanitizeField(formState.notes)
    };

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
    ) as ContactCreateDto;
  };

  const finalizeContactSave = async (contactIdOverride: number | null = null) => {
    setSavingContact(true);
    setFormError(null);
    setActionError(null);

    const payload = preparePayload(contactIdOverride);

    try {
      let saved: Contact;
      if (editingContact) {
        const { contact_id: contactIdToOmit, ...updatePayload } = payload;
        void contactIdToOmit;
        saved = await updateStructureContact(
          structure.id,
          editingContact.id,
          updatePayload
        );
      } else {
        saved = await createStructureContact(structure.id, payload);
      }
      setContacts((prev) => {
        const next = editingContact
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved];
        return sortContacts(next);
      });
      await refetch();
      resetContactForm();
    } catch (apiError) {
      console.error(apiError);
      setFormError(t("structures.contacts.errors.saveFailed"));
    } finally {
      setSavingContact(false);
    }
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingContact) {
      return;
    }

    const trimmedFirst = formState.first_name.trim();
    const trimmedLast = formState.last_name.trim();
    const trimmedEmail = formState.email.trim();
    const trimmedPhone = formState.phone.trim();
    const trimmedNotes = formState.notes.trim();

    if (!editingContact && formState.contactId === null) {
      if (!trimmedFirst && !trimmedLast && !trimmedEmail && !trimmedPhone && !trimmedNotes) {
        setFormError(t("structures.contacts.errors.minimumDetails"));
        return;
      }

      if (!allowDuplicate) {
        setCheckingDuplicates(true);
        try {
          const matches = await searchContacts({
            first_name: trimmedFirst || undefined,
            last_name: trimmedLast || undefined,
            email: trimmedEmail || undefined,
            phone: trimmedPhone || undefined,
            limit: 5
          });
          if (matches.length > 0) {
            setDuplicateMatches(matches);
            setFormError(
              t("structures.contacts.errors.duplicatesFound", { count: matches.length })
            );
            return;
          }
        } catch (apiError) {
          console.error(apiError);
          setActionError(t("structures.contacts.errors.searchFailed"));
          return;
        } finally {
          setCheckingDuplicates(false);
        }
      }
    }

    await finalizeContactSave();
  };

  const handleForceCreate = async () => {
    setAllowDuplicate(true);
    setFormError(null);
    await finalizeContactSave();
  };

  const handleUseExisting = async (match: Contact) => {
    setAllowDuplicate(true);
    setFormError(null);
    await finalizeContactSave(match.contact_id);
  };

  const handleSearchDuplicates = async () => {
    if (savingContact) {
      return;
    }

    const trimmedFirst = formState.first_name.trim();
    const trimmedLast = formState.last_name.trim();
    const trimmedEmail = formState.email.trim();
    const trimmedPhone = formState.phone.trim();

    if (!trimmedFirst && !trimmedLast && !trimmedEmail && !trimmedPhone) {
      setFormError(t("structures.contacts.errors.minimumDetails"));
      return;
    }

    setCheckingDuplicates(true);
    setActionError(null);
    setFormError(null);
    try {
      const matches = await searchContacts({
        first_name: trimmedFirst || undefined,
        last_name: trimmedLast || undefined,
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
        limit: 5
      });
      setDuplicateMatches(matches);
      if (matches.length > 0) {
        setFormError(t("structures.contacts.errors.duplicatesFound", { count: matches.length }));
      } else {
        setFormError(t("structures.contacts.errors.noMatches"));
      }
    } catch (apiError) {
      console.error(apiError);
      setActionError(t("structures.contacts.errors.searchFailed"));
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    const confirmed = window.confirm(
      t("structures.contacts.confirmDelete", { name: contact.name })
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteStructureContact(structure.id, contact.id);
      setContacts((prev) => prev.filter((item) => item.id !== contact.id));
      if (editingContact?.id === contact.id) {
        resetContactForm();
      }
      setActionError(null);
      await refetch();
    } catch (apiError) {
      console.error(apiError);
      setActionError(t("structures.contacts.errors.deleteFailed"));
    }
  };

  const handleSetPrimary = async (contact: Contact) => {
    try {
      const updated = await updateStructureContact(structure.id, contact.id, {
        is_primary: true
      });
      setContacts((prev) =>
        sortContacts(prev.map((item) => (item.id === updated.id ? updated : item)))
      );
      setActionError(null);
      await refetch();
    } catch (apiError) {
      console.error(apiError);
      setActionError(t("structures.contacts.errors.saveFailed"));
    }
  };

  return (
    <section className="structure-details" aria-labelledby="structure-details-title">
      <div className="structure-details__hero">
        <div className="structure-details__hero-content">
          <div className="structure-details__hero-tags">
            {structureTypeLabel && <span className="structure-details__badge">{structureTypeLabel}</span>}
            {operationalStatusLabel && (
              <span className="structure-details__chip">{operationalStatusLabel}</span>
            )}
            {structure.province && <span className="structure-details__chip">{structure.province}</span>}
          </div>
          <h2 id="structure-details-title">{structure.name}</h2>
          {structure.address && <p className="structure-details__address">{structure.address}</p>}
          <div className="structure-details__meta">
            <dl className="structure-details__meta-list">
              <div className="structure-details__meta-item">
                <dt className="structure-details__meta-label">
                  {t("structures.details.meta.created")}
                </dt>
                <dd className="structure-details__meta-value">{createdAt}</dd>
              </div>
              {structure.estimated_cost !== undefined && structure.estimated_cost !== null && (
                <div className="structure-details__meta-item structure-details__meta-item--highlight">
                  <dt className="structure-details__meta-label">
                    {t("structures.details.meta.estimatedDailyCost")}
                  </dt>
                  <dd className="structure-details__meta-value structure-details__meta-value--emphasis">
                    <span>€{structure.estimated_cost.toFixed(2)}</span>
                    {costBandLabel && (
                      <span className="structure-details__meta-pill">{costBandLabel}</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {auth.user?.can_edit_structures && (
            <div className="structure-details__hero-actions">
              <LinkButton to={`/structures/${structure.slug}/edit`}>
                {t("structures.details.actions.edit")}
              </LinkButton>
            </div>
          )}
        </div>
      </div>

      <div className="structure-details__layout">
        <div className="structure-details__main">
          <div className="structure-details-card structure-details-card--photos">
            <div className="structure-details-card__section">
              <h3 className="structure-details-card__title">
                {t("structures.details.photos.title")}
              </h3>
              <StructurePhotosSection
                structureId={structure.id}
                canUpload={false}
                canDelete={false}
                showManagementControls={false}
              />
            </div>
          </div>

          <div className="structure-details-card structure-details-card--location">
            <h3 className="structure-details-card__title">
              {t("structures.details.location.title")}
            </h3>
          <div
            className="structure-details__map"
            data-has-coordinates={hasCoordinates ? "true" : "false"}
          >
            {hasCoordinates ? (
                <>
                  {googleMapsEmbedUrl && (
                    <iframe
                      className="structure-details__map-embed"
                      src={googleMapsEmbedUrl}
                      title={googleMapsEmbedTitle}
                      aria-label={googleMapsEmbedAriaLabel}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  )}
                  <p className="structure-details__map-coordinates">
                    {t("structures.details.location.coordinates", {
                      lat: structure.latitude?.toFixed(4),
                      lon: structure.longitude?.toFixed(4)
                    })}
                  </p>
                  {altitudeLabel && (
                    <p className="structure-details__map-coordinates">{altitudeLabel}</p>
                  )}
                  <p className="structure-details__map-note">
                    {t("structures.details.location.placeholder")}
                  </p>
                </>
              ) : (
                <p className="structure-details__map-note">
                  {t("structures.details.location.unavailable")}
                </p>
              )}
            </div>
            {locationDetails.length > 0 && (
              <dl className="structure-details__location-list">
                {locationDetails.map((detail) => (
                  <div
                    className="structure-details__location-list-item"
                    key={detail.label}
                  >
                    <dt className="structure-details__location-label">
                      {detail.label}
                    </dt>
                    <dd className="structure-details__location-value">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {googleMapsUrl && (
              <a
                className="structure-details__map-link"
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("structures.cards.openMap")}
              </a>
            )}
          </div>

          {shouldShowLogisticsCard && (
            <div className="structure-details-card">
              {hasLogisticsDetails && (
                <div className="structure-details-card__section">
                  <h3 className="structure-details-card__title">
                    {t("structures.details.overview.logistics")}
                  </h3>
                  <div className="structure-logistics-groups">
                    {hasIndoorDetails && (
                      <section className="structure-logistics-group">
                        <header className="structure-logistics-group__header">
                          <span className="structure-logistics-group__icon" aria-hidden="true">
                            🏠
                          </span>
                          <h4 className="structure-logistics-group__title">
                            {t("structures.create.form.sections.indoor.title")}
                          </h4>
                        </header>
                        {renderLogisticsDetails(indoorDetails)}
                      </section>
                    )}
                    {hasOutdoorDetails && (
                      <section className="structure-logistics-group">
                        <header className="structure-logistics-group__header">
                          <span className="structure-logistics-group__icon" aria-hidden="true">
                            🌳
                          </span>
                          <h4 className="structure-logistics-group__title">
                            {t("structures.create.form.sections.outdoor.title")}
                          </h4>
                        </header>
                        {renderLogisticsDetails(outdoorDetails)}
                      </section>
                    )}
                    {hasAccessibilityDetails && (
                      <section className="structure-logistics-group">
                        <header className="structure-logistics-group__header">
                          <span className="structure-logistics-group__icon" aria-hidden="true">
                            🧭
                          </span>
                          <h4 className="structure-logistics-group__title">
                            {t("structures.create.form.sections.accessibility.title")}
                          </h4>
                        </header>
                        {renderLogisticsDetails(accessibilityDetails)}
                      </section>
                    )}
                    {hasOperationsDetails && (
                      <section className="structure-logistics-group">
                        <header className="structure-logistics-group__header">
                          <span className="structure-logistics-group__icon" aria-hidden="true">
                            ⚙️
                          </span>
                          <h4 className="structure-logistics-group__title">
                            {t("structures.create.form.sections.operations.title")}
                          </h4>
                        </header>
                        {renderLogisticsDetails(operationsDetails)}
                      </section>
                    )}
                  </div>
                </div>
              )}

              {hasOpenPeriods && (
                <div className="structure-details-card__section">
                  <h3 className="structure-details-card__title">
                    {t("structures.details.openPeriods.title")}
                  </h3>
                  <div className="structure-open-periods-detail">
                    <ul className="structure-open-periods-detail__list">
                      {structure.open_periods!.map((period) => {
                        const description = describeOpenPeriod(period);
                        return (
                          <li key={period.id} className="structure-open-periods-detail__item">
                            <span className="structure-open-periods-detail__main">{description.main}</span>
                            {description.note && (
                              <span className="structure-open-periods-detail__note">{description.note}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="structure-details-card structure-details-card--tabs">
            <div className="detail-tabs">
              <button
                type="button"
                className={activeTab === "overview" ? "active" : ""}
                onClick={() => setActiveTab("overview")}
              >
                {t("structures.details.tabs.overview")}
              </button>
              <button
                type="button"
                className={activeTab === "availability" ? "active" : ""}
                onClick={() => setActiveTab("availability")}
              >
                {t("structures.details.tabs.availability")}
              </button>
              <button
                type="button"
                className={activeTab === "costs" ? "active" : ""}
                onClick={() => setActiveTab("costs")}
              >
                {t("structures.details.tabs.costs")}
              </button>
              <button
                type="button"
                className={activeTab === "contacts" ? "active" : ""}
                onClick={() => setActiveTab("contacts")}
              >
                {t("structures.details.tabs.contacts")}
              </button>
              <button
                type="button"
                className={activeTab === "photos" ? "active" : ""}
                onClick={() => setActiveTab("photos")}
              >
                {t("structures.details.tabs.photos")}
              </button>
              <button
                type="button"
                className={activeTab === "attachments" ? "active" : ""}
                onClick={() => setActiveTab("attachments")}
              >
                {t("structures.details.tabs.attachments")}
              </button>
            </div>

            {activeTab === "overview" && (
              <div className="detail-panel">
                <p className="structure-details__placeholder">
                  {t("structures.details.messages.overviewPlaceholder")}
                </p>
              </div>
            )}

            {activeTab === "availability" && (
              <div className="detail-panel">
                {availabilities.length === 0 ? (
                  <p className="structure-details__placeholder">
                    {t("structures.details.messages.availabilityEmpty")}
                  </p>
                ) : (
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Season</th>
                        <th>Units</th>
                        <th>Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availabilities.map((availability: Availability) => {
                        const { capacity_min, capacity_max } = availability;
                        const capacityLabel =
                          capacity_min !== null && capacity_max !== null
                            ? `${capacity_min} – ${capacity_max}`
                            : capacity_min !== null
                            ? `from ${capacity_min}`
                            : capacity_max !== null
                            ? `up to ${capacity_max}`
                            : "n/a";

                        return (
                          <tr key={availability.id}>
                            <td>{availability.season}</td>
                            <td>{availability.units.join(", ")}</td>
                            <td>{capacityLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === "costs" && (
              <div className="detail-panel">
                {costOptions.length === 0 ? (
                  <p className="structure-details__placeholder">
                    {t("structures.details.messages.costsEmpty")}
                  </p>
                ) : (
                  <ul className="cost-options">
                    {costOptions.map((option: CostOption) => {
                      const costModelLabel = t(
                        `structures.create.form.costOptions.models.${option.model}`,
                        { defaultValue: option.model }
                      );
                      const seasonalModifiers = (option.modifiers ?? []).filter(
                        (modifier) => modifier.kind === "season" && modifier.season
                      );

                      return (
                        <li key={option.id}>
                          <div className="cost-option__header">
                            <span className="cost-option__model">{costModelLabel}</span>
                            <span className="cost-option__amount">
                              {formatCurrency(option.amount, option.currency)}
                            </span>
                          </div>
                          <div className="cost-breakdown">
                            {option.booking_deposit !== null && (
                              <span>
                                {t("structures.details.costs.bookingDeposit", {
                                  value: formatCurrency(option.booking_deposit, option.currency)
                                })}
                              </span>
                            )}
                            {option.damage_deposit !== null && (
                              <span>
                                {t("structures.details.costs.damageDeposit", {
                                  value: formatCurrency(option.damage_deposit, option.currency)
                                })}
                              </span>
                            )}
                            {option.city_tax_per_night !== null && (
                              <span>
                                {t("structures.details.costs.cityTax", {
                                  value: formatCurrency(option.city_tax_per_night, option.currency)
                                })}
                              </span>
                            )}
                            {option.utilities_flat !== null && (
                              <span>
                                {t("structures.details.costs.utilitiesFlat", {
                                  value: formatCurrency(option.utilities_flat, option.currency)
                                })}
                              </span>
                            )}
                            {option.utilities_included !== null && (
                              <span>
                                {t("structures.details.costs.utilitiesIncluded", {
                                  value: formatBoolean(option.utilities_included)
                                })}
                              </span>
                            )}
                            {option.utilities_notes && (
                              <span>
                                {t("structures.details.costs.utilitiesNotes", {
                                  value: option.utilities_notes
                                })}
                              </span>
                            )}
                            {option.min_total !== null && (
                              <span>
                                {t("structures.details.costs.minimumTotal", {
                                  value: formatCurrency(option.min_total, option.currency)
                                })}
                              </span>
                            )}
                            {option.forfait_trigger_total !== null && (
                              <span>
                                {t("structures.details.costs.forfaitTrigger", {
                                  value: formatCurrency(option.forfait_trigger_total, option.currency)
                                })}
                              </span>
                            )}
                            {option.max_total !== null && (
                              <span>
                                {t("structures.details.costs.maximumTotal", {
                                  value: formatCurrency(option.max_total, option.currency)
                                })}
                              </span>
                            )}
                            {option.payment_methods && option.payment_methods.length > 0 && (
                              <span>
                                {t("structures.details.costs.paymentMethods", {
                                  value: option.payment_methods.join(", ")
                                })}
                              </span>
                            )}
                            {option.payment_terms && (
                              <span>
                                {t("structures.details.costs.paymentTerms", {
                                  value: formatOptionalText(option.payment_terms)
                                })}
                              </span>
                            )}
                          </div>
                          {seasonalModifiers.length > 0 && (
                            <div className="cost-option__modifiers">
                              <span className="cost-option__modifiers-title">
                                {t("structures.details.costs.seasonalAdjustments")}
                              </span>
                              <ul>
                                {seasonalModifiers.map((modifier) => {
                                  const seasonLabel = t(
                                    `structures.details.costs.seasonLabels.${modifier.season}`,
                                    { defaultValue: modifier.season ?? "" }
                                  );
                                  return (
                                    <li key={modifier.id ?? `${modifier.season}-${modifier.amount}`}>
                                      {t("structures.details.costs.seasonalAdjustment", {
                                        season: seasonLabel,
                                        value: formatCurrency(modifier.amount, option.currency)
                                      })}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

                {activeTab === "contacts" && (
              <div className="detail-panel structure-contacts">
                <div className="structure-contacts__actions">
                  <Button onClick={startCreateContact}>
                    {t("structures.contacts.new")}
                  </Button>
                </div>
                {actionError && <p className="error">{actionError}</p>}
                <div className="structure-contacts__website">
                  <h4>{t("structures.contacts.website.title")}</h4>
                  {structure.website_urls.length > 0 ? (
                    <ul className="structure-website-links">
                      {structure.website_urls.map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("structures.contacts.website.empty")}</p>
                  )}
                </div>
                <div className="structure-contacts__emails">
                  <h4>{t("structures.contacts.emails.title")}</h4>
                  {structure.contact_emails.length > 0 ? (
                    <ul className="structure-website-links">
                      {structure.contact_emails.map((email) => (
                        <li key={email}>
                          <a href={`mailto:${email}`}>{email}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("structures.contacts.emails.empty")}</p>
                  )}
                </div>
                {contacts.length === 0 ? (
                  <p className="structure-details__placeholder">{t("structures.contacts.empty")}</p>
                ) : (
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>{t("structures.contacts.table.name")}</th>
                        <th>{t("structures.contacts.table.role")}</th>
                        <th>{t("structures.contacts.table.channel")}</th>
                        <th>{t("structures.contacts.table.email")}</th>
                        <th>{t("structures.contacts.table.phone")}</th>
                        <th>{t("structures.contacts.table.primary")}</th>
                        <th>{t("structures.contacts.table.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => {
                        const mailHref = contact.email ? `mailto:${contact.email}` : null;
                        const telHref = contact.phone
                          ? `tel:${contact.phone.replace(/\s+/g, "")}`
                          : null;
                        return (
                          <tr key={contact.id}>
                            <td>{contact.name}</td>
                            <td>{contact.role ?? t("structures.contacts.placeholders.none")}</td>
                            <td>{channelLabels[contact.preferred_channel]}</td>
                            <td>
                              {mailHref ? (
                                <a href={mailHref}>{contact.email}</a>
                              ) : (
                                t("structures.contacts.placeholders.none")
                              )}
                            </td>
                            <td>
                              {telHref ? (
                                <a href={telHref}>{contact.phone}</a>
                              ) : (
                                t("structures.contacts.placeholders.none")
                              )}
                            </td>
                            <td>
                              {contact.is_primary
                                ? t("structures.contacts.primary.yes")
                                : t("structures.contacts.primary.no")}
                            </td>
                            <td>
                              <div className="structure-contacts__table-actions">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => startEditContact(contact)}
                                >
                                  {t("structures.contacts.actions.edit")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleDeleteContact(contact)}
                                >
                                  {t("structures.contacts.actions.delete")}
                                </Button>
                                {!contact.is_primary && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleSetPrimary(contact)}
                                  >
                                    {t("structures.contacts.actions.makePrimary")}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {isFormVisible && (
                  <form className="structure-contacts__form" onSubmit={handleContactSubmit}>
                    <h3 className="structure-contacts__form-title">
                      {editingContact
                        ? t("structures.contacts.form.editTitle")
                        : t("structures.contacts.form.createTitle")}
                    </h3>
                    <div className="structure-contacts__grid">
                      <label>
                        {t("structures.contacts.form.firstName")}
                        <input
                          type="text"
                          value={formState.first_name}
                          onChange={(event) =>
                            setFormState((prev) => ({ ...prev, first_name: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        {t("structures.contacts.form.lastName")}
                        <input
                          type="text"
                          value={formState.last_name}
                          onChange={(event) =>
                            setFormState((prev) => ({ ...prev, last_name: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label>
                      {t("structures.contacts.form.role")}
                      <input
                        type="text"
                        value={formState.role}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, role: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      {t("structures.contacts.form.email")}
                      <input
                        type="email"
                        value={formState.email}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, email: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      {t("structures.contacts.form.phone")}
                      <input
                        type="tel"
                        value={formState.phone}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, phone: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      {t("structures.contacts.form.preferredChannel")}
                      <select
                        value={formState.preferred_channel}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            preferred_channel: event.target.value as ContactPreferredChannel
                          }))
                        }
                      >
                        <option value="email">{channelLabels.email}</option>
                        <option value="phone">{channelLabels.phone}</option>
                        <option value="other">{channelLabels.other}</option>
                      </select>
                    </label>
                    <label className="structure-contacts__checkbox">
                      <input
                        type="checkbox"
                        checked={formState.is_primary}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, is_primary: event.target.checked }))
                        }
                      />
                      {t("structures.contacts.form.isPrimary")}
                    </label>
                    <label>
                      {t("structures.contacts.form.notes")}
                      <textarea
                        value={formState.notes}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, notes: event.target.value }))
                        }
                      />
                    </label>
                    <div className="structure-contacts__duplicate-actions">
                      <Button
                        variant="secondary"
                        onClick={handleSearchDuplicates}
                        disabled={savingContact || checkingDuplicates}
                      >
                        {checkingDuplicates
                          ? t("structures.contacts.form.searching")
                          : t("structures.contacts.form.searchExisting")}
                      </Button>
                      {checkingDuplicates && (
                        <span className="structure-contacts__status">
                          {t("structures.contacts.form.searchingHelp")}
                        </span>
                      )}
                    </div>
                    {duplicateMatches.length > 0 && !editingContact && (
                      <div className="structure-contacts__duplicates">
                        <p>
                          {t("structures.contacts.form.duplicatesIntro", {
                            count: duplicateMatches.length
                          })}
                        </p>
                        <ul>
                          {duplicateMatches.map((candidate) => (
                            <li key={candidate.id}>
                              <div>
                                <strong>{candidate.name}</strong>
                                {candidate.email && ` · ${candidate.email}`}
                                {candidate.phone && ` · ${candidate.phone}`}
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleUseExisting(candidate)}
                                disabled={savingContact}
                              >
                                {t("structures.contacts.actions.useExisting")}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant="secondary"
                          onClick={handleForceCreate}
                          disabled={savingContact}
                        >
                          {t("structures.contacts.actions.createAnyway")}
                        </Button>
                      </div>
                    )}
                    {formError && <p className="error">{formError}</p>}
                    <div className="structure-contacts__form-actions">
                      <Button type="submit" disabled={savingContact}>
                        {savingContact
                          ? t("structures.contacts.form.saving")
                          : editingContact
                          ? t("structures.contacts.form.save")
                          : t("structures.contacts.form.create")}
                      </Button>
                      <Button variant="secondary" onClick={resetContactForm}>
                        {t("structures.contacts.form.cancel")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
            {activeTab === "photos" && (
              <div className="detail-panel">
                <StructurePhotosSection
                  structureId={structure.id}
                  canUpload={Boolean(auth.user?.is_admin)}
                  canDelete={Boolean(auth.user?.is_admin)}
                />
              </div>
            )}
            {activeTab === "attachments" && (
              <div className="detail-panel">
                {!auth.user ? (
                  <p className="structure-details__placeholder">{t("attachments.state.authRequired")}</p>
                ) : (
                  <AttachmentsSection
                    ownerType="structure"
                    ownerId={structure.id}
                    canUpload={auth.user.is_admin}
                    canDelete={auth.user.is_admin}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="structure-details__back-link">
        <Link to="/structures">← Back to catalog</Link>
      </p>
    </section>
  );
};
