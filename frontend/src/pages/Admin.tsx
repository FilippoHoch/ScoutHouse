import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  createUser,
  listUsers,
  previewMailTemplate,
  sendTestMail,
  updateUser,
  UserAdminUpdateRequest
} from "../shared/api";
import { useAuth } from "../shared/auth";
import type { MailTemplate, User, UserType } from "../shared/types";

const templateValues: MailTemplate[] = [
  "reset_password",
  "task_assigned",
  "candidate_status_changed"
];

interface UserFormState {
  name: string;
  email: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
  user_type: "" | UserType;
}

const userTypeOptions: Array<"" | UserType> = ["", "LC", "EG", "RS", "CC", "LEADERS", "OTHER"];

export const AdminPage = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const [selectedTemplate, setSelectedTemplate] = useState<MailTemplate>("reset_password");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [shouldFocusEditForm, setShouldFocusEditForm] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>({
    name: "",
    email: "",
    password: "",
    is_admin: false,
    is_active: true,
    user_type: ""
  });
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editCardRef = useRef<HTMLDivElement | null>(null);
  const editNameInputRef = useRef<HTMLInputElement | null>(null);

  const templates = useMemo(
    () =>
      templateValues.map((value) => ({
        value,
        label: t(`admin.notifications.templates.${value}`)
      })),
    [t]
  );

  const parseApiError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      const body = error.body;
      if (error.status === 0 && error.message) {
        return error.message;
      }
      if (body && typeof body === "object" && "detail" in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === "string" && detail) {
          return detail;
        }
      }
    }
    return fallback;
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await listUsers();
      setUsers(response);
    } catch (error) {
      setUsersError(parseApiError(error, t("admin.users.errors.load")));
    } finally {
      setUsersLoading(false);
    }
  }, [parseApiError, t]);

  const handlePreview = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const preview = await previewMailTemplate(selectedTemplate);
      const blob = new Blob([JSON.stringify(preview, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank", "noopener");
      if (!newWindow) {
        setErrorMessage(t("admin.notifications.previewError"));
      }
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (error) {
      console.error(error);
      setErrorMessage(t("admin.notifications.previewError"));
    }
  };

  const handleSendTest = async () => {
    if (!auth.user?.email) {
      setErrorMessage(t("admin.notifications.testError"));
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setSending(true);
    try {
      const response = await sendTestMail(auth.user.email, selectedTemplate);
      setStatusMessage(
        t("admin.notifications.testSuccess", { provider: response.provider })
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(t("admin.notifications.testError"));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (auth.user?.is_admin) {
      void loadUsers();
    }
  }, [auth.user?.is_admin, loadUsers]);

  const selectedUser = useMemo(
    () =>
      users.find((user) => String(user.id) === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  useEffect(() => {
    if (!selectedUser && users.length > 0) {
      setSelectedUserId((previous) => {
        if (previous && users.some((user) => String(user.id) === previous)) {
          return previous;
        }
        const first = users[0]?.id;
        return first != null ? String(first) : null;
      });
      return;
    }

    if (selectedUser) {
      setEditForm({
        name: selectedUser.name,
        email: selectedUser.email,
        password: "",
        is_admin: selectedUser.is_admin,
        is_active: selectedUser.is_active,
        user_type: selectedUser.user_type ?? ""
      });
      setEditStatus(null);
      setEditError(null);
      if (shouldFocusEditForm) {
        setShouldFocusEditForm(false);
        window.setTimeout(() => {
          editCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          editNameInputRef.current?.focus();
        }, 0);
      }
    } else {
      setEditForm(null);
    }
  }, [selectedUser, shouldFocusEditForm, users]);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setShouldFocusEditForm(true);
  };

  const handleCreateChange = (field: keyof UserFormState, value: string | boolean) => {
    setCreateForm((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateStatus(null);
    setCreateSubmitting(true);
    try {
      const payload = {
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        is_admin: createForm.is_admin,
        is_active: createForm.is_active,
        user_type: createForm.user_type ? createForm.user_type : null
      };
      const created = await createUser(payload);
      setCreateStatus(t("admin.users.createSuccess", { name: created.name }));
      setCreateForm({
        name: "",
        email: "",
        password: "",
        is_admin: false,
        is_active: true,
        user_type: ""
      });
      await loadUsers();
      handleSelectUser(String(created.id));
    } catch (error) {
      setCreateError(parseApiError(error, t("admin.users.errors.create")));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditChange = (field: keyof UserFormState, value: string | boolean) => {
    setEditForm((previous) =>
      previous
        ? {
            ...previous,
            [field]: value
          }
        : previous
    );
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser || !editForm) {
      return;
    }
    setEditError(null);
    setEditStatus(null);
    setEditSubmitting(true);
    try {
      const payload: UserAdminUpdateRequest = {};

      if (editForm.name !== selectedUser.name) {
        payload.name = editForm.name;
      }
      if (editForm.email !== selectedUser.email) {
        payload.email = editForm.email;
      }
      if (editForm.is_admin !== selectedUser.is_admin) {
        payload.is_admin = editForm.is_admin;
      }
      if (editForm.is_active !== selectedUser.is_active) {
        payload.is_active = editForm.is_active;
      }
      if ((editForm.user_type || "") !== (selectedUser.user_type ?? "")) {
        payload.user_type = editForm.user_type ? editForm.user_type : null;
      }
      if (editForm.password.trim()) {
        payload.password = editForm.password;
      }

      if (Object.keys(payload).length === 0) {
        setEditStatus(t("admin.users.noChanges"));
        return;
      }

      const updated = await updateUser(String(selectedUser.id), payload);
      setEditStatus(t("admin.users.updateSuccess", { name: updated.name }));
      await loadUsers();
    } catch (error) {
      setEditError(parseApiError(error, t("admin.users.errors.update")));
    } finally {
      setEditSubmitting(false);
      setEditForm((previous) => (previous ? { ...previous, password: "" } : previous));
    }
  };

  if (!auth.user?.is_admin) {
    return (
      <section>
        <div className="card">
          <p>{t("admin.forbidden")}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>{t("admin.notifications.title")}</h2>
        <p>{t("admin.notifications.description")}</p>
        <div className="admin-notifications__controls">
          <label className="admin-notifications__field">
            <span>{t("admin.notifications.templateLabel")}</span>
            <select
              value={selectedTemplate}
              onChange={(event) => setSelectedTemplate(event.target.value as MailTemplate)}
            >
              {templates.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {errorMessage && <p className="error">{errorMessage}</p>}
          {statusMessage && <p className="success">{statusMessage}</p>}
          <div className="admin-notifications__actions">
            <button type="button" onClick={handlePreview} className="button secondary">
              {t("admin.notifications.preview")}
            </button>
            <button type="button" onClick={handleSendTest} className="button" disabled={sending}>
              {sending ? t("common.loading") : t("admin.notifications.test")}
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>{t("admin.users.title")}</h2>
        <p>{t("admin.users.description")}</p>
        <div className="inline-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => void loadUsers()}
            disabled={usersLoading}
          >
            {usersLoading ? t("common.loading") : t("admin.users.refresh")}
          </button>
        </div>
        {usersError && <p className="error">{usersError}</p>}
        {usersLoading ? (
          <p>{t("common.loading")}</p>
        ) : users.length === 0 ? (
          <p className="empty-state">{t("admin.users.empty")}</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("admin.users.table.name")}</th>
                  <th scope="col">{t("admin.users.table.email")}</th>
                  <th scope="col">{t("admin.users.table.role")}</th>
                  <th scope="col">{t("admin.users.table.branch")}</th>
                  <th scope="col">{t("admin.users.table.status")}</th>
                  <th scope="col">{t("admin.users.table.created")}</th>
                  <th scope="col">{t("admin.users.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      {user.is_admin
                        ? t("admin.users.role.admin")
                        : t("admin.users.role.user")}
                    </td>
                    <td>
                      {user.user_type
                        ? t(`settings.fields.profileBranch.options.${user.user_type}`)
                        : t("settings.fields.profileBranch.none")}
                    </td>
                    <td>
                      {user.is_active
                        ? t("admin.users.status.active")
                        : t("admin.users.status.inactive")}
                    </td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        type="button"
                        className="button small"
                        onClick={() => handleSelectUser(String(user.id))}
                      >
                        {t("admin.users.editAction")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2>{t("admin.users.createTitle")}</h2>
        <p>{t("admin.users.createDescription")}</p>
        {createError && <p className="error">{createError}</p>}
        {createStatus && <p className="success">{createStatus}</p>}
        <form onSubmit={handleCreateSubmit} className="inline-fields">
          <label>
            {t("admin.users.form.name")}
            <input
              type="text"
              value={createForm.name}
              onChange={(event) => handleCreateChange("name", event.target.value)}
              required
            />
          </label>
          <label>
            {t("admin.users.form.email")}
            <input
              type="email"
              value={createForm.email}
              onChange={(event) => handleCreateChange("email", event.target.value)}
              required
            />
          </label>
          <label>
            {t("admin.users.form.password")}
            <input
              type="password"
              value={createForm.password}
              onChange={(event) => handleCreateChange("password", event.target.value)}
              required
            />
          </label>
          <label>
            {t("admin.users.form.userType")}
            <select
              value={createForm.user_type}
              onChange={(event) => handleCreateChange("user_type", event.target.value as "" | UserType)}
            >
              {userTypeOptions.map((option) => (
                <option key={option || "none"} value={option}>
                  {option
                    ? t(`settings.fields.profileBranch.options.${option}`)
                    : t("settings.fields.profileBranch.none")}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={createForm.is_admin}
              onChange={(event) => handleCreateChange("is_admin", event.target.checked)}
            />
            {t("admin.users.form.isAdmin")}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => handleCreateChange("is_active", event.target.checked)}
            />
            {t("admin.users.form.isActive")}
          </label>
          <button className="button" type="submit" disabled={createSubmitting}>
            {createSubmitting ? t("common.loading") : t("admin.users.createSubmit")}
          </button>
        </form>
      </div>
      <div className="card" ref={editCardRef}>
        <h2>{t("admin.users.editTitle")}</h2>
        {editError && <p className="error">{editError}</p>}
        {editStatus && <p className="success">{editStatus}</p>}
        {selectedUser && editForm ? (
          <form onSubmit={handleEditSubmit} className="inline-fields">
            <label>
              {t("admin.users.form.name")}
              <input
                type="text"
                value={editForm.name}
                onChange={(event) => handleEditChange("name", event.target.value)}
                ref={editNameInputRef}
                required
              />
            </label>
            <label>
              {t("admin.users.form.email")}
              <input
                type="email"
                value={editForm.email}
                onChange={(event) => handleEditChange("email", event.target.value)}
                required
              />
            </label>
            <label>
              {t("admin.users.form.password")}
              <input
                type="password"
                value={editForm.password}
                onChange={(event) => handleEditChange("password", event.target.value)}
                placeholder={t("admin.users.form.passwordHint") ?? undefined}
              />
            </label>
            <label>
              {t("admin.users.form.userType")}
              <select
                value={editForm.user_type}
                onChange={(event) => handleEditChange("user_type", event.target.value as "" | UserType)}
              >
                {userTypeOptions.map((option) => (
                  <option key={option || "none"} value={option}>
                    {option
                      ? t(`settings.fields.profileBranch.options.${option}`)
                      : t("settings.fields.profileBranch.none")}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={editForm.is_admin}
                onChange={(event) => handleEditChange("is_admin", event.target.checked)}
              />
              {t("admin.users.form.isAdmin")}
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(event) => handleEditChange("is_active", event.target.checked)}
              />
              {t("admin.users.form.isActive")}
            </label>
            <button className="button" type="submit" disabled={editSubmitting}>
              {editSubmitting ? t("common.loading") : t("admin.users.updateSubmit")}
            </button>
          </form>
        ) : (
          <p className="empty-state">{t("admin.users.selectPrompt")}</p>
        )}
      </div>
    </section>
  );
};

export default AdminPage;
