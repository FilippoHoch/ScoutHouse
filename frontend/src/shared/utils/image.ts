const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;

export const isImageFile = (file: File): boolean => {
  if (file.type) {
    return file.type.startsWith("image/");
  }
  const lowered = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lowered.endsWith(ext));
};

export { ACCEPTED_IMAGE_EXTENSIONS };
