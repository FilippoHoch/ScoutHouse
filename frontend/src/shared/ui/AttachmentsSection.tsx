import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  Attachment,
  AttachmentOwnerType,
} from "../types";
import {
  AttachmentConfirmRequest,
  AttachmentUploadRequest,
  confirmAttachmentUpload,
  deleteAttachment,
  getAttachments,
  signAttachmentDownload,
  signAttachmentUpload,
} from "../api";

interface AttachmentsSectionProps {
  ownerType: AttachmentOwnerType;
  ownerId: number | null;
  canUpload: boolean;
  canDelete: boolean;
}

const formatFileSize = (size: number): string => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
};

export const AttachmentsSection = ({
  ownerType,
  ownerId,
  canUpload,
  canDelete,
}: AttachmentsSectionProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["attachments", ownerType, ownerId],
    [ownerType, ownerId]
  );

  const attachmentsQuery = useQuery<Attachment[]>({
    queryKey,
    queryFn: () => getAttachments(ownerType, ownerId ?? 0),
    enabled: ownerId !== null,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (ownerId === null) {
        throw new Error("missing-owner");
      }

      const payload: AttachmentUploadRequest = {
        owner_type: ownerType,
        owner_id: ownerId,
        filename: file.name,
        mime: file.type || "application/octet-stream",
      };

      const signature = await signAttachmentUpload(payload);
      const key = signature.fields.key;
      if (!key) {
        throw new Error("missing-key");
      }

      const formData = new FormData();
      Object.entries(signature.fields).forEach(([field, value]) => {
        formData.append(field, value);
      });
      formData.append("file", file);

      const uploadResponse = await fetch(signature.url, {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error("upload-failed");
      }

      const confirmPayload: AttachmentConfirmRequest = {
        ...payload,
        size: file.size,
        key,
      };
      await confirmAttachmentUpload(confirmPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number) => deleteAttachment(attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    handleUpload(files[0]);
    event.target.value = "";
  };

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      try {
        await uploadMutation.mutateAsync(file);
      } catch (err) {
        const code = (err as Error).message;
        if (code === "missing-owner") {
          setError(t("attachments.errors.invalidOwner"));
        } else if (code === "upload-failed") {
          setError(t("attachments.errors.uploadFailed"));
        } else if (code === "missing-key") {
          setError(t("attachments.errors.invalidKey"));
        } else {
          setError(t("attachments.errors.generic"));
        }
      }
    },
    [t, uploadMutation]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dropActive) {
      setDropActive(true);
    }
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
  };

  const attachments = attachmentsQuery.data ?? [];

  const handleDownload = async (attachmentId: number) => {
    const { url } = await signAttachmentDownload(attachmentId);
    window.open(url, "_blank", "noopener");
  };

  const renderBody = () => {
    if (ownerId === null) {
      return <p>{t("attachments.errors.invalidOwner")}</p>;
    }
    if (attachmentsQuery.isLoading) {
      return <p>{t("attachments.state.loading")}</p>;
    }
    if (attachmentsQuery.isError) {
      return <p className="error">{t("attachments.state.error")}</p>;
    }
    if (attachments.length === 0) {
      return <p>{t("attachments.state.empty")}</p>;
    }
    return (
      <table className="attachments">
        <thead>
          <tr>
            <th>{t("attachments.columns.name")}</th>
            <th>{t("attachments.columns.size")}</th>
            <th>{t("attachments.columns.author")}</th>
            <th>{t("attachments.columns.createdAt")}</th>
            <th>{t("attachments.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((attachment) => (
            <tr key={attachment.id}>
              <td>{attachment.filename}</td>
              <td>{formatFileSize(attachment.size)}</td>
              <td>{attachment.created_by_name ?? "–"}</td>
              <td>{new Date(attachment.created_at).toLocaleString()}</td>
              <td className="actions">
                <button type="button" onClick={() => handleDownload(attachment.id)}>
                  {t("attachments.actions.download")}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(attachment.id)}
                    disabled={deleteMutation.isPending}
                  >
                    {t("attachments.actions.delete")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="attachments-section">
      {canUpload && (
        <div
          className={`dropzone ${dropActive ? "active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={handleDrop}
        >
          <p>{t("attachments.upload.prompt")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending || ownerId === null}
          >
            {uploadMutation.isPending
              ? t("attachments.upload.progress")
              : t("attachments.upload.button")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleSelectFile}
            disabled={uploadMutation.isPending || ownerId === null}
            style={{ display: "none" }}
            accept="application/pdf,image/*"
          />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="attachments-list">{renderBody()}</div>
    </div>
  );
};
