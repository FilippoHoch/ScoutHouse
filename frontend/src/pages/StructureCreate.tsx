import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  AttachmentConfirmRequest,
  AttachmentUploadRequest,
  confirmAttachmentUpload,
  createStructure,
  createStructureContact,
  createStructurePhoto,
  createStructureAttachment,
  getStructureBySlug,
  searchContacts,
  searchGeocoding,
  signAttachmentUpload,
  updateStructure,
  upsertStructureCostOptions
} from "../shared/api";
import {
  CostModel,
  CostModifierKind,
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  GeocodingResult,
  FieldSlope,
  FirePolicy,
  FloodRiskLevel,
  PAYMENT_METHODS,
  PaymentMethod,
  CellSignalQuality,
  DataQualityStatus,
  StructureCreateDto,
  StructureAttachmentKind,
  StructureOperationalStatus,
  StructureType,
  StructureOpenPeriodKind,
  StructureOpenPeriodInput,
  StructureOpenPeriodSeason,
  StructureCostOptionInput,
  StructureCostModifierInput,
  StructureUsageRecommendation,
  TransportAccessPoint,
  TransportAccessPointType,
  Unit,
  WaterSource
} from "../shared/types";
import {
  Button,
  InlineMessage,
  SectionHeader,
  StatusBadge,
  Surface
} from "../shared/ui/designSystem";
import { GoogleMapEmbed, type GoogleMapEmbedCoordinates } from "../shared/ui/GoogleMapEmbed";
import { MapTypeToggle } from "../shared/ui/MapTypeToggle";
import {
  TransportAccessPointFormValue,
  TransportAccessPointsField
} from "../shared/ui/TransportAccessPointsField";
import { TriStateToggle } from "../shared/ui/TriStateToggle";
import type { GoogleMapType } from "../shared/utils/googleMaps";
import { isImageFile } from "../shared/utils/image";

const structureTypes: StructureType[] = ["house", "land", "mixed"];
const waterSourceOptions: WaterSource[] = [
  "lake",
  "river",
  "field_shower",
  "tap",
  "none",
  "unknown",
];
const firePolicyOptions: FirePolicy[] = ["allowed", "with_permit", "forbidden"];
const fieldSlopeOptions: FieldSlope[] = ["flat", "gentle", "moderate", "steep"];
const floodRiskOptions: FloodRiskLevel[] = ["none", "low", "medium", "high"];
const cellSignalOptions: CellSignalQuality[] = [
  "none",
  "limited",
  "good",
  "excellent"
];
const usageRecommendationOptions: StructureUsageRecommendation[] = [
  "outings_only",
  "camps_only",
  "prefer_outings",
  "prefer_camps"
];
const operationalStatusOptions: StructureOperationalStatus[] = [
  "operational",
  "seasonal",
  "temporarily_closed",
  "permanently_closed"
];
const createTransportAccessPointId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
type FieldErrorKey =
  | "name"
  | "country"
  | "province"
  | "postal_code"
  | "latitude"
  | "longitude"
  | "altitude"
  | "type"
  | "indoor_beds"
  | "indoor_bathrooms"
  | "indoor_showers"
  | "indoor_activity_rooms"
  | "contact_emails"
  | "website_urls"
  | "land_area_m2"
  | "transport_access_points"
  | "usage_recommendation"
  | "open_periods"
  | "data_quality_status"
  | "cost_options";

type FieldErrors = Partial<Record<FieldErrorKey, string>>;

type OpenPeriodFormRow = {
  key: string;
  id?: number;
  kind: StructureOpenPeriodKind;
  season: StructureOpenPeriodSeason | "";
  dateStart: string;
  dateEnd: string;
  notes: string;
  units: Unit[];
};

type SeasonalAmenityRow = {
  id: string;
  key: string;
  value: string;
};

type OptionalSectionKey =
  | "allowedAudiences"
  | "inAreaProtetta"
  | "floodRisk"
  | "environmentalNotes"
  | "documentsRequired"
  | "mapResources";

const optionalSectionOrder: OptionalSectionKey[] = [
  "allowedAudiences",
  "inAreaProtetta",
  "floodRisk",
  "environmentalNotes",
  "documentsRequired",
  "mapResources"
];

const sortOptionalSections = (sections: OptionalSectionKey[]) =>
  sections
    .slice()
    .sort(
      (left, right) =>
        optionalSectionOrder.indexOf(left) - optionalSectionOrder.indexOf(right)
    );

export const StructureCreatePage = () => <StructureFormPage mode="create" />;

export const StructureEditPage = () => <StructureFormPage mode="edit" />;

const openPeriodSeasonOptions: StructureOpenPeriodSeason[] = [
  "winter",
  "spring",
  "summer",
  "autumn"
];

const toSeasonValue = (value: unknown): StructureOpenPeriodSeason | "" => {
  if (typeof value === "string") {
    if ((openPeriodSeasonOptions as string[]).includes(value)) {
      return value as StructureOpenPeriodSeason;
    }
    return "";
  }
  return "";
};

const openPeriodUnitOptions: Unit[] = ["LC", "EG", "RS", "ALL"];

const openPeriodKindOptions: StructureOpenPeriodKind[] = ["season", "range"];

const createOpenPeriodKey = () => `op-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const createOpenPeriodRow = (kind: StructureOpenPeriodKind = "season"): OpenPeriodFormRow => ({
  key: createOpenPeriodKey(),
  kind,
  season: "",
  dateStart: "",
  dateEnd: "",
  notes: "",
  units: []
});

const createSeasonalAmenityId = () =>
  `amenity-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const createSeasonalAmenityRow = (key = "", value = ""): SeasonalAmenityRow => ({
  id: createSeasonalAmenityId(),
  key,
  value
});

const paymentMethodOptions: readonly PaymentMethod[] = PAYMENT_METHODS;
const defaultPaymentMethod: PaymentMethod = "unspecified";
const isValidPaymentMethodValue = (value: unknown): value is PaymentMethod =>
  typeof value === "string" && (paymentMethodOptions as readonly string[]).includes(value);

type GeocodingSelectionCriteria = {
  fullAddress?: string;
  streetAddress?: string;
  locality?: string;
  municipality?: string;
  province?: string;
  postalCode?: string;
};

const normalizeGeocodingText = (value: string | null | undefined) =>
  value ? value.toString().trim().toLowerCase() : "";

const normalizePostalCode = (value: string | null | undefined) =>
  value ? value.toString().replace(/\s+/g, "").toLowerCase() : "";

const parseStreetAddress = (value: string | null | undefined) => {
  const normalized = normalizeGeocodingText(value);

  if (!normalized) {
    return { streetName: "", houseNumber: "" };
  }

  const sanitized = normalized.replace(/[.,;#]/g, " ");
  const houseMatch = sanitized.match(/(\d+[a-z0-9/-]*)$/);

  if (!houseMatch) {
    return {
      streetName: sanitized.trim().replace(/\s+/g, " "),
      houseNumber: ""
    };
  }

  const houseNumber = houseMatch[1];
  const streetName = sanitized
    .slice(0, sanitized.length - houseNumber.length)
    .trim()
    .replace(/\s+/g, " ");

  return { streetName, houseNumber };
};

const pickBestGeocodingResult = (
  results: GeocodingResult[],
  criteria: GeocodingSelectionCriteria
): GeocodingResult | null => {
  if (results.length === 0) {
    return null;
  }

  const expectedFullAddress = normalizeGeocodingText(criteria.fullAddress);
  const expectedStreetAddress = normalizeGeocodingText(criteria.streetAddress);
  const expectedLocality = normalizeGeocodingText(criteria.locality);
  const expectedMunicipality = normalizeGeocodingText(criteria.municipality);
  const expectedProvince = normalizeGeocodingText(criteria.province);
  const expectedPostalCode = normalizePostalCode(criteria.postalCode);
  const { streetName: expectedStreetName, houseNumber: expectedHouseNumber } =
    parseStreetAddress(criteria.streetAddress);
  const expectedStreetWithNumber = [
    expectedStreetName,
    expectedHouseNumber
  ]
    .filter(Boolean)
    .join(" ");

  const scored = results.map((result, index) => {
    let score = 0;
    const label = normalizeGeocodingText(result.label);
    if (expectedFullAddress && label.includes(expectedFullAddress)) {
      score += 4;
    }

    if (expectedStreetAddress && label.includes(expectedStreetAddress)) {
      score += 4;
    }

    if (result.address) {
      const {
        street,
        house_number: houseNumber,
        locality,
        municipality,
        province,
        postal_code: postalCode
      } = result.address;

      const normalizedStreet = normalizeGeocodingText(street);
      const normalizedHouseNumber = normalizeGeocodingText(houseNumber);
      const streetWithNumber = [normalizedStreet, normalizedHouseNumber]
        .filter(Boolean)
        .join(" ");

      if (
        expectedStreetName &&
        normalizedStreet &&
        normalizedStreet.includes(expectedStreetName)
      ) {
        score += 6;
        if (normalizedStreet === expectedStreetName) {
          score += 2;
        }
      }

      if (expectedStreetName && label.includes(expectedStreetName)) {
        score += 3;
      }

      if (
        expectedStreetWithNumber &&
        streetWithNumber === expectedStreetWithNumber
      ) {
        score += 4;
      } else if (
        expectedStreetWithNumber &&
        label.includes(expectedStreetWithNumber)
      ) {
        score += 3;
      }

      if (
        expectedHouseNumber &&
        normalizedHouseNumber === expectedHouseNumber
      ) {
        score += 2;
      }

      if (expectedLocality && normalizeGeocodingText(locality).includes(expectedLocality)) {
        score += 2;
        if (normalizeGeocodingText(locality) === expectedLocality) {
          score += 1;
        }
      }

      if (
        expectedMunicipality &&
        normalizeGeocodingText(municipality).includes(expectedMunicipality)
      ) {
        score += 3;
        if (normalizeGeocodingText(municipality) === expectedMunicipality) {
          score += 1;
        }
      }

      if (expectedProvince && normalizeGeocodingText(province).includes(expectedProvince)) {
        score += 1;
      }

      if (
        expectedPostalCode &&
        normalizePostalCode(postalCode) === expectedPostalCode
      ) {
        score += 4;
      }
    }

    return { result, score, index };
  });

  scored.sort((a, b) => {
    if (b.score === a.score) {
      return a.index - b.index;
    }
    return b.score - a.score;
  });

  return scored[0]?.result ?? null;
};

const costModelOptions: CostModel[] = ["per_person_day", "per_person_night", "forfait"];

type CostModifierFormRow = {
  key: string;
  id?: number;
  kind: CostModifierKind;
  season: StructureOpenPeriodSeason | "";
  amount: string;
};

type CostOptionFormRow = {
  key: string;
  id?: number;
  model: CostModel | "";
  amount: string;
  currency: string;
  bookingDeposit: string;
  damageDeposit: string;
  cityTaxPerNight: string;
  utilitiesFlat: string;
  utilitiesIncluded: "" | "yes" | "no";
  utilitiesNotes: string;
  paymentMethods: PaymentMethod[];
  paymentTerms: string;
  minTotal: string;
  maxTotal: string;
  forfaitTrigger: string;
  modifiers: CostModifierFormRow[];
  hadModifiers: boolean;
};

const createCostOptionKey = () => `co-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const createCostModifierKey = () => `cm-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const createSeasonalModifierRow = (): CostModifierFormRow => ({
  key: createCostModifierKey(),
  kind: "season",
  season: "",
  amount: "",
});

const createCostOptionRow = (): CostOptionFormRow => ({
  key: createCostOptionKey(),
  model: "",
  amount: "",
  currency: "EUR",
  bookingDeposit: "",
  damageDeposit: "",
  cityTaxPerNight: "",
  utilitiesFlat: "",
  utilitiesIncluded: "",
  utilitiesNotes: "",
  paymentMethods: [defaultPaymentMethod],
  paymentTerms: "",
  minTotal: "",
  maxTotal: "",
  forfaitTrigger: "",
  modifiers: [],
  hadModifiers: false
});

const parseCoordinateValue = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const toTriState = (value: boolean | null | undefined): boolean | null => {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return null;
};

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

const isValidEmail = (value: string): boolean => {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(value);
};

type StructureFormMode = "create" | "edit";

const StructureFormPage = ({ mode }: { mode: StructureFormMode }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ slug?: string }>();
  const queryClient = useQueryClient();
  const isEditing = mode === "edit";
  const editingSlug = isEditing ? params.slug : undefined;
  useEffect(() => {
    document.body.classList.add("layout-wide");
    return () => {
      document.body.classList.remove("layout-wide");
    };
  }, []);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [country, setCountry] = useState("IT");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [locality, setLocality] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [altitude, setAltitude] = useState("");
  const [coordinatesManuallyEdited, setCoordinatesManuallyEdited] = useState(false);
  const [geocodingStatus, setGeocodingStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [geocodingSuggestion, setGeocodingSuggestion] = useState<GeocodingResult | null>(null);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [geocodingApplied, setGeocodingApplied] = useState(false);
  const [geocodingAltitudeApplied, setGeocodingAltitudeApplied] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchStatus, setMapSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mapSearchError, setMapSearchError] = useState<string | null>(null);
  const [mapSearchResults, setMapSearchResults] = useState<GeocodingResult[]>([]);
  const [mapSearchLastQuery, setMapSearchLastQuery] = useState("");
  const [mapType, setMapType] = useState<GoogleMapType>("roadmap");
  const [altitudeManuallyEdited, setAltitudeManuallyEdited] = useState(false);
  const [type, setType] = useState<StructureType | "">("");
  const [operationalStatus, setOperationalStatus] =
    useState<StructureOperationalStatus | "">("");
  const [indoorBeds, setIndoorBeds] = useState("");
  const [indoorBathrooms, setIndoorBathrooms] = useState("");
  const [indoorShowers, setIndoorShowers] = useState("");
  const [indoorActivityRooms, setIndoorActivityRooms] = useState("");
  const [hasKitchen, setHasKitchen] = useState<boolean | null>(null);
  const [hotWater, setHotWater] = useState<boolean | null>(null);
  const [landArea, setLandArea] = useState("");
  const [fieldSlope, setFieldSlope] = useState<FieldSlope | "">("");
  const [pitchesTende, setPitchesTende] = useState("");
  const [waterAtField, setWaterAtField] = useState<boolean | null>(null);
  const [shelterOnField, setShelterOnField] = useState<boolean | null>(null);
  const [pitLatrineAllowed, setPitLatrineAllowed] = useState<boolean | null>(null);
  const [waterSources, setWaterSources] = useState<WaterSource[]>([]);
  const [electricityAvailable, setElectricityAvailable] = useState<boolean | null>(null);
  const [firePolicy, setFirePolicy] = useState<FirePolicy | "">("");
  const [accessByCar, setAccessByCar] = useState<boolean | null>(null);
  const [accessByCoach, setAccessByCoach] = useState<boolean | null>(null);
  const [accessByPublicTransport, setAccessByPublicTransport] = useState<boolean | null>(null);
  const [coachTurningArea, setCoachTurningArea] = useState<boolean | null>(null);
  const [transportAccessPoints, setTransportAccessPoints] = useState<TransportAccessPointFormValue[]>([]);
  const [wheelchairAccessible, setWheelchairAccessible] = useState<boolean | null>(null);
  const [stepFreeAccess, setStepFreeAccess] = useState<boolean | null>(null);
  const [parkingCarSlots, setParkingCarSlots] = useState("");
  const [parkingBusSlots, setParkingBusSlots] = useState("");
  const [parkingNotes, setParkingNotes] = useState("");
  const [accessibilityNotes, setAccessibilityNotes] = useState("");
  const [weekendOnly, setWeekendOnly] = useState<boolean | null>(null);
  const [hasFieldPoles, setHasFieldPoles] = useState<boolean | null>(null);
  type WebsiteUrlStatus = "idle" | "valid" | "invalid";

  const [contactEmails, setContactEmails] = useState<string[]>([""]);
  const [websiteUrls, setWebsiteUrls] = useState<string[]>([""]);
  const [websiteUrlStatuses, setWebsiteUrlStatuses] = useState<WebsiteUrlStatus[]>(["idle"]);
  const [allowedAudiences, setAllowedAudiences] = useState<string[]>([]);
  const [documentsRequired, setDocumentsRequired] = useState<string[]>([""]);
  const [mapResourcesUrls, setMapResourcesUrls] = useState<string[]>([""]);
  const [cellDataQuality, setCellDataQuality] = useState<CellSignalQuality | "">("");
  const [cellVoiceQuality, setCellVoiceQuality] = useState<CellSignalQuality | "">("");
  const [wifiAvailable, setWifiAvailable] = useState<boolean | null>(null);
  const [landlineAvailable, setLandlineAvailable] = useState<boolean | null>(null);
  const [communicationsNotes, setCommunicationsNotes] = useState("");
  const [activityEquipment, setActivityEquipment] = useState<string[]>([""]);
  const [structurePaymentMethods, setStructurePaymentMethods] = useState<PaymentMethod[]>([
    defaultPaymentMethod
  ]);
  const [dataQualityStatus, setDataQualityStatus] = useState<DataQualityStatus | "">("");
  const [activeOptionalSections, setActiveOptionalSections] = useState<OptionalSectionKey[]>([]);
  const [optionalSectionSelection, setOptionalSectionSelection] = useState<
    OptionalSectionKey | ""
  >("");
  const [usageRecommendation, setUsageRecommendation] = useState<
    StructureUsageRecommendation | ""
  >("");
  const [usageRules, setUsageRules] = useState("");

  const [inAreaProtetta, setInAreaProtetta] = useState<boolean | null>(null);
  const [enteAreaProtetta, setEnteAreaProtetta] = useState("");
  const [environmentalNotes, setEnvironmentalNotes] = useState("");
  const [floodRisk, setFloodRisk] = useState<FloodRiskLevel | "">("");
  const [seasonalAmenities, setSeasonalAmenities] = useState<SeasonalAmenityRow[]>([]);
  const [notesLogistics, setNotesLogistics] = useState("");
  const [notes, setNotes] = useState("");
  const [structureId, setStructureId] = useState<number | null>(null);
  const [isPrefilled, setIsPrefilled] = useState(!isEditing);
  const [addContact, setAddContact] = useState(false);
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [contactPreferredChannel, setContactPreferredChannel] =
    useState<ContactPreferredChannel>("email");
  const [contactIsPrimary, setContactIsPrimary] = useState(true);
  const [contactId, setContactId] = useState<number | null>(null);
  const [contactDuplicates, setContactDuplicates] = useState<Contact[]>([]);
  const [contactAllowDuplicate, setContactAllowDuplicate] = useState(false);
  const [contactCheckingDuplicates, setContactCheckingDuplicates] = useState(false);
  const [contactStatusMessage, setContactStatusMessage] = useState<string | null>(null);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [contactPickerQuery, setContactPickerQuery] = useState("");
  const [contactPickerLoading, setContactPickerLoading] = useState(false);
  const [contactPickerError, setContactPickerError] = useState<string | null>(null);
  const [contactPickerResults, setContactPickerResults] = useState<Contact[]>([]);
  const triStateLabels = useMemo(
    () => ({
      yes: t("triState.yes"),
      no: t("triState.no"),
      unknown: t("triState.unknown"),
    }),
    [t]
  );
  const [openPeriods, setOpenPeriods] = useState<OpenPeriodFormRow[]>([]);
  const [costOptions, setCostOptions] = useState<CostOptionFormRow[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoDropActive, setPhotoDropActive] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentDropActive, setAttachmentDropActive] = useState(false);
  const [mapResourceAttachmentFiles, setMapResourceAttachmentFiles] = useState<File[]>([]);
  const [mapResourceDropActive, setMapResourceDropActive] = useState(false);
  const [documentAttachmentFiles, setDocumentAttachmentFiles] = useState<File[]>([]);
  const [documentDropActive, setDocumentDropActive] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mapResourceAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const geocodingRequestId = useRef(0);
  const geocodingDebounceRef = useRef<number | null>(null);
  const geocodingAbortController = useRef<AbortController | null>(null);
  const mapSearchRequestId = useRef(0);
  const mapSearchAbortController = useRef<AbortController | null>(null);
  const mapSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mapSearchResultsRef = useRef<HTMLDivElement | null>(null);
  const coordinatesEditedRef = useRef(false);
  const latitudeRef = useRef("");
  const longitudeRef = useRef("");
  const altitudeRef = useRef("");
  const altitudeEditedRef = useRef(false);

  useEffect(() => {
    coordinatesEditedRef.current = coordinatesManuallyEdited;
  }, [coordinatesManuallyEdited]);

  useEffect(() => {
    latitudeRef.current = latitude.trim();
  }, [latitude]);

  useEffect(() => {
    longitudeRef.current = longitude.trim();
  }, [longitude]);

  useEffect(() => {
    altitudeRef.current = altitude.trim();
  }, [altitude]);

  useEffect(() => {
    altitudeEditedRef.current = altitudeManuallyEdited;
  }, [altitudeManuallyEdited]);

  useEffect(() => {
    return () => {
      if (mapSearchAbortController.current) {
        mapSearchAbortController.current.abort();
        mapSearchAbortController.current = null;
      }
    };
  }, []);
  const shouldFetchStructure = isEditing && Boolean(editingSlug);
  const {
    data: existingStructure,
    isLoading: isStructureLoading,
    isError: isStructureError,
    error: structureError
  } = useQuery({
    queryKey: ["structure", editingSlug],
    queryFn: () => getStructureBySlug(editingSlug!, { include: "details" }),
    enabled: shouldFetchStructure,
    retry: false
  });

  const selectedCoordinates = useMemo(() => {
    const latNumber = parseCoordinateValue(latitude);
    const lonNumber = parseCoordinateValue(longitude);

    if (latNumber === null || lonNumber === null) {
      return null;
    }

    return { lat: latNumber, lng: lonNumber };
  }, [latitude, longitude]);

  const selectedCoordinatesLabel = useMemo(() => {
    if (!selectedCoordinates) {
      return null;
    }

    return t("structures.create.form.map.selected", {
      lat: selectedCoordinates.lat.toFixed(6),
      lon: selectedCoordinates.lng.toFixed(6)
    });
  }, [selectedCoordinates, t]);

  const mapTypeLabels = useMemo(
    () => ({
      label: t("structures.map.type.label"),
      roadmap: t("structures.map.type.options.roadmap"),
      satellite: t("structures.map.type.options.satellite"),
    }),
    [t]
  );

  const automaticCoordinates = geocodingApplied && !coordinatesManuallyEdited;
  const automaticAltitude = geocodingAltitudeApplied && !altitudeManuallyEdited;

  const automaticAltitudeValue = useMemo(() => {
    if (!automaticAltitude) {
      return null;
    }
    const parsed = parseCoordinateValue(altitude);
    return parsed !== null ? Math.round(parsed) : null;
  }, [altitude, automaticAltitude]);

  const automaticGeocodingMessage = useMemo(() => {
    if (!automaticCoordinates) {
      return null;
    }
    if (automaticAltitudeValue !== null) {
      return t("structures.create.form.geocoding.appliedWithAltitude", {
        alt: automaticAltitudeValue
      });
    }
    return t("structures.create.form.geocoding.appliedApproximate");
  }, [automaticAltitudeValue, automaticCoordinates, t]);

  const manualCoordinatesMessage = coordinatesManuallyEdited
    ? t("structures.create.form.geocoding.manualCoordinates")
    : null;

  const manualAltitudeMessage = altitudeManuallyEdited
    ? t("structures.create.form.geocoding.manualAltitude")
    : null;

  const saveMutation = useMutation({
    mutationFn: (dto: StructureCreateDto) => {
      if (isEditing) {
        if (!structureId) {
          throw new Error("missing-structure-id");
        }
        return updateStructure(structureId, dto);
      }
      return createStructure(dto);
    }
  });

  const clearFieldErrorsGroup = useCallback((keys: FieldErrorKey[]) => {
    if (keys.length === 0) {
      return;
    }
    setFieldErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        if (key in next) {
          changed = true;
          delete next[key];
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleMapSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setMapSearchQuery(nextValue);
    if (!nextValue.trim()) {
      setMapSearchResults([]);
      setMapSearchStatus("idle");
      setMapSearchError(null);
      setMapSearchLastQuery("");
      if (mapSearchAbortController.current) {
        mapSearchAbortController.current.abort();
        mapSearchAbortController.current = null;
      }
    }
  };

  const handleMapSearchSubmit = () => {
    const trimmedQuery = mapSearchQuery.trim();
    if (!trimmedQuery) {
      setMapSearchResults([]);
      setMapSearchStatus("idle");
      setMapSearchError(null);
      setMapSearchLastQuery("");
      return;
    }

    if (mapSearchAbortController.current) {
      mapSearchAbortController.current.abort();
      mapSearchAbortController.current = null;
    }

    setMapSearchStatus("loading");
    setMapSearchError(null);
    setMapSearchLastQuery(trimmedQuery);
    const requestId = mapSearchRequestId.current + 1;
    mapSearchRequestId.current = requestId;
    const controller = new AbortController();
    mapSearchAbortController.current = controller;

    void searchGeocoding({ address: trimmedQuery, limit: 6 }, { signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted || requestId !== mapSearchRequestId.current) {
          return;
        }
        setMapSearchResults(results);
        setMapSearchStatus("success");
        if (results.length > 0) {
          window.setTimeout(() => {
            mapSearchResultsRef.current
              ?.querySelector<HTMLButtonElement>("button.structure-map-search__result")
              ?.focus();
          }, 0);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== mapSearchRequestId.current) {
          return;
        }
        let message = t("structures.create.form.map.searchError");
        if (error instanceof ApiError) {
          const detailValue =
            error.body && typeof error.body === "object" && "detail" in error.body
              ? (error.body as Record<string, unknown>).detail
              : null;
          const detail = typeof detailValue === "string" ? detailValue : null;
          message = detail ?? t("structures.create.form.map.searchError");
        } else if (error instanceof Error) {
          message = error.message;
        }
        setMapSearchResults([]);
        setMapSearchStatus("error");
        setMapSearchError(message);
      })
      .finally(() => {
        if (mapSearchAbortController.current === controller) {
          mapSearchAbortController.current = null;
        }
      });
  };

  const handleMapSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      handleMapSearchSubmit();
    }
  };

  const handleMapSearchSelect = (result: GeocodingResult) => {
    const latString = result.latitude.toFixed(6);
    const lonString = result.longitude.toFixed(6);
    setLatitude(latString);
    setLongitude(lonString);
    setCoordinatesManuallyEdited(false);
    const altitudeValue =
      typeof result.altitude === "number" && Number.isFinite(result.altitude)
        ? Math.round(result.altitude)
        : null;
    if (altitudeValue !== null) {
      setAltitude(String(altitudeValue));
      setAltitudeManuallyEdited(false);
      setGeocodingAltitudeApplied(true);
    } else {
      setGeocodingAltitudeApplied(false);
    }
    setGeocodingApplied(true);
    setGeocodingSuggestion(null);
    setGeocodingError(null);
    setApiError(null);
    clearFieldErrorsGroup(["latitude", "longitude"]);
    setMapSearchResults([]);
    setMapSearchStatus("idle");
    setMapSearchError(null);
    setMapSearchLastQuery("");
    setMapSearchQuery(result.label);
    window.setTimeout(() => {
      mapSearchInputRef.current?.focus();
    }, 0);
  };

  const handleMapCoordinatesChange = (next: GoogleMapEmbedCoordinates) => {
    setLatitude(next.lat.toFixed(6));
    setLongitude(next.lng.toFixed(6));
    setApiError(null);
    clearFieldErrorsGroup(["latitude", "longitude"]);
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
    setGeocodingAltitudeApplied(false);
  };

  const handleApplyGeocodingSuggestion = () => {
    if (!geocodingSuggestion) {
      return;
    }
    const latString = geocodingSuggestion.latitude.toFixed(6);
    const lonString = geocodingSuggestion.longitude.toFixed(6);
    setLatitude(latString);
    setLongitude(lonString);
    setCoordinatesManuallyEdited(false);
    const altitudeValue =
      typeof geocodingSuggestion.altitude === "number" &&
      Number.isFinite(geocodingSuggestion.altitude)
        ? Math.round(geocodingSuggestion.altitude)
        : null;
    if (altitudeValue !== null) {
      setAltitude(String(altitudeValue));
      setAltitudeManuallyEdited(false);
      setGeocodingAltitudeApplied(true);
    } else {
      setGeocodingAltitudeApplied(false);
    }
    setGeocodingApplied(true);
    setApiError(null);
    clearFieldErrorsGroup(["latitude", "longitude"]);
  };

  const resetIndoorFields = () => {
    setIndoorBeds("");
    setIndoorBathrooms("");
    setIndoorShowers("");
    setIndoorActivityRooms("");
    setHasKitchen(null);
    setHotWater(null);
    clearFieldErrorsGroup([
      "indoor_beds",
      "indoor_bathrooms",
      "indoor_showers",
      "indoor_activity_rooms"
    ]);
  };

  const resetOutdoorFields = () => {
    setLandArea("");
    setFieldSlope("");
    setPitchesTende("");
    setWaterAtField(null);
    setShelterOnField(null);
    setPitLatrineAllowed(null);
    setWaterSources([]);
    setElectricityAvailable(null);
    setFirePolicy("");
    setTransportAccessPoints([]);
    setHasFieldPoles(null);
    clearFieldErrorsGroup([
      "land_area_m2",
      "open_periods"
    ]);
  };

  const resetContactSection = useCallback(() => {
    setContactFirstName("");
    setContactLastName("");
    setContactRole("");
    setContactEmail("");
    setContactPhone("");
    setContactNotes("");
    setContactPreferredChannel("email");
    setContactIsPrimary(true);
    setContactId(null);
    setContactDuplicates([]);
    setContactAllowDuplicate(false);
    setContactCheckingDuplicates(false);
    setContactStatusMessage(null);
  }, []);

  const contactHasDetails = () =>
    Boolean(
      contactFirstName.trim() ||
        contactLastName.trim() ||
        contactEmail.trim() ||
        contactPhone.trim() ||
        contactNotes.trim()
    );

  const addPhotoFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      let hasInvalid = false;
      let hasValid = false;
      setPhotoFiles((previous) => {
        let changed = false;
        const next = [...previous];
        for (const file of files) {
          if (!isImageFile(file)) {
            hasInvalid = true;
            continue;
          }
          const duplicate = next.some(
            (existing) =>
              existing.name === file.name &&
              existing.size === file.size &&
              existing.lastModified === file.lastModified
          );
          if (duplicate) {
            continue;
          }
          next.push(file);
          changed = true;
          hasValid = true;
        }
        return changed ? next : previous;
      });
      if (hasInvalid) {
        setPhotoError(t("structures.photos.errors.invalidType"));
      } else if (hasValid) {
        setPhotoError(null);
      }
    },
    [t]
  );

  const addAttachmentFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setAttachmentFiles((previous) => {
      let changed = false;
      const next = [...previous];
      for (const file of files) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (duplicate) {
          continue;
        }
        next.push(file);
        changed = true;
      }
      return changed ? next : previous;
    });
  }, []);

  const addMapResourceAttachmentFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setMapResourceAttachmentFiles((previous) => {
      let changed = false;
      const next = [...previous];
      for (const file of files) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (duplicate) {
          continue;
        }
        next.push(file);
        changed = true;
      }
      return changed ? next : previous;
    });
  }, []);

  const addDocumentAttachmentFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setDocumentAttachmentFiles((previous) => {
      let changed = false;
      const next = [...previous];
      for (const file of files) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (duplicate) {
          continue;
        }
        next.push(file);
        changed = true;
      }
      return changed ? next : previous;
    });
  }, []);

  const handlePhotoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    addPhotoFiles(files);
    event.target.value = "";
  };

  const handlePhotoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPhotoDropActive(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    addPhotoFiles(files);
  };

  const handlePhotoDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!photoDropActive) {
      setPhotoDropActive(true);
    }
  };

  const handlePhotoDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (photoDropActive) {
      setPhotoDropActive(false);
    }
  };

  const handlePhotoRemove = (index: number) => {
    setPhotoFiles((previous) => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      if (next.length === 0) {
        setPhotoError(null);
      }
      return next;
    });
  };

  const handleAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    addAttachmentFiles(files);
    event.target.value = "";
  };

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAttachmentDropActive(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    addAttachmentFiles(files);
  };

  const handleAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!attachmentDropActive) {
      setAttachmentDropActive(true);
    }
  };

  const handleAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (attachmentDropActive) {
      setAttachmentDropActive(false);
    }
  };

  const handleAttachmentRemove = (index: number) => {
    setAttachmentFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleMapAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    addMapResourceAttachmentFiles(files);
    event.target.value = "";
  };

  const handleMapAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMapResourceDropActive(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    addMapResourceAttachmentFiles(files);
  };

  const handleMapAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!mapResourceDropActive) {
      setMapResourceDropActive(true);
    }
  };

  const handleMapAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (mapResourceDropActive) {
      setMapResourceDropActive(false);
    }
  };

  const handleMapAttachmentRemove = (index: number) => {
    setMapResourceAttachmentFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleDocumentAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    addDocumentAttachmentFiles(files);
    event.target.value = "";
  };

  const handleDocumentAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDocumentDropActive(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    addDocumentAttachmentFiles(files);
  };

  const handleDocumentAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!documentDropActive) {
      setDocumentDropActive(true);
    }
  };

  const handleDocumentAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (documentDropActive) {
      setDocumentDropActive(false);
    }
  };

  const handleDocumentAttachmentRemove = (index: number) => {
    setDocumentAttachmentFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const uploadQueuedPhotos = useCallback(
    async (structureId: number) => {
      if (photoFiles.length === 0) {
        return;
      }
      for (const file of photoFiles) {
        const payload: AttachmentUploadRequest = {
          owner_type: "structure",
          owner_id: structureId,
          filename: file.name,
          mime: file.type || "image/jpeg"
        };
        const signature = await signAttachmentUpload(payload);
        const key = signature.fields.key;
        if (!key) {
          throw new Error("missing-key");
        }
        const formData = new FormData();
        Object.entries(signature.fields).forEach(([name, value]) => {
          formData.append(name, value);
        });
        formData.append("file", file);

        const response = await fetch(signature.url, {
          method: "POST",
          body: formData
        });
        if (!response.ok) {
          throw new Error("upload-failed");
        }

        const confirmPayload: AttachmentConfirmRequest = {
          ...payload,
          size: file.size,
          key
        };
        const attachment = await confirmAttachmentUpload(confirmPayload);
        await createStructurePhoto(structureId, { attachment_id: attachment.id });
      }
      setPhotoFiles([]);
      setPhotoError(null);
    },
    [photoFiles]
  );

  const uploadCategorizedAttachments = useCallback(
    async (structureId: number, files: File[], kind?: StructureAttachmentKind) => {
      if (files.length === 0) {
        return;
      }
      for (const file of files) {
        const payload: AttachmentUploadRequest = {
          owner_type: "structure",
          owner_id: structureId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
        };
        const signature = await signAttachmentUpload(payload);
        const key = signature.fields.key;
        if (!key) {
          throw new Error("missing-key");
        }
        const formData = new FormData();
        Object.entries(signature.fields).forEach(([name, value]) => {
          formData.append(name, value);
        });
        formData.append("file", file);

        const response = await fetch(signature.url, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("upload-failed");
        }

        const confirmPayload: AttachmentConfirmRequest = {
          ...payload,
          size: file.size,
          key,
        };
        const attachment = await confirmAttachmentUpload(confirmPayload);
        if (kind) {
          await createStructureAttachment(structureId, {
            attachment_id: attachment.id,
            kind,
          });
        }
      }
    },
    []
  );

  const uploadQueuedAttachments = useCallback(
    async (structureId: number) => {
      await uploadCategorizedAttachments(structureId, attachmentFiles);
      setAttachmentFiles([]);
    },
    [attachmentFiles, uploadCategorizedAttachments]
  );

  const uploadMapResourceAttachments = useCallback(
    async (structureId: number) => {
      await uploadCategorizedAttachments(structureId, mapResourceAttachmentFiles, "map_resource");
      setMapResourceAttachmentFiles([]);
    },
    [mapResourceAttachmentFiles, uploadCategorizedAttachments]
  );

  const uploadDocumentAttachments = useCallback(
    async (structureId: number) => {
      await uploadCategorizedAttachments(structureId, documentAttachmentFiles, "required_document");
      setDocumentAttachmentFiles([]);
    },
    [documentAttachmentFiles, uploadCategorizedAttachments]
  );

  const formatQueuedFileSize = useCallback(
    (size: number) => {
      if (size >= 1024 * 1024) {
        const value = new Intl.NumberFormat("it-IT", {
          maximumFractionDigits: 1
        }).format(size / (1024 * 1024));
        return t("structures.create.photos.size.mb", { value });
      }
      if (size >= 1024) {
        const value = new Intl.NumberFormat("it-IT", {
          maximumFractionDigits: 0
        }).format(size / 1024);
        return t("structures.create.photos.size.kb", { value });
      }
      return t("structures.create.photos.size.bytes", { value: size });
    },
    [t]
  );

  const selectedContactSummary = useMemo(() => {
    if (contactId === null) {
      return null;
    }
    const parts = [contactFirstName, contactLastName]
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0 && contactEmail.trim()) {
      parts.push(contactEmail.trim());
    }
    if (parts.length === 0 && contactPhone.trim()) {
      parts.push(contactPhone.trim());
    }
    return parts.join(" ") || t("structures.create.form.contact.picker.unknownContact");
  }, [contactEmail, contactFirstName, contactId, contactLastName, contactPhone, t]);

  const sanitizeContactField = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const buildContactPayload = (overrideId: number | null = null): ContactCreateDto => {
    const payload: ContactCreateDto = {
      contact_id: overrideId ?? contactId ?? undefined,
      first_name: sanitizeContactField(contactFirstName),
      last_name: sanitizeContactField(contactLastName),
      role: sanitizeContactField(contactRole),
      email: sanitizeContactField(contactEmail),
      phone: sanitizeContactField(contactPhone),
      notes: sanitizeContactField(contactNotes),
      preferred_channel: contactPreferredChannel,
      is_primary: contactIsPrimary
    };

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
    ) as ContactCreateDto;
  };

  const checkContactDuplicates = async (respectAllowance = true): Promise<boolean> => {
    if (!addContact || contactId !== null || !contactHasDetails()) {
      return true;
    }

    if (respectAllowance && contactAllowDuplicate) {
      return true;
    }

    setContactCheckingDuplicates(true);
    setContactStatusMessage(null);

    try {
      const matches = await searchContacts({
        first_name: sanitizeContactField(contactFirstName),
        last_name: sanitizeContactField(contactLastName),
        email: sanitizeContactField(contactEmail),
        phone: sanitizeContactField(contactPhone),
        limit: 5
      });
      setContactDuplicates(matches);
      if (matches.length > 0) {
        setContactStatusMessage(
          t("structures.create.contact.duplicatesFound", { count: matches.length })
        );
        return false;
      }
      setContactStatusMessage(t("structures.create.contact.noMatches"));
      return true;
      } catch (error) {
        console.error(error);
        setContactStatusMessage(t("structures.create.contact.searchFailed"));
        return false;
      } finally {
      setContactCheckingDuplicates(false);
    }
  };

  const handleContactDuplicateSearch = async () => {
    if (!contactHasDetails()) {
      setContactStatusMessage(t("structures.create.contact.minimumDetails"));
      return;
    }
    setContactAllowDuplicate(false);
    await checkContactDuplicates(false);
  };

  const handleContactUseExisting = (match: Contact) => {
    setContactId(match.contact_id);
    setContactFirstName(match.first_name ?? "");
    setContactLastName(match.last_name ?? "");
    setContactRole(match.role ?? "");
    setContactEmail(match.email ?? "");
    setContactPhone(match.phone ?? "");
    setContactNotes(match.notes ?? "");
    setContactPreferredChannel(match.preferred_channel);
    setContactIsPrimary(match.is_primary);
    setContactAllowDuplicate(true);
    setContactDuplicates([]);
    setContactStatusMessage(
      t("structures.create.contact.usingExisting", { name: match.name })
    );
  };

  const handleContactCreateAnyway = () => {
    setContactAllowDuplicate(true);
    setContactStatusMessage(null);
    setContactDuplicates([]);
  };

  const runContactPickerSearch = useCallback(async (queryValue: string) => {
    setContactPickerLoading(true);
    setContactPickerError(null);
    try {
      const trimmed = queryValue.trim();
      const params = {
        first_name: trimmed || null,
        last_name: trimmed || null,
        email: trimmed.includes("@") ? trimmed : null,
        phone: trimmed ? trimmed : null,
        limit: 20
      } as const;
      const results = await searchContacts(params);
      setContactPickerResults(results);
      } catch (error) {
        console.error(error);
        setContactPickerError(t("structures.create.form.contact.picker.error"));
      } finally {
      setContactPickerLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isContactPickerOpen) {
      return;
    }
    void runContactPickerSearch(contactPickerQuery);
  }, [contactPickerQuery, isContactPickerOpen, runContactPickerSearch]);

  const handleContactPickerOpen = () => {
    setIsContactPickerOpen(true);
    setContactPickerError(null);
  };

  const handleContactPickerClose = () => {
    setIsContactPickerOpen(false);
    setContactPickerError(null);
  };

  const handleContactPickerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runContactPickerSearch(contactPickerQuery);
  };

  const handleContactPickerSelect = (contact: Contact) => {
    handleContactUseExisting(contact);
    setIsContactPickerOpen(false);
  };

  const handleContactPickerClear = () => {
    setContactId(null);
    setContactFirstName("");
    setContactLastName("");
    setContactRole("");
    setContactEmail("");
    setContactPhone("");
    setContactNotes("");
    setContactPreferredChannel("email");
    setContactIsPrimary(true);
    setContactAllowDuplicate(false);
    setContactStatusMessage(null);
  };

  const clearFieldError = (field: FieldErrorKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setName(value);
    setApiError(null);
    clearFieldError("name");
    setSlug(toSlug(value));
  };

  const handleCountryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.toUpperCase();
    setCountry(value);
    setApiError(null);
    clearFieldError("country");
  };

  const handleProvinceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProvince(event.target.value.toUpperCase());
    setApiError(null);
    clearFieldError("province");
    setGeocodingApplied(false);
  };

  const handleMunicipalityChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMunicipality(event.target.value);
    setApiError(null);
    setGeocodingApplied(false);
  };

  const handleLocalityChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLocality(event.target.value);
    setApiError(null);
    setGeocodingApplied(false);
  };

  const handlePostalCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPostalCode(event.target.value.toUpperCase());
    setApiError(null);
    clearFieldError("postal_code");
    setGeocodingApplied(false);
  };

  const handleAddressChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setAddress(event.target.value);
    setApiError(null);
    setGeocodingApplied(false);
  };

  const handleLatitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLatitude(event.target.value);
    setApiError(null);
    clearFieldError("latitude");
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
    setGeocodingAltitudeApplied(false);
  };

  const handleLongitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLongitude(event.target.value);
    setApiError(null);
    clearFieldError("longitude");
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
    setGeocodingAltitudeApplied(false);
  };

  const handleAltitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAltitude(event.target.value);
    setApiError(null);
    clearFieldError("altitude");
    setAltitudeManuallyEdited(true);
    setGeocodingAltitudeApplied(false);
    setGeocodingApplied(false);
  };

  const handleIndoorBedsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIndoorBeds(event.target.value);
    setApiError(null);
    clearFieldError("indoor_beds");
  };

  const handleIndoorBathroomsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIndoorBathrooms(event.target.value);
    setApiError(null);
    clearFieldError("indoor_bathrooms");
  };

  const handleIndoorShowersChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIndoorShowers(event.target.value);
    setApiError(null);
    clearFieldError("indoor_showers");
  };

  const handleIndoorActivityRoomsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIndoorActivityRooms(event.target.value);
    setApiError(null);
    clearFieldError("indoor_activity_rooms");
  };

  const handleHasKitchenChange = (value: boolean | null) => {
    setHasKitchen(value);
    setApiError(null);
  };

  const handleHotWaterChange = (value: boolean | null) => {
    setHotWater(value);
    setApiError(null);
  };

  const handleLandAreaChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLandArea(event.target.value);
    setApiError(null);
    clearFieldError("land_area_m2");
  };

  const handleShelterOnFieldChange = (value: boolean | null) => {
    setShelterOnField(value);
    setApiError(null);
  };

  const handlePitLatrineAllowedChange = (value: boolean | null) => {
    setPitLatrineAllowed(value);
    setApiError(null);
  };

  const focusOpenPeriodField = (key: string, field: "season" | "date_start") => {
    requestAnimationFrame(() => {
      const element = document.getElementById(`structure-open-period-${key}-${field}`);
      if (element instanceof HTMLElement) {
        element.focus();
      }
    });
  };

  const handleAddOpenPeriod = (kind: StructureOpenPeriodKind) => {
    const row = createOpenPeriodRow(kind);
    setOpenPeriods((prev) => [...prev, row]);
    clearFieldError("open_periods");
    focusOpenPeriodField(row.key, kind === "season" ? "season" : "date_start");
  };

  const handleRemoveOpenPeriod = (key: string) => {
    setOpenPeriods((prev) => prev.filter((row) => row.key !== key));
    clearFieldError("open_periods");
    requestAnimationFrame(() => {
      const addButton = document.getElementById("structure-open-periods-add-season");
      if (addButton instanceof HTMLElement) {
        addButton.focus();
      }
    });
  };

  const handleOpenPeriodKindChange = (
    key: string,
    nextKind: StructureOpenPeriodKind
  ) => {
    setOpenPeriods((prev) =>
      prev.map((row) => {
        if (row.key !== key) {
          return row;
        }
        return {
          ...row,
          kind: nextKind,
          season: nextKind === "season" ? row.season : "",
          dateStart: nextKind === "range" ? row.dateStart : "",
          dateEnd: nextKind === "range" ? row.dateEnd : ""
        };
      })
    );
    clearFieldError("open_periods");
    focusOpenPeriodField(key, nextKind === "season" ? "season" : "date_start");
  };

  const handleOpenPeriodSeasonChange = (
    key: string,
    nextSeason: StructureOpenPeriodSeason | ""
  ) => {
    setOpenPeriods((prev) =>
      prev.map((row) => (row.key === key ? { ...row, season: nextSeason } : row))
    );
    clearFieldError("open_periods");
  };

  const handleOpenPeriodDateChange = (
    key: string,
    field: "dateStart" | "dateEnd",
    value: string
  ) => {
    setOpenPeriods((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
    clearFieldError("open_periods");
  };

  const handleOpenPeriodNotesChange = (key: string, value: string) => {
    setOpenPeriods((prev) =>
      prev.map((row) => (row.key === key ? { ...row, notes: value } : row))
    );
  };

  const handleOpenPeriodUnitsChange = (key: string, value: Unit[]) => {
    setOpenPeriods((prev) =>
      prev.map((row) => (row.key === key ? { ...row, units: value } : row))
    );
    clearFieldError("open_periods");
  };

  const handleAddCostOption = () => {
    setCostOptions((prev) => [...prev, createCostOptionRow()]);
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleRemoveCostOption = (key: string) => {
    setCostOptions((prev) => prev.filter((row) => row.key !== key));
    setApiError(null);
    clearFieldError("cost_options");
    requestAnimationFrame(() => {
      const addButton = document.getElementById("structure-cost-options-add");
      if (addButton instanceof HTMLElement) {
        addButton.focus();
      }
    });
  };

  const updateCostOption = (key: string, updates: Partial<CostOptionFormRow>) => {
    setCostOptions((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...updates } : row))
    );
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleCostOptionModelChange = (key: string, value: CostModel | "") => {
    updateCostOption(key, { model: value });
  };

  const handleCostOptionFieldChange = (
    key: string,
    field:
      | "amount"
      | "currency"
      | "bookingDeposit"
      | "damageDeposit"
      | "cityTaxPerNight"
      | "utilitiesFlat"
      | "utilitiesIncluded"
      | "utilitiesNotes"
      | "paymentTerms"
      | "minTotal"
      | "maxTotal"
      | "forfaitTrigger",
    value: string
  ) => {
    const updates: Partial<CostOptionFormRow> = { [field]: value } as Partial<CostOptionFormRow>;
    if (field === "utilitiesIncluded" && value === "") {
      updates.utilitiesIncluded = "";
    }
    updateCostOption(key, updates);
  };

  const handleCostOptionPaymentMethodToggle = (
    optionKey: string,
    method: PaymentMethod,
    checked: boolean
  ) => {
    setCostOptions((prev) =>
      prev.map((option) => {
        if (option.key !== optionKey) {
          return option;
        }
        const existing = option.paymentMethods;
        let next: PaymentMethod[];
        if (checked) {
          if (method === defaultPaymentMethod) {
            next = [defaultPaymentMethod];
          } else {
            next = existing.filter((value) => value !== defaultPaymentMethod);
            if (!next.includes(method)) {
              next = [...next, method];
            }
          }
        } else {
          next = existing.filter((value) => value !== method);
          if (next.length === 0) {
            next = [defaultPaymentMethod];
          }
        }
        return { ...option, paymentMethods: next };
      })
    );
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleAddSeasonalModifier = (optionKey: string) => {
    setCostOptions((prev) =>
      prev.map((row) =>
        row.key === optionKey
          ? { ...row, modifiers: [...row.modifiers, createSeasonalModifierRow()] }
          : row
      )
    );
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleCostModifierFieldChange = (
    optionKey: string,
    modifierKey: string,
    field: "season" | "amount",
    value: string
  ) => {
    setCostOptions((prev) =>
      prev.map((row) => {
        if (row.key !== optionKey) {
          return row;
        }
        const nextModifiers = row.modifiers.map((modifier) =>
          modifier.key === modifierKey ? { ...modifier, [field]: value } : modifier
        );
        return { ...row, modifiers: nextModifiers };
      })
    );
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleRemoveCostModifier = (optionKey: string, modifierKey: string) => {
    setCostOptions((prev) =>
      prev.map((row) =>
        row.key === optionKey
          ? { ...row, modifiers: row.modifiers.filter((modifier) => modifier.key !== modifierKey) }
          : row
      )
    );
    setApiError(null);
    clearFieldError("cost_options");
  };

  const handleWaterSourceToggle = (option: WaterSource, checked: boolean) => {
    setWaterSources((prev) => {
      const exclusiveOptions: WaterSource[] = ["none", "unknown"];

      if (checked) {
        if (exclusiveOptions.includes(option)) {
          return [option];
        }

        const withoutExclusive = prev.filter(
          (value) => !exclusiveOptions.includes(value)
        );

        if (withoutExclusive.includes(option)) {
          return withoutExclusive;
        }

        return [...withoutExclusive, option];
      }

      return prev.filter((value) => value !== option);
    });
    setApiError(null);
  };

  const handleElectricityAvailableChange = (value: boolean | null) => {
    setElectricityAvailable(value);
    setApiError(null);
  };

  const handleFirePolicyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFirePolicy(event.target.value as FirePolicy | "");
    setApiError(null);
  };

  const handleFloodRiskChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFloodRisk(event.target.value as FloodRiskLevel | "");
    setApiError(null);
  };

  const handleFieldSlopeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFieldSlope(event.target.value as FieldSlope | "");
    setApiError(null);
  };

  const handlePitchesTendeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPitchesTende(event.target.value);
    setApiError(null);
  };

  const handleWaterAtFieldChange = (value: boolean | null) => {
    setWaterAtField(value);
    setApiError(null);
  };

  const handleAccessByCarChange = (value: boolean | null) => {
    setAccessByCar(value);
    setApiError(null);
  };

  const handleAccessByCoachChange = (value: boolean | null) => {
    setAccessByCoach(value);
    setApiError(null);
  };

  const handleAccessByPublicTransportChange = (value: boolean | null) => {
    setAccessByPublicTransport(value);
    setApiError(null);
  };

  const handleCoachTurningAreaChange = (value: boolean | null) => {
    setCoachTurningArea(value);
    setApiError(null);
  };

  const handleTransportAccessPointsChange = (points: TransportAccessPointFormValue[]) => {
    setTransportAccessPoints(points);
    setApiError(null);
    clearFieldError("transport_access_points");
  };

  const handleWheelchairAccessibleChange = (value: boolean | null) => {
    setWheelchairAccessible(value);
    setApiError(null);
  };

  const handleStepFreeAccessChange = (value: boolean | null) => {
    setStepFreeAccess(value);
    setApiError(null);
  };

  const handleParkingCarSlotsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setParkingCarSlots(event.target.value);
    setApiError(null);
  };

  const handleParkingBusSlotsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setParkingBusSlots(event.target.value);
    setApiError(null);
  };

  const handleParkingNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setParkingNotes(event.target.value);
    setApiError(null);
  };

  const handleAccessibilityNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setAccessibilityNotes(event.target.value);
    setApiError(null);
  };

  const handleWeekendOnlyChange = (value: boolean | null) => {
    setWeekendOnly(value);
    setApiError(null);
  };

  const handleHasFieldPolesChange = (value: boolean | null) => {
    setHasFieldPoles(value);
    setApiError(null);
  };

  const handleContactEmailChange = (index: number, value: string) => {
    setContactEmails((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
    clearFieldError("contact_emails");
  };

  const handleUsageRecommendationChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value as StructureUsageRecommendation | "";
    setUsageRecommendation(value);
    setApiError(null);
    clearFieldError("usage_recommendation");
  };

  const handleAllowedAudienceChange = (index: number, value: string) => {
    setAllowedAudiences((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
  };

  const handleDocumentsRequiredChange = (index: number, value: string) => {
    setDocumentsRequired((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
  };

  const handleAddDocumentsRequired = () => {
    setDocumentsRequired((current) => [...current, ""]);
    setApiError(null);
  };

  const handleRemoveDocumentsRequired = (index: number) => {
    setDocumentsRequired((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setApiError(null);
  };

  const handleMapResourcesUrlChange = (index: number, value: string) => {
    setMapResourcesUrls((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
  };

  const handleAddMapResourcesUrl = () => {
    setMapResourcesUrls((current) => [...current, ""]);
    setApiError(null);
  };

  const handleRemoveMapResourcesUrl = (index: number) => {
    setMapResourcesUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setApiError(null);
  };

  const handleCellDataQualityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCellDataQuality(value === "" ? "" : (value as CellSignalQuality));
    setApiError(null);
  };

  const handleCellVoiceQualityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCellVoiceQuality(value === "" ? "" : (value as CellSignalQuality));
    setApiError(null);
  };

  const handleCommunicationsNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCommunicationsNotes(event.target.value);
    setApiError(null);
  };

  const handleActivityEquipmentChange = (index: number, value: string) => {
    setActivityEquipment((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
  };

  const handleAddActivityEquipment = () => {
    setActivityEquipment((current) => [...current, ""]);
    setApiError(null);
  };

  const handleRemoveActivityEquipment = (index: number) => {
    setActivityEquipment((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [""];
    });
    setApiError(null);
  };

  const handleStructurePaymentMethodToggle = (method: PaymentMethod, checked: boolean) => {
    setStructurePaymentMethods((current) => {
      if (checked) {
        if (method === defaultPaymentMethod) {
          return [defaultPaymentMethod];
        }
        const withoutDefaults = current.filter((value) => value !== defaultPaymentMethod);
        if (withoutDefaults.includes(method)) {
          return withoutDefaults;
        }
        return [...withoutDefaults, method];
      }
      const next = current.filter((value) => value !== method);
      return next.length > 0 ? next : [defaultPaymentMethod];
    });
    setApiError(null);
  };

  const optionalSectionOptions = useMemo(
    () =>
      optionalSectionOrder.map((section) => ({
        value: section,
        label: t(`structures.create.form.optionalSections.options.${section}`)
      })),
    [t]
  );

  const availableOptionalSectionOptions = useMemo(
    () =>
      optionalSectionOptions.filter(
        (option) => !activeOptionalSections.includes(option.value)
      ),
    [activeOptionalSections, optionalSectionOptions]
  );

  const resetOptionalSection = useCallback(
    (section: OptionalSectionKey) => {
      switch (section) {
        case "allowedAudiences":
          setAllowedAudiences([]);
          break;
        case "inAreaProtetta":
          setInAreaProtetta(null);
          setEnteAreaProtetta("");
          break;
        case "floodRisk":
          setFloodRisk("");
          break;
        case "environmentalNotes":
          setEnvironmentalNotes("");
          break;
        case "documentsRequired":
          setDocumentsRequired([""]);
          break;
        case "mapResources":
          setMapResourcesUrls([""]);
          break;
      }
    },
    [
      setAllowedAudiences,
      setDocumentsRequired,
      setEnteAreaProtetta,
      setInAreaProtetta,
      setMapResourcesUrls,
      setFloodRisk,
      setEnvironmentalNotes
    ]
  );

  const activateOptionalSection = useCallback(
    (section: OptionalSectionKey) => {
      setActiveOptionalSections((current) => {
        if (current.includes(section)) {
          return current;
        }
        return sortOptionalSections([...current, section]);
      });

      if (section === "documentsRequired") {
        setDocumentsRequired((current) => (current.length === 0 ? [""] : current));
      }
      if (section === "mapResources") {
        setMapResourcesUrls((current) => (current.length === 0 ? [""] : current));
      }

      setApiError(null);
    },
    [setApiError, setDocumentsRequired, setMapResourcesUrls]
  );

  const deactivateOptionalSection = useCallback(
    (section: OptionalSectionKey) => {
      setActiveOptionalSections((current) =>
        sortOptionalSections(current.filter((value) => value !== section))
      );
      resetOptionalSection(section);
      setApiError(null);
    },
    [resetOptionalSection, setApiError]
  );

  const handleOptionalSectionSelectionChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value as OptionalSectionKey | "";
    if (!value) {
      setOptionalSectionSelection("");
      return;
    }
    setOptionalSectionSelection("");
    activateOptionalSection(value);
  };

  const renderOptionalSectionRemoveButton = (section: OptionalSectionKey) => (
    <div className="structure-optional-section-actions">
      <button
        type="button"
        className="link-button structure-optional-section-remove"
        onClick={() => deactivateOptionalSection(section)}
      >
        {t("structures.create.form.optionalSections.remove")}
      </button>
    </div>
  );

  const isOptionalSectionActive = useCallback(
    (section: OptionalSectionKey) => activeOptionalSections.includes(section),
    [activeOptionalSections]
  );

  const handleUsageRulesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setUsageRules(event.target.value);
    setApiError(null);
  };

  const handleInAreaProtettaChange = (value: boolean | null) => {
    setInAreaProtetta(value);
    if (value !== true) {
      setEnteAreaProtetta("");
    }
    setApiError(null);
  };

  const handleEnteAreaProtettaChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEnteAreaProtetta(event.target.value);
    setApiError(null);
  };

  const handleEnvironmentalNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEnvironmentalNotes(event.target.value);
    setApiError(null);
  };

  const handleSeasonalAmenityChange = (
    amenityId: string,
    field: "key" | "value",
    value: string
  ) => {
    setSeasonalAmenities((current) =>
      current.map((row) =>
        row.id === amenityId
          ? {
              ...row,
              [field]: value
            }
          : row
      )
    );
    setApiError(null);
  };

  const handleAddSeasonalAmenity = () => {
    setSeasonalAmenities((current) => [...current, createSeasonalAmenityRow()]);
    setApiError(null);
  };

  const handleRemoveSeasonalAmenity = (amenityId: string) => {
    setSeasonalAmenities((current) => {
      const next = current.filter((row) => row.id !== amenityId);
      return next;
    });
    setApiError(null);
  };

  const handleAddAllowedAudience = () => {
    setAllowedAudiences((current) => [...current, ""]);
    setApiError(null);
  };

  const handleRemoveAllowedAudience = (index: number) => {
    setAllowedAudiences((current) => current.filter((_, position) => position !== index));
    setApiError(null);
  };

  const handleAddContactEmail = () => {
    setContactEmails((current) => [...current, ""]);
    setApiError(null);
    clearFieldError("contact_emails");
  };

  const handleRemoveContactEmail = (index: number) => {
    setContactEmails((current) => {
      if (current.length === 1) {
        return [""];
      }
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [""];
    });
    setApiError(null);
    clearFieldError("contact_emails");
  };

  const evaluateWebsiteUrlStatus = useCallback((value: string): WebsiteUrlStatus => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "idle";
    }

    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }, []);

  useEffect(() => {
    if (!isEditing || !existingStructure || isPrefilled) {
      return;
    }

    const nextActiveSections: OptionalSectionKey[] = [];

    setStructureId(existingStructure.id);
    setName(existingStructure.name ?? "");
    setSlug(existingStructure.slug ?? "");
    setCountry(existingStructure.country ?? "IT");
    setProvince(existingStructure.province ?? "");
    setMunicipality(existingStructure.municipality ?? "");
    setLocality(existingStructure.locality ?? "");
    setPostalCode(existingStructure.postal_code ?? "");
    setAddress(existingStructure.address ?? "");
    setLatitude(
      existingStructure.latitude !== null && existingStructure.latitude !== undefined
        ? String(existingStructure.latitude)
        : ""
    );
    setLongitude(
      existingStructure.longitude !== null && existingStructure.longitude !== undefined
        ? String(existingStructure.longitude)
        : ""
    );
    setAltitude(
      existingStructure.altitude !== null && existingStructure.altitude !== undefined
        ? String(existingStructure.altitude)
        : ""
    );
    setType(existingStructure.type ?? "");
    setOperationalStatus(existingStructure.operational_status ?? "");
    setIndoorBeds(
      existingStructure.indoor_beds !== null && existingStructure.indoor_beds !== undefined
        ? String(existingStructure.indoor_beds)
        : ""
    );
    setIndoorBathrooms(
      existingStructure.indoor_bathrooms !== null && existingStructure.indoor_bathrooms !== undefined
        ? String(existingStructure.indoor_bathrooms)
        : ""
    );
    setIndoorShowers(
      existingStructure.indoor_showers !== null && existingStructure.indoor_showers !== undefined
        ? String(existingStructure.indoor_showers)
        : ""
    );
    setIndoorActivityRooms(
      existingStructure.indoor_activity_rooms !== null &&
      existingStructure.indoor_activity_rooms !== undefined
        ? String(existingStructure.indoor_activity_rooms)
        : ""
    );
    setHasKitchen(toTriState(existingStructure.has_kitchen));
    setHotWater(toTriState(existingStructure.hot_water));
    setLandArea(
      existingStructure.land_area_m2 !== null && existingStructure.land_area_m2 !== undefined
        ? String(existingStructure.land_area_m2)
        : ""
    );
    setFieldSlope(existingStructure.field_slope ?? "");
    setPitchesTende(
      existingStructure.pitches_tende !== null && existingStructure.pitches_tende !== undefined
        ? String(existingStructure.pitches_tende)
        : ""
    );
    setWaterAtField(toTriState(existingStructure.water_at_field));
    setShelterOnField(toTriState(existingStructure.shelter_on_field));
    setPitLatrineAllowed(toTriState(existingStructure.pit_latrine_allowed));
    setWaterSources(existingStructure.water_sources ?? []);
    setElectricityAvailable(toTriState(existingStructure.electricity_available));
    setFirePolicy(existingStructure.fire_policy ?? "");
    setAccessByCar(toTriState(existingStructure.access_by_car));
    setAccessByCoach(toTriState(existingStructure.access_by_coach));
    setAccessByPublicTransport(toTriState(existingStructure.access_by_public_transport));
    setCoachTurningArea(toTriState(existingStructure.coach_turning_area));
    const prefilledTransportAccessPoints =
      existingStructure.transport_access_points?.map<TransportAccessPointFormValue>((point, index) => {
        const normalizedType: TransportAccessPointType =
          point.type === "car" || point.type === "4x4" ? point.type : "bus";
        return {
          id: createTransportAccessPointId() + index,
          type: normalizedType,
          note: point.note ?? "",
          coordinates: point.coordinates
            ? { lat: point.coordinates.lat, lng: point.coordinates.lon }
            : null
        };
      }) ?? [];

    setTransportAccessPoints(prefilledTransportAccessPoints);
    setWheelchairAccessible(toTriState(existingStructure.wheelchair_accessible));
    setStepFreeAccess(toTriState(existingStructure.step_free_access));
    setParkingCarSlots(
      existingStructure.parking_car_slots !== null && existingStructure.parking_car_slots !== undefined
        ? String(existingStructure.parking_car_slots)
        : ""
    );
    setParkingBusSlots(
      existingStructure.parking_bus_slots !== null && existingStructure.parking_bus_slots !== undefined
        ? String(existingStructure.parking_bus_slots)
        : ""
    );
    setParkingNotes(existingStructure.parking_notes ?? "");
    setAccessibilityNotes(existingStructure.accessibility_notes ?? "");
    setWeekendOnly(toTriState(existingStructure.weekend_only));
    setHasFieldPoles(toTriState(existingStructure.has_field_poles));

    const emailValues =
      existingStructure.contact_emails && existingStructure.contact_emails.length > 0
        ? [...existingStructure.contact_emails]
        : [""];
    setContactEmails(emailValues);

    const websiteValues =
      existingStructure.website_urls && existingStructure.website_urls.length > 0
        ? [...existingStructure.website_urls]
        : [""];
    setWebsiteUrls(websiteValues);
    setWebsiteUrlStatuses(websiteValues.map(evaluateWebsiteUrlStatus));

    const mapResourceValues =
      existingStructure.map_resources_urls && existingStructure.map_resources_urls.length > 0
        ? [...existingStructure.map_resources_urls]
        : [""];
    setMapResourcesUrls(mapResourceValues);
    if (existingStructure.map_resources_urls && existingStructure.map_resources_urls.length > 0) {
      nextActiveSections.push("mapResources");
    }

    const documentValues =
      existingStructure.documents_required && existingStructure.documents_required.length > 0
        ? [...existingStructure.documents_required]
        : [""];
    setDocumentsRequired(documentValues);
    if (existingStructure.documents_required && existingStructure.documents_required.length > 0) {
      nextActiveSections.push("documentsRequired");
    }

    setCellDataQuality(existingStructure.cell_data_quality ?? "");
    setCellVoiceQuality(existingStructure.cell_voice_quality ?? "");
    setWifiAvailable(existingStructure.wifi_available);
    setLandlineAvailable(existingStructure.landline_available);
    const communicationsNotesValue =
      existingStructure.communications_infrastructure &&
      existingStructure.communications_infrastructure.length > 0
        ? existingStructure.communications_infrastructure.join("\n")
        : "";
    setCommunicationsNotes(communicationsNotesValue);

    const activityEquipmentValues =
      existingStructure.activity_equipment && existingStructure.activity_equipment.length > 0
        ? [...existingStructure.activity_equipment]
        : [""];
    setActivityEquipment(activityEquipmentValues);

    const paymentMethodValues = (existingStructure.payment_methods ?? []).filter(
      (value): value is PaymentMethod => isValidPaymentMethodValue(value)
    );
    if (paymentMethodValues.length > 0) {
      setStructurePaymentMethods(paymentMethodValues);
    } else {
      setStructurePaymentMethods([defaultPaymentMethod]);
    }

    setDataQualityStatus(existingStructure.data_quality_status ?? "");

    const audiences =
      existingStructure.allowed_audiences && existingStructure.allowed_audiences.length > 0
        ? [...existingStructure.allowed_audiences]
        : [];
    setAllowedAudiences(audiences);
    if (audiences.length > 0) {
      nextActiveSections.push("allowedAudiences");
    }
    setUsageRecommendation(existingStructure.usage_recommendation ?? "");
    setUsageRules(existingStructure.usage_rules ?? "");
    const areaProtettaValue = toTriState(existingStructure.in_area_protetta);
    setInAreaProtetta(areaProtettaValue);
    const enteAreaProtettaValue = existingStructure.ente_area_protetta ?? "";
    setEnteAreaProtetta(enteAreaProtettaValue);
    if (
      areaProtettaValue !== null ||
      (enteAreaProtettaValue && enteAreaProtettaValue.trim().length > 0)
    ) {
      nextActiveSections.push("inAreaProtetta");
    }
    const environmentalNotesValue = existingStructure.environmental_notes ?? "";
    setEnvironmentalNotes(environmentalNotesValue);
    if (environmentalNotesValue.trim().length > 0) {
      nextActiveSections.push("environmentalNotes");
    }
    const floodRiskValue = existingStructure.flood_risk ?? "";
    setFloodRisk(floodRiskValue);
    if (floodRiskValue) {
      nextActiveSections.push("floodRisk");
    }

    const amenitiesEntries = existingStructure.seasonal_amenities ?? {};
    const amenitiesRows = Object.entries(amenitiesEntries).map(([key, value]) =>
      createSeasonalAmenityRow(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      )
    );
    setSeasonalAmenities(amenitiesRows);

    setNotesLogistics(existingStructure.notes_logistics ?? "");
    setNotes(existingStructure.notes ?? "");

    const mappedOpenPeriods = (existingStructure.open_periods ?? []).map((period) => ({
      key: createOpenPeriodKey(),
      id: period.id,
      kind: period.kind,
      season: period.kind === "season" ? toSeasonValue(period.season) : "",
      dateStart: period.date_start ?? "",
      dateEnd: period.date_end ?? "",
      notes: period.notes ?? "",
      units: period.units ?? []
    }));
    setOpenPeriods(mappedOpenPeriods);

    const mappedCostOptions = (existingStructure.cost_options ?? []).map((option) => {
      const seasonalModifiers = (option.modifiers ?? []).filter(
        (modifier) => modifier.kind === "season"
      );
      const parsedPaymentMethods = (option.payment_methods ?? []).filter(
        (method): method is PaymentMethod => isValidPaymentMethodValue(method)
      );
      return {
        key: createCostOptionKey(),
        id: option.id,
        model: option.model,
        amount:
          option.amount !== null && option.amount !== undefined ? String(option.amount) : "",
        currency: option.currency,
        bookingDeposit:
          option.booking_deposit !== null && option.booking_deposit !== undefined
            ? String(option.booking_deposit)
            : "",
        damageDeposit:
          option.damage_deposit !== null && option.damage_deposit !== undefined
            ? String(option.damage_deposit)
            : "",
        cityTaxPerNight:
          option.city_tax_per_night !== null && option.city_tax_per_night !== undefined
            ? String(option.city_tax_per_night)
            : "",
        utilitiesFlat:
          option.utilities_flat !== null && option.utilities_flat !== undefined
            ? String(option.utilities_flat)
            : "",
        utilitiesIncluded:
          option.utilities_included === true
            ? "yes"
            : option.utilities_included === false
            ? "no"
            : "",
        utilitiesNotes: option.utilities_notes ?? "",
        paymentMethods:
          parsedPaymentMethods.length > 0 ? parsedPaymentMethods : [defaultPaymentMethod],
        paymentTerms: option.payment_terms ?? "",
        minTotal:
          option.min_total !== null && option.min_total !== undefined
            ? String(option.min_total)
            : "",
        maxTotal:
          option.max_total !== null && option.max_total !== undefined
            ? String(option.max_total)
            : "",
        forfaitTrigger:
          option.forfait_trigger_total !== null && option.forfait_trigger_total !== undefined
            ? String(option.forfait_trigger_total)
            : "",
        modifiers: seasonalModifiers.map((modifier) => ({
          key: createCostModifierKey(),
          id: modifier.id,
          kind: modifier.kind,
          season: modifier.season ?? "",
          amount:
            modifier.amount !== null && modifier.amount !== undefined
              ? String(modifier.amount)
              : "",
        })),
        hadModifiers: seasonalModifiers.length > 0,
      } satisfies CostOptionFormRow;
    });
    setCostOptions(mappedCostOptions);

    setAddContact(false);
    setContactAllowDuplicate(false);
    resetContactSection();
    setContactDuplicates([]);
    setContactStatusMessage(null);
    setContactCheckingDuplicates(false);
    setApiError(null);
    setFieldErrors({});
    setCoordinatesManuallyEdited(
      Boolean(
        (existingStructure.latitude !== null &&
          existingStructure.latitude !== undefined) ||
          (existingStructure.longitude !== null &&
            existingStructure.longitude !== undefined)
      )
    );
    setGeocodingStatus("idle");
    setGeocodingSuggestion(null);
    setGeocodingError(null);
    setGeocodingApplied(false);
    setActiveOptionalSections(sortOptionalSections(nextActiveSections));
    setIsPrefilled(true);
  }, [
    existingStructure,
    isEditing,
    isPrefilled,
    evaluateWebsiteUrlStatus,
    resetContactSection,
    setActiveOptionalSections
  ]);

  useEffect(() => {
    const trimmedAddress = address.trim();
    const trimmedLocality = locality.trim();
    const trimmedMunicipality = municipality.trim();
    const trimmedProvince = province.trim();
    const trimmedPostal = postalCode.trim();
    const normalizedProvince = trimmedProvince ? trimmedProvince.toUpperCase() : "";
    const normalizedPostal = trimmedPostal.replace(/\s+/g, "");

    const combinedAddressParts = [
      trimmedAddress,
      trimmedLocality,
      trimmedMunicipality,
      normalizedProvince,
      normalizedPostal ? `CAP ${normalizedPostal}` : "",
      "Italia",
    ];
    const combinedAddress = combinedAddressParts.filter(Boolean).join(", ");

    if (!trimmedAddress && !trimmedLocality && !trimmedMunicipality && !trimmedPostal) {
      if (geocodingDebounceRef.current !== null) {
        window.clearTimeout(geocodingDebounceRef.current);
        geocodingDebounceRef.current = null;
      }
      if (geocodingAbortController.current) {
        geocodingAbortController.current.abort();
        geocodingAbortController.current = null;
      }
      setGeocodingStatus("idle");
      setGeocodingSuggestion(null);
      setGeocodingError(null);
      setGeocodingApplied(false);
      return;
    }

    if (geocodingDebounceRef.current !== null) {
      window.clearTimeout(geocodingDebounceRef.current);
      geocodingDebounceRef.current = null;
    }

    if (geocodingAbortController.current) {
      geocodingAbortController.current.abort();
    }

    const controller = new AbortController();
    geocodingAbortController.current = controller;
    const requestId = geocodingRequestId.current + 1;
    geocodingRequestId.current = requestId;

    setGeocodingStatus("loading");
    setGeocodingError(null);
    setGeocodingApplied(false);
    setGeocodingAltitudeApplied(false);

    geocodingDebounceRef.current = window.setTimeout(() => {
      const params = {
        address: combinedAddress || undefined,
        locality: trimmedLocality || undefined,
        municipality: trimmedMunicipality || undefined,
        province: normalizedProvince || undefined,
        postal_code: normalizedPostal || undefined,
        country: "IT",
        limit: 5
      } as const;

      searchGeocoding(params, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted || requestId !== geocodingRequestId.current) {
            return;
          }
          const bestMatch =
            pickBestGeocodingResult(results, {
              fullAddress: combinedAddress,
              streetAddress: trimmedAddress,
              locality: trimmedLocality,
              municipality: trimmedMunicipality,
              province: normalizedProvince,
              postalCode: normalizedPostal
            }) ?? results[0] ?? null;
          setGeocodingStatus("success");
          setGeocodingSuggestion(bestMatch);
          if (!bestMatch) {
            setGeocodingApplied(false);
            setGeocodingAltitudeApplied(false);
            return;
          }

          if (!coordinatesEditedRef.current) {
            const suggestedLatitude = bestMatch.latitude.toFixed(6);
            const suggestedLongitude = bestMatch.longitude.toFixed(6);

            const shouldUpdateLatitude = latitudeRef.current !== suggestedLatitude;
            const shouldUpdateLongitude = longitudeRef.current !== suggestedLongitude;
            let shouldUpdateAltitude = false;
            const suggestedAltitudeValue =
              typeof bestMatch.altitude === "number" &&
              Number.isFinite(bestMatch.altitude)
                ? Math.round(bestMatch.altitude)
                : null;
            const canApplyAltitude =
              !altitudeEditedRef.current && suggestedAltitudeValue !== null;

            if (shouldUpdateLatitude) {
              setLatitude(suggestedLatitude);
            }
            if (shouldUpdateLongitude) {
              setLongitude(suggestedLongitude);
            }

            if (canApplyAltitude) {
              const altitudeString = String(suggestedAltitudeValue);
              if (altitudeRef.current !== altitudeString) {
                setAltitude(altitudeString);
                shouldUpdateAltitude = true;
              }
              setAltitudeManuallyEdited(false);
            }

            setGeocodingApplied((current) =>
              current ||
              shouldUpdateLatitude ||
              shouldUpdateLongitude ||
              shouldUpdateAltitude
            );

            if (canApplyAltitude) {
              setGeocodingAltitudeApplied(true);
            } else if (altitudeEditedRef.current || suggestedAltitudeValue === null) {
              setGeocodingAltitudeApplied(false);
            }
          } else {
            setGeocodingApplied(false);
            setGeocodingAltitudeApplied(false);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== geocodingRequestId.current) {
            return;
          }
          if (error instanceof ApiError) {
            if (error.status === 422) {
              setGeocodingError(t("structures.create.form.geocoding.unableToResolve"));
            } else {
              const detailValue =
                error.body &&
                typeof error.body === "object" &&
                "detail" in error.body
                  ? (error.body as Record<string, unknown>).detail
                  : null;
              const detail = typeof detailValue === "string" ? detailValue : null;
              setGeocodingError(detail ?? t("structures.create.form.geocoding.error"));
            }
          } else if (error instanceof Error) {
            setGeocodingError(error.message);
          } else {
            setGeocodingError(t("structures.create.form.geocoding.error"));
          }
          setGeocodingSuggestion(null);
          setGeocodingStatus("error");
          setGeocodingApplied(false);
          setGeocodingAltitudeApplied(false);
        })
        .finally(() => {
          if (geocodingDebounceRef.current !== null) {
            geocodingDebounceRef.current = null;
          }
          if (geocodingAbortController.current === controller) {
            geocodingAbortController.current = null;
          }
        });
    }, 800);

    return () => {
      if (geocodingDebounceRef.current !== null) {
        window.clearTimeout(geocodingDebounceRef.current);
        geocodingDebounceRef.current = null;
      }
      controller.abort();
    };
  }, [address, locality, municipality, province, postalCode, t]);

  const handleWebsiteUrlChange = (index: number, value: string) => {
    setWebsiteUrls((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setWebsiteUrlStatuses((current) => {
      const next = [...current];
      next[index] = "idle";
      return next;
    });
    setApiError(null);
    clearFieldError("website_urls");
  };

  const handleAddWebsiteUrl = () => {
    setWebsiteUrls((current) => [...current, ""]);
    setWebsiteUrlStatuses((current) => [...current, "idle"]);
    setApiError(null);
    clearFieldError("website_urls");
  };

  const handleRemoveWebsiteUrl = (index: number) => {
    setWebsiteUrls((current) => {
      if (current.length === 1) {
        return [""];
      }
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [""];
    });
    setWebsiteUrlStatuses((current) => {
      if (current.length === 1) {
        return ["idle"];
      }
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : ["idle"];
    });
    setApiError(null);
    clearFieldError("website_urls");
  };

  const handleWebsiteUrlBlur = (index: number) => {
    setWebsiteUrlStatuses((current) => {
      const next = [...current];
      next[index] = evaluateWebsiteUrlStatus(websiteUrls[index] ?? "");
      return next;
    });
  };

  const handleNotesLogisticsChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotesLogistics(event.target.value);
    setApiError(null);
  };

  const handleNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
    setApiError(null);
  };

  const handleContactSectionEnable = () => {
    setAddContact(true);
    setContactAllowDuplicate(false);
    setContactDuplicates([]);
    setContactStatusMessage(null);
    setContactIsPrimary(true);
  };

  const handleContactSectionDisable = () => {
    setAddContact(false);
    resetContactSection();
  };

  const handleOperationalStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setOperationalStatus(event.target.value as StructureOperationalStatus | "");
    setApiError(null);
  };

  const handleDataQualityStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDataQualityStatus(event.target.value as DataQualityStatus | "");
    clearFieldErrorsGroup(["data_quality_status"]);
  };

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as StructureType | "";
    setType(nextType);
    setApiError(null);
    clearFieldError("type");
    if (nextType === "house") {
      resetOutdoorFields();
    } else if (nextType === "land") {
      resetIndoorFields();
    }
  };

  const focusFirstError = (errors: FieldErrors) => {
    const first = Object.keys(errors)[0] as FieldErrorKey | undefined;
    if (!first) {
      return;
    }
    const element = document.getElementById(`structure-${first}`);
    if (element) {
      element.focus();
    }
  };

  const validate = (): boolean => {
    const trimmedName = name.trim();
    const trimmedCountry = country.trim().toUpperCase();
    const trimmedProvince = province.trim();
    const trimmedPostalCode = postalCode.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedAltitude = altitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedIndoorActivityRooms = indoorActivityRooms.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedWebsiteUrls = websiteUrls.map((value) => value.trim());
    const trimmedContactEmails = contactEmails.map((value) => value.trim());
    const trimmedCostOptions = costOptions.map((option) => ({
      key: option.key,
      id: option.id,
      model: option.model,
      amount: option.amount.trim(),
      currency: option.currency.trim(),
      bookingDeposit: option.bookingDeposit.trim(),
      damageDeposit: option.damageDeposit.trim(),
      cityTaxPerNight: option.cityTaxPerNight.trim(),
      utilitiesFlat: option.utilitiesFlat.trim(),
      utilitiesIncluded: option.utilitiesIncluded,
      utilitiesNotes: option.utilitiesNotes.trim(),
      paymentMethods: [...option.paymentMethods],
      paymentTerms: option.paymentTerms.trim(),
      minTotal: option.minTotal.trim(),
      maxTotal: option.maxTotal.trim(),
      modifiers: option.modifiers.map((modifier) => ({
        key: modifier.key,
        id: modifier.id,
        kind: modifier.kind,
        season: modifier.season,
        amount: modifier.amount.trim()
      })),
      hadModifiers: option.hadModifiers
    }));

    const errors: FieldErrors = {};

    if (!trimmedName) {
      errors.name = t("structures.create.errors.nameRequired");
    }

    if (!type) {
      errors.type = t("structures.create.errors.typeRequired");
    }

    if (!dataQualityStatus) {
      errors.data_quality_status = t(
        "structures.create.errors.dataQualityStatusRequired"
      );
    }

    if (!/^[A-Z]{2}$/.test(trimmedCountry)) {
      errors.country = t("structures.create.errors.countryInvalid");
    }

    if (trimmedProvince && !/^[A-Z]{2}$/.test(trimmedProvince)) {
      errors.province = t("structures.create.errors.provinceInvalid");
    }

    if (trimmedPostalCode) {
      const normalizedPostalCode = trimmedPostalCode.toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9\s-]{2,15}$/.test(normalizedPostalCode)) {
        errors.postal_code = t("structures.create.errors.postalCodeInvalid");
      }
    }

    if (trimmedLatitude) {
      const latNumber = parseCoordinateValue(trimmedLatitude);
      if (latNumber === null || latNumber < -90 || latNumber > 90) {
        errors.latitude = t("structures.create.errors.latitudeInvalid");
      }
    }

    if (trimmedLongitude) {
      const lonNumber = parseCoordinateValue(trimmedLongitude);
      if (lonNumber === null || lonNumber < -180 || lonNumber > 180) {
        errors.longitude = t("structures.create.errors.longitudeInvalid");
      }
    }

    if (trimmedAltitude) {
      const altNumber = parseCoordinateValue(trimmedAltitude);
      if (altNumber === null || altNumber < -500 || altNumber > 9000) {
        errors.altitude = t("structures.create.errors.altitudeInvalid");
      }
    }

    const validatePositiveInteger = (
      value: string,
      field: FieldErrorKey,
      message: string
    ) => {
      if (!value) {
        return;
      }
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        errors[field] = message;
      }
    };

    const validateNonNegativeDecimal = (
      value: string,
      field: FieldErrorKey,
      message: string
    ) => {
      if (!value) {
        return;
      }
      const parsed = Number.parseFloat(value.replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0) {
        errors[field] = message;
      }
    };

    validatePositiveInteger(
      trimmedIndoorBeds,
      "indoor_beds",
      t("structures.create.errors.numberInvalid")
    );
    validatePositiveInteger(
      trimmedIndoorBathrooms,
      "indoor_bathrooms",
      t("structures.create.errors.numberInvalid")
    );
    validatePositiveInteger(
      trimmedIndoorShowers,
      "indoor_showers",
      t("structures.create.errors.numberInvalid")
    );
    validatePositiveInteger(
      trimmedIndoorActivityRooms,
      "indoor_activity_rooms",
      t("structures.create.errors.numberInvalid")
    );
    validateNonNegativeDecimal(
      trimmedLandArea,
      "land_area_m2",
      t("structures.create.errors.decimalInvalid")
    );

    if (openPeriods.length > 0 && !errors.open_periods) {
      for (const period of openPeriods) {
        if (period.kind === "season") {
          if (!period.season) {
            errors.open_periods = t("structures.create.errors.openPeriodsSeasonRequired");
            break;
          }
        } else {
          if (!period.dateStart || !period.dateEnd) {
            errors.open_periods = t("structures.create.errors.openPeriodsRangeRequired");
            break;
          }
          if (period.dateStart > period.dateEnd) {
            errors.open_periods = t("structures.create.errors.openPeriodsRangeOrder");
            break;
          }
        }
        if (period.units.length === 0) {
          errors.open_periods = t("structures.create.errors.openPeriodsUnitsRequired");
          break;
        }
      }
    }

    for (const candidate of trimmedContactEmails) {
      if (!candidate) {
        continue;
      }
      if (!isValidEmail(candidate)) {
        errors.contact_emails = t("structures.create.errors.contactEmailInvalid");
        break;
      }
    }

    for (const candidate of trimmedWebsiteUrls) {
      if (!candidate) {
        continue;
      }
      try {
        const url = new URL(candidate);
        if (!url.protocol.startsWith("http")) {
          throw new Error("invalid protocol");
        }
      } catch {
        errors.website_urls = t("structures.create.errors.websiteInvalid");
        break;
      }
    }

    const isCostOptionEmpty = (option: typeof trimmedCostOptions[number]) => {
      const hasMeaningfulPaymentMethods = option.paymentMethods.some(
        (method) => method !== defaultPaymentMethod
      );

      return (
        !hasMeaningfulPaymentMethods &&
        !option.model &&
        !option.amount &&
        !option.bookingDeposit &&
        !option.damageDeposit &&
        !option.cityTaxPerNight &&
        !option.utilitiesFlat &&
        !option.minTotal &&
        !option.maxTotal &&
        !option.forfaitTrigger &&
        !option.utilitiesNotes &&
        !option.paymentTerms &&
        option.utilitiesIncluded === "" &&
        option.modifiers.length === 0
      );
    };

    for (const option of trimmedCostOptions) {
      if (isCostOptionEmpty(option)) {
        continue;
      }
      if (!option.model) {
        errors.cost_options = t("structures.create.errors.costOptionsModelRequired");
        break;
      }
      if (!option.amount) {
        errors.cost_options = t("structures.create.errors.costOptionsAmountRequired");
        break;
      }
      const amountValue = Number.parseFloat(option.amount.replace(",", "."));
      if (Number.isNaN(amountValue) || amountValue <= 0) {
        errors.cost_options = t("structures.create.errors.costOptionsAmountInvalid");
        break;
      }
      const currencyValue = option.currency ? option.currency.toUpperCase() : "";
      if (!/^[A-Z]{3}$/.test(currencyValue)) {
        errors.cost_options = t("structures.create.errors.costOptionsCurrencyInvalid");
        break;
      }
      const extraFields = [
        option.bookingDeposit,
        option.damageDeposit,
        option.cityTaxPerNight,
        option.utilitiesFlat,
        option.minTotal,
        option.maxTotal,
        option.forfaitTrigger
      ];
      for (const candidate of extraFields) {
        if (!candidate) {
          continue;
        }
        const parsed = Number.parseFloat(candidate.replace(",", "."));
        if (Number.isNaN(parsed) || parsed < 0) {
          errors.cost_options = t("structures.create.errors.costOptionsExtraInvalid");
          break;
        }
      }
      if (errors.cost_options) {
        break;
      }
      if (option.minTotal && option.maxTotal) {
        const minValue = Number.parseFloat(option.minTotal.replace(",", "."));
        const maxValue = Number.parseFloat(option.maxTotal.replace(",", "."));
        if (!Number.isNaN(minValue) && !Number.isNaN(maxValue) && minValue > maxValue) {
          errors.cost_options = t("structures.create.errors.costOptionsTotalsInvalid");
          break;
        }
      }
      for (const modifier of option.modifiers) {
        if (!modifier.season) {
          errors.cost_options = t("structures.create.errors.costOptionsSeasonalInvalid");
          break;
        }
        if (!modifier.amount) {
          errors.cost_options = t("structures.create.errors.costOptionsSeasonalInvalid");
          break;
        }
        const modifierValue = Number.parseFloat(modifier.amount.replace(",", "."));
        if (Number.isNaN(modifierValue) || modifierValue <= 0) {
          errors.cost_options = t("structures.create.errors.costOptionsSeasonalInvalid");
          break;
        }
      }
      if (errors.cost_options) {
        break;
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiError(null);

    if (!validate()) {
      return;
    }

    if (addContact && contactHasDetails()) {
      const duplicatesOk = await checkContactDuplicates();
      if (!duplicatesOk) {
        return;
      }
    }

    const trimmedCountry = country.trim().toUpperCase();
    const trimmedProvince = province.trim();
    const trimmedMunicipality = municipality.trim();
    const trimmedLocality = locality.trim();
    const trimmedPostalCode = postalCode.trim();
    const trimmedAddress = address.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedAltitude = altitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedIndoorActivityRooms = indoorActivityRooms.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedPitchesTende = pitchesTende.trim();
    const trimmedParkingCarSlots = parkingCarSlots.trim();
    const trimmedParkingBusSlots = parkingBusSlots.trim();
    const trimmedParkingNotes = parkingNotes.trim();
    const trimmedAccessibilityNotes = accessibilityNotes.trim();
    const trimmedWebsiteUrls = websiteUrls.map((value) => value.trim());
    const trimmedContactEmails = contactEmails.map((value) => value.trim());
    const trimmedAllowedAudiences = allowedAudiences.map((value) => value.trim());
    const trimmedNotesLogistics = notesLogistics.trim();
    const trimmedNotes = notes.trim();
    const trimmedUsageRules = usageRules.trim();
    const trimmedEnteAreaProtetta = enteAreaProtetta.trim();
    const trimmedEnvironmentalNotes = environmentalNotes.trim();
    const trimmedDocumentsRequired = documentsRequired.map((value) => value.trim());
    const trimmedMapResourcesUrls = mapResourcesUrls.map((value) => value.trim());
    const trimmedCommunicationsNotes = communicationsNotes
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const trimmedActivityEquipment = activityEquipment.map((value) => value.trim());
    const trimmedCostOptions = costOptions.map((option) => ({
      key: option.key,
      id: option.id,
      model: option.model,
      amount: option.amount.trim(),
      currency: option.currency.trim(),
      bookingDeposit: option.bookingDeposit.trim(),
      damageDeposit: option.damageDeposit.trim(),
      cityTaxPerNight: option.cityTaxPerNight.trim(),
      utilitiesFlat: option.utilitiesFlat.trim(),
      utilitiesIncluded: option.utilitiesIncluded,
      utilitiesNotes: option.utilitiesNotes.trim(),
      paymentMethods: [...option.paymentMethods],
      paymentTerms: option.paymentTerms.trim(),
      minTotal: option.minTotal.trim(),
      maxTotal: option.maxTotal.trim(),
      modifiers: option.modifiers.map((modifier) => ({
        key: modifier.key,
        id: modifier.id,
        kind: modifier.kind,
        season: modifier.season,
        amount: modifier.amount.trim()
      })),
      hadModifiers: option.hadModifiers
    }));

    const normalizedTransportAccessPoints: TransportAccessPoint[] = transportAccessPoints
      .map((point) => {
        const note = point.note.trim();
        return {
          type: point.type,
          note: note ? note : null,
          coordinates: point.coordinates
            ? { lat: point.coordinates.lat, lon: point.coordinates.lng }
            : null
        };
      })
      .filter((point) => point.note || point.coordinates);

    const payload: StructureCreateDto = {
      name: name.trim(),
      slug: slug.trim(),
      type: type as StructureType,
      data_quality_status: dataQualityStatus as DataQualityStatus,
      has_kitchen: hasKitchen,
      hot_water: hotWater,
      cell_data_quality: cellDataQuality ? (cellDataQuality as CellSignalQuality) : null,
      cell_voice_quality: cellVoiceQuality ? (cellVoiceQuality as CellSignalQuality) : null,
      wifi_available: wifiAvailable,
      landline_available: landlineAvailable,
      access_by_car: accessByCar,
      access_by_coach: accessByCoach,
      access_by_public_transport: accessByPublicTransport,
      coach_turning_area: coachTurningArea,
      shelter_on_field: shelterOnField,
      electricity_available: electricityAvailable,
      weekend_only: weekendOnly,
      has_field_poles: hasFieldPoles,
      pit_latrine_allowed: pitLatrineAllowed,
    };

    payload.transport_access_points =
      normalizedTransportAccessPoints.length > 0 ? normalizedTransportAccessPoints : null;

    payload.country = trimmedCountry;

    if (operationalStatus) {
      payload.operational_status = operationalStatus as StructureOperationalStatus;
    } else {
      payload.operational_status = null;
    }

    if (usageRecommendation) {
      payload.usage_recommendation = usageRecommendation as StructureUsageRecommendation;
    } else {
      payload.usage_recommendation = null;
    }

    const showIndoorSection = type !== "land";
    const showOutdoorSection = type !== "house";

    if (trimmedProvince) {
      payload.province = trimmedProvince.toUpperCase();
    }

    if (trimmedMunicipality) {
      payload.municipality = trimmedMunicipality;
    }


    if (trimmedLocality) {
      payload.locality = trimmedLocality;
    }

    if (trimmedPostalCode) {
      payload.postal_code = trimmedPostalCode.toUpperCase();
    }

    if (trimmedAddress) {
      payload.address = trimmedAddress;
    }

    const latitudeValue = parseCoordinateValue(trimmedLatitude);
    if (latitudeValue !== null) {
      payload.latitude = latitudeValue;
    }

    const longitudeValue = parseCoordinateValue(trimmedLongitude);
    if (longitudeValue !== null) {
      payload.longitude = longitudeValue;
    }

    const altitudeValue = parseCoordinateValue(trimmedAltitude);
    if (altitudeValue !== null) {
      payload.altitude = altitudeValue;
    }

    if (showIndoorSection) {
      payload.indoor_beds = trimmedIndoorBeds
        ? Number.parseInt(trimmedIndoorBeds, 10)
        : null;
      payload.indoor_bathrooms = trimmedIndoorBathrooms
        ? Number.parseInt(trimmedIndoorBathrooms, 10)
        : null;
      payload.indoor_showers = trimmedIndoorShowers
        ? Number.parseInt(trimmedIndoorShowers, 10)
        : null;
      payload.indoor_activity_rooms = trimmedIndoorActivityRooms
        ? Number.parseInt(trimmedIndoorActivityRooms, 10)
        : null;
    } else {
      payload.indoor_beds = null;
      payload.indoor_bathrooms = null;
      payload.indoor_showers = null;
      payload.indoor_activity_rooms = null;
      payload.has_kitchen = null;
      payload.hot_water = null;
    }

    if (showOutdoorSection) {
      payload.land_area_m2 = trimmedLandArea ? Number.parseFloat(trimmedLandArea.replace(",", ".")) : null;
      payload.water_sources = waterSources.length > 0 ? [...waterSources] : null;
      payload.fire_policy = firePolicy ? (firePolicy as FirePolicy) : null;
      payload.field_slope = fieldSlope ? (fieldSlope as FieldSlope) : null;
      payload.water_at_field = waterAtField;
    } else {
      payload.land_area_m2 = null;
      payload.field_slope = null;
      payload.water_at_field = null;
      payload.shelter_on_field = null;
      payload.water_sources = null;
      payload.electricity_available = null;
      payload.fire_policy = null;
      payload.has_field_poles = null;
      payload.pit_latrine_allowed = null;
    }

    const nonEmptyWebsiteUrls = trimmedWebsiteUrls.filter((value) => value);
    if (nonEmptyWebsiteUrls.length > 0) {
      payload.website_urls = nonEmptyWebsiteUrls;
    }

    const nonEmptyContactEmails = trimmedContactEmails.filter((value) => value);
    if (nonEmptyContactEmails.length > 0) {
      payload.contact_emails = nonEmptyContactEmails;
    }

    const nonEmptyDocumentsRequired = trimmedDocumentsRequired.filter((value) => value);
    if (nonEmptyDocumentsRequired.length > 0) {
      payload.documents_required = nonEmptyDocumentsRequired;
    }

    const nonEmptyMapResources = trimmedMapResourcesUrls.filter((value) => value);
    if (nonEmptyMapResources.length > 0) {
      payload.map_resources_urls = nonEmptyMapResources;
    }

    if (trimmedCommunicationsNotes.length > 0) {
      payload.communications_infrastructure = trimmedCommunicationsNotes;
    }

    const nonEmptyActivityEquipment = trimmedActivityEquipment.filter((value) => value);
    if (nonEmptyActivityEquipment.length > 0) {
      payload.activity_equipment = nonEmptyActivityEquipment;
    }

    if (structurePaymentMethods.length > 0) {
      payload.payment_methods = [...structurePaymentMethods];
    }

    if (trimmedNotesLogistics) {
      payload.notes_logistics = trimmedNotesLogistics;
    }

    if (trimmedNotes) {
      payload.notes = trimmedNotes;
    }

    payload.wheelchair_accessible = wheelchairAccessible;
    payload.step_free_access = stepFreeAccess;
    const parsedPitchesTende = trimmedPitchesTende ? Number.parseInt(trimmedPitchesTende, 10) : null;
    const parsedParkingCarSlots = trimmedParkingCarSlots
      ? Number.parseInt(trimmedParkingCarSlots, 10)
      : null;
    const parsedParkingBusSlots = trimmedParkingBusSlots
      ? Number.parseInt(trimmedParkingBusSlots, 10)
      : null;

    payload.pitches_tende = parsedPitchesTende !== null && Number.isNaN(parsedPitchesTende)
      ? null
      : parsedPitchesTende;
    payload.parking_car_slots = parsedParkingCarSlots !== null && Number.isNaN(parsedParkingCarSlots)
      ? null
      : parsedParkingCarSlots;
    payload.parking_bus_slots = parsedParkingBusSlots !== null && Number.isNaN(parsedParkingBusSlots)
      ? null
      : parsedParkingBusSlots;
    payload.parking_notes = trimmedParkingNotes || null;
    payload.accessibility_notes = trimmedAccessibilityNotes || null;

    const normalizedAudiences = trimmedAllowedAudiences.filter((value) => value.length > 0);
    payload.allowed_audiences = normalizedAudiences;

    if (trimmedUsageRules) {
      payload.usage_rules = trimmedUsageRules;
    } else {
      payload.usage_rules = null;
    }

    payload.in_area_protetta = inAreaProtetta;
    if (inAreaProtetta === true) {
      payload.ente_area_protetta = trimmedEnteAreaProtetta || null;
    } else {
      payload.ente_area_protetta = null;
    }
    payload.environmental_notes = trimmedEnvironmentalNotes || null;
    if (floodRisk) {
      payload.flood_risk = floodRisk as FloodRiskLevel;
    } else {
      payload.flood_risk = null;
    }

    if (seasonalAmenities.length > 0) {
      const amenities = seasonalAmenities.reduce<Record<string, unknown>>((acc, row) => {
        const key = row.key.trim();
        const valueText = row.value.trim();
        if (!key || !valueText) {
          return acc;
        }
        try {
          acc[key] = JSON.parse(valueText);
        } catch {
          acc[key] = valueText;
        }
        return acc;
      }, {});
      payload.seasonal_amenities = Object.keys(amenities).length > 0 ? amenities : {};
    } else {
      payload.seasonal_amenities = {};
    }

    payload.open_periods = openPeriods.map((period): StructureOpenPeriodInput => {
      const base: StructureOpenPeriodInput = { kind: period.kind };
      if (period.id !== undefined) {
        base.id = period.id;
      }
      if (period.kind === "season") {
        base.season = period.season ? (period.season as StructureOpenPeriodSeason) : undefined;
      } else {
        base.date_start = period.dateStart || undefined;
        base.date_end = period.dateEnd || undefined;
      }
      const trimmedNotesValue = period.notes.trim();
      if (trimmedNotesValue) {
        base.notes = trimmedNotesValue;
      }
      if (period.units.length > 0) {
        base.units = period.units as Unit[];
      }
      return base;
    });

    const costOptionPayloads: StructureCostOptionInput[] = trimmedCostOptions
      .map((option) => {
        const hasMeaningfulPaymentMethods = option.paymentMethods.some(
          (method) => method !== defaultPaymentMethod
        );
        const isEmpty =
          !hasMeaningfulPaymentMethods &&
          !option.model &&
          !option.amount &&
          !option.bookingDeposit &&
          !option.damageDeposit &&
          !option.cityTaxPerNight &&
          !option.utilitiesFlat &&
          !option.minTotal &&
          !option.maxTotal &&
          !option.forfaitTrigger &&
          !option.utilitiesNotes &&
          !option.paymentTerms &&
          option.utilitiesIncluded === "";
        if (isEmpty) {
          return null;
        }
        const amountValue = Number.parseFloat(option.amount.replace(",", "."));
        const currencyValue = option.currency ? option.currency.toUpperCase() : "EUR";
        const payloadItem: StructureCostOptionInput = {
          model: option.model as CostModel,
          amount: amountValue,
          currency: currencyValue
        };
        if (option.id !== undefined) {
          payloadItem.id = option.id;
        }
        const parseOptional = (value: string) => {
          if (!value) {
            return null;
          }
          return Number.parseFloat(value.replace(",", "."));
        };
        const bookingDepositValue = parseOptional(option.bookingDeposit);
        if (bookingDepositValue !== null) {
          payloadItem.booking_deposit = bookingDepositValue;
        }
        const damageDepositValue = parseOptional(option.damageDeposit);
        if (damageDepositValue !== null) {
          payloadItem.damage_deposit = damageDepositValue;
        }
        const cityTaxValue = parseOptional(option.cityTaxPerNight);
        if (cityTaxValue !== null) {
          payloadItem.city_tax_per_night = cityTaxValue;
        }
        const utilitiesValue = parseOptional(option.utilitiesFlat);
        if (utilitiesValue !== null) {
          payloadItem.utilities_flat = utilitiesValue;
        }
        if (option.utilitiesIncluded === "yes") {
          payloadItem.utilities_included = true;
        } else if (option.utilitiesIncluded === "no") {
          payloadItem.utilities_included = false;
        }
        const trimmedUtilitiesNotes = option.utilitiesNotes.trim();
        if (trimmedUtilitiesNotes) {
          payloadItem.utilities_notes = trimmedUtilitiesNotes;
        }
        const minTotalValue = parseOptional(option.minTotal);
        if (minTotalValue !== null) {
          payloadItem.min_total = minTotalValue;
        }
        const maxTotalValue = parseOptional(option.maxTotal);
        if (maxTotalValue !== null) {
          payloadItem.max_total = maxTotalValue;
        }
        const forfaitTriggerValue = parseOptional(option.forfaitTrigger);
        if (forfaitTriggerValue !== null) {
          payloadItem.forfait_trigger_total = forfaitTriggerValue;
        }
        const paymentMethods = option.paymentMethods.filter((entry): entry is PaymentMethod =>
          isValidPaymentMethodValue(entry)
        );
        if (paymentMethods.length > 0) {
          payloadItem.payment_methods = paymentMethods;
        }
        const trimmedPaymentTerms = option.paymentTerms.trim();
        if (trimmedPaymentTerms) {
          payloadItem.payment_terms = trimmedPaymentTerms;
        }
        const modifierPayloads: StructureCostModifierInput[] = option.modifiers
          .map((modifier) => {
            if (!modifier.season || !modifier.amount) {
              return null;
            }
            const modifierValue = Number.parseFloat(modifier.amount.replace(",", "."));
            if (Number.isNaN(modifierValue) || modifierValue <= 0) {
              return null;
            }
            const payloadModifier: StructureCostModifierInput = {
              kind: modifier.kind,
              amount: modifierValue,
              season: modifier.season as StructureOpenPeriodSeason,
            };
            if (modifier.id !== undefined) {
              payloadModifier.id = modifier.id;
            }
            return payloadModifier;
          })
          .filter((item): item is StructureCostModifierInput => item !== null);
        if (modifierPayloads.length > 0) {
          payloadItem.modifiers = modifierPayloads;
        } else if (option.hadModifiers) {
          payloadItem.modifiers = [];
        }
        return payloadItem;
      })
      .filter((item): item is StructureCostOptionInput => item !== null);

    try {
      const saved = await saveMutation.mutateAsync(payload);

      if (Array.isArray(saved.warnings) && saved.warnings.length > 0) {
        const formatted = saved.warnings.map((url) => `• ${url}`).join("\n");
        window.alert(
          t("structures.create.warnings.websiteUnreachable", {
            count: saved.warnings.length,
            urls: formatted
          })
        );
      }

      const shouldUpsertCostOptions = isEditing || costOptionPayloads.length > 0;
      if (shouldUpsertCostOptions) {
        try {
          await upsertStructureCostOptions(saved.id, costOptionPayloads);
        } catch (costError) {
          console.error("Unable to save structure cost options", costError);
          window.alert(t("structures.create.costs.saveFailed"));
        }
      }

        if (addContact && (contactHasDetails() || contactId !== null)) {
          try {
            await createStructureContact(saved.id, buildContactPayload());
          } catch (contactError) {
            console.error(contactError);
            window.alert(t("structures.create.contact.saveFailed"));
          }
        }

      try {
        await uploadQueuedPhotos(saved.id);
      } catch (photoUploadError) {
        console.error("Unable to upload structure photos", photoUploadError);
        window.alert(t("structures.create.photos.uploadFailed"));
      }

      try {
        await uploadQueuedAttachments(saved.id);
      } catch (attachmentUploadError) {
        console.error("Unable to upload structure attachments", attachmentUploadError);
        window.alert(t("structures.create.attachments.uploadFailed"));
      }

      try {
        await uploadMapResourceAttachments(saved.id);
      } catch (mapAttachmentError) {
        console.error("Unable to upload structure map resources", mapAttachmentError);
        window.alert(t("structures.create.mapResources.uploadFailed"));
      }

      try {
        await uploadDocumentAttachments(saved.id);
      } catch (documentAttachmentError) {
        console.error("Unable to upload required documents", documentAttachmentError);
        window.alert(t("structures.create.documentsRequired.uploadFailed"));
      }

      await queryClient.invalidateQueries({ queryKey: ["structures"] });
      if (isEditing && editingSlug) {
        await queryClient.invalidateQueries({ queryKey: ["structure", editingSlug] });
        if (saved.slug !== editingSlug) {
          await queryClient.invalidateQueries({ queryKey: ["structure", saved.slug] });
        }
      }

      navigate(`/structures/${saved.slug}`);
    } catch (error) {
      const fallbackKey = isEditing
        ? "structures.edit.errors.saveFailed"
        : "structures.create.errors.saveFailed";
      const fallbackMessage = t(fallbackKey);
      if (error instanceof ApiError) {
        if (typeof error.body === "object" && error.body !== null && "detail" in error.body) {
          const detail = (error.body as { detail?: unknown }).detail;
          setApiError(detail ? String(detail) : fallbackMessage);
        } else if (error.status === 0) {
          setApiError(error.message);
        } else {
          setApiError(fallbackMessage);
        }
      } else {
        setApiError(fallbackMessage);
      }
    }
  };

  const slugHintId = "structure-slug-hint";
  const slugPreviewId = "structure-slug-preview";

  const countryErrorId = fieldErrors.country ? "structure-country-error" : undefined;
  const provinceErrorId = fieldErrors.province ? "structure-province-error" : undefined;
  const postalCodeErrorId = fieldErrors.postal_code ? "structure-postal-code-error" : undefined;
  const latitudeErrorId = fieldErrors.latitude ? "structure-latitude-error" : undefined;
  const longitudeErrorId = fieldErrors.longitude ? "structure-longitude-error" : undefined;
  const altitudeErrorId = fieldErrors.altitude ? "structure-altitude-error" : undefined;
  const nameErrorId = fieldErrors.name ? "structure-name-error" : undefined;
  const nameDescribedBy = [slugHintId, slugPreviewId, nameErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const typeErrorId = fieldErrors.type ? "structure-type-error" : undefined;
  const dataQualityStatusErrorId = fieldErrors.data_quality_status
    ? "structure-data-quality-status-error"
    : undefined;
  const indoorBedsErrorId = fieldErrors.indoor_beds ? "structure-indoor-beds-error" : undefined;
  const indoorBathroomsErrorId = fieldErrors.indoor_bathrooms
    ? "structure-indoor-bathrooms-error"
    : undefined;
  const indoorShowersErrorId = fieldErrors.indoor_showers
    ? "structure-indoor-showers-error"
    : undefined;
  const indoorActivityRoomsErrorId = fieldErrors.indoor_activity_rooms
    ? "structure-indoor-activity-rooms-error"
    : undefined;
  const landAreaErrorId = fieldErrors.land_area_m2 ? "structure-land-area-error" : undefined;
  const contactEmailsErrorId = fieldErrors.contact_emails
    ? "structure-contact-emails-error"
    : undefined;
  const websiteErrorId = fieldErrors.website_urls ? "structure-website-url-error" : undefined;
  const usageRecommendationErrorId = fieldErrors.usage_recommendation
    ? "structure-usage-recommendation-error"
    : undefined;
  const openPeriodsErrorId = fieldErrors.open_periods
    ? "structure-open-periods-error"
    : undefined;

  const typeHintId = "structure-type-hint";
  const typeDescribedBy = [typeHintId, typeErrorId].filter(Boolean).join(" ") || undefined;
  const dataQualityStatusHintId = "structure-data-quality-status-hint";
  const dataQualityStatusDescribedBy =
    [dataQualityStatusHintId, dataQualityStatusErrorId].filter(Boolean).join(" ") || undefined;
  const operationalStatusHintId = "structure-operational-status-hint";
  const operationalStatusDescribedBy = operationalStatusHintId;
  const countryHintId = "structure-country-hint";
  const countryDescribedBy = [countryHintId, countryErrorId].filter(Boolean).join(" ") || undefined;
  const provinceHintId = "structure-province-hint";
  const provinceDescribedBy = [provinceHintId, provinceErrorId].filter(Boolean).join(" ") || undefined;
  const municipalityHintId = "structure-municipality-hint";
  const localityHintId = "structure-locality-hint";
  const addressHintId = "structure-address-hint";
  const postalCodeHintId = "structure-postal-code-hint";
  const postalCodeDescribedBy = [postalCodeHintId, postalCodeErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const latitudeHintId = "structure-latitude-hint";
  const latitudeDescribedBy = [latitudeHintId, latitudeErrorId].filter(Boolean).join(" ") || undefined;
  const longitudeHintId = "structure-longitude-hint";
  const longitudeDescribedBy = [longitudeHintId, longitudeErrorId].filter(Boolean).join(" ") || undefined;
  const altitudeHintId = "structure-altitude-hint";
  const altitudeDescribedBy = [altitudeHintId, altitudeErrorId].filter(Boolean).join(" ") || undefined;
  const indoorBedsHintId = "structure-indoor-beds-hint";
  const indoorBedsDescribedBy = [indoorBedsHintId, indoorBedsErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const indoorBathroomsHintId = "structure-indoor-bathrooms-hint";
  const indoorBathroomsDescribedBy = [indoorBathroomsHintId, indoorBathroomsErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const indoorShowersHintId = "structure-indoor-showers-hint";
  const indoorShowersDescribedBy = [indoorShowersHintId, indoorShowersErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const indoorActivityRoomsHintId = "structure-indoor-activity-rooms-hint";
  const indoorActivityRoomsDescribedBy = [
    indoorActivityRoomsHintId,
    indoorActivityRoomsErrorId
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const landAreaHintId = "structure-land-area-hint";
  const landAreaDescribedBy = [landAreaHintId, landAreaErrorId].filter(Boolean).join(" ") || undefined;
  const fieldSlopeHintId = "structure-field-slope-hint";
  const pitchesTendeHintId = "structure-pitches-tende-hint";
  const waterAtFieldHintId = "structure-water-at-field-hint";
  const waterSourcesLabelId = "structure-water-sources-label";
  const waterSourcesHintId = "structure-water-sources-hint";
  const waterSourcesOptionIdPrefix = "structure-water-source";
  const wheelchairHintId = "structure-wheelchair-hint";
  const stepFreeHintId = "structure-step-free-hint";
  const parkingCarHintId = "structure-parking-car-hint";
  const parkingBusHintId = "structure-parking-bus-hint";
  const parkingNotesHintId = "structure-parking-notes-hint";
  const accessibilityNotesHintId = "structure-accessibility-notes-hint";
  const contactEmailsHintId = "structure-contact-emails-hint";
  const contactEmailsDescribedBy =
    [contactEmailsHintId, contactEmailsErrorId].filter(Boolean).join(" ") || undefined;
  const websiteHintId = "structure-website-hint";
  const websiteDescribedBy = [websiteHintId, websiteErrorId].filter(Boolean).join(" ") || undefined;
  const allowedAudiencesHintId = "structure-allowed-audiences-hint";
  const allowedAudiencesDescribedBy = allowedAudiencesHintId;
  const firstAllowedAudienceInputId =
    allowedAudiences.length > 0 ? "structure-allowed-audience-0" : undefined;
  const allowedAudiencesAddButtonId = "structure-allowed-audience-add";
  const allowedAudiencesLabelFor = firstAllowedAudienceInputId ?? allowedAudiencesAddButtonId;
  const documentsRequiredHintId = "structure-documents-required-hint";
  const documentsRequiredDescribedBy = documentsRequiredHintId;
  const mapResourcesHintId = "structure-map-resources-hint";
  const mapResourcesDescribedBy = mapResourcesHintId;
  const activityEquipmentHintId = "structure-activity-equipment-hint";
  const activityEquipmentDescribedBy = activityEquipmentHintId;
  const firstActivityEquipmentInputId =
    activityEquipment.length > 0 ? "structure-activity-equipment-0" : undefined;
  const activityEquipmentAddButtonId = "structure-activity-equipment-add";
  const activityEquipmentLabelFor = firstActivityEquipmentInputId ?? activityEquipmentAddButtonId;
  const paymentMethodsLabelId = "structure-payment-methods-label";
  const paymentMethodsHintId = "structure-payment-methods-hint";
  const usageRecommendationHintId = "structure-usage-recommendation-hint";
  const usageRecommendationDescribedBy = [
    usageRecommendationHintId,
    usageRecommendationErrorId
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const usageRulesHintId = "structure-usage-rules-hint";
  const inAreaProtettaHintId = "structure-in-area-protetta-hint";
  const enteAreaProtettaHintId = "structure-ente-area-protetta-hint";
  const floodRiskHintId = "structure-flood-risk-hint";
  const environmentalNotesHintId = "structure-environmental-notes-hint";
  const seasonalAmenitiesHintId = "structure-seasonal-amenities-hint";
  const openPeriodsHintId = "structure-open-periods-hint";
  const openPeriodsDescribedBy = [openPeriodsHintId, openPeriodsErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const costOptionsErrorId = fieldErrors.cost_options ? "structure-cost-options-error" : undefined;
  const costOptionsHintId = "structure-cost-options-hint";
  const costOptionsDescribedBy = [costOptionsHintId, costOptionsErrorId]
    .filter(Boolean)
    .join(" ") || undefined;

  const showIndoorSection = type !== "land";
  const showOutdoorSection = type !== "house";

  const trimmedSlug = slug.trim();

  const headingTitleKey = isEditing ? "structures.edit.title" : "structures.create.title";
  const headingDescriptionKey = isEditing
    ? "structures.edit.description"
    : "structures.create.description";

  const slugPreviewMessage = trimmedSlug
    ? t("structures.create.form.slugPreviewLabel", { url: `/structures/${trimmedSlug}` })
    : t("structures.create.form.slugPreviewPlaceholder");

  if (isEditing && !editingSlug) {
    return (
      <section>
        <div className="card">
          <h2>{t("structures.edit.notFoundTitle")}</h2>
          <p>{t("structures.edit.notFoundDescription")}</p>
          <Link to="/structures">{t("structures.edit.backToList")}</Link>
        </div>
      </section>
    );
  }

  if (isEditing && (isStructureLoading || !isPrefilled)) {
    return (
      <section>
        <div className="card" role="status" aria-live="polite">
          <p>{t("structures.edit.loading")}</p>
        </div>
      </section>
    );
  }

  if (isEditing && isStructureError) {
    if (structureError instanceof ApiError && structureError.status === 404) {
      return (
        <section>
          <div className="card">
            <h2>{t("structures.edit.notFoundTitle")}</h2>
            <p>{t("structures.edit.notFoundDescription")}</p>
            <Link to="/structures">{t("structures.edit.backToList")}</Link>
          </div>
        </section>
      );
    }

    return (
      <section>
        <div className="card">
          <h2>{t("structures.edit.loadErrorTitle")}</h2>
          <p>{t("structures.edit.loadErrorDescription")}</p>
          <Link to="/structures">{t("structures.edit.backToList")}</Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="structure-create-title" className="structure-create">
      <div className="structure-create-grid">
        <Surface className="structure-create-card">
          <SectionHeader className="structure-create-header">
            <h2 id="structure-create-title">{t(headingTitleKey)}</h2>
            <p className="helper-text">{t(headingDescriptionKey)}</p>
          </SectionHeader>
          <form className="structure-form" onSubmit={handleSubmit} noValidate>
            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.general.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.general.description")}
              </p>
              <div className="structure-field-grid structure-general-grid">
                <div className="structure-form-field structure-form-field--highlight" data-span="full">
                  <label htmlFor="structure-name">
                    {t("structures.create.form.name")}
                    <input
                      id="structure-name"
                      value={name}
                      onChange={handleNameChange}
                      autoComplete="off"
                      placeholder={t("structures.create.form.namePlaceholder")}
                      required
                      aria-invalid={fieldErrors.name ? "true" : undefined}
                      aria-describedby={nameDescribedBy}
                    />
                  </label>
                  {fieldErrors.name && (
                    <p className="error-text" id={nameErrorId!}>
                      {fieldErrors.name}
                    </p>
                  )}
                  <div
                    className="structure-form-footnote"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span className="helper-text" id={slugHintId}>
                      {t("structures.create.form.slugHint")}
                    </span>
                    <span className="helper-text slug-preview" id={slugPreviewId}>
                      {slugPreviewMessage}
                    </span>
                  </div>
                </div>

                <div className="structure-form-field structure-form-field--card">
                  <label htmlFor="structure-type">
                    {t("structures.create.form.type")}
                    <select
                      id="structure-type"
                      value={type}
                      onChange={handleTypeChange}
                      aria-invalid={fieldErrors.type ? "true" : undefined}
                      aria-describedby={typeDescribedBy}
                    >
                      <option value="">{t("structures.create.form.typePlaceholder")}</option>
                      {structureTypes.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.types.${option}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="helper-text" id={typeHintId}>
                    {t("structures.create.form.typeHint")}
                  </span>
                  {fieldErrors.type && (
                    <p className="error-text" id={typeErrorId!}>
                      {fieldErrors.type}
                    </p>
                  )}
                </div>

                <div className="structure-form-field structure-form-field--card">
                  <label htmlFor="structure-operational-status">
                    {t("structures.create.form.operationalStatus")}
                    <select
                      id="structure-operational-status"
                      value={operationalStatus}
                      onChange={handleOperationalStatusChange}
                      aria-describedby={operationalStatusDescribedBy}
                    >
                      <option value="">
                        {t("structures.create.form.operationalStatusPlaceholder")}
                      </option>
                      {operationalStatusOptions.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.create.form.operationalStatusOptions.${option}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="helper-text" id={operationalStatusHintId}>
                    {t("structures.create.form.operationalStatusHint")}
                  </span>
                </div>

                <div className="structure-form-field structure-form-field--card">
                  <label htmlFor="structure-usage-recommendation">
                    {t("structures.create.form.usageRecommendation.label")}
                    <select
                      id="structure-usage-recommendation"
                      value={usageRecommendation}
                      onChange={handleUsageRecommendationChange}
                      aria-describedby={usageRecommendationDescribedBy}
                      aria-invalid={usageRecommendationErrorId ? "true" : undefined}
                    >
                      <option value="">
                        {t("structures.create.form.usageRecommendation.placeholder")}
                      </option>
                      {usageRecommendationOptions.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.create.form.usageRecommendation.options.${option}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="helper-text" id={usageRecommendationHintId}>
                    {t("structures.create.form.usageRecommendation.hint")}
                  </span>
                  {usageRecommendationErrorId && (
                    <p className="error-text" id={usageRecommendationErrorId}>
                      {fieldErrors.usage_recommendation}
                    </p>
                  )}
                </div>

                <div className="structure-form-field structure-form-field--card">
                  <label htmlFor="structure-data_quality_status">
                    {t("structures.create.form.dataQualityStatus.label")}
                    <select
                      id="structure-data_quality_status"
                      value={dataQualityStatus}
                      onChange={handleDataQualityStatusChange}
                      required
                      aria-invalid={
                        fieldErrors.data_quality_status ? "true" : undefined
                      }
                      aria-describedby={dataQualityStatusDescribedBy}
                    >
                      <option value="">
                        {t("structures.create.form.dataQualityStatus.placeholder")}
                      </option>
                      <option value="verified">
                        {t("structures.create.form.dataQualityStatus.options.verified")}
                      </option>
                      <option value="unverified">
                        {t("structures.create.form.dataQualityStatus.options.unverified")}
                      </option>
                    </select>
                  </label>
                  <span className="helper-text" id={dataQualityStatusHintId}>
                    {t("structures.create.form.dataQualityStatus.hint")}
                  </span>
                  {dataQualityStatusErrorId && (
                    <p className="error-text" id={dataQualityStatusErrorId}>
                      {fieldErrors.data_quality_status}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.location.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.location.description")}
              </p>
              <div className="structure-location-layout">
                <section className="structure-location-panel structure-location-panel--combined">
                  <header className="structure-location-panel__header">
                    <h3 className="structure-location-panel__title">
                      {t("structures.create.form.location.detailsTitle")}
                    </h3>
                    <p className="helper-text structure-location-panel__description">
                      {t("structures.create.form.location.detailsDescription")}
                    </p>
                  </header>
                  <div className="structure-location-panel__groups">
                    <div className="structure-location-panel__group">
                      <div className="structure-location-panel__group-header">
                        <h4 className="structure-location-panel__group-title">
                          {t("structures.create.form.location.addressGroupTitle")}
                        </h4>
                        <p className="helper-text structure-location-panel__group-description">
                          {t("structures.create.form.location.addressGroupDescription")}
                        </p>
                      </div>
                      <div className="structure-location-panel__fields structure-field-grid">
                        <div className="structure-form-field">
                          <label htmlFor="structure-country">
                            {t("structures.create.form.country")}
                            <input
                              id="structure-country"
                              value={country}
                              onChange={handleCountryChange}
                              autoComplete="off"
                              maxLength={2}
                              placeholder={t("structures.create.form.countryPlaceholder")}
                              aria-invalid={fieldErrors.country ? "true" : undefined}
                              aria-describedby={countryDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={countryHintId}>
                            {t("structures.create.form.countryHint")}
                          </span>
                          {fieldErrors.country && (
                            <p className="error-text" id={countryErrorId!}>
                              {fieldErrors.country}
                            </p>
                          )}
                        </div>

                        <div className="structure-form-field">
                          <label htmlFor="structure-province">
                            {t("structures.create.form.province")}
                            <input
                              id="structure-province"
                              value={province}
                              onChange={handleProvinceChange}
                              autoComplete="off"
                              maxLength={2}
                              placeholder={t("structures.create.form.provincePlaceholder")}
                              aria-invalid={fieldErrors.province ? "true" : undefined}
                              aria-describedby={provinceDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={provinceHintId}>
                            {t("structures.create.form.provinceHint")}
                          </span>
                          {fieldErrors.province && (
                            <p className="error-text" id={provinceErrorId}>
                              {fieldErrors.province}
                            </p>
                          )}
                        </div>

                        <div className="structure-form-field">
                          <label htmlFor="structure-postal-code">
                            {t("structures.create.form.postalCode")}
                            <input
                              id="structure-postal-code"
                              value={postalCode}
                              onChange={handlePostalCodeChange}
                              maxLength={16}
                              placeholder={t("structures.create.form.postalCodePlaceholder")}
                              aria-invalid={fieldErrors.postal_code ? "true" : undefined}
                              aria-describedby={postalCodeDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={postalCodeHintId}>
                            {t("structures.create.form.postalCodeHint")}
                          </span>
                          {fieldErrors.postal_code && (
                            <p className="error-text" id={postalCodeErrorId!}>
                              {fieldErrors.postal_code}
                            </p>
                          )}
                        </div>

                        <div className="structure-form-field">
                          <label htmlFor="structure-municipality">
                            {t("structures.create.form.municipality")}
                            <input
                              id="structure-municipality"
                              value={municipality}
                              onChange={handleMunicipalityChange}
                              placeholder={t("structures.create.form.municipalityPlaceholder")}
                              aria-describedby={municipalityHintId}
                            />
                          </label>
                          <span className="helper-text" id={municipalityHintId}>
                            {t("structures.create.form.municipalityHint")}
                          </span>
                        </div>

                        <div className="structure-form-field">
                          <label htmlFor="structure-locality">
                            {t("structures.create.form.locality")}
                            <input
                              id="structure-locality"
                              value={locality}
                              onChange={handleLocalityChange}
                              placeholder={t("structures.create.form.localityPlaceholder")}
                              aria-describedby={localityHintId}
                            />
                          </label>
                          <span className="helper-text" id={localityHintId}>
                            {t("structures.create.form.localityHint")}
                          </span>
                        </div>

                        <div className="structure-form-field" data-span="full">
                          <label htmlFor="structure-address">
                            {t("structures.create.form.address")}
                            <textarea
                              id="structure-address"
                              value={address}
                              onChange={handleAddressChange}
                              rows={3}
                              placeholder={t("structures.create.form.addressPlaceholder")}
                              aria-describedby={addressHintId}
                            />
                          </label>
                          <span className="helper-text" id={addressHintId}>
                            {t("structures.create.form.addressHint")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="structure-location-panel__group">
                      <div className="structure-location-panel__group-header">
                        <h4 className="structure-location-panel__group-title">
                          {t("structures.create.form.location.coordinatesGroupTitle")}
                        </h4>
                        <p className="helper-text structure-location-panel__group-description">
                          {t("structures.create.form.location.coordinatesGroupDescription")}
                        </p>
                      </div>
                      <div className="structure-location-panel__fields structure-field-grid">
                        <div className="structure-form-field">
                          <label htmlFor="structure-latitude">
                            {t("structures.create.form.latitude")}
                            <input
                              id="structure-latitude"
                              value={latitude}
                              onChange={handleLatitudeChange}
                              inputMode="decimal"
                              step="any"
                              aria-invalid={fieldErrors.latitude ? "true" : undefined}
                              aria-describedby={latitudeDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={latitudeHintId}>
                            {t("structures.create.form.coordinatesHint")}
                          </span>
                          {fieldErrors.latitude && (
                            <p className="error-text" id={latitudeErrorId}>
                              {fieldErrors.latitude}
                            </p>
                          )}
                        </div>

                        <div className="structure-form-field">
                          <label htmlFor="structure-longitude">
                            {t("structures.create.form.longitude")}
                            <input
                              id="structure-longitude"
                              value={longitude}
                              onChange={handleLongitudeChange}
                              inputMode="decimal"
                              step="any"
                              aria-invalid={fieldErrors.longitude ? "true" : undefined}
                              aria-describedby={longitudeDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={longitudeHintId}>
                            {t("structures.create.form.coordinatesHint")}
                          </span>
                          {fieldErrors.longitude && (
                            <p className="error-text" id={longitudeErrorId}>
                              {fieldErrors.longitude}
                            </p>
                          )}
                        </div>
                        <div className="structure-form-field">
                          <label htmlFor="structure-altitude">
                            {t("structures.create.form.altitude")}
                            <input
                              id="structure-altitude"
                              value={altitude}
                              onChange={handleAltitudeChange}
                              inputMode="decimal"
                              step="any"
                              aria-invalid={fieldErrors.altitude ? "true" : undefined}
                              aria-describedby={altitudeDescribedBy}
                            />
                          </label>
                          <span className="helper-text" id={altitudeHintId}>
                            {t("structures.create.form.altitudeHint")}
                          </span>
                          {fieldErrors.altitude && (
                            <p className="error-text" id={altitudeErrorId}>
                              {fieldErrors.altitude}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="structure-location-panel structure-location-panel--map">
                  <header className="structure-location-panel__header">
                    <h3 className="structure-location-panel__title">
                      {t("structures.create.form.location.mapPanelTitle")}
                    </h3>
                    <p className="helper-text structure-location-panel__description">
                      {t("structures.create.form.location.mapPanelDescription")}
                    </p>
                  </header>
                  <div className="structure-map-panel">
                    <div className="structure-map-field">
                      <span className="structure-map-field-title">
                        {t("structures.create.form.map.title")}
                      </span>
                      <div className="structure-map-search" aria-live="polite">
                        <div className="structure-map-search__form" role="search">
                          <label htmlFor="structure-map-search-input">
                            {t("structures.create.form.map.searchLabel")}
                          </label>
                          <div className="structure-map-search__controls">
                            <input
                              id="structure-map-search-input"
                              ref={mapSearchInputRef}
                              value={mapSearchQuery}
                              onChange={handleMapSearchInputChange}
                              onKeyDown={handleMapSearchKeyDown}
                              placeholder={t("structures.create.form.map.searchPlaceholder")}
                              autoComplete="off"
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={mapSearchStatus === "loading" || !mapSearchQuery.trim()}
                              onClick={handleMapSearchSubmit}
                            >
                              {t("structures.create.form.map.searchButton")}
                            </Button>
                          </div>
                        </div>
                        {mapSearchStatus === "loading" && (
                          <p className="structure-map-search__status" role="status">
                            {t("structures.create.form.map.searching")}
                          </p>
                        )}
                        {mapSearchStatus === "error" && mapSearchError && (
                          <p className="structure-map-search__status structure-map-search__status--error" role="alert">
                            {mapSearchError}
                          </p>
                        )}
                        {mapSearchStatus === "success" && mapSearchResults.length === 0 && mapSearchLastQuery && (
                          <p className="structure-map-search__status">
                            {t("structures.create.form.map.searchNoResults", { query: mapSearchLastQuery })}
                          </p>
                        )}
                        {mapSearchResults.length > 0 && (
                          <div className="structure-map-search__results" ref={mapSearchResultsRef}>
                            <p className="structure-map-search__results-title">
                              {t("structures.create.form.map.searchResultsTitle")}
                            </p>
                            <ul className="structure-map-search__list" role="list">
                              {mapSearchResults.map((result, index) => (
                                <li key={`${result.latitude}-${result.longitude}-${index}`}>
                                  <div className="structure-map-search__result">
                                    <div className="structure-map-search__result-details">
                                      <span className="structure-map-search__result-label">{result.label}</span>
                                      <span className="structure-map-search__result-coords">
                                        {result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}
                                      </span>
                                      {typeof result.altitude === "number" &&
                                        Number.isFinite(result.altitude) && (
                                          <span className="structure-map-search__result-altitude">
                                            {t("structures.create.form.geocoding.suggestionAltitude", {
                                              alt: Math.round(result.altitude)
                                            })}
                                          </span>
                                        )}
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="structure-map-search__result-action"
                                      onClick={() => handleMapSearchSelect(result)}
                                    >
                                      {t("structures.create.form.map.searchSelect")}
                                    </Button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <MapTypeToggle
                        mapType={mapType}
                        onChange={setMapType}
                        label={mapTypeLabels.label}
                        optionLabels={{ roadmap: mapTypeLabels.roadmap, satellite: mapTypeLabels.satellite }}
                      />
                      <GoogleMapEmbed
                        coordinates={selectedCoordinates}
                        title={t("structures.create.form.map.title")}
                        ariaLabel={t("structures.create.form.map.ariaLabel")}
                        emptyLabel={t("structures.create.form.map.empty")}
                        mapType={mapType}
                        onCoordinatesChange={handleMapCoordinatesChange}
                      />
                      <span className="helper-text">
                        {t("structures.create.form.map.hint")}
                      </span>
                      {geocodingStatus === "loading" && (
                        <span className="structure-geocode-status">
                          {t("structures.create.form.geocoding.searching")}
                        </span>
                      )}
                      {geocodingStatus === "error" && (
                        <p className="structure-geocode-status structure-geocode-status__message structure-geocode-status__message--error">
                          {geocodingError ?? t("structures.create.form.geocoding.error")}
                        </p>
                      )}
                      {geocodingSuggestion && (
                        <div className="structure-geocode-status structure-geocode-status__suggestion">
                          <span>
                            {t("structures.create.form.geocoding.suggestion", {
                              label: geocodingSuggestion.label
                            })}
                          </span>
                          <span className="structure-geocode-status__coords">
                            {geocodingSuggestion.latitude.toFixed(6)}, {" "}
                            {geocodingSuggestion.longitude.toFixed(6)}
                          </span>
                          {typeof geocodingSuggestion.altitude === "number" &&
                            Number.isFinite(geocodingSuggestion.altitude) && (
                              <span className="structure-geocode-status__coords">
                                {t("structures.create.form.geocoding.suggestionAltitude", {
                                  alt: Math.round(geocodingSuggestion.altitude)
                                })}
                              </span>
                            )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleApplyGeocodingSuggestion}
                          >
                            {t("structures.create.form.geocoding.apply")}
                          </Button>
                        </div>
                      )}
                      {automaticGeocodingMessage && (
                        <span className="structure-geocode-status structure-geocode-status__message structure-geocode-status__message--success">
                          {automaticGeocodingMessage}
                        </span>
                      )}
                      {manualCoordinatesMessage && (
                        <span className="structure-geocode-status structure-geocode-status__message">
                          {manualCoordinatesMessage}
                        </span>
                      )}
                      {manualAltitudeMessage && (
                        <span className="structure-geocode-status structure-geocode-status__message">
                          {manualAltitudeMessage}
                        </span>
                      )}
                      {selectedCoordinatesLabel && (
                        <span className="structure-map-field-selected helper-text">
                          {selectedCoordinatesLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              </div>
          </fieldset>

          {showIndoorSection && (
            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.indoor.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.indoor.description")}
              </p>
              <div className="structure-field-grid">
                  <div className="structure-form-field">
                    <label htmlFor="structure-indoor-beds">
                      {t("structures.create.form.indoorBeds")}
                      <input
                        id="structure-indoor-beds"
                        value={indoorBeds}
                        onChange={handleIndoorBedsChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={indoorBedsDescribedBy}
                        aria-invalid={fieldErrors.indoor_beds ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={indoorBedsHintId}>
                      {t("structures.create.form.indoorBedsHint")}
                    </span>
                    {fieldErrors.indoor_beds && (
                      <p className="error-text" id={indoorBedsErrorId!}>
                        {fieldErrors.indoor_beds}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-indoor-bathrooms">
                      {t("structures.create.form.indoorBathrooms")}
                      <input
                        id="structure-indoor-bathrooms"
                        value={indoorBathrooms}
                        onChange={handleIndoorBathroomsChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={indoorBathroomsDescribedBy}
                        aria-invalid={fieldErrors.indoor_bathrooms ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={indoorBathroomsHintId}>
                      {t("structures.create.form.indoorBathroomsHint")}
                    </span>
                    {fieldErrors.indoor_bathrooms && (
                      <p className="error-text" id={indoorBathroomsErrorId!}>
                        {fieldErrors.indoor_bathrooms}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-indoor-showers">
                      {t("structures.create.form.indoorShowers")}
                      <input
                        id="structure-indoor-showers"
                        value={indoorShowers}
                        onChange={handleIndoorShowersChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={indoorShowersDescribedBy}
                        aria-invalid={fieldErrors.indoor_showers ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={indoorShowersHintId}>
                      {t("structures.create.form.indoorShowersHint")}
                    </span>
                    {fieldErrors.indoor_showers && (
                      <p className="error-text" id={indoorShowersErrorId!}>
                        {fieldErrors.indoor_showers}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-indoor-activity-rooms">
                      {t("structures.create.form.indoorActivityRooms")}
                      <input
                        id="structure-indoor-activity-rooms"
                        value={indoorActivityRooms}
                        onChange={handleIndoorActivityRoomsChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={indoorActivityRoomsDescribedBy}
                        aria-invalid={fieldErrors.indoor_activity_rooms ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={indoorActivityRoomsHintId}>
                      {t("structures.create.form.indoorActivityRoomsHint")}
                    </span>
                    {fieldErrors.indoor_activity_rooms && (
                      <p className="error-text" id={indoorActivityRoomsErrorId!}>
                        {fieldErrors.indoor_activity_rooms}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-has-kitchen" className="tri-state-field__label">
                      {t("structures.create.form.hasKitchen")}
                    </label>
                    <TriStateToggle
                      id="structure-has-kitchen"
                      value={hasKitchen}
                      onChange={handleHasKitchenChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.hasKitchenHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-hot-water" className="tri-state-field__label">
                      {t("structures.create.form.hotWater")}
                    </label>
                    <TriStateToggle
                      id="structure-hot-water"
                      value={hotWater}
                      onChange={handleHotWaterChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.hotWaterHint")}
                    </span>
                  </div>
                </div>
              </fieldset>
            )}

            {showOutdoorSection && (
              <fieldset className="structure-form-section">
                <legend>{t("structures.create.form.sections.outdoor.title")}</legend>
                <p className="helper-text">
                  {t("structures.create.form.sections.outdoor.description")}
                </p>
                <div className="structure-field-grid">
                  <div className="structure-form-field">
                    <label htmlFor="structure-land-area">
                      {t("structures.create.form.landArea")}
                      <input
                        id="structure-land-area"
                        value={landArea}
                        onChange={handleLandAreaChange}
                        inputMode="decimal"
                        step="any"
                        aria-describedby={landAreaDescribedBy}
                        aria-invalid={fieldErrors.land_area_m2 ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={landAreaHintId}>
                      {t("structures.create.form.landAreaHint")}
                    </span>
                    {fieldErrors.land_area_m2 && (
                      <p className="error-text" id={landAreaErrorId!}>
                        {fieldErrors.land_area_m2}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-field-slope">
                      {t("structures.create.form.fieldSlope")}
                      <select
                        id="structure-field-slope"
                        value={fieldSlope}
                        onChange={handleFieldSlopeChange}
                        aria-describedby={fieldSlopeHintId}
                      >
                        <option value="">
                          {t("structures.create.form.fieldSlopePlaceholder")}
                        </option>
                        {fieldSlopeOptions.map((option) => (
                          <option key={option} value={option}>
                            {t(`structures.create.form.fieldSlopeOptions.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="helper-text" id={fieldSlopeHintId}>
                      {t("structures.create.form.fieldSlopeHint")}
                    </span>
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-pitches-tende">
                      {t("structures.create.form.pitchesTende")}
                      <input
                        id="structure-pitches-tende"
                        value={pitchesTende}
                        onChange={handlePitchesTendeChange}
                        inputMode="numeric"
                        aria-describedby={pitchesTendeHintId}
                      />
                    </label>
                    <span className="helper-text" id={pitchesTendeHintId}>
                      {t("structures.create.form.pitchesTendeHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-water-at-field" className="tri-state-field__label">
                      {t("structures.create.form.waterAtField")}
                    </label>
                    <TriStateToggle
                      id="structure-water-at-field"
                      value={waterAtField}
                      onChange={handleWaterAtFieldChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text" id={waterAtFieldHintId}>
                      {t("structures.create.form.waterAtFieldHint")}
                    </span>
                  </div>

                  <div className="structure-form-field">
                    <span className="field-label" id={waterSourcesLabelId}>
                      {t("structures.create.form.waterSource")}
                    </span>
                    <div
                      className="structure-checkbox-list"
                      role="group"
                      aria-labelledby={waterSourcesLabelId}
                      aria-describedby={waterSourcesHintId}
                    >
                      {waterSourceOptions.map((option) => {
                        const optionId = `${waterSourcesOptionIdPrefix}-${option}`;
                        return (
                          <label
                            key={option}
                            htmlFor={optionId}
                            className="structure-checkbox-list__option"
                          >
                            <input
                              id={optionId}
                              type="checkbox"
                              checked={waterSources.includes(option)}
                              onChange={(event) =>
                                handleWaterSourceToggle(option, event.target.checked)
                              }
                            />
                            <span>
                              {t(`structures.create.form.waterSourceOptions.${option}`)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <span className="helper-text" id={waterSourcesHintId}>
                      {t("structures.create.form.waterSourceHint")}
                    </span>
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-fire-policy">
                      {t("structures.create.form.firePolicy")}
                      <select
                        id="structure-fire-policy"
                        value={firePolicy}
                        onChange={handleFirePolicyChange}
                      >
                        <option value="">
                          {t("structures.create.form.firePolicyPlaceholder")}
                        </option>
                        {firePolicyOptions.map((option) => (
                          <option key={option} value={option}>
                            {t(`structures.create.form.firePolicyOptions.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="helper-text">
                      {t("structures.create.form.firePolicyHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-shelter-on-field" className="tri-state-field__label">
                      {t("structures.create.form.shelterOnField")}
                    </label>
                    <TriStateToggle
                      id="structure-shelter-on-field"
                      value={shelterOnField}
                      onChange={handleShelterOnFieldChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.shelterOnFieldHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-electricity-available" className="tri-state-field__label">
                      {t("structures.create.form.electricityAvailable")}
                    </label>
                    <TriStateToggle
                      id="structure-electricity-available"
                      value={electricityAvailable}
                      onChange={handleElectricityAvailableChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.electricityAvailableHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-has-field-poles" className="tri-state-field__label">
                      {t("structures.create.form.hasFieldPoles")}
                    </label>
                    <TriStateToggle
                      id="structure-has-field-poles"
                      value={hasFieldPoles}
                      onChange={handleHasFieldPolesChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.hasFieldPolesHint")}
                    </span>
                  </div>

                  <div className="structure-form-field tri-state-field">
                    <label htmlFor="structure-pit-latrine" className="tri-state-field__label">
                      {t("structures.create.form.pitLatrineAllowed")}
                    </label>
                    <TriStateToggle
                      id="structure-pit-latrine"
                      value={pitLatrineAllowed}
                      onChange={handlePitLatrineAllowedChange}
                      labels={triStateLabels}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.pitLatrineAllowedHint")}
                    </span>
                  </div>

                </div>
              </fieldset>
            )}

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.activityEquipment.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.activityEquipment.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <label htmlFor={activityEquipmentLabelFor} id="structure-activity-equipment-label">
                    {t("structures.create.form.activityEquipment.label")}
                  </label>
                  <div
                    className="structure-website-list"
                    aria-labelledby="structure-activity-equipment-label"
                  >
                    {activityEquipment.map((value, index) => {
                      const inputId = `structure-activity-equipment-${index}`;
                      const ariaLabel =
                        index === 0
                          ? undefined
                          : t("structures.create.form.activityEquipment.entryLabel", {
                              index: index + 1
                            });
                      return (
                        <div className="structure-website-list__row" key={inputId}>
                          <div className="structure-website-list__input">
                            <input
                              id={inputId}
                              value={value}
                              onChange={(event) =>
                                handleActivityEquipmentChange(index, event.target.value)
                              }
                              aria-describedby={activityEquipmentDescribedBy}
                              aria-label={ariaLabel}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveActivityEquipment(index)}
                            className="link-button"
                          >
                            {t("structures.create.form.activityEquipment.remove")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="structure-website-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      id={activityEquipmentAddButtonId}
                      onClick={handleAddActivityEquipment}
                    >
                      {t("structures.create.form.activityEquipment.add")}
                    </Button>
                  </div>
                  <span className="helper-text" id={activityEquipmentHintId}>
                    {t("structures.create.form.activityEquipment.hint")}
                  </span>
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.accessibility.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.accessibility.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-access-car" className="tri-state-field__label">
                    {t("structures.create.form.accessByCar")}
                  </label>
                  <TriStateToggle
                    id="structure-access-car"
                    value={accessByCar}
                    onChange={handleAccessByCarChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.accessByCarHint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-access-coach" className="tri-state-field__label">
                    {t("structures.create.form.accessByCoach")}
                  </label>
                  <TriStateToggle
                    id="structure-access-coach"
                    value={accessByCoach}
                    onChange={handleAccessByCoachChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.accessByCoachHint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-access-pt" className="tri-state-field__label">
                    {t("structures.create.form.accessByPublicTransport")}
                  </label>
                  <TriStateToggle
                    id="structure-access-pt"
                    value={accessByPublicTransport}
                    onChange={handleAccessByPublicTransportChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.accessByPublicTransportHint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-coach-turning-area" className="tri-state-field__label">
                    {t("structures.create.form.coachTurningArea")}
                  </label>
                  <TriStateToggle
                    id="structure-coach-turning-area"
                    value={coachTurningArea}
                    onChange={handleCoachTurningAreaChange}
                    labels={triStateLabels}
                  />
                </div>

                <TransportAccessPointsField
                  points={transportAccessPoints}
                  onChange={handleTransportAccessPointsChange}
                  selectedCoordinates={selectedCoordinates}
                  mapType={mapType}
                  onMapTypeChange={setMapType}
                  error={fieldErrors.transport_access_points}
                />

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-wheelchair-accessible" className="tri-state-field__label">
                    {t("structures.create.form.wheelchairAccessible")}
                  </label>
                  <TriStateToggle
                    id="structure-wheelchair-accessible"
                    value={wheelchairAccessible}
                    onChange={handleWheelchairAccessibleChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text" id={wheelchairHintId}>
                    {t("structures.create.form.wheelchairAccessibleHint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-step-free-access" className="tri-state-field__label">
                    {t("structures.create.form.stepFreeAccess")}
                  </label>
                  <TriStateToggle
                    id="structure-step-free-access"
                    value={stepFreeAccess}
                    onChange={handleStepFreeAccessChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text" id={stepFreeHintId}>
                    {t("structures.create.form.stepFreeAccessHint")}
                  </span>
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-parking-car-slots">
                    {t("structures.create.form.parkingCarSlots")}
                    <input
                      id="structure-parking-car-slots"
                      value={parkingCarSlots}
                      onChange={handleParkingCarSlotsChange}
                      inputMode="numeric"
                      aria-describedby={parkingCarHintId}
                    />
                  </label>
                  <span className="helper-text" id={parkingCarHintId}>
                    {t("structures.create.form.parkingCarSlotsHint")}
                  </span>
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-parking-bus-slots">
                    {t("structures.create.form.parkingBusSlots")}
                    <input
                      id="structure-parking-bus-slots"
                      value={parkingBusSlots}
                      onChange={handleParkingBusSlotsChange}
                      inputMode="numeric"
                      aria-describedby={parkingBusHintId}
                    />
                  </label>
                  <span className="helper-text" id={parkingBusHintId}>
                    {t("structures.create.form.parkingBusSlotsHint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-parking-notes">
                    {t("structures.create.form.parkingNotes")}
                    <textarea
                      id="structure-parking-notes"
                      value={parkingNotes}
                      onChange={handleParkingNotesChange}
                      rows={3}
                      aria-describedby={parkingNotesHintId}
                    />
                  </label>
                  <span className="helper-text" id={parkingNotesHintId}>
                    {t("structures.create.form.parkingNotesHint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-accessibility-notes">
                    {t("structures.create.form.accessibilityNotes")}
                    <textarea
                      id="structure-accessibility-notes"
                      value={accessibilityNotes}
                      onChange={handleAccessibilityNotesChange}
                      rows={3}
                      aria-describedby={accessibilityNotesHintId}
                    />
                  </label>
                  <span className="helper-text" id={accessibilityNotesHintId}>
                    {t("structures.create.form.accessibilityNotesHint")}
                  </span>
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.operations.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.operations.description")}
              </p>
              <div className="structure-field-grid">
                <div
                  className="structure-form-field structure-open-periods-field"
                  data-span="full"
                  id="structure-open_periods"
                  role="group"
                  aria-describedby={openPeriodsDescribedBy}
                >
                  <div className="structure-open-periods-header">
                    <span className="form-label">
                      {t("structures.create.form.openPeriods.title")}
                    </span>
                    <p className="helper-text" id={openPeriodsHintId}>
                      {t("structures.create.form.openPeriods.hint")}
                    </p>
                  </div>
                  <div className="structure-open-periods-table-wrapper">
                    <table className="structure-open-periods-table">
                      <thead>
                        <tr>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.kind")}</th>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.season")}</th>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.start")}</th>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.end")}</th>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.units")}</th>
                          <th scope="col">{t("structures.create.form.openPeriods.columns.notes")}</th>
                          <th scope="col" className="structure-open-periods-actions-column">
                            <span className="sr-only">
                              {t("structures.create.form.openPeriods.columns.actions")}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPeriods.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="structure-open-periods-empty">
                              {t("structures.create.form.openPeriods.empty")}
                            </td>
                          </tr>
                        ) : (
                          openPeriods.map((period) => (
                            <tr key={period.key}>
                              <td>
                                <select
                                  id={`structure-open-period-${period.key}-kind`}
                                  value={period.kind}
                                  onChange={(event) =>
                                    handleOpenPeriodKindChange(
                                      period.key,
                                      event.target.value as StructureOpenPeriodKind
                                    )
                                  }
                                >
                                  {openPeriodKindOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {t(`structures.create.form.openPeriods.kind.${option}`)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {period.kind === "season" ? (
                                  <select
                                    id={`structure-open-period-${period.key}-season`}
                                    value={period.season}
                                    onChange={(event) =>
                                      handleOpenPeriodSeasonChange(
                                        period.key,
                                        event.target.value as StructureOpenPeriodSeason | ""
                                      )
                                    }
                                  >
                                    <option value="">
                                      {t("structures.create.form.openPeriods.seasonPlaceholder")}
                                    </option>
                                    {openPeriodSeasonOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {t(`structures.create.form.openPeriods.season.${option}`)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="structure-open-periods-placeholder">—</span>
                                )}
                              </td>
                              <td>
                                {period.kind === "range" ? (
                                  <input
                                    id={`structure-open-period-${period.key}-date_start`}
                                    type="date"
                                    value={period.dateStart}
                                    onChange={(event) =>
                                      handleOpenPeriodDateChange(
                                        period.key,
                                        "dateStart",
                                        event.target.value
                                      )
                                    }
                                  />
                                ) : (
                                  <span className="structure-open-periods-placeholder">—</span>
                                )}
                              </td>
                              <td>
                                {period.kind === "range" ? (
                                  <input
                                    id={`structure-open-period-${period.key}-date_end`}
                                    type="date"
                                    value={period.dateEnd}
                                    onChange={(event) =>
                                      handleOpenPeriodDateChange(
                                        period.key,
                                        "dateEnd",
                                        event.target.value
                                      )
                                    }
                                  />
                                ) : (
                                  <span className="structure-open-periods-placeholder">—</span>
                                )}
                              </td>
                              <td>
                                <div className="structure-open-periods-units">
                                  {openPeriodUnitOptions.map((option) => {
                                    const label = t(
                                      `structures.create.form.openPeriods.unitsOptions.${option}`
                                    );
                                    const isChecked = period.units.includes(option);
                                    return (
                                      <label
                                        key={`${period.key}-${option}`}
                                        className="structure-open-periods-unit-option"
                                      >
                                        <input
                                          id={`structure-open-period-${period.key}-units-${option}`}
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(event) => {
                                            let nextUnits: Unit[];
                                            if (event.target.checked) {
                                              if (option === "ALL") {
                                                nextUnits = ["ALL"];
                                              } else {
                                                nextUnits = Array.from(
                                                  new Set(
                                                    [
                                                      ...period.units.filter((unit) => unit !== "ALL"),
                                                      option
                                                    ]
                                                  )
                                                ) as Unit[];
                                              }
                                            } else if (option === "ALL") {
                                              nextUnits = period.units.filter((unit) => unit !== "ALL");
                                            } else {
                                              nextUnits = period.units.filter((unit) => unit !== option);
                                            }
                                            handleOpenPeriodUnitsChange(period.key, nextUnits);
                                          }}
                                        />
                                        <span>{label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={period.notes}
                                  onChange={(event) =>
                                    handleOpenPeriodNotesChange(period.key, event.target.value)
                                  }
                                  placeholder={t(
                                    "structures.create.form.openPeriods.notesPlaceholder"
                                  )}
                                />
                              </td>
                              <td className="structure-open-periods-actions-cell">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveOpenPeriod(period.key)}
                                >
                                  {t("structures.create.form.openPeriods.remove")}
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="structure-open-periods-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      id="structure-open-periods-add-season"
                      onClick={() => handleAddOpenPeriod("season")}
                    >
                      {t("structures.create.form.openPeriods.addSeason")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddOpenPeriod("range")}
                    >
                      {t("structures.create.form.openPeriods.addRange")}
                    </Button>
                  </div>
                  {fieldErrors.open_periods && (
                    <p className="error-text" id={openPeriodsErrorId!}>
                      {fieldErrors.open_periods}
                    </p>
                  )}
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-weekend-only" className="tri-state-field__label">
                    {t("structures.create.form.weekendOnly")}
                  </label>
                  <TriStateToggle
                    id="structure-weekend-only"
                    value={weekendOnly}
                    onChange={handleWeekendOnlyChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.weekendOnlyHint")}
                  </span>
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-cell-data-quality">
                    {t("structures.create.form.connectivity.cellDataQuality.label")}
                    <select
                      id="structure-cell-data-quality"
                      value={cellDataQuality}
                      onChange={handleCellDataQualityChange}
                    >
                      <option value="">
                        {t("structures.create.form.connectivity.cellDataQuality.placeholder")}
                      </option>
                      {cellSignalOptions.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.create.form.connectivity.options.${option}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.connectivity.cellDataQuality.hint")}
                  </span>
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-cell-voice-quality">
                    {t("structures.create.form.connectivity.cellVoiceQuality.label")}
                    <select
                      id="structure-cell-voice-quality"
                      value={cellVoiceQuality}
                      onChange={handleCellVoiceQualityChange}
                    >
                      <option value="">
                        {t("structures.create.form.connectivity.cellVoiceQuality.placeholder")}
                      </option>
                      {cellSignalOptions.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.create.form.connectivity.options.${option}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.connectivity.cellVoiceQuality.hint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-wifi-available" className="tri-state-field__label">
                    {t("structures.create.form.connectivity.wifiAvailable.label")}
                  </label>
                  <TriStateToggle
                    id="structure-wifi-available"
                    value={wifiAvailable}
                    onChange={setWifiAvailable}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.connectivity.wifiAvailable.hint")}
                  </span>
                </div>

                <div className="structure-form-field tri-state-field">
                  <label htmlFor="structure-landline-available" className="tri-state-field__label">
                    {t("structures.create.form.connectivity.landlineAvailable.label")}
                  </label>
                  <TriStateToggle
                    id="structure-landline-available"
                    value={landlineAvailable}
                    onChange={setLandlineAvailable}
                    labels={triStateLabels}
                  />
                  <span className="helper-text">
                    {t("structures.create.form.connectivity.landlineAvailable.hint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-communications-notes">
                    {t("structures.create.form.connectivity.notes.label")}
                    <textarea
                      id="structure-communications-notes"
                      value={communicationsNotes}
                      onChange={handleCommunicationsNotesChange}
                      rows={3}
                    />
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.connectivity.notes.hint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-usage-rules">
                    {t("structures.create.form.usageRules")}
                    <textarea
                      id="structure-usage-rules"
                      value={usageRules}
                      onChange={handleUsageRulesChange}
                      rows={3}
                      aria-describedby={usageRulesHintId}
                    />
                  </label>
                  <span className="helper-text" id={usageRulesHintId}>
                    {t("structures.create.form.usageRulesHint")}
                  </span>
                </div>

                <div
                  className="structure-form-field"
                  data-span="full"
                  id="structure-seasonal-amenities"
                  aria-describedby={seasonalAmenitiesHintId}
                >
                  <span className="form-label" id="structure-seasonal-amenities-label">
                    {t("structures.create.form.seasonalAmenities.label")}
                  </span>
                  {seasonalAmenities.length === 0 ? (
                    <p className="helper-text">
                      {t("structures.create.form.seasonalAmenities.empty")}
                    </p>
                  ) : (
                    <div className="structure-website-list">
                      {seasonalAmenities.map((row, index) => {
                        const keyId = `structure-seasonal-amenity-${index}-key`;
                        const valueId = `structure-seasonal-amenity-${index}-value`;
                        return (
                          <div className="structure-website-list__row" key={row.id}>
                            <div className="structure-website-list__input">
                              <input
                                id={keyId}
                                value={row.key}
                                placeholder={t("structures.create.form.seasonalAmenities.keyPlaceholder")}
                                onChange={(event) =>
                                  handleSeasonalAmenityChange(row.id, "key", event.target.value)
                                }
                                aria-label={t(
                                  "structures.create.form.seasonalAmenities.keyAriaLabel",
                                  { index: index + 1 }
                                )}
                              />
                            </div>
                            <div className="structure-website-list__input">
                              <textarea
                                id={valueId}
                                value={row.value}
                                onChange={(event) =>
                                  handleSeasonalAmenityChange(row.id, "value", event.target.value)
                                }
                                rows={2}
                                aria-label={t(
                                  "structures.create.form.seasonalAmenities.valueAriaLabel",
                                  { index: index + 1 }
                                )}
                                placeholder={t(
                                  "structures.create.form.seasonalAmenities.valuePlaceholder"
                                )}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSeasonalAmenity(row.id)}
                            >
                              {t("structures.create.form.seasonalAmenities.remove")}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="structure-website-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddSeasonalAmenity}
                    >
                      {t("structures.create.form.seasonalAmenities.add")}
                    </Button>
                  </div>
                  <span className="helper-text" id={seasonalAmenitiesHintId}>
                    {t("structures.create.form.seasonalAmenities.hint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-notes-logistics">
                    {t("structures.create.form.notesLogistics")}
                    <textarea
                      id="structure-notes-logistics"
                      value={notesLogistics}
                      onChange={handleNotesLogisticsChange}
                      rows={3}
                    />
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.notesLogisticsHint")}
                  </span>
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.optional.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.optional.description")}
              </p>
              <div className="structure-field-grid">
                <div
                  className="structure-form-field structure-form-field--optional-picker"
                  data-span="full"
                >
                  <label htmlFor="structure-optional-section-picker">
                    {t("structures.create.form.optionalSections.label")}
                  </label>
                  <select
                    id="structure-optional-section-picker"
                    value={optionalSectionSelection}
                    onChange={handleOptionalSectionSelectionChange}
                    disabled={availableOptionalSectionOptions.length === 0}
                  >
                    <option value="">
                      {t("structures.create.form.optionalSections.placeholder")}
                    </option>
                    {availableOptionalSectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="helper-text">
                    {t("structures.create.form.optionalSections.hint")}
                  </span>
                </div>

            {isOptionalSectionActive("allowedAudiences") && (
              <div className="structure-form-field structure-form-field--optional" data-span="full">
                {renderOptionalSectionRemoveButton("allowedAudiences")}
                {allowedAudiences.length > 0 ? (
                  <label htmlFor={allowedAudiencesLabelFor} id="structure-allowed-audience-label">
                    {t("structures.create.form.allowedAudiences.label")}
                  </label>
                ) : (
                  <div className="field-label" id="structure-allowed-audience-label">
                    {t("structures.create.form.allowedAudiences.label")}
                  </div>
                )}
                <div
                  className="structure-website-list"
                  aria-labelledby="structure-allowed-audience-label"
                >
                  {allowedAudiences.length === 0 ? (
                    <p className="structure-website-list__empty">
                      {t("structures.create.form.allowedAudiences.empty")}
                    </p>
                  ) : (
                    allowedAudiences.map((value, index) => {
                      const inputId = `structure-allowed-audience-${index}`;
                      const ariaLabel = t("structures.create.form.allowedAudiences.entryLabel", {
                        index: index + 1
                      });
                      return (
                        <div className="structure-website-list__row" key={inputId}>
                          <div className="structure-website-list__input">
                            <input
                              id={inputId}
                              value={value}
                              onChange={(event) => handleAllowedAudienceChange(index, event.target.value)}
                              aria-describedby={allowedAudiencesDescribedBy}
                              aria-label={ariaLabel}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAllowedAudience(index)}
                            className="link-button"
                          >
                            {t("structures.create.form.allowedAudiences.remove")}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="structure-website-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    id={allowedAudiencesAddButtonId}
                    onClick={handleAddAllowedAudience}
                  >
                    {t("structures.create.form.allowedAudiences.add")}
                  </Button>
                </div>
                <span className="helper-text" id={allowedAudiencesHintId}>
                  {t("structures.create.form.allowedAudiences.hint")}
                </span>
              </div>
            )}
            {isOptionalSectionActive("inAreaProtetta") && (
              <>
                <div className="structure-form-field structure-form-field--optional tri-state-field">
                  {renderOptionalSectionRemoveButton("inAreaProtetta")}
                  <label htmlFor="structure-in-area-protetta" className="tri-state-field__label">
                    {t("structures.create.form.inAreaProtetta")}
                  </label>
                  <TriStateToggle
                    id="structure-in-area-protetta"
                    value={inAreaProtetta}
                    onChange={handleInAreaProtettaChange}
                    labels={triStateLabels}
                  />
                  <span className="helper-text" id={inAreaProtettaHintId}>
                    {t("structures.create.form.inAreaProtettaHint")}
                  </span>
                </div>

                {inAreaProtetta === true && (
                  <div className="structure-form-field structure-form-field--optional">
                    <label htmlFor="structure-ente-area-protetta">
                      {t("structures.create.form.enteAreaProtetta")}
                      <input
                        id="structure-ente-area-protetta"
                        value={enteAreaProtetta}
                        onChange={handleEnteAreaProtettaChange}
                        aria-describedby={enteAreaProtettaHintId}
                      />
                    </label>
                    <span className="helper-text" id={enteAreaProtettaHintId}>
                      {t("structures.create.form.enteAreaProtettaHint")}
                    </span>
                  </div>
                )}
              </>
            )}

            {isOptionalSectionActive("floodRisk") && (
              <div className="structure-form-field structure-form-field--optional">
                {renderOptionalSectionRemoveButton("floodRisk")}
                <label htmlFor="structure-flood-risk">
                  {t("structures.create.form.floodRisk")}
                  <select
                    id="structure-flood-risk"
                    value={floodRisk}
                    onChange={handleFloodRiskChange}
                    aria-describedby={floodRiskHintId}
                  >
                    <option value="">
                      {t("structures.create.form.floodRiskPlaceholder")}
                    </option>
                    {floodRiskOptions.map((option) => (
                      <option key={option} value={option}>
                        {t(`structures.create.form.floodRiskOptions.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="helper-text" id={floodRiskHintId}>
                  {t("structures.create.form.floodRiskHint")}
                </span>
              </div>
            )}

            {isOptionalSectionActive("environmentalNotes") && (
              <div className="structure-form-field structure-form-field--optional" data-span="full">
                {renderOptionalSectionRemoveButton("environmentalNotes")}
                <label htmlFor="structure-environmental-notes">
                  {t("structures.create.form.environmentalNotes")}
                  <textarea
                    id="structure-environmental-notes"
                    value={environmentalNotes}
                    onChange={handleEnvironmentalNotesChange}
                    rows={3}
                    aria-describedby={environmentalNotesHintId}
                  />
                </label>
                <span className="helper-text" id={environmentalNotesHintId}>
                  {t("structures.create.form.environmentalNotesHint")}
                </span>
              </div>
            )}

            {isOptionalSectionActive("mapResources") && (
              <div className="structure-form-field structure-form-field--optional" data-span="full">
                {renderOptionalSectionRemoveButton("mapResources")}
                <label htmlFor="structure-map-resource-0" id="structure-map-resources-label">
                  {t("structures.create.form.mapResources.label")}
                </label>
                <div className="structure-website-list">
                  {mapResourcesUrls.map((value, index) => {
                    const inputId = `structure-map-resource-${index}`;
                    const ariaLabel =
                      index === 0
                        ? undefined
                        : t("structures.create.form.mapResources.entryLabel", { index: index + 1 });
                    return (
                      <div className="structure-website-list__row" key={inputId}>
                        <div className="structure-website-list__input">
                          <input
                            id={inputId}
                            type="url"
                            value={value}
                            onChange={(event) => handleMapResourcesUrlChange(index, event.target.value)}
                            placeholder="https://"
                            aria-describedby={mapResourcesDescribedBy}
                            aria-label={ariaLabel}
                          />
                        </div>
                        {mapResourcesUrls.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMapResourcesUrl(index)}
                          >
                            {t("structures.create.form.mapResources.remove")}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="structure-website-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddMapResourcesUrl}
                  >
                    {t("structures.create.form.mapResources.add")}
                  </Button>
                </div>
                <div className="structure-photos">
                  <div
                    className={`structure-photos__dropzone ${mapResourceDropActive ? "is-active" : ""}`}
                    onDragOver={handleMapAttachmentDragOver}
                    onDragLeave={handleMapAttachmentDragLeave}
                    onDrop={handleMapAttachmentDrop}
                  >
                    <p>{t("structures.create.mapResources.uploadPrompt")}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => mapResourceAttachmentInputRef.current?.click()}
                    >
                      {t("attachments.upload.button")}
                    </Button>
                    <input
                      ref={mapResourceAttachmentInputRef}
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleMapAttachmentInputChange}
                    />
                  </div>
                  <div className="structure-photos__queue-wrapper">
                    <p className="helper-text">{t("structures.create.mapResources.queueHint")}</p>
                    {mapResourceAttachmentFiles.length === 0 ? (
                      <p className="helper-text">{t("structures.create.mapResources.queueEmpty")}</p>
                    ) : (
                      <ul className="structure-photos__queue">
                        {mapResourceAttachmentFiles.map((file, index) => (
                          <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                            <span className="structure-photos__queue-name">{file.name}</span>
                            <span className="structure-photos__queue-size">
                              {formatQueuedFileSize(file.size)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMapAttachmentRemove(index)}
                            >
                              {t("structures.create.mapResources.removeFile")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <span className="helper-text" id={mapResourcesHintId}>
                  {t("structures.create.form.mapResources.hint")}
                </span>
              </div>
            )}

            {isOptionalSectionActive("documentsRequired") && (
              <div className="structure-form-field structure-form-field--optional" data-span="full">
                {renderOptionalSectionRemoveButton("documentsRequired")}
                <label htmlFor="structure-documents-required-0" id="structure-documents-required-label">
                  {t("structures.create.form.documentsRequired.label")}
                </label>
                <div className="structure-website-list">
                  {documentsRequired.map((value, index) => {
                    const inputId = `structure-documents-required-${index}`;
                    const ariaLabel =
                      index === 0
                        ? undefined
                        : t("structures.create.form.documentsRequired.entryLabel", { index: index + 1 });
                    return (
                      <div className="structure-website-list__row" key={inputId}>
                        <div className="structure-website-list__input">
                          <input
                            id={inputId}
                            value={value}
                            onChange={(event) => handleDocumentsRequiredChange(index, event.target.value)}
                            aria-describedby={documentsRequiredDescribedBy}
                            aria-label={ariaLabel}
                          />
                        </div>
                        {documentsRequired.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDocumentsRequired(index)}
                            className="link-button"
                          >
                            {t("structures.create.form.documentsRequired.remove")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="structure-website-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddDocumentsRequired}
                  >
                    {t("structures.create.form.documentsRequired.add")}
                  </Button>
                </div>
                <div className="structure-photos">
                  <div
                    className={`structure-photos__dropzone ${documentDropActive ? "is-active" : ""}`}
                    onDragOver={handleDocumentAttachmentDragOver}
                    onDragLeave={handleDocumentAttachmentDragLeave}
                    onDrop={handleDocumentAttachmentDrop}
                  >
                    <p>{t("structures.create.documentsRequired.uploadPrompt")}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => documentAttachmentInputRef.current?.click()}
                    >
                      {t("attachments.upload.button")}
                    </Button>
                    <input
                      ref={documentAttachmentInputRef}
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleDocumentAttachmentInputChange}
                    />
                  </div>
                  <div className="structure-photos__queue-wrapper">
                    <p className="helper-text">{t("structures.create.documentsRequired.queueHint")}</p>
                    {documentAttachmentFiles.length === 0 ? (
                      <p className="helper-text">{t("structures.create.documentsRequired.queueEmpty")}</p>
                    ) : (
                      <ul className="structure-photos__queue">
                        {documentAttachmentFiles.map((file, index) => (
                          <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                            <span className="structure-photos__queue-name">{file.name}</span>
                            <span className="structure-photos__queue-size">
                              {formatQueuedFileSize(file.size)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDocumentAttachmentRemove(index)}
                            >
                              {t("structures.create.documentsRequired.removeFile")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <span className="helper-text" id={documentsRequiredHintId}>
                  {t("structures.create.form.documentsRequired.hint")}
                </span>
              </div>
            )}

          </div>
        </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.costs.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.costs.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <span className="form-label" id={paymentMethodsLabelId}>
                    {t("structures.create.form.paymentMethodSelector.label")}
                  </span>
                  <p className="helper-text" id={paymentMethodsHintId}>
                    {t("structures.create.form.paymentMethodSelector.hint")}
                  </p>
                  <div
                    className="structure-checkbox-list"
                    role="group"
                    aria-labelledby={paymentMethodsLabelId}
                    aria-describedby={paymentMethodsHintId}
                  >
                    {paymentMethodOptions.map((method) => {
                      const optionId = `structure-payment-method-${method}`;
                      return (
                        <label
                          key={method}
                          htmlFor={optionId}
                          className="structure-checkbox-list__option"
                        >
                          <input
                            id={optionId}
                            type="checkbox"
                            checked={structurePaymentMethods.includes(method)}
                            onChange={(event) =>
                              handleStructurePaymentMethodToggle(method, event.target.checked)
                            }
                          />
                          <span>
                            {t(
                              `structures.create.form.paymentMethodSelector.options.${method}`
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div
                  className="structure-form-field"
                  data-span="full"
                  id="structure-cost_options"
                  role="group"
                  aria-describedby={costOptionsDescribedBy}
                >
                  <div className="structure-cost-options-header">
                    <span className="form-label">
                      {t("structures.create.form.costOptions.title")}
                    </span>
                    <p className="helper-text" id={costOptionsHintId}>
                      {t("structures.create.form.costOptions.hint")}
                    </p>
                  </div>
                  {costOptions.length === 0 ? (
                    <p className="helper-text structure-cost-options-empty">
                      {t("structures.create.form.costOptions.empty")}
                    </p>
                  ) : (
                    <div className="structure-cost-options-list">
                      {costOptions.map((option, index) => {
                        const modelId = `structure-cost-option-${option.key}-model`;
                        const amountId = `structure-cost-option-${option.key}-amount`;
                        const currencyId = `structure-cost-option-${option.key}-currency`;
                        const bookingDepositId = `structure-cost-option-${option.key}-booking-deposit`;
                        const damageDepositId = `structure-cost-option-${option.key}-damage-deposit`;
                        const cityTaxId = `structure-cost-option-${option.key}-city-tax`;
                        const utilitiesFlatId = `structure-cost-option-${option.key}-utilities`;
                        const utilitiesIncludedId = `structure-cost-option-${option.key}-utilities-included`;
                        const utilitiesNotesId = `structure-cost-option-${option.key}-utilities-notes`;
                        const minTotalId = `structure-cost-option-${option.key}-min-total`;
                        const maxTotalId = `structure-cost-option-${option.key}-max-total`;
                        const forfaitTriggerId = `structure-cost-option-${option.key}-forfait-trigger`;
                        const paymentMethodsGroupId = `structure-cost-option-${option.key}-payment-methods`;
                        const paymentMethodsHintId = `structure-cost-option-${option.key}-payment-methods-hint`;
                        const paymentTermsId = `structure-cost-option-${option.key}-payment-terms`;
                        const cardTitle = t("structures.create.form.costOptions.cardTitle", {
                          index: index + 1,
                        });
                        const modelLabel = option.model
                          ? t(`structures.create.form.costOptions.models.${option.model}`, {
                              defaultValue: option.model,
                            })
                          : t("structures.create.form.costOptions.modelPlaceholder");
                        const summaryAmount = option.amount.trim().length
                          ? `${option.amount} ${option.currency || "EUR"}`
                          : t("structures.create.form.costOptions.summaryMissingAmount");
                        const seasonInputId = (modifierKey: string) =>
                          `structure-cost-option-${option.key}-modifier-${modifierKey}-season`;
                        const modifierAmountId = (modifierKey: string) =>
                          `structure-cost-option-${option.key}-modifier-${modifierKey}-amount`;
                        return (
                          <Surface className="structure-cost-option-card" key={option.key}>
                            <div className="structure-cost-option-card__header">
                              <div>
                                <p className="structure-cost-option-card__title">{cardTitle}</p>
                                <p className="structure-cost-option-card__summary">
                                  {t("structures.create.form.costOptions.cardSummary", {
                                    summary: `${modelLabel} · ${summaryAmount}`,
                                  })}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={t("structures.create.form.costOptions.removeLabel", {
                                  index: index + 1,
                                })}
                                onClick={() => handleRemoveCostOption(option.key)}
                              >
                                {t("structures.create.form.costOptions.remove")}
                              </Button>
                            </div>

                            <div className="structure-cost-option-sections">
                              <div className="structure-cost-option-section">
                                <div className="structure-cost-option-section__header">
                                  <span className="form-label">
                                    {t("structures.create.form.costOptions.layout.base.title")}
                                  </span>
                                  <p className="helper-text">
                                    {t("structures.create.form.costOptions.layout.base.hint")}
                                  </p>
                                </div>
                                <div className="structure-cost-option-grid structure-cost-option-grid--base">
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={modelId}>
                                      {t("structures.create.form.costOptions.model")}
                                      <select
                                        id={modelId}
                                        value={option.model}
                                        onChange={(event) =>
                                          handleCostOptionModelChange(
                                            option.key,
                                            event.target.value as CostModel | ""
                                          )
                                        }
                                      >
                                        <option value="">
                                          {t("structures.create.form.costOptions.modelPlaceholder")}
                                        </option>
                                        {costModelOptions.map((value) => (
                                          <option key={value} value={value}>
                                            {t(`structures.create.form.costOptions.models.${value}`)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={amountId}>
                                      {t("structures.create.form.costOptions.amount")}
                                      <input
                                        id={amountId}
                                        value={option.amount}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "amount",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field structure-cost-option-field--currency">
                                    <label htmlFor={currencyId}>
                                      {t("structures.create.form.costOptions.currency")}
                                      <input
                                        id={currencyId}
                                        value={option.currency}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "currency",
                                            event.target.value.toUpperCase()
                                          )
                                        }
                                        maxLength={3}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div className="structure-cost-option-section">
                                <div className="structure-cost-option-section__header">
                                  <span className="form-label">
                                    {t("structures.create.form.costOptions.layout.thresholds.title")}
                                  </span>
                                  <p className="helper-text">
                                    {t("structures.create.form.costOptions.layout.thresholds.hint")}
                                  </p>
                                </div>
                                <div className="structure-cost-option-grid structure-cost-option-grid--two">
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={minTotalId}>
                                      {t("structures.create.form.costOptions.minTotal")}
                                      <input
                                        id={minTotalId}
                                        value={option.minTotal}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "minTotal",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                    <span className="helper-text">
                                      {t("structures.create.form.costOptions.minTotalHint")}
                                    </span>
                                  </div>
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={maxTotalId}>
                                      {t("structures.create.form.costOptions.maxTotal")}
                                      <input
                                        id={maxTotalId}
                                        value={option.maxTotal}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "maxTotal",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                    <span className="helper-text">
                                      {t("structures.create.form.costOptions.maxTotalHint")}
                                    </span>
                                  </div>
                                </div>
                                <div className="structure-cost-option-field">
                                  <label htmlFor={forfaitTriggerId}>
                                    {t("structures.create.form.costOptions.forfaitTrigger")}
                                  </label>
                                  <input
                                    id={forfaitTriggerId}
                                    value={option.forfaitTrigger}
                                    onChange={(event) =>
                                      handleCostOptionFieldChange(
                                        option.key,
                                        "forfaitTrigger",
                                        event.target.value
                                      )
                                    }
                                    inputMode="decimal"
                                    placeholder="0,00"
                                  />
                                  <span className="helper-text">
                                    {t("structures.create.form.costOptions.forfaitTriggerHint")}
                                  </span>
                                </div>
                              </div>
                              <div className="structure-cost-option-section">
                                <div className="structure-cost-option-section__header">
                                  <span className="form-label">
                                    {t("structures.create.form.costOptions.layout.deposits.title")}
                                  </span>
                                  <p className="helper-text">
                                    {t("structures.create.form.costOptions.layout.deposits.hint")}
                                  </p>
                                </div>
                                <div className="structure-cost-option-grid structure-cost-option-grid--three">
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={bookingDepositId}>
                                      {t("structures.create.form.costOptions.bookingDeposit")}
                                      <input
                                        id={bookingDepositId}
                                        value={option.bookingDeposit}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "bookingDeposit",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={damageDepositId}>
                                      {t("structures.create.form.costOptions.damageDeposit")}
                                      <input
                                        id={damageDepositId}
                                        value={option.damageDeposit}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "damageDeposit",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={cityTaxId}>
                                      {t("structures.create.form.costOptions.cityTax")}
                                      <input
                                        id={cityTaxId}
                                        value={option.cityTaxPerNight}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "cityTaxPerNight",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div className="structure-cost-option-section">
                                <div className="structure-cost-option-section__header">
                                  <span className="form-label">
                                    {t("structures.create.form.costOptions.layout.utilities.title")}
                                  </span>
                                  <p className="helper-text">
                                    {t("structures.create.form.costOptions.layout.utilities.hint")}
                                  </p>
                                </div>
                                <div className="structure-cost-option-grid structure-cost-option-grid--utilities">
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={utilitiesFlatId}>
                                      {t("structures.create.form.costOptions.utilities")}
                                      <input
                                        id={utilitiesFlatId}
                                        value={option.utilitiesFlat}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "utilitiesFlat",
                                            event.target.value
                                          )
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                      />
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field">
                                    <label htmlFor={utilitiesIncludedId}>
                                      {t("structures.create.form.costOptions.utilitiesIncluded")}
                                      <select
                                        id={utilitiesIncludedId}
                                        value={option.utilitiesIncluded}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "utilitiesIncluded",
                                            event.target.value as "" | "yes" | "no"
                                          )
                                        }
                                      >
                                        <option value="">
                                          {t("structures.create.form.costOptions.utilitiesIncludedUnset")}
                                        </option>
                                        <option value="yes">
                                          {t("structures.details.common.yes")}
                                        </option>
                                        <option value="no">
                                          {t("structures.details.common.no")}
                                        </option>
                                      </select>
                                    </label>
                                  </div>
                                  <div className="structure-cost-option-field structure-cost-option-field--wide">
                                    <label htmlFor={utilitiesNotesId}>
                                      {t("structures.create.form.costOptions.utilitiesNotes")}
                                      <textarea
                                        id={utilitiesNotesId}
                                        value={option.utilitiesNotes}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "utilitiesNotes",
                                            event.target.value
                                          )
                                        }
                                        rows={2}
                                      />
                                    </label>
                                    <span className="helper-text">
                                      {t("structures.create.form.costOptions.utilitiesNotesHint")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="structure-cost-option-section">
                                <div className="structure-cost-option-section__header">
                                  <span className="form-label">
                                    {t("structures.create.form.costOptions.layout.notes.title")}
                                  </span>
                                  <p className="helper-text">
                                    {t("structures.create.form.costOptions.layout.notes.hint")}
                                  </p>
                                </div>
                                <div className="structure-cost-option-grid">
                                  <div className="structure-cost-option-field structure-cost-option-field--wide">
                                    <span className="form-label" id={paymentMethodsGroupId}>
                                      {t("structures.create.form.costOptions.paymentMethods")}
                                    </span>
                                    <p className="helper-text" id={paymentMethodsHintId}>
                                      {t("structures.create.form.costOptions.paymentMethodsHint")}
                                    </p>
                                    <div
                                      className="structure-checkbox-list"
                                      role="group"
                                      aria-labelledby={paymentMethodsGroupId}
                                      aria-describedby={paymentMethodsHintId}
                                    >
                                      {paymentMethodOptions.map((method) => {
                                        const optionId = `${paymentMethodsGroupId}-${method}`;
                                        return (
                                          <label
                                            key={method}
                                            htmlFor={optionId}
                                            className="structure-checkbox-list__option"
                                          >
                                            <input
                                              id={optionId}
                                              type="checkbox"
                                              checked={option.paymentMethods.includes(method)}
                                              onChange={(event) =>
                                                handleCostOptionPaymentMethodToggle(
                                                  option.key,
                                                  method,
                                                  event.target.checked
                                                )
                                              }
                                            />
                                            <span>
                                              {t(
                                                `structures.create.form.paymentMethodSelector.options.${method}`
                                              )}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="structure-cost-option-field structure-cost-option-field--wide">
                                    <label htmlFor={paymentTermsId}>
                                      {t("structures.create.form.costOptions.paymentTerms")}
                                      <textarea
                                        id={paymentTermsId}
                                        value={option.paymentTerms}
                                        onChange={(event) =>
                                          handleCostOptionFieldChange(
                                            option.key,
                                            "paymentTerms",
                                            event.target.value
                                          )
                                        }
                                        rows={2}
                                      />
                                    </label>
                                    <span className="helper-text">
                                      {t("structures.create.form.costOptions.paymentTermsHint")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="structure-cost-option-modifiers">
                              <div className="structure-cost-option-modifiers__header">
                                <span className="form-label">
                                  {t("structures.create.form.costOptions.modifiers.title")}
                                </span>
                                <p className="helper-text">
                                  {t("structures.create.form.costOptions.modifiers.hint")}
                                </p>
                              </div>
                              {option.modifiers.length === 0 ? (
                                <p className="helper-text structure-cost-option-modifiers__empty">
                                  {t("structures.create.form.costOptions.modifiers.empty")}
                                </p>
                              ) : (
                                <div className="structure-cost-option-modifiers__list">
                                  {option.modifiers.map((modifier) => {
                                    const seasonId = seasonInputId(modifier.key);
                                    const amountInputId = modifierAmountId(modifier.key);
                                    return (
                                      <div
                                        className="structure-cost-option-modifier-row"
                                        key={modifier.key}
                                      >
                                        <label htmlFor={seasonId}>
                                          {t("structures.create.form.costOptions.modifiers.season")}
                                          <select
                                            id={seasonId}
                                            value={modifier.season}
                                            onChange={(event) =>
                                              handleCostModifierFieldChange(
                                                option.key,
                                                modifier.key,
                                                "season",
                                                event.target.value
                                              )
                                            }
                                          >
                                            <option value="">
                                              {t(
                                                "structures.create.form.costOptions.modifiers.seasonPlaceholder"
                                              )}
                                            </option>
                                            {openPeriodSeasonOptions.map((season) => (
                                              <option key={season} value={season}>
                                                {t(`structures.create.form.openPeriods.season.${season}`)}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label htmlFor={amountInputId}>
                                          {t("structures.create.form.costOptions.modifiers.amount")}
                                          <input
                                            id={amountInputId}
                                            value={modifier.amount}
                                            onChange={(event) =>
                                              handleCostModifierFieldChange(
                                                option.key,
                                                modifier.key,
                                                "amount",
                                                event.target.value
                                              )
                                            }
                                            inputMode="decimal"
                                            placeholder="0,00"
                                          />
                                        </label>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          aria-label={t(
                                            "structures.create.form.costOptions.modifiers.removeLabel"
                                          )}
                                          onClick={() =>
                                            handleRemoveCostModifier(option.key, modifier.key)
                                          }
                                        >
                                          {t("structures.create.form.costOptions.modifiers.remove")}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleAddSeasonalModifier(option.key)}
                              >
                                {t("structures.create.form.costOptions.modifiers.addSeasonal")}
                              </Button>
                            </div>
                          </Surface>
                        );
                      })}
                    </div>
                  )}
                  <div className="structure-cost-options-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      id="structure-cost-options-add"
                      onClick={handleAddCostOption}
                    >
                      {t("structures.create.form.costOptions.add")}
                    </Button>
                  </div>
                  {fieldErrors.cost_options && (
                    <p className="error-text" id={costOptionsErrorId!}>
                      {fieldErrors.cost_options}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.photos.title")}</legend>
              <p className="helper-text">
                {t("structures.create.photos.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <div className="structure-photos">
                    <div
                      className={`structure-photos__dropzone ${photoDropActive ? "is-active" : ""}`}
                      onDragOver={handlePhotoDragOver}
                      onDragLeave={handlePhotoDragLeave}
                      onDrop={handlePhotoDrop}
                    >
                      <p>{t("structures.photos.upload.prompt")}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {t("structures.photos.upload.button")}
                      </Button>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={handlePhotoInputChange}
                      />
                    </div>
                    {photoError && <p className="error-text">{photoError}</p>}
                    <div className="structure-photos__queue-wrapper">
                      <p className="helper-text">
                        {t("structures.create.photos.queueHint")}
                      </p>
                      {photoFiles.length === 0 ? (
                        <p className="helper-text">
                          {t("structures.create.photos.queueEmpty")}
                        </p>
                      ) : (
                        <ul className="structure-photos__queue">
                          {photoFiles.map((file, index) => (
                            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                              <span className="structure-photos__queue-name">{file.name}</span>
                              <span className="structure-photos__queue-size">
                                {formatQueuedFileSize(file.size)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePhotoRemove(index)}
                              >
                                {t("structures.create.photos.remove")}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.attachments.title")}</legend>
              <p className="helper-text">
                {t("structures.create.attachments.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <div className="structure-photos">
                    <div
                      className={`structure-photos__dropzone ${attachmentDropActive ? "is-active" : ""}`}
                      onDragOver={handleAttachmentDragOver}
                      onDragLeave={handleAttachmentDragLeave}
                      onDrop={handleAttachmentDrop}
                    >
                      <p>{t("attachments.upload.prompt")}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => attachmentInputRef.current?.click()}
                      >
                        {t("attachments.upload.button")}
                      </Button>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        style={{ display: "none" }}
                        onChange={handleAttachmentInputChange}
                      />
                    </div>
                    <div className="structure-photos__queue-wrapper">
                      <p className="helper-text">
                        {t("structures.create.attachments.queueHint")}
                      </p>
                      {attachmentFiles.length === 0 ? (
                        <p className="helper-text">
                          {t("structures.create.attachments.queueEmpty")}
                        </p>
                      ) : (
                        <ul className="structure-photos__queue">
                          {attachmentFiles.map((file, index) => (
                            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                              <span className="structure-photos__queue-name">{file.name}</span>
                              <span className="structure-photos__queue-size">
                                {formatQueuedFileSize(file.size)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAttachmentRemove(index)}
                              >
                                {t("structures.create.attachments.remove")}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.contact.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.contact.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-contact-email-0" id="structure-contact-email-label">
                    {t("structures.create.form.contactEmails.label")}
                  </label>
                  <div className="structure-website-list">
                    {contactEmails.map((value, index) => {
                      const inputId = `structure-contact-email-${index}`;
                      const ariaLabel =
                        index === 0
                          ? undefined
                          : t("structures.create.form.contactEmails.entryLabel", { index: index + 1 });
                      return (
                        <div className="structure-website-list__row" key={inputId}>
                          <div className="structure-website-list__input">
                            <input
                              id={inputId}
                              type="email"
                              value={value}
                              onChange={(event) => handleContactEmailChange(index, event.target.value)}
                              aria-describedby={contactEmailsDescribedBy}
                              aria-invalid={fieldErrors.contact_emails ? "true" : undefined}
                              aria-label={ariaLabel}
                            />
                          </div>
                          {contactEmails.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveContactEmail(index)}
                              className="link-button"
                            >
                              {t("structures.create.form.contactEmails.remove")}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="structure-website-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddContactEmail}
                    >
                      {t("structures.create.form.contactEmails.add")}
                    </Button>
                  </div>
                  <span className="helper-text" id={contactEmailsHintId}>
                    {t("structures.create.form.contactEmails.hint")}
                  </span>
                  {fieldErrors.contact_emails && (
                    <p className="error-text" id={contactEmailsErrorId!}>
                      {fieldErrors.contact_emails}
                    </p>
                  )}
                </div>
                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-website-0" id="structure-website-label">
                    {t("structures.create.form.website")}
                  </label>
                  <div className="structure-website-list">
                    {websiteUrls.map((value, index) => {
                      const inputId = `structure-website-${index}`;
                      const ariaLabel =
                        index === 0
                          ? undefined
                          : t("structures.create.form.websiteEntryLabel", { index: index + 1 });
                      const status = websiteUrlStatuses[index] ?? "idle";
                      const statusId = status === "idle" ? undefined : `${inputId}-status`;
                      const inputDescribedBy =
                        [websiteDescribedBy, statusId].filter(Boolean).join(" ") || undefined;
                      return (
                        <div className="structure-website-list__row" key={inputId}>
                          <div className="structure-website-list__input">
                            <input
                              id={inputId}
                              type="url"
                              value={value}
                              onChange={(event) => handleWebsiteUrlChange(index, event.target.value)}
                              onBlur={() => handleWebsiteUrlBlur(index)}
                              placeholder="https://"
                              aria-describedby={inputDescribedBy}
                              aria-invalid={fieldErrors.website_urls ? "true" : undefined}
                              aria-label={ariaLabel}
                            />
                            {status === "valid" && (
                              <span
                                className="structure-website-list__status structure-website-list__status--valid"
                                id={statusId}
                                role="status"
                              >
                                {t("structures.create.form.websiteValidStatus")}
                              </span>
                            )}
                            {status === "invalid" && (
                              <span
                                className="structure-website-list__status structure-website-list__status--invalid"
                                id={statusId}
                                role="status"
                              >
                                {t("structures.create.form.websiteInvalidStatus")}
                              </span>
                            )}
                          </div>
                          {websiteUrls.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveWebsiteUrl(index)}
                            >
                              {t("structures.create.form.websiteRemove")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="structure-website-actions">
                    <Button type="button" variant="secondary" size="sm" onClick={handleAddWebsiteUrl}>
                      {t("structures.create.form.websiteAdd")}
                    </Button>
                  </div>
                  <span className="helper-text" id={websiteHintId}>
                    {t("structures.create.form.websiteHint")}
                  </span>
                  {fieldErrors.website_urls && (
                    <p className="error-text" id={websiteErrorId!}>
                      {fieldErrors.website_urls}
                    </p>
                  )}
                </div>

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-notes">
                    {t("structures.create.form.notes")}
                    <textarea
                      id="structure-notes"
                      value={notes}
                      onChange={handleNotesChange}
                      rows={3}
                    />
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.notesHint")}
                  </span>
                </div>

                <div className="structure-form-field" data-span="full">
                  {!addContact ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleContactSectionEnable}
                      >
                        {t("structures.create.form.contact.enable")}
                      </Button>
                      <span className="helper-text">
                        {t("structures.create.form.contact.enableHint")}
                      </span>
                    </>
                  ) : (
                    <span className="helper-text">
                      {t("structures.create.form.contact.enableHint")}
                    </span>
                  )}
                </div>

                {addContact && (
                  <div className="structure-form-field" data-span="full">
                    <div className="structure-contact-card">
                      <div className="structure-contact-card__intro">
                        <div className="structure-contact-card__intro-header">
                          <div>
                            <h4>{t("structures.create.form.contact.cardTitle")}</h4>
                            <p>{t("structures.create.form.contact.cardSubtitle")}</p>
                          </div>
                          <div className="structure-contact-card__intro-actions">
                            {contactIsPrimary && (
                              <StatusBadge status="info">
                                {t("structures.create.form.contact.primaryBadge")}
                              </StatusBadge>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleContactSectionDisable}
                            >
                              {t("structures.create.form.contact.remove")}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {contactStatusMessage && (
                        <InlineMessage>{contactStatusMessage}</InlineMessage>
                      )}
                      <div className="structure-contact-section">
                        <span className="structure-contact-section__title">
                          {t("structures.create.form.contact.sectionPerson")}
                        </span>
                        <div className="structure-contact-grid">
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.firstName")}
                            </span>
                            <input
                              type="text"
                              value={contactFirstName}
                              onChange={(event) => setContactFirstName(event.target.value)}
                            />
                          </label>
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.lastName")}
                            </span>
                            <input
                              type="text"
                              value={contactLastName}
                              onChange={(event) => setContactLastName(event.target.value)}
                            />
                          </label>
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.role")}
                            </span>
                            <input
                              type="text"
                              value={contactRole}
                              onChange={(event) => setContactRole(event.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="structure-contact-section">
                        <span className="structure-contact-section__title">
                          {t("structures.create.form.contact.sectionReachability")}
                        </span>
                        <div className="structure-contact-grid">
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.email")}
                            </span>
                            <input
                              type="email"
                              value={contactEmail}
                              onChange={(event) => setContactEmail(event.target.value)}
                            />
                          </label>
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.phone")}
                            </span>
                            <input
                              type="tel"
                              value={contactPhone}
                              onChange={(event) => setContactPhone(event.target.value)}
                            />
                          </label>
                          <label className="structure-contact-field">
                            <span className="structure-contact-label">
                              {t("structures.create.form.contact.preferredChannel")}
                            </span>
                            <select
                              value={contactPreferredChannel}
                              onChange={(event) =>
                                setContactPreferredChannel(
                                  event.target.value as ContactPreferredChannel
                                )
                              }
                            >
                              <option value="email">{t("structures.contacts.channels.email")}</option>
                              <option value="phone">{t("structures.contacts.channels.phone")}</option>
                              <option value="other">{t("structures.contacts.channels.other")}</option>
                            </select>
                          </label>
                          <label className="structure-contact-checkbox">
                            <input
                              type="checkbox"
                              checked={contactIsPrimary}
                              onChange={(event) => setContactIsPrimary(event.target.checked)}
                            />
                            <span>{t("structures.create.form.contact.isPrimary")}</span>
                          </label>
                        </div>
                      </div>
                      <div className="structure-contact-section">
                        <span className="structure-contact-section__title">
                          {t("structures.create.form.contact.sectionExisting")}
                        </span>
                        <div className="structure-contact-picker">
                          <div className="structure-contact-picker__actions">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={handleContactPickerOpen}
                            >
                              {t("structures.create.form.contact.picker.open")}
                            </Button>
                            {contactId !== null && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleContactPickerClear}
                              >
                                {t("structures.create.form.contact.picker.clearSelection")}
                              </Button>
                            )}
                          </div>
                          {contactId !== null && selectedContactSummary && (
                            <p className="structure-contact-helper structure-contact-picker__selected">
                              {t("structures.create.form.contact.picker.selected", {
                                name: selectedContactSummary
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="structure-contact-section">
                        <span className="structure-contact-section__title">
                          {t("structures.create.form.contact.sectionNotes")}
                        </span>
                        <label className="structure-contact-field structure-contact-field--full">
                          <span className="structure-contact-label">
                            {t("structures.create.form.contact.notes")}
                          </span>
                          <textarea
                            value={contactNotes}
                            onChange={(event) => setContactNotes(event.target.value)}
                            rows={3}
                          />
                        </label>
                      </div>
                      <div className="structure-contact-section">
                        <span className="structure-contact-section__title">
                          {t("structures.create.form.contact.sectionActions")}
                        </span>
                        <p className="structure-contact-helper">
                          {t("structures.create.form.contact.searchHelper")}
                        </p>
                        <div className="structure-contact-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleContactDuplicateSearch}
                            disabled={contactCheckingDuplicates}
                          >
                            {contactCheckingDuplicates
                              ? t("structures.create.form.contact.searching")
                              : t("structures.create.form.contact.search")}
                          </Button>
                          {contactCheckingDuplicates && (
                            <span className="structure-contact-helper">
                              {t("structures.create.form.contact.searchingHelp")}
                            </span>
                          )}
                        </div>
                      </div>
                      {contactDuplicates.length > 0 && (
                        <div className="structure-contact-duplicates">
                          <p className="structure-contact-duplicates__title">
                            {t("structures.create.form.contact.duplicatesIntro", {
                              count: contactDuplicates.length
                            })}
                          </p>
                          <ul className="structure-contact-duplicates__list">
                            {contactDuplicates.map((candidate) => (
                              <li key={candidate.id}>
                                <div className="structure-contact-duplicates__match">
                                  <strong>{candidate.name}</strong>
                                  {candidate.email && ` · ${candidate.email}`}
                                  {candidate.phone && ` · ${candidate.phone}`}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleContactUseExisting(candidate)}
                                >
                                  {t("structures.create.form.contact.useExisting")}
                                </Button>
                              </li>
                            ))}
                          </ul>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleContactCreateAnyway}
                          >
                            {t("structures.create.form.contact.createAnyway")}
                          </Button>
                        </div>
                      )}
                      {isContactPickerOpen && (
                        <div className="modal" role="presentation">
                          <div
                            className="modal-content"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="structure-contact-picker-title"
                          >
                            <header className="modal-header">
                              <h3 id="structure-contact-picker-title">
                                {t("structures.create.form.contact.picker.title")}
                              </h3>
                            </header>
                            <div className="modal-body">
                              <form
                                className="structure-contact-picker__form"
                                onSubmit={handleContactPickerSubmit}
                              >
                                <label className="structure-contact-picker__search">
                                  <span>{t("structures.create.form.contact.picker.searchLabel")}</span>
                                  <input
                                    type="text"
                                    value={contactPickerQuery}
                                    onChange={(event) => setContactPickerQuery(event.target.value)}
                                    placeholder={t(
                                      "structures.create.form.contact.picker.searchPlaceholder"
                                    )}
                                  />
                                </label>
                                <div className="structure-contact-picker__form-actions">
                                  <Button type="submit" size="sm" variant="primary">
                                    {t("structures.create.form.contact.picker.search")}
                                  </Button>
                                </div>
                              </form>
                              {contactPickerLoading ? (
                                <p>{t("structures.create.form.contact.picker.loading")}</p>
                              ) : contactPickerError ? (
                                <p className="error-text">{contactPickerError}</p>
                              ) : contactPickerResults.length === 0 ? (
                                <p>{t("structures.create.form.contact.picker.noResults")}</p>
                              ) : (
                                <ul className="structure-contact-picker__list">
                                  {contactPickerResults.map((contact) => (
                                    <li key={contact.id}>
                                      <div className="structure-contact-picker__match">
                                        <strong>{contact.name}</strong>
                                        {contact.email && <span> · {contact.email}</span>}
                                        {contact.phone && <span> · {contact.phone}</span>}
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleContactPickerSelect(contact)}
                                      >
                                        {t("structures.create.form.contact.picker.choose")}
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="modal-actions">
                              <Button type="button" variant="ghost" onClick={handleContactPickerClose}>
                                {t("structures.create.form.contact.picker.close")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </fieldset>

            {apiError && <InlineMessage tone="danger">{apiError}</InlineMessage>}

            <div className="structure-form-actions">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? t(
                      isEditing
                        ? "structures.edit.form.submitting"
                        : "structures.create.form.submitting"
                    )
                  : t(
                      isEditing
                        ? "structures.edit.form.submit"
                        : "structures.create.form.submit"
                    )}
              </Button>
            </div>
          </form>
        </Surface>
      </div>
    </section>
  );
};
