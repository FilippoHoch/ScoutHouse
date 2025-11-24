import { useMemo } from "react";

import type { StructureAttachment, StructureAttachmentKind } from "../types";
import { Button } from "./designSystem";

interface Props {
  attachments: StructureAttachment[];
  kinds?: StructureAttachmentKind[];
  onDownload: (attachmentId: number) => void;
}

export function CategorizedAttachmentsList({ attachments, kinds, onDownload }: Props) {
  const filtered = useMemo(() => {
    if (!kinds || kinds.length === 0) {
      return attachments;
    }
    const allowed = new Set(kinds);
    return attachments.filter((item) => allowed.has(item.kind));
  }, [attachments, kinds]);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <ul className="structure-website-links">
      {filtered.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <Button variant="link" onClick={() => onDownload(item.attachment.id)}>
            {item.attachment.filename}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default CategorizedAttachmentsList;
