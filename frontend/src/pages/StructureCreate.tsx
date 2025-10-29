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
  const slugErrorId = fieldErrors.slug ? "structure-slug-error" : undefined;
  const slugDescribedBy = [slugHintId, slugErrorId].filter(Boolean).join(" ") || undefined;

  const provinceErrorId = fieldErrors.province ? "structure-province-error" : undefined;
  const latitudeErrorId = fieldErrors.latitude ? "structure-latitude-error" : undefined;
  const longitudeErrorId = fieldErrors.longitude ? "structure-longitude-error" : undefined;
  const nameErrorId = fieldErrors.name ? "structure-name-error" : undefined;
  const typeErrorId = fieldErrors.type ? "structure-type-error" : undefined;

  return (
    <section aria-labelledby="structure-create-title">
      <Surface>
        <SectionHeader>
          <h2 id="structure-create-title">{t("structures.create.title")}</h2>
          <p className="helper-text">{t("structures.create.description")}</p>
        </SectionHeader>
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="structure-name">
              {t("structures.create.form.name")}
              <input
                id="structure-name"
                value={name}
                onChange={handleNameChange}
                autoComplete="off"
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

          <div>
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
            <span className="helper-text" id={slugHintId}>
              {t("structures.create.form.slugHint")}
            </span>
            {fieldErrors.slug && (
              <p className="error-text" id={slugErrorId}>
                {fieldErrors.slug}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="structure-type">
              {t("structures.create.form.type")}
              <select
                id="structure-type"
                value={type}
                onChange={handleTypeChange}
                aria-invalid={fieldErrors.type ? "true" : undefined}
                aria-describedby={typeErrorId || undefined}
              >
                <option value="">{t("structures.create.form.typePlaceholder")}</option>
                {structureTypes.map((option) => (
                  <option key={option} value={option}>
                    {t(`structures.types.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            {fieldErrors.type && (
              <p className="error-text" id={typeErrorId!}>
                {fieldErrors.type}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="structure-province">
              {t("structures.create.form.province")}
              <input
                id="structure-province"
                value={province}
                onChange={handleProvinceChange}
                autoComplete="off"
                maxLength={2}
                aria-invalid={fieldErrors.province ? "true" : undefined}
                aria-describedby={provinceErrorId || undefined}
              />
            </label>
            <span className="helper-text">{t("structures.create.form.provinceHint")}</span>
            {fieldErrors.province && (
              <p className="error-text" id={provinceErrorId}>
                {fieldErrors.province}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="structure-address">
              {t("structures.create.form.address")}
              <textarea
                id="structure-address"
                value={address}
                onChange={handleAddressChange}
                rows={3}
              />
            </label>
            <span className="helper-text">{t("structures.create.form.addressHint")}</span>
          </div>

          <div>
            <label htmlFor="structure-latitude">
              {t("structures.create.form.latitude")}
              <input
                id="structure-latitude"
                value={latitude}
                onChange={handleLatitudeChange}
                inputMode="decimal"
                step="any"
                aria-invalid={fieldErrors.latitude ? "true" : undefined}
                aria-describedby={latitudeErrorId || undefined}
              />
            </label>
            <span className="helper-text">{t("structures.create.form.coordinatesHint")}</span>
            {fieldErrors.latitude && (
              <p className="error-text" id={latitudeErrorId}>
                {fieldErrors.latitude}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="structure-longitude">
              {t("structures.create.form.longitude")}
              <input
                id="structure-longitude"
                value={longitude}
                onChange={handleLongitudeChange}
                inputMode="decimal"
                step="any"
                aria-invalid={fieldErrors.longitude ? "true" : undefined}
                aria-describedby={longitudeErrorId || undefined}
              />
            </label>
            <span className="helper-text">{t("structures.create.form.coordinatesHint")}</span>
            {fieldErrors.longitude && (
              <p className="error-text" id={longitudeErrorId}>
                {fieldErrors.longitude}
              </p>
            )}
          </div>

          {apiError && (
            <InlineMessage tone="danger">{apiError}</InlineMessage>
          )}

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending
              ? t("structures.create.form.submitting")
              : t("structures.create.form.submit")}
          </Button>
        </form>
      </Surface>
    </section>
  );
};
