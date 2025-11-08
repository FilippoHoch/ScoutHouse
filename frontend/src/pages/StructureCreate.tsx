import {
  ChangeEvent,
  DragEvent,
  FormEvent,
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
  getStructureBySlug,
  searchContacts,
  searchGeocoding,
  signAttachmentUpload,
  updateStructure,
  upsertStructureCostOptions
} from "../shared/api";
import {
  CostModel,
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  GeocodingResult,
  FieldSlope,
  FirePolicy,
  FloodRiskLevel,
  StructureCreateDto,
  StructureOperationalStatus,
  StructureType,
  StructureOpenPeriodKind,
  StructureOpenPeriodInput,
  StructureOpenPeriodSeason,
  StructureCostOptionInput,
  Unit,
  WaterSource
} from "../shared/types";
import {
  extractAdvancedStructureData,
  extractAdvancedCostOptionData,
  mergeAdvancedCostOptionPayload,
  mergeAdvancedStructurePayload
} from "../shared/structureMetadata";
import {
  Button,
  InlineMessage,
  SectionHeader,
  StatusBadge,
  Surface
} from "../shared/ui/designSystem";
import { GoogleMapEmbed, type GoogleMapEmbedCoordinates } from "../shared/ui/GoogleMapEmbed";
import { TriStateToggle } from "../shared/ui/TriStateToggle";
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
const operationalStatusOptions: StructureOperationalStatus[] = [
  "operational",
  "seasonal",
  "temporarily_closed",
  "permanently_closed"
];
type FieldErrorKey =
  | "name"
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
  | "open_periods"
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

const costModelOptions: CostModel[] = ["per_person_day", "per_person_night", "forfait"];

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
  paymentMethods: string;
  paymentTerms: string;
  minTotal: string;
  maxTotal: string;
  advancedMetadata: string;
  advancedMetadataError: string | null;
};

const createCostOptionKey = () => `co-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

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
  paymentMethods: "",
  paymentTerms: "",
  minTotal: "",
  maxTotal: "",
  advancedMetadata: "",
  advancedMetadataError: null
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
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [municipalityCode, setMunicipalityCode] = useState("");
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
  const [nearestBusStop, setNearestBusStop] = useState("");
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
  const [allowedAudiences, setAllowedAudiences] = useState<string[]>([""]);
  const [usageRules, setUsageRules] = useState("");

  const [inAreaProtetta, setInAreaProtetta] = useState<boolean | null>(null);
  const [enteAreaProtetta, setEnteAreaProtetta] = useState("");
  const [environmentalNotes, setEnvironmentalNotes] = useState("");
  const [floodRisk, setFloodRisk] = useState<FloodRiskLevel | "">("");
  const [seasonalAmenities, setSeasonalAmenities] = useState<SeasonalAmenityRow[]>([]);
  const [notesLogistics, setNotesLogistics] = useState("");
  const [notes, setNotes] = useState("");
  const [advancedMetadata, setAdvancedMetadata] = useState("");
  const [advancedMetadataError, setAdvancedMetadataError] = useState<string | null>(null);
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const advancedMetadataRef = useRef<HTMLTextAreaElement | null>(null);
  const geocodingRequestId = useRef(0);
  const geocodingDebounceRef = useRef<number | null>(null);
  const geocodingAbortController = useRef<AbortController | null>(null);
  const coordinatesEditedRef = useRef(false);
  const latitudeRef = useRef("");
  const longitudeRef = useRef("");

  useEffect(() => {
    coordinatesEditedRef.current = coordinatesManuallyEdited;
  }, [coordinatesManuallyEdited]);

  useEffect(() => {
    latitudeRef.current = latitude.trim();
  }, [latitude]);

  useEffect(() => {
    longitudeRef.current = longitude.trim();
  }, [longitude]);
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

  const clearFieldErrorsGroup = (keys: FieldErrorKey[]) => {
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
  };

  const handleMapCoordinatesChange = (next: GoogleMapEmbedCoordinates) => {
    setLatitude(next.lat.toFixed(6));
    setLongitude(next.lng.toFixed(6));
    setApiError(null);
    clearFieldErrorsGroup(["latitude", "longitude"]);
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
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
    setNearestBusStop("");
    setHasFieldPoles(null);
    clearFieldErrorsGroup([
      "land_area_m2",
      "open_periods"
    ]);
  };

  const resetContactSection = () => {
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
  };

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

  const formatQueuedPhotoSize = useCallback(
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

  const handleMunicipalityCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMunicipalityCode(event.target.value.toUpperCase());
    setApiError(null);
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

  const normalizeAdvancedMetadataInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return { formatted: "", isValid: true } as const;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("invalid");
      }
      return { formatted: JSON.stringify(parsed, null, 2), isValid: true } as const;
    } catch {
      return { formatted: value, isValid: false } as const;
    }
  };

  const handleAdvancedMetadataChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setAdvancedMetadata(event.target.value);
    setAdvancedMetadataError(null);
  };

  const handleAdvancedMetadataBlur = () => {
    const { formatted, isValid } = normalizeAdvancedMetadataInput(advancedMetadata);
    if (!isValid) {
      setAdvancedMetadataError(t("structures.create.form.advancedMetadata.error"));
      return;
    }
    setAdvancedMetadata(formatted);
    setAdvancedMetadataError(null);
  };

  const handleLatitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLatitude(event.target.value);
    setApiError(null);
    clearFieldError("latitude");
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
  };

  const handleLongitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLongitude(event.target.value);
    setApiError(null);
    clearFieldError("longitude");
    setCoordinatesManuallyEdited(true);
    setGeocodingApplied(false);
  };

  const handleAltitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAltitude(event.target.value);
    setApiError(null);
    clearFieldError("altitude");
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
      | "paymentMethods"
      | "paymentTerms"
      | "minTotal"
      | "maxTotal"
      | "advancedMetadata",
    value: string
  ) => {
    const updates: Partial<CostOptionFormRow> = { [field]: value } as Partial<CostOptionFormRow>;
    if (field === "advancedMetadata") {
      updates.advancedMetadataError = null;
    }
    if (field === "utilitiesIncluded" && value === "") {
      updates.utilitiesIncluded = "";
    }
    updateCostOption(key, updates);
  };

  const handleCostOptionAdvancedMetadataBlur = (key: string) => {
    setCostOptions((prev) =>
      prev.map((row) => {
        if (row.key !== key) {
          return row;
        }
        const { formatted, isValid } = normalizeAdvancedMetadataInput(row.advancedMetadata);
        if (!isValid) {
          return {
            ...row,
            advancedMetadataError: t("structures.create.errors.costOptionsAdvancedInvalid")
          };
        }
        return {
          ...row,
          advancedMetadata: formatted,
          advancedMetadataError: null
        };
      })
    );
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

  const handleNearestBusStopChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNearestBusStop(event.target.value);
    setApiError(null);
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

  const handleAllowedAudienceChange = (index: number, value: string) => {
    setAllowedAudiences((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
  };

  const handleUsageRulesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setUsageRules(event.target.value);
    setApiError(null);
  };

  const handleInAreaProtettaChange = (value: boolean | null) => {
    setInAreaProtetta(value);
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
    setAllowedAudiences((current) => {
      if (current.length === 1) {
        return [""];
      }
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [""];
    });
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

  const evaluateWebsiteUrlStatus = (value: string): WebsiteUrlStatus => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "idle";
    }

    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? "valid" : "invalid";
    } catch (error) {
      return "invalid";
    }
  };

  useEffect(() => {
    if (!isEditing || !existingStructure || isPrefilled) {
      return;
    }

    setStructureId(existingStructure.id);
    setName(existingStructure.name ?? "");
    setSlug(existingStructure.slug ?? "");
    setProvince(existingStructure.province ?? "");
    setMunicipality(existingStructure.municipality ?? "");
    setMunicipalityCode(existingStructure.municipality_code ?? "");
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
    setNearestBusStop(existingStructure.nearest_bus_stop ?? "");
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

    const audiences =
      existingStructure.allowed_audiences && existingStructure.allowed_audiences.length > 0
        ? [...existingStructure.allowed_audiences]
        : [""];
    setAllowedAudiences(audiences);
    setUsageRules(existingStructure.usage_rules ?? "");
    setInAreaProtetta(toTriState(existingStructure.in_area_protetta));
    setEnteAreaProtetta(existingStructure.ente_area_protetta ?? "");
    setEnvironmentalNotes(existingStructure.environmental_notes ?? "");
    setFloodRisk(existingStructure.flood_risk ?? "");

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

    const advancedData = extractAdvancedStructureData(existingStructure);
    if (Object.keys(advancedData).length > 0) {
      setAdvancedMetadata(JSON.stringify(advancedData, null, 2));
    } else {
      setAdvancedMetadata("");
    }
    setAdvancedMetadataError(null);

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
      const advancedCostData = extractAdvancedCostOptionData(option);
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
        paymentMethods: option.payment_methods?.join("\n") ?? "",
        paymentTerms: option.payment_terms ?? "",
        minTotal:
          option.min_total !== null && option.min_total !== undefined
            ? String(option.min_total)
            : "",
        maxTotal:
          option.max_total !== null && option.max_total !== undefined
            ? String(option.max_total)
            : "",
        advancedMetadata:
          Object.keys(advancedCostData).length > 0
            ? JSON.stringify(advancedCostData, null, 2)
            : "",
        advancedMetadataError: null
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
    setIsPrefilled(true);
  }, [
    existingStructure,
    isEditing,
    isPrefilled,
    evaluateWebsiteUrlStatus,
    resetContactSection
  ]);

  useEffect(() => {
    const trimmedAddress = address.trim();
    const trimmedLocality = locality.trim();
    const trimmedMunicipality = municipality.trim();
    const trimmedProvince = province.trim();
    const trimmedPostal = postalCode.trim();

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

    geocodingDebounceRef.current = window.setTimeout(() => {
      const params = {
        address: trimmedAddress || undefined,
        locality: trimmedLocality || undefined,
        municipality: trimmedMunicipality || undefined,
        province: trimmedProvince || undefined,
        postal_code: trimmedPostal || undefined,
        country: "IT"
      };

      searchGeocoding(params, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted || requestId !== geocodingRequestId.current) {
            return;
          }
          const [first] = results;
          setGeocodingStatus("success");
          setGeocodingSuggestion(first ?? null);
          if (!first) {
            setGeocodingApplied(false);
            return;
          }

          const suggestedLatitude = first.latitude.toFixed(6);
          const suggestedLongitude = first.longitude.toFixed(6);

          if (
            !coordinatesEditedRef.current &&
            !latitudeRef.current &&
            !longitudeRef.current
          ) {
            setLatitude(suggestedLatitude);
            setLongitude(suggestedLongitude);
            setGeocodingApplied(true);
          } else {
            setGeocodingApplied(false);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== geocodingRequestId.current) {
            return;
          }
          if (error instanceof ApiError) {
            setGeocodingError(error.message);
          } else if (error instanceof Error) {
            setGeocodingError(error.message);
          } else {
            setGeocodingError(String(error));
          }
          setGeocodingSuggestion(null);
          setGeocodingStatus("error");
          setGeocodingApplied(false);
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
  }, [address, locality, municipality, province, postalCode]);

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
      paymentMethods: option.paymentMethods.trim(),
      paymentTerms: option.paymentTerms.trim(),
      minTotal: option.minTotal.trim(),
      maxTotal: option.maxTotal.trim(),
      advancedMetadata: option.advancedMetadata.trim()
    }));

    const errors: FieldErrors = {};

    if (!trimmedName) {
      errors.name = t("structures.create.errors.nameRequired");
    }

    if (!type) {
      errors.type = t("structures.create.errors.typeRequired");
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

    const isCostOptionEmpty = (option: typeof trimmedCostOptions[number]) =>
      !option.model &&
      !option.amount &&
      !option.bookingDeposit &&
      !option.damageDeposit &&
      !option.cityTaxPerNight &&
      !option.utilitiesFlat &&
      !option.minTotal &&
      !option.maxTotal &&
      !option.utilitiesNotes &&
      !option.paymentMethods &&
      !option.paymentTerms &&
      option.utilitiesIncluded === "" &&
      !option.advancedMetadata;

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
        option.maxTotal
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

    let parsedAdvancedMetadata: Record<string, unknown> | null = null;
    const trimmedAdvancedMetadata = advancedMetadata.trim();
    if (trimmedAdvancedMetadata) {
      try {
        const parsed = JSON.parse(trimmedAdvancedMetadata);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("invalid");
        }
        parsedAdvancedMetadata = parsed as Record<string, unknown>;
        setAdvancedMetadataError(null);
      } catch (error) {
        setAdvancedMetadataError(t("structures.create.form.advancedMetadata.error"));
        advancedMetadataRef.current?.focus();
        return;
      }
    } else {
      setAdvancedMetadataError(null);
    }

    if (addContact && contactHasDetails()) {
      const duplicatesOk = await checkContactDuplicates();
      if (!duplicatesOk) {
        return;
      }
    }

    const trimmedProvince = province.trim();
    const trimmedMunicipality = municipality.trim();
    const trimmedMunicipalityCode = municipalityCode.trim();
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
    const trimmedNearestBusStop = nearestBusStop.trim();
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
      paymentMethods: option.paymentMethods.trim(),
      paymentTerms: option.paymentTerms.trim(),
      minTotal: option.minTotal.trim(),
      maxTotal: option.maxTotal.trim(),
      advancedMetadata: option.advancedMetadata.trim()
    }));

    const payload: StructureCreateDto = {
      name: name.trim(),
      slug: slug.trim(),
      type: type as StructureType,
      has_kitchen: hasKitchen,
      hot_water: hotWater,
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

    if (operationalStatus) {
      payload.operational_status = operationalStatus as StructureOperationalStatus;
    } else {
      payload.operational_status = null;
    }

    const showIndoorSection = type !== "land";
    const showOutdoorSection = type !== "house";

    if (trimmedProvince) {
      payload.province = trimmedProvince.toUpperCase();
    }

    if (trimmedMunicipality) {
      payload.municipality = trimmedMunicipality;
    }

    if (trimmedMunicipalityCode) {
      payload.municipality_code = trimmedMunicipalityCode.toUpperCase();
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
      payload.nearest_bus_stop = trimmedNearestBusStop || null;
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
      payload.nearest_bus_stop = null;
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
    payload.ente_area_protetta = trimmedEnteAreaProtetta || null;
    payload.environmental_notes = trimmedEnvironmentalNotes || null;
    if (floodRisk) {
      payload.flood_risk = floodRisk as FloodRiskLevel;
    } else {
      payload.flood_risk = null;
    }

    if (parsedAdvancedMetadata) {
      mergeAdvancedStructurePayload(
        payload as unknown as Record<string, unknown>,
        parsedAdvancedMetadata
      );
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
        } catch (error) {
          void error;
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

    const advancedCostErrors: Record<string, string> = {};

    const costOptionPayloads: StructureCostOptionInput[] = trimmedCostOptions
      .map((option) => {
        const isEmpty =
          !option.model &&
          !option.amount &&
          !option.bookingDeposit &&
          !option.damageDeposit &&
          !option.cityTaxPerNight &&
          !option.utilitiesFlat &&
          !option.minTotal &&
          !option.maxTotal &&
          !option.utilitiesNotes &&
          !option.paymentMethods &&
          !option.paymentTerms &&
          option.utilitiesIncluded === "" &&
          !option.advancedMetadata;
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
        const paymentMethods = option.paymentMethods
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        if (paymentMethods.length > 0) {
          payloadItem.payment_methods = paymentMethods;
        }
        const trimmedPaymentTerms = option.paymentTerms.trim();
        if (trimmedPaymentTerms) {
          payloadItem.payment_terms = trimmedPaymentTerms;
        }
        const trimmedAdvancedMetadata = option.advancedMetadata.trim();
        if (trimmedAdvancedMetadata) {
          try {
            const parsedAdvanced = JSON.parse(trimmedAdvancedMetadata);
            if (
              parsedAdvanced &&
              typeof parsedAdvanced === "object" &&
              !Array.isArray(parsedAdvanced)
            ) {
              mergeAdvancedCostOptionPayload(
                payloadItem as unknown as Record<string, unknown>,
                parsedAdvanced as Record<string, unknown>
              );
            } else {
              throw new Error("invalid");
            }
          } catch {
            advancedCostErrors[option.key] = t(
              "structures.create.errors.costOptionsAdvancedInvalid"
            );
            return null;
          }
        }
        return payloadItem;
      })
      .filter((item): item is StructureCostOptionInput => item !== null);

    if (Object.keys(advancedCostErrors).length > 0) {
      setCostOptions((prev) =>
        prev.map((row) => ({
          ...row,
          advancedMetadataError: advancedCostErrors[row.key] ?? null
        }))
      );
      setFieldErrors((prev) => ({
        ...prev,
        cost_options: t("structures.create.errors.costOptionsAdvancedInvalid")
      }));
      return;
    }

    if (costOptions.some((row) => row.advancedMetadataError)) {
      setCostOptions((prev) =>
        prev.map((row) => ({
          ...row,
          advancedMetadataError: null
        }))
      );
    }

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
          window.alert(t("structures.create.contact.saveFailed"));
        }
      }

      try {
        await uploadQueuedPhotos(saved.id);
      } catch (photoUploadError) {
        console.error("Unable to upload structure photos", photoUploadError);
        window.alert(t("structures.create.photos.uploadFailed"));
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
  const openPeriodsErrorId = fieldErrors.open_periods
    ? "structure-open-periods-error"
    : undefined;

  const typeHintId = "structure-type-hint";
  const typeDescribedBy = [typeHintId, typeErrorId].filter(Boolean).join(" ") || undefined;
  const operationalStatusHintId = "structure-operational-status-hint";
  const operationalStatusDescribedBy = operationalStatusHintId;
  const provinceHintId = "structure-province-hint";
  const provinceDescribedBy = [provinceHintId, provinceErrorId].filter(Boolean).join(" ") || undefined;
  const municipalityHintId = "structure-municipality-hint";
  const municipalityCodeHintId = "structure-municipality-code-hint";
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
  const usageRulesHintId = "structure-usage-rules-hint";
  const inAreaProtettaHintId = "structure-in-area-protetta-hint";
  const enteAreaProtettaHintId = "structure-ente-area-protetta-hint";
  const floodRiskHintId = "structure-flood-risk-hint";
  const environmentalNotesHintId = "structure-environmental-notes-hint";
  const seasonalAmenitiesHintId = "structure-seasonal-amenities-hint";
  const advancedMetadataHintId = "structure-advanced-metadata-hint";
  const advancedMetadataErrorId = advancedMetadataError
    ? "structure-advanced-metadata-error"
    : undefined;
  const advancedMetadataDescribedBy =
    [advancedMetadataHintId, advancedMetadataErrorId].filter(Boolean).join(" ") || undefined;
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
              <div className="structure-field-grid">
                <div className="structure-form-field">
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

                <div className="structure-form-field">
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

                <div className="structure-form-field">
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
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.location.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.location.description")}
              </p>
              <div className="structure-location-layout">
                <section className="structure-location-panel">
                  <header className="structure-location-panel__header">
                    <h3 className="structure-location-panel__title">
                      {t("structures.create.form.location.addressTitle")}
                    </h3>
                    <p className="helper-text structure-location-panel__description">
                      {t("structures.create.form.location.addressDescription")}
                    </p>
                  </header>
                  <div className="structure-location-panel__fields structure-field-grid">
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

                    <div className="structure-form-field">
                      <label htmlFor="structure-municipality-code">
                        {t("structures.create.form.municipalityCode")}
                        <input
                          id="structure-municipality-code"
                          value={municipalityCode}
                          onChange={handleMunicipalityCodeChange}
                          maxLength={16}
                          placeholder={t("structures.create.form.municipalityCodePlaceholder")}
                          aria-describedby={municipalityCodeHintId}
                        />
                      </label>
                      <span className="helper-text" id={municipalityCodeHintId}>
                        {t("structures.create.form.municipalityCodeHint")}
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
                </section>

                <section className="structure-location-panel">
                  <header className="structure-location-panel__header">
                    <h3 className="structure-location-panel__title">
                      {t("structures.create.form.location.coordinatesTitle")}
                    </h3>
                    <p className="helper-text structure-location-panel__description">
                      {t("structures.create.form.location.coordinatesDescription")}
                    </p>
                  </header>
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

                    <div className="structure-form-field" data-span="full">
                      <div className="structure-map-field">
                        <span className="structure-map-field-title">
                          {t("structures.create.form.map.title")}
                        </span>
                        <GoogleMapEmbed
                          coordinates={selectedCoordinates}
                          title={t("structures.create.form.map.title")}
                          ariaLabel={t("structures.create.form.map.ariaLabel")}
                          emptyLabel={t("structures.create.form.map.empty")}
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
                        {geocodingApplied && (
                          <span className="structure-geocode-status structure-geocode-status__message structure-geocode-status__message--success">
                            {t("structures.create.form.geocoding.applied")}
                          </span>
                        )}
                        {selectedCoordinatesLabel && (
                          <span className="structure-map-field-selected helper-text">
                            {selectedCoordinatesLabel}
                          </span>
                        )}
                      </div>
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

                <div className="structure-form-field">
                  <label htmlFor="structure-nearest-bus-stop">
                    {t("structures.create.form.nearestBusStop")}
                    <input
                      id="structure-nearest-bus-stop"
                      value={nearestBusStop}
                      onChange={handleNearestBusStopChange}
                      maxLength={255}
                    />
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.nearestBusStopHint")}
                  </span>
                </div>

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

                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-allowed-audience-0" id="structure-allowed-audience-label">
                    {t("structures.create.form.allowedAudiences.label")}
                  </label>
                  <div className="structure-website-list">
                    {allowedAudiences.map((value, index) => {
                      const inputId = `structure-allowed-audience-${index}`;
                      const ariaLabel =
                        index === 0
                          ? t("structures.create.form.allowedAudiences.entryLabel", { index: index + 1 })
                          : t("structures.create.form.allowedAudiences.entryLabel", { index: index + 1 });
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
                          {allowedAudiences.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAllowedAudience(index)}
                              className="link-button"
                            >
                              {t("structures.create.form.allowedAudiences.remove")}
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
                      onClick={handleAddAllowedAudience}
                    >
                      {t("structures.create.form.allowedAudiences.add")}
                    </Button>
                  </div>
                  <span className="helper-text" id={allowedAudiencesHintId}>
                    {t("structures.create.form.allowedAudiences.hint")}
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

                <div className="structure-form-field tri-state-field">
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

                <div className="structure-form-field">
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

                <div className="structure-form-field">
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

                <div className="structure-form-field" data-span="full">
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
              <legend>{t("structures.create.form.sections.costs.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.costs.description")}
              </p>
              <div className="structure-field-grid">
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
                      {costOptions.map((option) => {
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
                        const paymentMethodsId = `structure-cost-option-${option.key}-payment-methods`;
                        const paymentTermsId = `structure-cost-option-${option.key}-payment-terms`;
                        const advancedMetadataId = `structure-cost-option-${option.key}-advanced`;
                        const advancedMetadataHintId = `${advancedMetadataId}-hint`;
                        const advancedMetadataErrorId = option.advancedMetadataError
                          ? `${advancedMetadataId}-error`
                          : undefined;
                        const advancedMetadataDescribedBy = [
                          advancedMetadataHintId,
                          advancedMetadataErrorId
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined;
                        return (
                          <div className="structure-cost-option-row" key={option.key}>
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
                                      event.target.value
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
                            <div className="structure-cost-option-field structure-cost-option-field--wide">
                              <label htmlFor={paymentMethodsId}>
                                {t("structures.create.form.costOptions.paymentMethods")}
                                <textarea
                                  id={paymentMethodsId}
                                  value={option.paymentMethods}
                                  onChange={(event) =>
                                    handleCostOptionFieldChange(
                                      option.key,
                                      "paymentMethods",
                                      event.target.value
                                    )
                                  }
                                  rows={2}
                                />
                              </label>
                              <span className="helper-text">
                                {t("structures.create.form.costOptions.paymentMethodsHint")}
                              </span>
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
                            </div>
                            <div className="structure-cost-option-field structure-cost-option-field--wide">
                              <label htmlFor={advancedMetadataId}>
                                {t("structures.create.form.costOptions.advancedMetadata.label")}
                                <textarea
                                  id={advancedMetadataId}
                                  value={option.advancedMetadata}
                                  onChange={(event) =>
                                    handleCostOptionFieldChange(
                                      option.key,
                                      "advancedMetadata",
                                      event.target.value
                                    )
                                  }
                                  onBlur={() => handleCostOptionAdvancedMetadataBlur(option.key)}
                                  rows={3}
                                  aria-describedby={advancedMetadataDescribedBy}
                                />
                              </label>
                              <span className="helper-text" id={advancedMetadataHintId}>
                                {t("structures.create.form.costOptions.advancedMetadata.hint")}
                              </span>
                              {option.advancedMetadataError && (
                                <p className="error-text" id={advancedMetadataErrorId}>
                                  {option.advancedMetadataError}
                                </p>
                              )}
                            </div>
                            <div className="structure-cost-option-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveCostOption(option.key)}
                              >
                                {t("structures.create.form.costOptions.remove")}
                              </Button>
                            </div>
                          </div>
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
                                {formatQueuedPhotoSize(file.size)}
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
              <legend>{t("structures.create.form.sections.advanced.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.advanced.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field" data-span="full">
                  <label htmlFor="structure-advanced-metadata">
                    {t("structures.create.form.advancedMetadata.label")}
                    <textarea
                      id="structure-advanced-metadata"
                      ref={advancedMetadataRef}
                      value={advancedMetadata}
                      onChange={handleAdvancedMetadataChange}
                      onBlur={handleAdvancedMetadataBlur}
                      rows={10}
                      spellCheck={false}
                      aria-describedby={advancedMetadataDescribedBy}
                      aria-invalid={advancedMetadataError ? "true" : undefined}
                      placeholder={t("structures.create.form.advancedMetadata.placeholder")}
                    />
                  </label>
                  <span className="helper-text" id={advancedMetadataHintId}>
                    {t("structures.create.form.advancedMetadata.hint")}
                  </span>
                  {advancedMetadataError && (
                    <p className="error-text" id={advancedMetadataErrorId!}>
                      {advancedMetadataError}
                    </p>
                  )}
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
