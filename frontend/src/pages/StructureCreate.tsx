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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  AttachmentConfirmRequest,
  AttachmentUploadRequest,
  checkStructureWebsiteUrl,
  confirmAttachmentUpload,
  createStructure,
  createStructureContact,
  createStructurePhoto,
  searchContacts,
  signAttachmentUpload
} from "../shared/api";
import {
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  FirePolicy,
  StructureCreateDto,
  StructureType,
  StructureOpenPeriodKind,
  StructureOpenPeriodInput,
  StructureOpenPeriodSeason,
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
import {
  GoogleMapPicker,
  GOOGLE_MAP_DEFAULT_CENTER
} from "../shared/ui/GoogleMapPicker";
import { isImageFile } from "../shared/utils/image";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const structureTypes: StructureType[] = ["house", "land", "mixed"];
const waterSourceOptions: WaterSource[] = ["none", "fountain", "tap", "river"];
const firePolicyOptions: FirePolicy[] = ["allowed", "with_permit", "forbidden"];

type FieldErrorKey =
  | "name"
  | "slug"
  | "province"
  | "latitude"
  | "longitude"
  | "altitude"
  | "type"
  | "indoor_beds"
  | "indoor_bathrooms"
  | "indoor_showers"
  | "indoor_activity_rooms"
  | "website_urls"
  | "land_area_m2"
  | "open_periods";

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

const openPeriodSeasonOptions: StructureOpenPeriodSeason[] = [
  "winter",
  "spring",
  "summer",
  "autumn"
];

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

const parseCoordinateValue = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
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

export const StructureCreatePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    document.body.classList.add("layout-wide");
    return () => {
      document.body.classList.remove("layout-wide");
    };
  }, []);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [altitude, setAltitude] = useState("");
  const [type, setType] = useState<StructureType | "">("");
  const [indoorBeds, setIndoorBeds] = useState("");
  const [indoorBathrooms, setIndoorBathrooms] = useState("");
  const [indoorShowers, setIndoorShowers] = useState("");
  const [indoorActivityRooms, setIndoorActivityRooms] = useState("");
  const [hasKitchen, setHasKitchen] = useState(false);
  const [hotWater, setHotWater] = useState(false);
  const [landArea, setLandArea] = useState("");
  const [shelterOnField, setShelterOnField] = useState(false);
  const [pitLatrineAllowed, setPitLatrineAllowed] = useState(false);
  const [waterSources, setWaterSources] = useState<WaterSource[]>([]);
  const [electricityAvailable, setElectricityAvailable] = useState(false);
  const [firePolicy, setFirePolicy] = useState<FirePolicy | "">("");
  const [accessByCar, setAccessByCar] = useState(false);
  const [accessByCoach, setAccessByCoach] = useState(false);
  const [accessByPublicTransport, setAccessByPublicTransport] = useState(false);
  const [coachTurningArea, setCoachTurningArea] = useState(false);
  const [nearestBusStop, setNearestBusStop] = useState("");
  const [weekendOnly, setWeekendOnly] = useState(false);
  const [hasFieldPoles, setHasFieldPoles] = useState(false);
  const [websiteUrls, setWebsiteUrls] = useState<string[]>([""]);
  const [notesLogistics, setNotesLogistics] = useState("");
  const [notes, setNotes] = useState("");
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
  const [openPeriods, setOpenPeriods] = useState<OpenPeriodFormRow[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoDropActive, setPhotoDropActive] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [slugDirty, setSlugDirty] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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

  const previewMapUrl = useMemo(() => {
    const target = selectedCoordinates ?? GOOGLE_MAP_DEFAULT_CENTER;
    const lat = target.lat.toFixed(6);
    const lng = target.lng.toFixed(6);
    const zoom = selectedCoordinates ? 15 : 8;

    const params = new URLSearchParams({
      q: `${lat},${lng}`,
      z: zoom.toString(),
      t: "m",
      output: "embed",
      iwloc: "near"
    });

    return `https://maps.google.com/maps?${params.toString()}`;
  }, [selectedCoordinates]);

  const previewMapPlaceholder = t("structures.create.preview.mapPlaceholder");
  const previewMapTitle = t("structures.create.preview.mapTitle");
  const previewMapAriaLabel = t("structures.create.preview.mapAriaLabel");
  const previewMapHasSelection = Boolean(selectedCoordinates);

  const createMutation = useMutation({
    mutationFn: (dto: StructureCreateDto) => createStructure(dto)
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

  const resetIndoorFields = () => {
    setIndoorBeds("");
    setIndoorBathrooms("");
    setIndoorShowers("");
    setIndoorActivityRooms("");
    setHasKitchen(false);
    setHotWater(false);
    clearFieldErrorsGroup([
      "indoor_beds",
      "indoor_bathrooms",
      "indoor_showers",
      "indoor_activity_rooms"
    ]);
  };

  const resetOutdoorFields = () => {
    setLandArea("");
    setShelterOnField(false);
    setPitLatrineAllowed(false);
    setWaterSources([]);
    setElectricityAvailable(false);
    setFirePolicy("");
    setNearestBusStop("");
    setHasFieldPoles(false);
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
    [
      photoFiles,
      confirmAttachmentUpload,
      createStructurePhoto,
      signAttachmentUpload
    ]
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
    if (!slugDirty) {
      setSlug(toSlug(value));
    }
  };

  const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSlug(toSlug(event.target.value));
    setSlugDirty(true);
    setApiError(null);
    clearFieldError("slug");
  };

  const handleProvinceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProvince(event.target.value.toUpperCase());
    setApiError(null);
    clearFieldError("province");
  };

  const handleAddressChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setAddress(event.target.value);
    setApiError(null);
  };

  const handleLatitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLatitude(event.target.value);
    setApiError(null);
    clearFieldError("latitude");
  };

  const handleLongitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLongitude(event.target.value);
    setApiError(null);
    clearFieldError("longitude");
  };

  const handleAltitudeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAltitude(event.target.value);
    setApiError(null);
    clearFieldError("altitude");
  };

  const handleMapCoordinatesChange = (coordinates: { lat: number; lng: number }) => {
    setLatitude(coordinates.lat.toFixed(6));
    setLongitude(coordinates.lng.toFixed(6));
    setApiError(null);
    clearFieldErrorsGroup(["latitude", "longitude"]);
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

  const handleHasKitchenChange = (event: ChangeEvent<HTMLInputElement>) => {
    setHasKitchen(event.target.checked);
    setApiError(null);
  };

  const handleHotWaterChange = (event: ChangeEvent<HTMLInputElement>) => {
    setHotWater(event.target.checked);
    setApiError(null);
  };

  const handleLandAreaChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLandArea(event.target.value);
    setApiError(null);
    clearFieldError("land_area_m2");
  };

  const handleShelterOnFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    setShelterOnField(event.target.checked);
    setApiError(null);
  };

  const handlePitLatrineAllowedChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPitLatrineAllowed(event.target.checked);
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

  const handleWaterSourcesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValues = Array.from(event.target.selectedOptions).map(
      (option) => option.value as WaterSource
    );
    const nextValues = selectedValues.includes("none")
      ? ["none"]
      : selectedValues;
    setWaterSources(nextValues);
    setApiError(null);
  };

  const handleElectricityAvailableChange = (event: ChangeEvent<HTMLInputElement>) => {
    setElectricityAvailable(event.target.checked);
    setApiError(null);
  };

  const handleFirePolicyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFirePolicy(event.target.value as FirePolicy | "");
    setApiError(null);
  };

  const handleAccessByCarChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAccessByCar(event.target.checked);
    setApiError(null);
  };

  const handleAccessByCoachChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAccessByCoach(event.target.checked);
    setApiError(null);
  };

  const handleAccessByPublicTransportChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAccessByPublicTransport(event.target.checked);
    setApiError(null);
  };

  const handleCoachTurningAreaChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCoachTurningArea(event.target.checked);
    setApiError(null);
  };

  const handleNearestBusStopChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNearestBusStop(event.target.value);
    setApiError(null);
  };

  const handleWeekendOnlyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWeekendOnly(event.target.checked);
    setApiError(null);
  };

  const handleHasFieldPolesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setHasFieldPoles(event.target.checked);
    setApiError(null);
  };

  const handleWebsiteUrlChange = (index: number, value: string) => {
    setWebsiteUrls((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setApiError(null);
    clearFieldError("website_urls");
  };

  const handleAddWebsiteUrl = () => {
    setWebsiteUrls((current) => [...current, ""]);
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
    setApiError(null);
    clearFieldError("website_urls");
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
    const trimmedSlug = slug.trim();
    const trimmedProvince = province.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedAltitude = altitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedIndoorActivityRooms = indoorActivityRooms.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedWebsiteUrls = websiteUrls.map((value) => value.trim());

    const errors: FieldErrors = {};

    if (!trimmedName) {
      errors.name = t("structures.create.errors.nameRequired");
    }

    if (!trimmedSlug || !slugPattern.test(trimmedSlug)) {
      errors.slug = t("structures.create.errors.slugInvalid");
    }

    if (!type) {
      errors.type = t("structures.create.errors.typeRequired");
    }

    if (trimmedProvince && !/^[A-Z]{2}$/.test(trimmedProvince)) {
      errors.province = t("structures.create.errors.provinceInvalid");
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

    const trimmedProvince = province.trim();
    const trimmedAddress = address.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedIndoorActivityRooms = indoorActivityRooms.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedNearestBusStop = nearestBusStop.trim();
    const trimmedWebsiteUrls = websiteUrls.map((value) => value.trim());
    const trimmedNotesLogistics = notesLogistics.trim();
    const trimmedNotes = notes.trim();
    const nonEmptyWebsiteUrls = trimmedWebsiteUrls.filter((value) => value);

    if (nonEmptyWebsiteUrls.length > 0) {
      const checkResults = await Promise.all(
        nonEmptyWebsiteUrls.map(async (url) => {
          try {
            const result = await checkStructureWebsiteUrl({ url });
            return { url, ok: result.ok };
          } catch (error) {
            console.warn("Unable to verify website URL", url, error);
            return { url, ok: false };
          }
        })
      );

      const unreachableUrls = checkResults
        .filter((result) => !result.ok)
        .map((result) => result.url);

      if (unreachableUrls.length > 0) {
        const message = t("structures.create.confirm.websiteUnreachable", {
          count: unreachableUrls.length,
          urls: unreachableUrls.join("\n"),
        });
        const proceed =
          typeof window === "undefined" ? true : window.confirm(message);
        if (!proceed) {
          return;
        }
      }
    }

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

    const showIndoorSection = type !== "land";
    const showOutdoorSection = type !== "house";

    if (trimmedProvince) {
      payload.province = trimmedProvince.toUpperCase();
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
      payload.has_kitchen = false;
      payload.hot_water = false;
    }

    if (showOutdoorSection) {
      payload.land_area_m2 = trimmedLandArea ? Number.parseFloat(trimmedLandArea.replace(",", ".")) : null;
      payload.nearest_bus_stop = trimmedNearestBusStop || null;
      payload.water_sources = waterSources.length > 0 ? [...waterSources] : null;
      payload.fire_policy = firePolicy ? (firePolicy as FirePolicy) : null;
    } else {
      payload.land_area_m2 = null;
      payload.shelter_on_field = false;
      payload.water_sources = null;
      payload.electricity_available = false;
      payload.fire_policy = null;
      payload.nearest_bus_stop = null;
      payload.has_field_poles = false;
      payload.pit_latrine_allowed = false;
    }

    if (nonEmptyWebsiteUrls.length > 0) {
      payload.website_urls = nonEmptyWebsiteUrls;
    }

    if (trimmedNotesLogistics) {
      payload.notes_logistics = trimmedNotesLogistics;
    }

    if (trimmedNotes) {
      payload.notes = trimmedNotes;
    }

    payload.open_periods = openPeriods.map((period): StructureOpenPeriodInput => {
      const base: StructureOpenPeriodInput = { kind: period.kind };
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

    try {
      const created = await createMutation.mutateAsync(payload);

      if (addContact && (contactHasDetails() || contactId !== null)) {
        try {
          await createStructureContact(created.id, buildContactPayload());
        } catch (contactError) {
          window.alert(t("structures.create.contact.saveFailed"));
        }
      }

      try {
        await uploadQueuedPhotos(created.id);
      } catch (photoUploadError) {
        console.error("Unable to upload structure photos", photoUploadError);
        window.alert(t("structures.create.photos.uploadFailed"));
      }

      await queryClient.invalidateQueries({ queryKey: ["structures"] });
      navigate(`/structures/${created.slug}`);
    } catch (error) {
      const fallbackMessage = t("structures.create.errors.saveFailed");
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
  const slugErrorId = fieldErrors.slug ? "structure-slug-error" : undefined;
  const slugDescribedBy = [slugHintId, slugErrorId, slugPreviewId].filter(Boolean).join(" ") || undefined;

  const provinceErrorId = fieldErrors.province ? "structure-province-error" : undefined;
  const latitudeErrorId = fieldErrors.latitude ? "structure-latitude-error" : undefined;
  const longitudeErrorId = fieldErrors.longitude ? "structure-longitude-error" : undefined;
  const altitudeErrorId = fieldErrors.altitude ? "structure-altitude-error" : undefined;
  const nameErrorId = fieldErrors.name ? "structure-name-error" : undefined;
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
  const websiteErrorId = fieldErrors.website_urls ? "structure-website-url-error" : undefined;
  const openPeriodsErrorId = fieldErrors.open_periods
    ? "structure-open-periods-error"
    : undefined;

  const typeHintId = "structure-type-hint";
  const typeDescribedBy = [typeHintId, typeErrorId].filter(Boolean).join(" ") || undefined;
  const provinceHintId = "structure-province-hint";
  const provinceDescribedBy = [provinceHintId, provinceErrorId].filter(Boolean).join(" ") || undefined;
  const addressHintId = "structure-address-hint";
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
  const waterSourcesLabelId = "structure-water-sources-label";
  const waterSourcesHintId = "structure-water-sources-hint";
  const waterSourcesSelectId = "structure-water-sources";
  const waterSourcesSelectSize = Math.min(4, waterSourceOptions.length);
  const websiteHintId = "structure-website-hint";
  const websiteDescribedBy = [websiteHintId, websiteErrorId].filter(Boolean).join(" ") || undefined;
  const openPeriodsHintId = "structure-open-periods-hint";
  const openPeriodsDescribedBy = [openPeriodsHintId, openPeriodsErrorId]
    .filter(Boolean)
    .join(" ") || undefined;

  const showIndoorSection = type !== "land";
  const showOutdoorSection = type !== "house";

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const trimmedProvince = province.trim();
  const trimmedAddress = address.trim();
  const trimmedLatitude = latitude.trim();
  const trimmedLongitude = longitude.trim();
  const trimmedAltitude = altitude.trim();

  const slugPreviewMessage = trimmedSlug
    ? t("structures.create.form.slugPreviewLabel", { url: `/structures/${trimmedSlug}` })
    : t("structures.create.form.slugPreviewPlaceholder");

  const previewName = trimmedName || t("structures.create.preview.namePlaceholder");
  const previewTypeLabel = type
    ? t(`structures.types.${type}`)
    : t("structures.create.preview.typeFallback");
  const previewProvince = trimmedProvince || t("structures.create.preview.provinceFallback");
  const previewAddress = trimmedAddress || t("structures.create.preview.addressFallback");
  const previewUrlLabel = trimmedSlug
    ? t("structures.create.preview.urlLabel", { url: `/structures/${trimmedSlug}` })
    : t("structures.create.preview.urlPlaceholder");
  const previewCoordinatesLabel =
    trimmedLatitude && trimmedLongitude
      ? t("structures.create.preview.coordinatesLabel", {
          lat: trimmedLatitude,
          lon: trimmedLongitude
        })
      : t("structures.create.preview.coordinatesPlaceholder");
  const previewAltitudeLabel = trimmedAltitude
    ? t("structures.create.preview.altitudeLabel", { alt: trimmedAltitude })
    : null;

  const sidebarTips = [
    t("structures.create.sidebar.items.fields"),
    t("structures.create.sidebar.items.details"),
    t("structures.create.sidebar.items.services"),
    t("structures.create.sidebar.items.accessibility"),
    t("structures.create.sidebar.items.photos"),
    t("structures.create.sidebar.items.operations")
  ];

  return (
    <section aria-labelledby="structure-create-title" className="structure-create">
      <div className="structure-create-grid">
        <Surface className="structure-create-card">
          <SectionHeader className="structure-create-header">
            <h2 id="structure-create-title">{t("structures.create.title")}</h2>
            <p className="helper-text">{t("structures.create.description")}</p>
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
                      aria-describedby={nameErrorId || undefined}
                    />
                  </label>
                  {fieldErrors.name && (
                    <p className="error-text" id={nameErrorId!}>
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-slug">
                    {t("structures.create.form.slug")}
                    <input
                      id="structure-slug"
                      value={slug}
                      onChange={handleSlugChange}
                      autoComplete="off"
                      required
                      aria-invalid={fieldErrors.slug ? "true" : undefined}
                      aria-describedby={slugDescribedBy}
                    />
                  </label>
                  <div className="structure-form-footnote">
                    <span className="helper-text" id={slugHintId}>
                      {t("structures.create.form.slugHint")}
                    </span>
                    <span className="helper-text slug-preview" id={slugPreviewId}>
                      {slugPreviewMessage}
                    </span>
                  </div>
                  {fieldErrors.slug && (
                    <p className="error-text" id={slugErrorId}>
                      {fieldErrors.slug}
                    </p>
                  )}
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
              </div>
            </fieldset>

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.location.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.location.description")}
              </p>
              <div className="structure-field-grid">
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

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-has-kitchen">
                      <input
                        id="structure-has-kitchen"
                        type="checkbox"
                        checked={hasKitchen}
                        onChange={handleHasKitchenChange}
                      />
                      {t("structures.create.form.hasKitchen")}
                    </label>
                    <span className="helper-text">
                      {t("structures.create.form.hasKitchenHint")}
                    </span>
                  </div>

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-hot-water">
                      <input
                        id="structure-hot-water"
                        type="checkbox"
                        checked={hotWater}
                        onChange={handleHotWaterChange}
                      />
                      {t("structures.create.form.hotWater")}
                    </label>
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
                    <label id={waterSourcesLabelId} htmlFor={waterSourcesSelectId}>
                      {t("structures.create.form.waterSource")}
                    </label>
                    <select
                      id={waterSourcesSelectId}
                      multiple
                      className="structure-water-sources-select"
                      value={waterSources}
                      onChange={handleWaterSourcesChange}
                      aria-labelledby={waterSourcesLabelId}
                      aria-describedby={waterSourcesHintId}
                      size={waterSourcesSelectSize}
                    >
                      {waterSourceOptions.map((option) => (
                        <option key={option} value={option}>
                          {t(`structures.create.form.waterSourceOptions.${option}`)}
                        </option>
                      ))}
                    </select>
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

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-shelter-on-field">
                      <input
                        id="structure-shelter-on-field"
                        type="checkbox"
                        checked={shelterOnField}
                        onChange={handleShelterOnFieldChange}
                      />
                      {t("structures.create.form.shelterOnField")}
                    </label>
                    <span className="helper-text">
                      {t("structures.create.form.shelterOnFieldHint")}
                    </span>
                  </div>

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-electricity-available">
                      <input
                        id="structure-electricity-available"
                        type="checkbox"
                        checked={electricityAvailable}
                        onChange={handleElectricityAvailableChange}
                      />
                      {t("structures.create.form.electricityAvailable")}
                    </label>
                    <span className="helper-text">
                      {t("structures.create.form.electricityAvailableHint")}
                    </span>
                  </div>

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-has-field-poles">
                      <input
                        id="structure-has-field-poles"
                        type="checkbox"
                        checked={hasFieldPoles}
                        onChange={handleHasFieldPolesChange}
                      />
                      {t("structures.create.form.hasFieldPoles")}
                    </label>
                    <span className="helper-text">
                      {t("structures.create.form.hasFieldPolesHint")}
                    </span>
                  </div>

                  <div className="structure-form-field checkbox-field">
                    <label htmlFor="structure-pit-latrine">
                      <input
                        id="structure-pit-latrine"
                        type="checkbox"
                        checked={pitLatrineAllowed}
                        onChange={handlePitLatrineAllowedChange}
                      />
                      {t("structures.create.form.pitLatrineAllowed")}
                    </label>
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
                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-access-car">
                    <input
                      id="structure-access-car"
                      type="checkbox"
                      checked={accessByCar}
                      onChange={handleAccessByCarChange}
                    />
                    {t("structures.create.form.accessByCar")}
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.accessByCarHint")}
                  </span>
                </div>

                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-access-coach">
                    <input
                      id="structure-access-coach"
                      type="checkbox"
                      checked={accessByCoach}
                      onChange={handleAccessByCoachChange}
                    />
                    {t("structures.create.form.accessByCoach")}
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.accessByCoachHint")}
                  </span>
                </div>

                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-access-pt">
                    <input
                      id="structure-access-pt"
                      type="checkbox"
                      checked={accessByPublicTransport}
                      onChange={handleAccessByPublicTransportChange}
                    />
                    {t("structures.create.form.accessByPublicTransport")}
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.accessByPublicTransportHint")}
                  </span>
                </div>

                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-coach-turning-area">
                    <input
                      id="structure-coach-turning-area"
                      type="checkbox"
                      checked={coachTurningArea}
                      onChange={handleCoachTurningAreaChange}
                    />
                    {t("structures.create.form.coachTurningArea")}
                  </label>
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

                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-weekend-only">
                    <input
                      id="structure-weekend-only"
                      type="checkbox"
                      checked={weekendOnly}
                      onChange={handleWeekendOnlyChange}
                    />
                    {t("structures.create.form.weekendOnly")}
                  </label>
                  <span className="helper-text">
                    {t("structures.create.form.weekendOnlyHint")}
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
              <legend>{t("structures.create.form.sections.extras.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.extras.description")}
              </p>
              <div className="structure-field-grid">
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
              <legend>{t("structures.create.form.sections.contact.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.contact.description")}
              </p>
              <div className="structure-field-grid">
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
                      return (
                        <div className="structure-website-list__row" key={inputId}>
                          <input
                            id={inputId}
                            type="url"
                            value={value}
                            onChange={(event) => handleWebsiteUrlChange(index, event.target.value)}
                            placeholder="https://"
                            aria-describedby={websiteDescribedBy}
                            aria-invalid={fieldErrors.website_urls ? "true" : undefined}
                            aria-label={ariaLabel}
                          />
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

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.coordinates.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.coordinates.description")}
              </p>
              <div className="structure-field-grid">
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
                    <GoogleMapPicker
                      apiKey={googleMapsApiKey}
                      value={selectedCoordinates}
                      onChange={handleMapCoordinatesChange}
                      labels={{
                        loading: t("structures.create.form.map.loading"),
                        loadError: t("structures.create.form.map.error"),
                        missingKey: t("structures.create.form.map.missingKey")
                      }}
                      ariaLabel={t("structures.create.form.map.ariaLabel")}
                    />
                    <span className="helper-text">
                      {t("structures.create.form.map.hint")}
                    </span>
                    {selectedCoordinatesLabel && (
                      <span className="structure-map-field-selected helper-text">
                        {selectedCoordinatesLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </fieldset>

            {apiError && <InlineMessage tone="danger">{apiError}</InlineMessage>}

            <div className="structure-form-actions">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? t("structures.create.form.submitting")
                  : t("structures.create.form.submit")}
              </Button>
            </div>
          </form>
        </Surface>

        <aside className="structure-create-sidebar">
          <Surface className="structure-create-sidebar-card">
            <div>
              <h3>{t("structures.create.sidebar.title")}</h3>
              <ul className="structure-create-sidebar-list">
                {sidebarTips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          </Surface>

          <Surface className="structure-create-sidebar-card">
            <h3>{t("structures.create.preview.title")}</h3>
            <div className="structure-preview-card">
              <div
                className="structure-preview-map"
                data-has-selection={previewMapHasSelection ? "true" : "false"}
              >
                <iframe
                  src={previewMapUrl}
                  title={previewMapTitle}
                  aria-label={previewMapAriaLabel}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <span
                  className="structure-preview-map-placeholder"
                  aria-hidden={previewMapHasSelection ? "true" : "false"}
                >
                  {previewMapPlaceholder}
                </span>
              </div>
              <span className="structure-preview-badge">{previewTypeLabel}</span>
              <h4>{previewName}</h4>
              <p className="structure-preview-subtitle">{previewProvince}</p>
              <p className="structure-preview-address">{previewAddress}</p>
              <p className="structure-preview-url">{previewUrlLabel}</p>
              <p className="structure-preview-hint">{previewCoordinatesLabel}</p>
              {previewAltitudeLabel && (
                <p className="structure-preview-hint">{previewAltitudeLabel}</p>
              )}
            </div>
          </Surface>
        </aside>
      </div>
    </section>
  );
};
