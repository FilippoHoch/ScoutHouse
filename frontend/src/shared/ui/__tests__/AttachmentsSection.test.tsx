import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  getAttachments,
  signAttachmentUpload,
  confirmAttachmentUpload,
  deleteAttachment,
  signAttachmentDownload,
  updateAttachment,
} from "../../api";
import { AttachmentsSection } from "../AttachmentsSection";
import { downloadEntriesAsZip } from "../../utils/download";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    getAttachments: vi.fn(),
    signAttachmentUpload: vi.fn(),
    confirmAttachmentUpload: vi.fn(),
    deleteAttachment: vi.fn(),
    signAttachmentDownload: vi.fn(),
    updateAttachment: vi.fn(),
  };
});

vi.mock("../../utils/download", () => ({
  downloadEntriesAsZip: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetAttachments = vi.mocked(getAttachments);
const mockedSignUpload = vi.mocked(signAttachmentUpload);
const mockedConfirm = vi.mocked(confirmAttachmentUpload);
const mockedDelete = vi.mocked(deleteAttachment);
const mockedSignDownload = vi.mocked(signAttachmentDownload);
const mockedDownloadZip = vi.mocked(downloadEntriesAsZip);
const mockedUpdate = vi.mocked(updateAttachment);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("AttachmentsSection", () => {
  beforeEach(() => {
    mockedGetAttachments.mockReset();
    mockedSignUpload.mockReset();
    mockedConfirm.mockReset();
    mockedDelete.mockReset();
    mockedSignDownload.mockReset();
    mockedDownloadZip.mockReset();
    mockedUpdate.mockReset();
    mockedDownloadZip.mockResolvedValue(undefined);
  });

  it("shows attachments list when data is available", async () => {
    mockedGetAttachments.mockResolvedValue([
      {
        id: 1,
        owner_type: "structure",
        owner_id: 99,
        filename: "documento.pdf",
        mime: "application/pdf",
        size: 1024,
        created_at: new Date("2024-05-01T10:00:00Z").toISOString(),
        created_by: "user-1",
        created_by_name: "Mario Rossi",
        description: null,
      },
    ]);

    render(
      <AttachmentsSection ownerType="structure" ownerId={99} canUpload={false} canDelete={false} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("documento.pdf")).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
  });

  it("uploads a file via presigned POST and confirms it", async () => {
    const user = userEvent.setup();
    mockedGetAttachments.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 2,
        owner_type: "structure",
        owner_id: 99,
        filename: "nuovo.pdf",
        mime: "application/pdf",
        size: 2048,
        created_at: new Date().toISOString(),
        created_by: "user-2",
        created_by_name: "Anna",
        description: null,
      },
    ]);
    mockedSignUpload.mockResolvedValue({
      url: "https://s3.example.com/upload",
      fields: { key: "attachments/structure/99/abc/nuovo.pdf", "Content-Type": "application/pdf" },
    });
    mockedConfirm.mockResolvedValue({
      id: 2,
      owner_type: "structure",
      owner_id: 99,
      filename: "nuovo.pdf",
      mime: "application/pdf",
      size: 2048,
      created_at: new Date().toISOString(),
      created_by: "user-2",
      created_by_name: "Anna",
      description: null,
    });

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }) as Response);

    render(
      <AttachmentsSection ownerType="structure" ownerId={99} canUpload canDelete={false} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(1));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(["hello"], "nuovo.pdf", { type: "application/pdf" });
    await user.upload(input, file);

    await waitFor(() => expect(mockedSignUpload).toHaveBeenCalledTimes(1));
    expect(mockedSignUpload).toHaveBeenCalledWith({
      owner_type: "structure",
      owner_id: 99,
      filename: "nuovo.pdf",
      mime: "application/pdf",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://s3.example.com/upload", expect.any(Object));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(2));
    fetchMock.mockRestore();
  });

  it("deletes an attachment when allowed", async () => {
    const user = userEvent.setup();
    mockedGetAttachments.mockResolvedValue([
      {
        id: 3,
        owner_type: "structure",
        owner_id: 99,
        filename: "da-rimuovere.pdf",
        mime: "application/pdf",
        size: 512,
        created_at: new Date().toISOString(),
        created_by: "user-3",
        created_by_name: "Luca",
        description: null,
      },
    ]);
    mockedDelete.mockResolvedValue();

    render(
      <AttachmentsSection ownerType="structure" ownerId={99} canUpload={false} canDelete />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalled());
    const deleteButton = await screen.findByRole("button", { name: /Elimina/i });
    await user.click(deleteButton);
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(3));
  });

  it("filters image attachments from the list", async () => {
    mockedGetAttachments.mockResolvedValue([
      {
        id: 10,
        owner_type: "structure",
        owner_id: 99,
        filename: "documento.pdf",
        mime: "application/pdf",
        size: 1024,
        created_at: new Date().toISOString(),
        created_by: "user-1",
        created_by_name: "Mario",
        description: null,
      },
      {
        id: 11,
        owner_type: "structure",
        owner_id: 99,
        filename: "foto.jpg",
        mime: "image/jpeg",
        size: 2048,
        created_at: new Date().toISOString(),
        created_by: "user-2",
        created_by_name: "Anna",
        description: null,
      },
    ]);

    render(
      <AttachmentsSection ownerType="structure" ownerId={99} canUpload={false} canDelete={false} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(1));
    await waitForElementToBeRemoved(() => screen.getByText(/Caricamento allegati…/i));
    expect(await screen.findByText("documento.pdf")).toBeInTheDocument();
    expect(screen.queryByText("foto.jpg")).not.toBeInTheDocument();
  });

  it("allows renaming an attachment and updating its description", async () => {
    const user = userEvent.setup();
    mockedGetAttachments
      .mockResolvedValueOnce([
        {
          id: 5,
          owner_type: "structure",
          owner_id: 42,
          filename: "documento.pdf",
          mime: "application/pdf",
          size: 1024,
          created_at: new Date().toISOString(),
          created_by: "user-1",
          created_by_name: "Mario",
          description: "Vecchia nota",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 5,
          owner_type: "structure",
          owner_id: 42,
          filename: "Documento aggiornato.pdf",
          mime: "application/pdf",
          size: 1024,
          created_at: new Date().toISOString(),
          created_by: "user-1",
          created_by_name: "Mario",
          description: "Versione aggiornata",
        },
      ]);
    mockedUpdate.mockResolvedValue({
      id: 5,
      owner_type: "structure",
      owner_id: 42,
      filename: "Documento aggiornato.pdf",
      mime: "application/pdf",
      size: 1024,
      created_at: new Date().toISOString(),
      created_by: "user-1",
      created_by_name: "Mario",
      description: "Versione aggiornata",
    });

    render(
      <AttachmentsSection ownerType="structure" ownerId={42} canUpload canDelete={false} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(1));

    const editButton = await screen.findByRole("button", { name: /Modifica/i });
    await user.click(editButton);

    const nameInput = screen.getByLabelText(/Nome allegato/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Documento aggiornato.pdf");

    const descriptionInput = screen.getByLabelText(/Descrizione allegato/i);
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Versione aggiornata");

    await user.click(screen.getByRole("button", { name: /Salva/i }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(5, {
        filename: "Documento aggiornato.pdf",
        description: "Versione aggiornata",
      })
    );

    await waitFor(() => expect(mockedGetAttachments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Documento aggiornato.pdf")).toBeInTheDocument();
    expect(screen.getByText("Versione aggiornata")).toBeInTheDocument();
  });

  it("downloads all attachments as a single archive", async () => {
    const user = userEvent.setup();
    mockedGetAttachments.mockResolvedValue([
      {
        id: 21,
        owner_type: "structure",
        owner_id: 99,
        filename: "documento.pdf",
        mime: "application/pdf",
        size: 1024,
        created_at: new Date().toISOString(),
        created_by: "user-1",
        created_by_name: "Mario",
        description: null,
      },
      {
        id: 22,
        owner_type: "structure",
        owner_id: 99,
        filename: "preventivo.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 2048,
        created_at: new Date().toISOString(),
        created_by: "user-2",
        created_by_name: "Anna",
        description: null,
      },
    ]);
    mockedSignDownload
      .mockResolvedValueOnce({ url: "https://example.com/documento.pdf" })
      .mockResolvedValueOnce({ url: "https://example.com/preventivo.docx" });

    render(
      <AttachmentsSection ownerType="structure" ownerId={99} canUpload={false} canDelete={false} />,
      { wrapper: createWrapper() }
    );

    const button = await screen.findByRole("button", { name: /Scarica tutto/i });
    await user.click(button);

    await waitFor(() => expect(mockedSignDownload).toHaveBeenCalledTimes(2));
    expect(mockedDownloadZip).toHaveBeenCalledWith(
      [
        { filename: "documento.pdf", url: "https://example.com/documento.pdf" },
        { filename: "preventivo.docx", url: "https://example.com/preventivo.docx" },
      ],
      "allegati.zip"
    );
  });
});
