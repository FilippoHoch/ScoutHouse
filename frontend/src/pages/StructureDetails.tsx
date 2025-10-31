import { FormEvent, useEffect, useMemo, useState } from "react";
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
  Structure,
  StructureOpenPeriod
} from "../shared/types";
import { useAuth } from "../shared/auth";
import { AttachmentsSection } from "../shared/ui/AttachmentsSection";

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
    "overview" | "availability" | "costs" | "contacts" | "attachments"
  >(
    "overview"
  );
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
    if (period.kind === "season") {
      const seasonLabel = period.season
        ? t(`structures.details.openPeriods.season.${period.season}`)
        : t("structures.details.openPeriods.seasonUnknown");
      return { main: seasonLabel, note: period.notes ?? null };
    }
    const startLabel = formatDate(period.date_start);
    const endLabel = formatDate(period.date_end);
    return {
      main: t("structures.details.openPeriods.range", { start: startLabel, end: endLabel }),
      note: period.notes ?? null,
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
  const googleMapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${structure.latitude},${structure.longitude}`
    : null;
  const kitchenLabel = structure.has_kitchen
    ? t("structures.details.overview.hasKitchen.yes")
    : t("structures.details.overview.hasKitchen.no");

  const availabilities = structure.availabilities ?? [];
  const costOptions = structure.cost_options ?? [];

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
    <section>
      <div className="card">
        <h2>{structure.name}</h2>
        <p>
          <strong>{structure.type}</strong> · {structure.province ?? "N/A"}
        </p>
        {structure.address && <p>{structure.address}</p>}
        <p>Slug: {structure.slug}</p>
        <p>Created: {createdAt}</p>
        {structure.estimated_cost !== undefined && structure.estimated_cost !== null && (
          <p>
            Estimated daily cost: €{structure.estimated_cost.toFixed(2)}
            {structure.cost_band && ` · ${formatCostBand(structure.cost_band)}`}
          </p>
        )}

        <div className="structure-logistics">
          <h3>{t("structures.details.overview.logistics")}</h3>
          <dl className="structure-logistics-grid">
            <dt>{t("structures.details.overview.hasKitchen.label")}</dt>
            <dd>{kitchenLabel}</dd>
            {structure.indoor_beds !== null && (
              <>
                <dt>{t("structures.details.overview.beds")}</dt>
                <dd>{structure.indoor_beds}</dd>
              </>
            )}
            {structure.indoor_bathrooms !== null && (
              <>
                <dt>{t("structures.details.overview.bathrooms")}</dt>
                <dd>{structure.indoor_bathrooms}</dd>
              </>
            )}
            {structure.indoor_showers !== null && (
              <>
                <dt>{t("structures.details.overview.showers")}</dt>
                <dd>{structure.indoor_showers}</dd>
              </>
            )}
            {structure.indoor_activity_rooms !== null && (
              <>
                <dt>{t("structures.details.overview.indoorActivityRooms")}</dt>
                <dd>{structure.indoor_activity_rooms}</dd>
              </>
            )}
            <dt>{t("structures.details.overview.website")}</dt>
            <dd>
              {structure.website_url ? (
                <a href={structure.website_url} target="_blank" rel="noopener noreferrer">
                  {structure.website_url}
                </a>
              ) : (
                t("structures.details.overview.websiteFallback")
              )}
            </dd>
            {structure.notes && (
              <>
                <dt>{t("structures.details.overview.notes")}</dt>
                <dd>{structure.notes}</dd>
              </>
            )}
            <dt>{t("structures.details.overview.pitLatrineAllowed")}</dt>
            <dd>
              {structure.pit_latrine_allowed
                ? t("structures.details.overview.pitLatrineYes")
                : t("structures.details.overview.pitLatrineNo")}
            </dd>
          </dl>
        </div>

        {structure.open_periods && structure.open_periods.length > 0 && (
          <div className="structure-open-periods-detail">
            <h3>{t("structures.details.openPeriods.title")}</h3>
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
        )}

        <div
          className="map-placeholder"
          style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f3f4f6" }}
        >
          {hasCoordinates ? (
            <>
              <p>
                Coordinates: {structure.latitude?.toFixed(4)}, {structure.longitude?.toFixed(4)}
              </p>
              <p>This is a placeholder map. Integrate a map provider in future milestones.</p>
            </>
          ) : (
            <p>Coordinates are not available for this structure.</p>
          )}
        </div>

        {googleMapsUrl && (
          <p style={{ marginTop: "1rem" }}>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
            </a>
          </p>
        )}

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
            className={activeTab === "attachments" ? "active" : ""}
            onClick={() => setActiveTab("attachments")}
          >
            {t("structures.details.tabs.attachments")}
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="detail-panel">
            <p>The overview tab summarises the structure metadata and coordinates.</p>
          </div>
        )}

        {activeTab === "availability" && (
          <div className="detail-panel">
            {availabilities.length === 0 ? (
              <p>No seasonal availability has been configured yet.</p>
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
              <p>No cost options are available for this structure.</p>
            ) : (
              <ul className="cost-options">
                {costOptions.map((option: CostOption) => (
                  <li key={option.id}>
                    <strong>{option.model}</strong> — {formatCurrency(option.amount, option.currency)}
                    <div className="cost-breakdown">
                      {option.deposit !== null && <span>Deposit: {formatCurrency(option.deposit, option.currency)}</span>}
                      {option.city_tax_per_night !== null && (
                        <span>City tax: {formatCurrency(option.city_tax_per_night, option.currency)} per night</span>
                      )}
                      {option.utilities_flat !== null && (
                        <span>Utilities: {formatCurrency(option.utilities_flat, option.currency)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="detail-panel">
            <div className="contacts-header" style={{ marginBottom: "1rem" }}>
              <button type="button" onClick={startCreateContact}>
                {t("structures.contacts.new")}
              </button>
            </div>
            {actionError && <p className="error">{actionError}</p>}
            <div
              className="contacts-website"
              style={{
                marginBottom: "1rem",
                padding: "1rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                backgroundColor: "#f9fafb"
              }}
            >
              <h4 style={{ marginTop: 0 }}>{t("structures.contacts.website.title")}</h4>
              {structure.website_url ? (
                <a href={structure.website_url} target="_blank" rel="noopener noreferrer">
                  {structure.website_url}
                </a>
              ) : (
                <p style={{ margin: 0 }}>{t("structures.contacts.website.empty")}</p>
              )}
            </div>
            {contacts.length === 0 ? (
              <p>{t("structures.contacts.empty")}</p>
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
                          <div className="inline-actions" style={{ display: "flex", gap: "0.5rem" }}>
                            <button type="button" onClick={() => startEditContact(contact)}>
                              {t("structures.contacts.actions.edit")}
                            </button>
                            <button type="button" onClick={() => handleDeleteContact(contact)}>
                              {t("structures.contacts.actions.delete")}
                            </button>
                            {!contact.is_primary && (
                              <button type="button" onClick={() => handleSetPrimary(contact)}>
                                {t("structures.contacts.actions.makePrimary")}
                              </button>
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
              <form className="contact-form" onSubmit={handleContactSubmit} style={{ marginTop: "1.5rem" }}>
                <h3>
                  {editingContact
                    ? t("structures.contacts.form.editTitle")
                    : t("structures.contacts.form.createTitle")}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "1rem"
                  }}
                >
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
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleSearchDuplicates}
                    disabled={savingContact || checkingDuplicates}
                  >
                    {checkingDuplicates
                      ? t("structures.contacts.form.searching")
                      : t("structures.contacts.form.searchExisting")}
                  </button>
                  {checkingDuplicates && (
                    <span>{t("structures.contacts.form.searchingHelp")}</span>
                  )}
                </div>
                {duplicateMatches.length > 0 && !editingContact && (
                  <div className="duplicate-warning" style={{ margin: "1rem 0" }}>
                    <p>
                      {t("structures.contacts.form.duplicatesIntro", {
                        count: duplicateMatches.length
                      })}
                    </p>
                    <ul style={{ paddingLeft: "1.25rem" }}>
                      {duplicateMatches.map((candidate) => (
                        <li key={candidate.id} style={{ marginBottom: "0.5rem" }}>
                          <div>
                            <strong>{candidate.name}</strong>
                            {candidate.email && ` · ${candidate.email}`}
                            {candidate.phone && ` · ${candidate.phone}`}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUseExisting(candidate)}
                            disabled={savingContact}
                            style={{ marginTop: "0.25rem" }}
                          >
                            {t("structures.contacts.actions.useExisting")}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={handleForceCreate}
                      disabled={savingContact}
                    >
                      {t("structures.contacts.actions.createAnyway")}
                    </button>
                  </div>
                )}
                {formError && <p className="error">{formError}</p>}
                <div className="form-actions" style={{ display: "flex", gap: "0.75rem" }}>
                  <button type="submit" disabled={savingContact}>
                    {savingContact
                      ? t("structures.contacts.form.saving")
                      : editingContact
                      ? t("structures.contacts.form.save")
                      : t("structures.contacts.form.create")}
                  </button>
                  <button type="button" onClick={resetContactForm}>
                    {t("structures.contacts.form.cancel")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {activeTab === "attachments" && (
          <div className="detail-panel">
            {!auth.user ? (
              <p>{t("attachments.state.authRequired")}</p>
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

        <p style={{ marginTop: "1rem" }}>
          <Link to="/structures">← Back to catalog</Link>
        </p>
      </div>
    </section>
  );
};
