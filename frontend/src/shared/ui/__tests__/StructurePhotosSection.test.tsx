import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  getStructurePhotos,
  signAttachmentUpload,
  confirmAttachmentUpload,
  createStructurePhoto,
  deleteStructurePhoto
} from "../../api";
import { StructurePhotosSection } from "../StructurePhotosSection";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    getStructurePhotos: vi.fn(),
    signAttachmentUpload: vi.fn(),
    confirmAttachmentUpload: vi.fn(),
    createStructurePhoto: vi.fn(),
    deleteStructurePhoto: vi.fn()
  };
});

const mockedGetPhotos = vi.mocked(getStructurePhotos);
const mockedSignUpload = vi.mocked(signAttachmentUpload);
const mockedConfirmUpload = vi.mocked(confirmAttachmentUpload);
const mockedCreatePhoto = vi.mocked(createStructurePhoto);
const mockedDeletePhoto = vi.mocked(deleteStructurePhoto);

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe("StructurePhotosSection", () => {
  beforeEach(() => {
    mockedGetPhotos.mockReset();
    mockedSignUpload.mockReset();
    mockedConfirmUpload.mockReset();
    mockedCreatePhoto.mockReset();
    mockedDeletePhoto.mockReset();
  });

  it("renders empty state when no photos are available", async () => {
    mockedGetPhotos.mockResolvedValue([]);

    render(
      <StructurePhotosSection structureId={42} canUpload={false} canDelete={false} />,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(mockedGetPhotos).toHaveBeenCalledWith(42));
    expect(await screen.findByText(/Nessuna foto caricata/i)).toBeInTheDocument();
  });

  it("displays photos in a grid", async () => {
    mockedGetPhotos.mockResolvedValue([
      {
        id: 1,
        structure_id: 42,
        attachment_id: 99,
        filename: "panorama.jpg",
        mime: "image/jpeg",
        size: 2048,
        position: 0,
        url: "https://example.com/panorama.jpg",
        created_at: new Date().toISOString()
      }
    ]);

    render(
      <StructurePhotosSection structureId={42} canUpload={false} canDelete={false} />,
      { wrapper: Wrapper }
    );

    expect(await screen.findByAltText("panorama.jpg")).toBeInTheDocument();
  });

  it("validates file type before uploading", async () => {
    const user = userEvent.setup();
    mockedGetPhotos.mockResolvedValue([]);

    render(
      <StructurePhotosSection structureId={42} canUpload canDelete={false} />,
      { wrapper: Wrapper }
    );

    await screen.findByRole("button", { name: /Carica foto/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(["content"], "documento.pdf", { type: "" });
    await user.upload(input, file);

    expect(await screen.findByText(/Carica un file immagine/i)).toBeInTheDocument();
    expect(mockedSignUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid image and registers the photo", async () => {
    const user = userEvent.setup();
    mockedGetPhotos.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 2,
        structure_id: 42,
        attachment_id: 101,
        filename: "nuova.jpg",
        mime: "image/jpeg",
        size: 1024,
        position: 0,
        url: "https://example.com/nuova.jpg",
        created_at: new Date().toISOString()
      }
    ]);
    mockedSignUpload.mockResolvedValue({
      url: "https://s3.example.com/upload",
      fields: { key: "attachments/structure/42/abc/nuova.jpg", "Content-Type": "image/jpeg" }
    });
    mockedConfirmUpload.mockResolvedValue({
      id: 101,
      owner_type: "structure",
      owner_id: 42,
      filename: "nuova.jpg",
      mime: "image/jpeg",
      size: 1024,
      created_by: "user",
      created_by_name: "User",
      created_at: new Date().toISOString()
    });
    mockedCreatePhoto.mockResolvedValue({
      id: 2,
      structure_id: 42,
      attachment_id: 101,
      filename: "nuova.jpg",
      mime: "image/jpeg",
      size: 1024,
      position: 0,
      url: "https://example.com/nuova.jpg",
      created_at: new Date().toISOString()
    });

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }) as Response);

    render(
      <StructurePhotosSection structureId={42} canUpload canDelete={false} />,
      { wrapper: Wrapper }
    );

    await screen.findByRole("button", { name: /Carica foto/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(["content"], "nuova.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    await waitFor(() => expect(mockedSignUpload).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("https://s3.example.com/upload", expect.any(Object));
    await waitFor(() => expect(mockedConfirmUpload).toHaveBeenCalled());
    await waitFor(() => expect(mockedCreatePhoto).toHaveBeenCalledWith(42, { attachment_id: 101 }));
    await waitFor(() => expect(mockedGetPhotos).toHaveBeenCalledTimes(2));

    fetchMock.mockRestore();
  });

  it("deletes a photo when allowed", async () => {
    const user = userEvent.setup();
    mockedGetPhotos.mockResolvedValue([
      {
        id: 5,
        structure_id: 42,
        attachment_id: 120,
        filename: "vecchia.jpg",
        mime: "image/jpeg",
        size: 900,
        position: 0,
        url: "https://example.com/vecchia.jpg",
        created_at: new Date().toISOString()
      }
    ]);
    mockedDeletePhoto.mockResolvedValue();

    render(
      <StructurePhotosSection structureId={42} canUpload={false} canDelete />,
      { wrapper: Wrapper }
    );

    const deleteButton = await screen.findByRole("button", { name: /Elimina/i });
    await user.click(deleteButton);
    await waitFor(() => expect(mockedDeletePhoto).toHaveBeenCalledWith(42, 5));
  });
});

