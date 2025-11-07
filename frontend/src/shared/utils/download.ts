import JSZip from "jszip";
import { saveAs } from "file-saver";

type DownloadEntry = {
  filename: string;
  url: string;
};

const ensureZipExtension = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "download.zip";
  }
  return trimmed.toLowerCase().endsWith(".zip") ? trimmed : `${trimmed}.zip`;
};

export const downloadEntriesAsZip = async (
  entries: DownloadEntry[],
  archiveName: string
): Promise<void> => {
  if (entries.length === 0) {
    return;
  }

  const zip = new JSZip();

  await Promise.all(
    entries.map(async ({ filename, url }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("download-failed");
      }
      const blob = await response.blob();
      zip.file(filename, blob);
    })
  );

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, ensureZipExtension(archiveName));
};
