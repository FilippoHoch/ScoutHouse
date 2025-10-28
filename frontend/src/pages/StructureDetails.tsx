import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  createStructureContact,
  deleteStructureContact,
  getStructureBySlug,
  updateStructureContact
} from "../shared/api";
import type {
  Availability,
  Contact,
  ContactCreateDto,
  ContactPreferredChannel,
  CostOption,
  CostBand,
  Structure
} from "../shared/types";
import { useAuth } from "../shared/auth";
import { AttachmentsSection } from "../shared/ui/AttachmentsSection";

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

const formatCostBand = (band: CostBand | null | undefined) =>
  band ? band.charAt(0).toUpperCase() + band.slice(1) : null;

type ContactFormState = {
  name: string;
  role: string;
  email: string;
  phone: string;
  preferred_channel: ContactPreferredChannel;
  is_primary: boolean;
  notes: string;
};

const initialContactForm: ContactFormState = {
  name: "",
  role: "",
  email: "",
  phone: "",
  preferred_channel: "email",
  is_primary: false,
  notes: ""
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

  const channelLabels = useMemo(
    () => ({
      email: t("structures.contacts.channels.email"),
      phone: t("structures.contacts.channels.phone"),
      other: t("structures.contacts.channels.other")
    }),
    [t]
  );

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

  const availabilities = structure.availabilities ?? [];
  const costOptions = structure.cost_options ?? [];

  const resetContactForm = () => {
    setEditingContact(null);
    setFormState(initialContactForm);
    setIsFormVisible(false);
    setFormError(null);
  };

  const startCreateContact = () => {
    setActionError(null);
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
      name: contact.name,
      role: contact.role ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      preferred_channel: contact.preferred_channel,
      is_primary: contact.is_primary,
      notes: contact.notes ?? ""
    });
    setIsFormVisible(true);
    setFormError(null);
  };

  const buildPayload = (state: ContactFormState): ContactCreateDto => {
    const payload: ContactCreateDto = {
      name: state.name.trim(),
      preferred_channel: state.preferred_channel,
      is_primary: state.is_primary
    };
    if (state.role.trim()) {
      payload.role = state.role.trim();
    }
    if (state.email.trim()) {
      payload.email = state.email.trim();
    }
    if (state.phone.trim()) {
      payload.phone = state.phone.trim();
    }
    if (state.notes.trim()) {
      payload.notes = state.notes.trim();
    }
    return payload;
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setFormError(t("structures.contacts.errors.nameRequired"));
      return;
    }

    setSavingContact(true);
    setFormError(null);
    setActionError(null);

    const payload = buildPayload({ ...formState, name: trimmedName });

    try {
      let saved: Contact;
      if (editingContact) {
        saved = await updateStructureContact(structure.id, editingContact.id, payload);
      } else {
        saved = await createStructureContact(structure.id, payload);
      }
      setContacts((prev) => {
        const next = editingContact
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved];
        return sortContacts(next);
      });
      resetContactForm();
      await refetch();
    } catch (apiError) {
      setFormError(t("structures.contacts.errors.saveFailed"));
    } finally {
      setSavingContact(false);
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
            Overview
          </button>
          <button
            type="button"
            className={activeTab === "availability" ? "active" : ""}
            onClick={() => setActiveTab("availability")}
          >
            Availability
          </button>
          <button
            type="button"
            className={activeTab === "costs" ? "active" : ""}
            onClick={() => setActiveTab("costs")}
          >
            Costs
          </button>
          <button
            type="button"
            className={activeTab === "contacts" ? "active" : ""}
            onClick={() => setActiveTab("contacts")}
          >
            {t("structures.contacts.tab")}
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
                <label>
                  {t("structures.contacts.form.name")}
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
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
