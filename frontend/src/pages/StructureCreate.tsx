import { ChangeEvent, FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ApiError, createStructure } from "../shared/api";
import { StructureCreateDto, StructureType } from "../shared/types";
import { Button, InlineMessage, SectionHeader, Surface } from "../shared/ui/designSystem";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const structureTypes: StructureType[] = ["house", "land", "mixed"];

type FieldErrorKey = "name" | "slug" | "province" | "latitude" | "longitude" | "type";

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

  const typeHintId = "structure-type-hint";
  const typeDescribedBy = [typeHintId, typeErrorId].filter(Boolean).join(" ") || undefined;
  const provinceHintId = "structure-province-hint";
  const provinceDescribedBy = [provinceHintId, provinceErrorId].filter(Boolean).join(" ") || undefined;
  const addressHintId = "structure-address-hint";
  const latitudeHintId = "structure-latitude-hint";
  const latitudeDescribedBy = [latitudeHintId, latitudeErrorId].filter(Boolean).join(" ") || undefined;
  const longitudeHintId = "structure-longitude-hint";
  const longitudeDescribedBy = [longitudeHintId, longitudeErrorId].filter(Boolean).join(" ") || undefined;

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
