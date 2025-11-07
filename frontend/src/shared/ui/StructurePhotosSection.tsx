import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
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
import { downloadEntriesAsZip } from "../utils/download";
import { Button } from "./designSystem";

interface StructurePhotosSectionProps {
  structureId: number | null;
  canUpload: boolean;
  canDelete: boolean;
  showManagementControls?: boolean;
}

export const StructurePhotosSection = ({
  structureId,
  canUpload,
  canDelete,
  showManagementControls = true
}: StructurePhotosSectionProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [downloadAllPending, setDownloadAllPending] = useState(false);

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

  useEffect(() => {
    setActiveIndex(0);
  }, [structureId]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (photos.length === 0) {
        return 0;
      }
      return Math.min(current, photos.length - 1);
    });
  }, [photos.length]);

  const handlePrevious = () => {
    if (photos.length <= 1) {
      return;
    }
    setActiveIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
  };

  const handleNext = () => {
    if (photos.length <= 1) {
      return;
    }
    setActiveIndex((current) => (current === photos.length - 1 ? 0 : current + 1));
  };

  const handleThumbnailClick = (index: number) => {
    setActiveIndex(index);
  };

  const handleDownloadAll = async () => {
    if (structureId === null || photos.length === 0) {
      return;
    }
    setError(null);
    setDownloadAllPending(true);
    try {
      await downloadEntriesAsZip(
        photos.map((photo) => ({
          filename: photo.filename,
          url: photo.url,
        })),
        t("structures.photos.actions.downloadAllArchiveName")
      );
    } catch (downloadError) {
      setError(t("structures.photos.errors.downloadAllFailed"));
      if (downloadError instanceof Error) {
        console.error("Unable to download photos", downloadError);
      }
    } finally {
      setDownloadAllPending(false);
    }
  };

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
    const activePhoto = photos[activeIndex];
    if (!activePhoto) {
      return null;
    }
    return (
      <div
        className="structure-photos__carousel"
        role="region"
        aria-label={t("structures.photos.carousel.label")}
      >
        <div className="structure-photos__preview">
          <button
            type="button"
            className="structure-photos__nav structure-photos__nav--previous"
            onClick={handlePrevious}
            disabled={photos.length <= 1}
          >
            <span className="sr-only">{t("structures.photos.carousel.previous")}</span>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M12.707 15.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414l5-5a1 1 0 1 1 1.414 1.414L8.414 10l4.293 4.293a1 1 0 0 1 0 1.414z" />
            </svg>
          </button>
          <figure className="structure-photos__preview-item">
            <img src={activePhoto.url} alt={activePhoto.filename} />
            <figcaption>
              <div className="structure-photos__preview-meta">
                <span className="structure-photos__filename" title={activePhoto.filename}>
                  {activePhoto.filename}
                </span>
                {photos.length > 1 && (
                  <span className="structure-photos__counter">
                    {t("structures.photos.carousel.counter", {
                      current: activeIndex + 1,
                      total: photos.length
                    })}
                  </span>
                )}
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(activePhoto.id)}
                  disabled={deleteMutation.isPending}
                >
                  {t("structures.photos.actions.delete")}
                </button>
              )}
            </figcaption>
          </figure>
          <button
            type="button"
            className="structure-photos__nav structure-photos__nav--next"
            onClick={handleNext}
            disabled={photos.length <= 1}
          >
            <span className="sr-only">{t("structures.photos.carousel.next")}</span>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M7.293 4.293a1 1 0 0 1 1.414 0L13.707 9.293a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414-1.414L11.586 10 7.293 5.707a1 1 0 0 1 0-1.414z" />
            </svg>
          </button>
        </div>
        {photos.length > 1 && (
          <ul className="structure-photos__thumbnails">
            {photos.map((photo, index) => (
              <li key={photo.id} className="structure-photos__thumbnail-item">
                <button
                  type="button"
                  className={`structure-photos__thumbnail-button ${
                    index === activeIndex ? "is-active" : ""
                  }`}
                  onClick={() => handleThumbnailClick(index)}
                  aria-current={index === activeIndex}
                  aria-label={t("structures.photos.carousel.select", { index: index + 1 })}
                >
                  <img src={photo.url} alt="" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div
      className={`structure-photos${showManagementControls ? "" : " structure-photos--compact"}`}
    >
      {showManagementControls && canUpload && (
        <div
          className={`structure-photos__dropzone ${dropActive ? "is-active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <p>{t("structures.photos.upload.prompt")}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending || structureId === null}
          >
            {uploadMutation.isPending
              ? t("structures.photos.upload.progress")
              : t("structures.photos.upload.button")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileSelect}
            disabled={uploadMutation.isPending || structureId === null}
          />
        </div>
      )}

      {showManagementControls && error && <p className="error">{error}</p>}

      {showManagementControls && (
        <div className="structure-photos__actions">
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadAllPending || photos.length === 0 || structureId === null}
          >
            {downloadAllPending
              ? t("structures.photos.actions.downloadAllProgress")
              : t("structures.photos.actions.downloadAll")}
          </button>
        </div>
      )}
      <div className="structure-photos__content">{renderBody()}</div>
    </div>
  );
};

