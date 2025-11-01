import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useMemo,
  useRef,
  useState
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { StructurePhoto } from "../types";
import { isImageFile } from "../utils/image";
import {
  AttachmentConfirmRequest,
  AttachmentUploadRequest,
  StructurePhotoCreateRequest,
  confirmAttachmentUpload,
  createStructurePhoto,
  deleteStructurePhoto,
  getStructurePhotos,
  signAttachmentUpload
} from "../api";

interface StructurePhotosSectionProps {
  structureId: number | null;
  canUpload: boolean;
  canDelete: boolean;
}

export const StructurePhotosSection = ({
  structureId,
  canUpload,
  canDelete
}: StructurePhotosSectionProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["structure-photos", structureId],
    [structureId]
  );

  const photosQuery = useQuery<StructurePhoto[]>({
    queryKey,
    queryFn: () => getStructurePhotos(structureId ?? 0),
    enabled: structureId !== null
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (structureId === null) {
        throw new Error("missing-structure");
      }
      if (!isImageFile(file)) {
        throw new Error("invalid-type");
      }

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

      const createPayload: StructurePhotoCreateRequest = {
        attachment_id: attachment.id
      };
      await createStructurePhoto(structureId, createPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => {
      if (structureId === null) {
        throw new Error("missing-structure");
      }
      return deleteStructurePhoto(structureId, photoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const handleUpload = useCallback(
    async (file: File) => {
      if (!isImageFile(file)) {
        setError(t("structures.photos.errors.invalidType"));
        return;
      }

      setError(null);
      try {
        await uploadMutation.mutateAsync(file);
      } catch (uploadError) {
        if (uploadError instanceof Error) {
          if (uploadError.message === "invalid-type") {
            setError(t("structures.photos.errors.invalidType"));
          } else if (uploadError.message === "missing-key") {
            setError(t("structures.photos.errors.invalidKey"));
          } else {
            setError(t("structures.photos.errors.uploadFailed"));
          }
        } else {
          setError(t("structures.photos.errors.uploadFailed"));
        }
      }
    },
    [t, uploadMutation]
  );

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    void handleUpload(files[0]);
    event.target.value = "";
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

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      void handleUpload(files[0]);
    }
  };

  const photos = photosQuery.data ?? [];

  const renderBody = () => {
    if (structureId === null) {
      return <p className="structure-photos__placeholder">{t("structures.photos.errors.invalidStructure")}</p>;
    }
    if (photosQuery.isLoading) {
      return <p className="structure-photos__placeholder">{t("structures.photos.state.loading")}</p>;
    }
    if (photosQuery.isError) {
      return <p className="structure-photos__placeholder error">{t("structures.photos.state.error")}</p>;
    }
    if (photos.length === 0) {
      return <p className="structure-photos__placeholder">{t("structures.photos.state.empty")}</p>;
    }
    return (
      <div className="structure-photos__grid">
        {photos.map((photo) => (
          <figure key={photo.id} className="structure-photos__item">
            <img src={photo.url} alt={photo.filename} />
            <figcaption>
              <span className="structure-photos__filename">{photo.filename}</span>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(photo.id)}
                  disabled={deleteMutation.isPending}
                >
                  {t("structures.photos.actions.delete")}
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  };

  return (
    <div className="structure-photos">
      {canUpload && (
        <div
          className={`structure-photos__dropzone ${dropActive ? "is-active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <p>{t("structures.photos.upload.prompt")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending || structureId === null}
          >
            {uploadMutation.isPending
              ? t("structures.photos.upload.progress")
              : t("structures.photos.upload.button")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileSelect}
            disabled={uploadMutation.isPending || structureId === null}
          />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="structure-photos__content">{renderBody()}</div>
    </div>
  );
};

