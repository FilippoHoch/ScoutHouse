import { ChangeEvent, FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ApiError, createStructure } from "../shared/api";
import { StructureCreateDto, StructureType } from "../shared/types";
import { Button, InlineMessage, SectionHeader, Surface } from "../shared/ui/designSystem";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const structureTypes: StructureType[] = ["house", "land", "mixed"];

type FieldErrorKey =
  | "name"
  | "slug"
  | "province"
  | "latitude"
  | "longitude"
  | "type"
  | "beds"
  | "bathrooms"
  | "showers"
  | "dining_capacity"
  | "website_url";

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
  const [beds, setBeds] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [showers, setShowers] = useState("");
  const [diningCapacity, setDiningCapacity] = useState("");
  const [hasKitchen, setHasKitchen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [slugDirty, setSlugDirty] = useState(false);

  const createMutation = useMutation({
    mutationFn: (dto: StructureCreateDto) => createStructure(dto)
  });

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

  const handleBedsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBeds(event.target.value);
    setApiError(null);
    clearFieldError("beds");
  };

  const handleBathroomsChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBathrooms(event.target.value);
    setApiError(null);
    clearFieldError("bathrooms");
  };

  const handleShowersChange = (event: ChangeEvent<HTMLInputElement>) => {
    setShowers(event.target.value);
    setApiError(null);
    clearFieldError("showers");
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

  const handleWebsiteUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setWebsiteUrl(event.target.value);
    setApiError(null);
    clearFieldError("website_url");
  };

  const handleNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
    setApiError(null);
  };

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setType(event.target.value as StructureType | "");
    setApiError(null);
    clearFieldError("type");
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
    const trimmedBeds = beds.trim();
    const trimmedBathrooms = bathrooms.trim();
    const trimmedShowers = showers.trim();
    const trimmedDiningCapacity = diningCapacity.trim();
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

    validatePositiveInteger(trimmedBeds, "beds", t("structures.create.errors.numberInvalid"));
    validatePositiveInteger(
      trimmedBathrooms,
      "bathrooms",
      t("structures.create.errors.numberInvalid")
    );
    validatePositiveInteger(trimmedShowers, "showers", t("structures.create.errors.numberInvalid"));
    validatePositiveInteger(
      trimmedDiningCapacity,
      "dining_capacity",
      t("structures.create.errors.numberInvalid")
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
    const trimmedBeds = beds.trim();
    const trimmedBathrooms = bathrooms.trim();
    const trimmedShowers = showers.trim();
    const trimmedDiningCapacity = diningCapacity.trim();
    const trimmedWebsiteUrl = websiteUrl.trim();
    const trimmedNotes = notes.trim();

    const payload: StructureCreateDto = {
      name: name.trim(),
      slug: slug.trim(),
      type: type as StructureType
    };

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

    if (trimmedBeds) {
      payload.beds = Number.parseInt(trimmedBeds, 10);
    }

    if (trimmedBathrooms) {
      payload.bathrooms = Number.parseInt(trimmedBathrooms, 10);
    }

    if (trimmedShowers) {
      payload.showers = Number.parseInt(trimmedShowers, 10);
    }

    if (trimmedDiningCapacity) {
      payload.dining_capacity = Number.parseInt(trimmedDiningCapacity, 10);
    }

    payload.has_kitchen = hasKitchen;

    if (trimmedWebsiteUrl) {
      payload.website_url = trimmedWebsiteUrl;
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
  const bedsErrorId = fieldErrors.beds ? "structure-beds-error" : undefined;
  const bathroomsErrorId = fieldErrors.bathrooms ? "structure-bathrooms-error" : undefined;
  const showersErrorId = fieldErrors.showers ? "structure-showers-error" : undefined;
  const diningCapacityErrorId = fieldErrors.dining_capacity
    ? "structure-dining-capacity-error"
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
  const bedsHintId = "structure-beds-hint";
  const bedsDescribedBy = [bedsHintId, bedsErrorId].filter(Boolean).join(" ") || undefined;
  const bathroomsHintId = "structure-bathrooms-hint";
  const bathroomsDescribedBy = [bathroomsHintId, bathroomsErrorId].filter(Boolean).join(" ") || undefined;
  const showersHintId = "structure-showers-hint";
  const showersDescribedBy = [showersHintId, showersErrorId].filter(Boolean).join(" ") || undefined;
  const diningCapacityHintId = "structure-dining-capacity-hint";
  const diningCapacityDescribedBy =
    [diningCapacityHintId, diningCapacityErrorId].filter(Boolean).join(" ") || undefined;
  const websiteHintId = "structure-website-hint";
  const websiteDescribedBy = [websiteHintId, websiteErrorId].filter(Boolean).join(" ") || undefined;

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
    t("structures.create.sidebar.items.logistics"),
    t("structures.create.sidebar.items.coordinates")
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

            <fieldset className="structure-form-section">
              <legend>{t("structures.create.form.sections.logistics.title")}</legend>
              <p className="helper-text">
                {t("structures.create.form.sections.logistics.description")}
              </p>
              <div className="structure-field-grid">
                <div className="structure-form-field">
                  <label htmlFor="structure-beds">
                    {t("structures.create.form.beds")}
                    <input
                      id="structure-beds"
                      value={beds}
                      onChange={handleBedsChange}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-describedby={bedsDescribedBy}
                      aria-invalid={fieldErrors.beds ? "true" : undefined}
                    />
                  </label>
                  <span className="helper-text" id={bedsHintId}>
                    {t("structures.create.form.bedsHint")}
                  </span>
                  {fieldErrors.beds && (
                    <p className="error-text" id={bedsErrorId!}>
                      {fieldErrors.beds}
                    </p>
                  )}
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-bathrooms">
                    {t("structures.create.form.bathrooms")}
                    <input
                      id="structure-bathrooms"
                      value={bathrooms}
                      onChange={handleBathroomsChange}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-describedby={bathroomsDescribedBy}
                      aria-invalid={fieldErrors.bathrooms ? "true" : undefined}
                    />
                  </label>
                  <span className="helper-text" id={bathroomsHintId}>
                    {t("structures.create.form.bathroomsHint")}
                  </span>
                  {fieldErrors.bathrooms && (
                    <p className="error-text" id={bathroomsErrorId!}>
                      {fieldErrors.bathrooms}
                    </p>
                  )}
                </div>

                <div className="structure-form-field">
                  <label htmlFor="structure-showers">
                    {t("structures.create.form.showers")}
                    <input
                      id="structure-showers"
                      value={showers}
                      onChange={handleShowersChange}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-describedby={showersDescribedBy}
                      aria-invalid={fieldErrors.showers ? "true" : undefined}
                    />
                  </label>
                  <span className="helper-text" id={showersHintId}>
                    {t("structures.create.form.showersHint")}
                  </span>
                  {fieldErrors.showers && (
                    <p className="error-text" id={showersErrorId!}>
                      {fieldErrors.showers}
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
