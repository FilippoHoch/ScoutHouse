import { ChangeEvent, FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ApiError, createStructure } from "../shared/api";
import {
  FirePolicy,
  StructureCreateDto,
  StructureType,
  WaterSource
} from "../shared/types";
import { Button, InlineMessage, SectionHeader, Surface } from "../shared/ui/designSystem";

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
  | "type"
  | "indoor_beds"
  | "indoor_bathrooms"
  | "indoor_showers"
  | "dining_capacity"
  | "website_url"
  | "land_area_m2"
  | "max_tents"
  | "toilets_on_field"
  | "max_vehicle_height_m";

type FieldErrors = Partial<Record<FieldErrorKey, string>>;

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

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [type, setType] = useState<StructureType | "">("");
  const [indoorBeds, setIndoorBeds] = useState("");
  const [indoorBathrooms, setIndoorBathrooms] = useState("");
  const [indoorShowers, setIndoorShowers] = useState("");
  const [diningCapacity, setDiningCapacity] = useState("");
  const [hasKitchen, setHasKitchen] = useState(false);
  const [hotWater, setHotWater] = useState(false);
  const [landArea, setLandArea] = useState("");
  const [maxTents, setMaxTents] = useState("");
  const [shelterOnField, setShelterOnField] = useState(false);
  const [toiletsOnField, setToiletsOnField] = useState("");
  const [waterSource, setWaterSource] = useState<WaterSource | "">("");
  const [electricityAvailable, setElectricityAvailable] = useState(false);
  const [firePolicy, setFirePolicy] = useState<FirePolicy | "">("");
  const [accessByCar, setAccessByCar] = useState(false);
  const [accessByCoach, setAccessByCoach] = useState(false);
  const [accessByPublicTransport, setAccessByPublicTransport] = useState(false);
  const [coachTurningArea, setCoachTurningArea] = useState(false);
  const [maxVehicleHeight, setMaxVehicleHeight] = useState("");
  const [nearestBusStop, setNearestBusStop] = useState("");
  const [winterOpen, setWinterOpen] = useState(false);
  const [weekendOnly, setWeekendOnly] = useState(false);
  const [hasFieldPoles, setHasFieldPoles] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notesLogistics, setNotesLogistics] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [slugDirty, setSlugDirty] = useState(false);

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
    setDiningCapacity("");
    setHasKitchen(false);
    setHotWater(false);
    clearFieldErrorsGroup([
      "indoor_beds",
      "indoor_bathrooms",
      "indoor_showers",
      "dining_capacity"
    ]);
  };

  const resetOutdoorFields = () => {
    setLandArea("");
    setMaxTents("");
    setShelterOnField(false);
    setToiletsOnField("");
    setWaterSource("");
    setElectricityAvailable(false);
    setFirePolicy("");
    setMaxVehicleHeight("");
    setNearestBusStop("");
    setHasFieldPoles(false);
    clearFieldErrorsGroup([
      "land_area_m2",
      "max_tents",
      "toilets_on_field",
      "max_vehicle_height_m"
    ]);
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

  const handleDiningCapacityChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDiningCapacity(event.target.value);
    setApiError(null);
    clearFieldError("dining_capacity");
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

  const handleMaxTentsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMaxTents(event.target.value);
    setApiError(null);
    clearFieldError("max_tents");
  };

  const handleShelterOnFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    setShelterOnField(event.target.checked);
    setApiError(null);
  };

  const handleToiletsOnFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    setToiletsOnField(event.target.value);
    setApiError(null);
    clearFieldError("toilets_on_field");
  };

  const handleWaterSourceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setWaterSource(event.target.value as WaterSource | "");
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

  const handleMaxVehicleHeightChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMaxVehicleHeight(event.target.value);
    setApiError(null);
    clearFieldError("max_vehicle_height_m");
  };

  const handleNearestBusStopChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNearestBusStop(event.target.value);
    setApiError(null);
  };

  const handleWinterOpenChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWinterOpen(event.target.checked);
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

  const handleWebsiteUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWebsiteUrl(event.target.value);
    setApiError(null);
    clearFieldError("website_url");
  };

  const handleNotesLogisticsChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotesLogistics(event.target.value);
    setApiError(null);
  };

  const handleNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
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
    const trimmedSlug = slug.trim();
    const trimmedProvince = province.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedDiningCapacity = diningCapacity.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedMaxTents = maxTents.trim();
    const trimmedToiletsOnField = toiletsOnField.trim();
    const trimmedMaxVehicleHeight = maxVehicleHeight.trim();
    const trimmedWebsiteUrl = websiteUrl.trim();

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
      const latNumber = Number.parseFloat(trimmedLatitude);
      if (Number.isNaN(latNumber) || latNumber < -90 || latNumber > 90) {
        errors.latitude = t("structures.create.errors.latitudeInvalid");
      }
    }

    if (trimmedLongitude) {
      const lonNumber = Number.parseFloat(trimmedLongitude);
      if (Number.isNaN(lonNumber) || lonNumber < -180 || lonNumber > 180) {
        errors.longitude = t("structures.create.errors.longitudeInvalid");
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
      trimmedDiningCapacity,
      "dining_capacity",
      t("structures.create.errors.numberInvalid")
    );
    validateNonNegativeDecimal(
      trimmedLandArea,
      "land_area_m2",
      t("structures.create.errors.decimalInvalid")
    );
    validatePositiveInteger(
      trimmedMaxTents,
      "max_tents",
      t("structures.create.errors.numberInvalid")
    );
    validatePositiveInteger(
      trimmedToiletsOnField,
      "toilets_on_field",
      t("structures.create.errors.numberInvalid")
    );
    validateNonNegativeDecimal(
      trimmedMaxVehicleHeight,
      "max_vehicle_height_m",
      t("structures.create.errors.decimalInvalid")
    );

    if (trimmedWebsiteUrl) {
      try {
        const url = new URL(trimmedWebsiteUrl);
        if (!url.protocol.startsWith("http")) {
          throw new Error("invalid protocol");
        }
      } catch {
        errors.website_url = t("structures.create.errors.websiteInvalid");
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

    const trimmedProvince = province.trim();
    const trimmedAddress = address.trim();
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    const trimmedIndoorBeds = indoorBeds.trim();
    const trimmedIndoorBathrooms = indoorBathrooms.trim();
    const trimmedIndoorShowers = indoorShowers.trim();
    const trimmedDiningCapacity = diningCapacity.trim();
    const trimmedLandArea = landArea.trim();
    const trimmedMaxTents = maxTents.trim();
    const trimmedToiletsOnField = toiletsOnField.trim();
    const trimmedMaxVehicleHeight = maxVehicleHeight.trim();
    const trimmedNearestBusStop = nearestBusStop.trim();
    const trimmedWebsiteUrl = websiteUrl.trim();
    const trimmedNotesLogistics = notesLogistics.trim();
    const trimmedNotes = notes.trim();

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
      winter_open: winterOpen,
      weekend_only: weekendOnly,
      has_field_poles: hasFieldPoles,
    };

    const showIndoorSection = type !== "land";
    const showOutdoorSection = type !== "house";

    if (trimmedProvince) {
      payload.province = trimmedProvince.toUpperCase();
    }

    if (trimmedAddress) {
      payload.address = trimmedAddress;
    }

    if (trimmedLatitude) {
      payload.latitude = Number.parseFloat(trimmedLatitude);
    }

    if (trimmedLongitude) {
      payload.longitude = Number.parseFloat(trimmedLongitude);
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
      payload.dining_capacity = trimmedDiningCapacity
        ? Number.parseInt(trimmedDiningCapacity, 10)
        : null;
    } else {
      payload.indoor_beds = null;
      payload.indoor_bathrooms = null;
      payload.indoor_showers = null;
      payload.dining_capacity = null;
      payload.has_kitchen = false;
      payload.hot_water = false;
    }

    if (showOutdoorSection) {
      payload.land_area_m2 = trimmedLandArea ? Number.parseFloat(trimmedLandArea.replace(",", ".")) : null;
      payload.max_tents = trimmedMaxTents ? Number.parseInt(trimmedMaxTents, 10) : null;
      payload.toilets_on_field = trimmedToiletsOnField
        ? Number.parseInt(trimmedToiletsOnField, 10)
        : null;
      payload.max_vehicle_height_m = trimmedMaxVehicleHeight
        ? Number.parseFloat(trimmedMaxVehicleHeight.replace(",", "."))
        : null;
      payload.nearest_bus_stop = trimmedNearestBusStop || null;
      payload.water_source = waterSource ? (waterSource as WaterSource) : null;
      payload.fire_policy = firePolicy ? (firePolicy as FirePolicy) : null;
    } else {
      payload.land_area_m2 = null;
      payload.max_tents = null;
      payload.shelter_on_field = false;
      payload.toilets_on_field = null;
      payload.water_source = null;
      payload.electricity_available = false;
      payload.fire_policy = null;
      payload.max_vehicle_height_m = null;
      payload.nearest_bus_stop = null;
      payload.has_field_poles = false;
    }

    if (trimmedWebsiteUrl) {
      payload.website_url = trimmedWebsiteUrl;
    }

    if (trimmedNotesLogistics) {
      payload.notes_logistics = trimmedNotesLogistics;
    }

    if (trimmedNotes) {
      payload.notes = trimmedNotes;
    }

    try {
      const created = await createMutation.mutateAsync(payload);
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
  const nameErrorId = fieldErrors.name ? "structure-name-error" : undefined;
  const typeErrorId = fieldErrors.type ? "structure-type-error" : undefined;
  const indoorBedsErrorId = fieldErrors.indoor_beds ? "structure-indoor-beds-error" : undefined;
  const indoorBathroomsErrorId = fieldErrors.indoor_bathrooms
    ? "structure-indoor-bathrooms-error"
    : undefined;
  const indoorShowersErrorId = fieldErrors.indoor_showers
    ? "structure-indoor-showers-error"
    : undefined;
  const diningCapacityErrorId = fieldErrors.dining_capacity
    ? "structure-dining-capacity-error"
    : undefined;
  const landAreaErrorId = fieldErrors.land_area_m2 ? "structure-land-area-error" : undefined;
  const maxTentsErrorId = fieldErrors.max_tents ? "structure-max-tents-error" : undefined;
  const toiletsOnFieldErrorId = fieldErrors.toilets_on_field
    ? "structure-toilets-on-field-error"
    : undefined;
  const maxVehicleHeightErrorId = fieldErrors.max_vehicle_height_m
    ? "structure-max-vehicle-height-error"
    : undefined;
  const websiteErrorId = fieldErrors.website_url ? "structure-website-url-error" : undefined;

  const typeHintId = "structure-type-hint";
  const typeDescribedBy = [typeHintId, typeErrorId].filter(Boolean).join(" ") || undefined;
  const provinceHintId = "structure-province-hint";
  const provinceDescribedBy = [provinceHintId, provinceErrorId].filter(Boolean).join(" ") || undefined;
  const addressHintId = "structure-address-hint";
  const latitudeHintId = "structure-latitude-hint";
  const latitudeDescribedBy = [latitudeHintId, latitudeErrorId].filter(Boolean).join(" ") || undefined;
  const longitudeHintId = "structure-longitude-hint";
  const longitudeDescribedBy = [longitudeHintId, longitudeErrorId].filter(Boolean).join(" ") || undefined;
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
  const diningCapacityHintId = "structure-dining-capacity-hint";
  const diningCapacityDescribedBy = [diningCapacityHintId, diningCapacityErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const landAreaHintId = "structure-land-area-hint";
  const landAreaDescribedBy = [landAreaHintId, landAreaErrorId].filter(Boolean).join(" ") || undefined;
  const maxTentsHintId = "structure-max-tents-hint";
  const maxTentsDescribedBy = [maxTentsHintId, maxTentsErrorId].filter(Boolean).join(" ") || undefined;
  const toiletsOnFieldHintId = "structure-toilets-on-field-hint";
  const toiletsOnFieldDescribedBy = [toiletsOnFieldHintId, toiletsOnFieldErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const maxVehicleHeightHintId = "structure-max-vehicle-height-hint";
  const maxVehicleHeightDescribedBy = [maxVehicleHeightHintId, maxVehicleHeightErrorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const websiteHintId = "structure-website-hint";
  const websiteDescribedBy = [websiteHintId, websiteErrorId].filter(Boolean).join(" ") || undefined;

  const showIndoorSection = type !== "land";
  const showOutdoorSection = type !== "house";

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const trimmedProvince = province.trim();
  const trimmedAddress = address.trim();
  const trimmedLatitude = latitude.trim();
  const trimmedLongitude = longitude.trim();

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

  const sidebarTips = [
    t("structures.create.sidebar.items.fields"),
    t("structures.create.sidebar.items.details"),
    t("structures.create.sidebar.items.services"),
    t("structures.create.sidebar.items.accessibility"),
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
                    <label htmlFor="structure-dining-capacity">
                      {t("structures.create.form.diningCapacity")}
                      <input
                        id="structure-dining-capacity"
                        value={diningCapacity}
                        onChange={handleDiningCapacityChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={diningCapacityDescribedBy}
                        aria-invalid={fieldErrors.dining_capacity ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={diningCapacityHintId}>
                      {t("structures.create.form.diningCapacityHint")}
                    </span>
                    {fieldErrors.dining_capacity && (
                      <p className="error-text" id={diningCapacityErrorId!}>
                        {fieldErrors.dining_capacity}
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
                    <label htmlFor="structure-max-tents">
                      {t("structures.create.form.maxTents")}
                      <input
                        id="structure-max-tents"
                        value={maxTents}
                        onChange={handleMaxTentsChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={maxTentsDescribedBy}
                        aria-invalid={fieldErrors.max_tents ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={maxTentsHintId}>
                      {t("structures.create.form.maxTentsHint")}
                    </span>
                    {fieldErrors.max_tents && (
                      <p className="error-text" id={maxTentsErrorId!}>
                        {fieldErrors.max_tents}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-toilets-on-field">
                      {t("structures.create.form.toiletsOnField")}
                      <input
                        id="structure-toilets-on-field"
                        value={toiletsOnField}
                        onChange={handleToiletsOnFieldChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-describedby={toiletsOnFieldDescribedBy}
                        aria-invalid={fieldErrors.toilets_on_field ? "true" : undefined}
                      />
                    </label>
                    <span className="helper-text" id={toiletsOnFieldHintId}>
                      {t("structures.create.form.toiletsOnFieldHint")}
                    </span>
                    {fieldErrors.toilets_on_field && (
                      <p className="error-text" id={toiletsOnFieldErrorId!}>
                        {fieldErrors.toilets_on_field}
                      </p>
                    )}
                  </div>

                  <div className="structure-form-field">
                    <label htmlFor="structure-water-source">
                      {t("structures.create.form.waterSource")}
                      <select
                        id="structure-water-source"
                        value={waterSource}
                        onChange={handleWaterSourceChange}
                      >
                        <option value="">
                          {t("structures.create.form.waterSourcePlaceholder")}
                        </option>
                        {waterSourceOptions.map((option) => (
                          <option key={option} value={option}>
                            {t(`structures.create.form.waterSourceOptions.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="helper-text">
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
                  <label htmlFor="structure-max-vehicle-height">
                    {t("structures.create.form.maxVehicleHeight")}
                    <input
                      id="structure-max-vehicle-height"
                      value={maxVehicleHeight}
                      onChange={handleMaxVehicleHeightChange}
                      inputMode="decimal"
                      step="any"
                      aria-describedby={maxVehicleHeightDescribedBy}
                      aria-invalid={fieldErrors.max_vehicle_height_m ? "true" : undefined}
                    />
                  </label>
                  <span className="helper-text" id={maxVehicleHeightHintId}>
                    {t("structures.create.form.maxVehicleHeightHint")}
                  </span>
                  {fieldErrors.max_vehicle_height_m && (
                    <p className="error-text" id={maxVehicleHeightErrorId!}>
                      {fieldErrors.max_vehicle_height_m}
                    </p>
                  )}
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
                <div className="structure-form-field checkbox-field">
                  <label htmlFor="structure-winter-open">
                    <input
                      id="structure-winter-open"
                      type="checkbox"
                      checked={winterOpen}
                      onChange={handleWinterOpenChange}
                    />
                    {t("structures.create.form.winterOpen")}
                  </label>
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
                  <label htmlFor="structure-website">
                    {t("structures.create.form.website")}
                    <input
                      id="structure-website"
                      value={websiteUrl}
                      onChange={handleWebsiteUrlChange}
                      type="url"
                      placeholder="https://"
                      aria-describedby={websiteDescribedBy}
                      aria-invalid={fieldErrors.website_url ? "true" : undefined}
                    />
                  </label>
                  <span className="helper-text" id={websiteHintId}>
                    {t("structures.create.form.websiteHint")}
                  </span>
                  {fieldErrors.website_url && (
                    <p className="error-text" id={websiteErrorId!}>
                      {fieldErrors.website_url}
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
                </div>
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
              <span className="structure-preview-badge">{previewTypeLabel}</span>
              <h4>{previewName}</h4>
              <p className="structure-preview-subtitle">{previewProvince}</p>
              <p className="structure-preview-address">{previewAddress}</p>
              <p className="structure-preview-url">{previewUrlLabel}</p>
              <p className="structure-preview-hint">{previewCoordinatesLabel}</p>
            </div>
          </Surface>
        </aside>
      </div>
    </section>
  );
};
