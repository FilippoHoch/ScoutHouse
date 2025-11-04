import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useState } from "react";
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
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  CostOption,
  CostBand,
  FirePolicy,
  Structure,
  StructureOpenPeriod,
  WaterSource
} from "../shared/types";
import { useAuth } from "../shared/auth";
import { AttachmentsSection } from "../shared/ui/AttachmentsSection";
import { StructurePhotosSection } from "../shared/ui/StructurePhotosSection";
import { Button } from "../shared/ui/designSystem";
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
  label: string;
  value: ReactNode;
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
      notAvailable: t("structures.details.overview.notAvailable"),
    }),
    [t]
  );

  const formatBoolean = (value: boolean | null | undefined) => {
    if (value === null || value === undefined) {
      return fallbackLabels.notAvailable;
    }
    return value ? fallbackLabels.yes : fallbackLabels.no;
  };

  const formatCount = (value: number | null | undefined) =>
    value === null || value === undefined
      ? fallbackLabels.notAvailable
      : new Intl.NumberFormat("it-IT").format(value);

  const formatLandArea = (value: number | null | undefined) =>
    value === null || value === undefined
      ? fallbackLabels.notAvailable
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
      return t(fallbackKey);
    }
    return fallbackLabels.notAvailable;
  };

  const formatWaterSources = (sources: WaterSource[] | null | undefined) => {
    if (!sources || sources.length === 0) {
      return t("structures.details.overview.waterSources.none");
    }
    return sources
      .map((source) => t(`structures.create.form.waterSourceOptions.${source}`))
      .join(", ");
  };

  const formatFirePolicy = (policy: FirePolicy | null | undefined) => {
    if (!policy) {
      return fallbackLabels.notAvailable;
    }
    return t(`structures.create.form.firePolicyOptions.${policy}`);
  };

  const renderLogisticsDetails = (items: LogisticsDetail[]) => (
    <dl className="structure-logistics-grid">
      {items.map(({ label, value, isFull }) => (
        <Fragment key={label}>
          <dt className={isFull ? "structure-logistics-grid__full" : undefined}>{label}</dt>
          <dd className={isFull ? "structure-logistics-grid__full" : undefined}>{value}</dd>
        </Fragment>
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

  const structure = data as Structure;
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
  const kitchenLabel = structure.has_kitchen
    ? t("structures.details.overview.hasKitchen.yes")
    : t("structures.details.overview.hasKitchen.no");
  const structureTypeLabel = structure.type
    ? t(`structures.types.${structure.type}`, { defaultValue: structure.type })
    : null;
  const costBandLabel = formatCostBand(structure.cost_band);

  const availabilities = structure.availabilities ?? [];
  const costOptions = structure.cost_options ?? [];

  const indoorDetails: LogisticsDetail[] = [
    {
      label: t("structures.details.overview.hasKitchen.label"),
      value: kitchenLabel
    },
    {
      label: t("structures.details.overview.hotWater"),
      value: formatBoolean(structure.hot_water)
    },
    {
      label: t("structures.details.overview.beds"),
      value: formatCount(structure.indoor_beds)
    },
    {
      label: t("structures.details.overview.bathrooms"),
      value: formatCount(structure.indoor_bathrooms)
    },
    {
      label: t("structures.details.overview.showers"),
      value: formatCount(structure.indoor_showers)
    },
    {
      label: t("structures.details.overview.indoorActivityRooms"),
      value: formatCount(structure.indoor_activity_rooms)
    }
  ];

  const outdoorDetails: LogisticsDetail[] = [
    {
      label: t("structures.details.overview.landArea"),
      value: formatLandArea(structure.land_area_m2)
    },
    {
      label: t("structures.details.overview.shelterOnField"),
      value: formatBoolean(structure.shelter_on_field)
    },
    {
      label: t("structures.details.overview.hasFieldPoles"),
      value: formatBoolean(structure.has_field_poles)
    },
    {
      label: t("structures.details.overview.waterSources.label"),
      value: formatWaterSources(structure.water_sources)
    },
    {
      label: t("structures.details.overview.pitLatrineAllowed"),
      value: formatBoolean(structure.pit_latrine_allowed)
    },
    {
      label: t("structures.details.overview.electricityAvailable"),
      value: formatBoolean(structure.electricity_available)
    },
    {
      label: t("structures.details.overview.firePolicy"),
      value: formatFirePolicy(structure.fire_policy)
    }
  ];

  const accessibilityDetails: LogisticsDetail[] = [
    {
      label: t("structures.details.overview.accessByCar"),
      value: formatBoolean(structure.access_by_car)
    },
    {
      label: t("structures.details.overview.accessByCoach"),
      value: formatBoolean(structure.access_by_coach)
    },
    {
      label: t("structures.details.overview.coachTurningArea"),
      value: formatBoolean(structure.coach_turning_area)
    },
    {
      label: t("structures.details.overview.accessByPublicTransport"),
      value: formatBoolean(structure.access_by_public_transport)
    },
    {
      label: t("structures.details.overview.nearestBusStop"),
      value: formatOptionalText(structure.nearest_bus_stop)
    }
  ];

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
    : t("structures.details.overview.websiteFallback");

  const operationsDetails: LogisticsDetail[] = [
    {
      label: t("structures.details.overview.website"),
      value: websiteValue,
      isFull: true
    },
    {
      label: t("structures.details.overview.weekendOnly"),
      value: formatBoolean(structure.weekend_only)
    },
    {
      label: t("structures.details.overview.notesLogistics"),
      value: formatOptionalText(
        structure.notes_logistics,
        "structures.details.overview.notesLogisticsFallback"
      ),
      isFull: true
    },
    {
      label: t("structures.details.overview.notes"),
      value: formatOptionalText(
        structure.notes,
        "structures.details.overview.notesFallback"
      ),
      isFull: true
    }
  ];

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
      setActionError(t("structures.contacts.errors.saveFailed"));
    }
  };

  return (
    <section className="structure-details" aria-labelledby="structure-details-title">
      <div className="structure-details__hero">
        <div className="structure-details__hero-content">
          <div className="structure-details__hero-tags">
            {structureTypeLabel && <span className="structure-details__badge">{structureTypeLabel}</span>}
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
        </div>
      </div>

      <div className="structure-details__layout">
        <div className="structure-details__main">
          <div className="structure-details-card">
            <div className="structure-details-card__section">
              <h3 className="structure-details-card__title">
                {t("structures.details.overview.logistics")}
              </h3>
              <div className="structure-logistics-groups">
                <section className="structure-logistics-group">
                  <h4>{t("structures.create.form.sections.indoor.title")}</h4>
                  {renderLogisticsDetails(indoorDetails)}
                </section>
                <section className="structure-logistics-group">
                  <h4>{t("structures.create.form.sections.outdoor.title")}</h4>
                  {renderLogisticsDetails(outdoorDetails)}
                </section>
                <section className="structure-logistics-group">
                  <h4>{t("structures.create.form.sections.accessibility.title")}</h4>
                  {renderLogisticsDetails(accessibilityDetails)}
                </section>
                <section className="structure-logistics-group">
                  <h4>{t("structures.create.form.sections.operations.title")}</h4>
                  {renderLogisticsDetails(operationsDetails)}
                </section>
              </div>
            </div>

            {structure.open_periods && structure.open_periods.length > 0 && (
              <div className="structure-details-card__section">
                <h3 className="structure-details-card__title">
                  {t("structures.details.openPeriods.title")}
                </h3>
                <div className="structure-open-periods-detail">
                  <ul className="structure-open-periods-detail__list">
                    {structure.open_periods.map((period) => {
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

                      return (
                        <li key={option.id}>
                          <div className="cost-option__header">
                            <span className="cost-option__model">{costModelLabel}</span>
                            <span className="cost-option__amount">
                              {formatCurrency(option.amount, option.currency)}
                            </span>
                          </div>
                          <div className="cost-breakdown">
                            {option.deposit !== null && (
                              <span>Deposit: {formatCurrency(option.deposit, option.currency)}</span>
                            )}
                            {option.city_tax_per_night !== null && (
                              <span>
                                City tax: {formatCurrency(option.city_tax_per_night, option.currency)} per night
                              </span>
                            )}
                            {option.utilities_flat !== null && (
                              <span>Utilities: {formatCurrency(option.utilities_flat, option.currency)}</span>
                            )}
                          </div>
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

        <aside className="structure-details__sidebar">
          <div className="structure-details-card structure-details-card--sidebar">
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
        </aside>
      </div>

      <p className="structure-details__back-link">
        <Link to="/structures">← Back to catalog</Link>
      </p>
    </section>
  );
};
