import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AttachmentStagingList,
  MessageAttachments,
  formatFileSize,
  type ChatAttachment,
} from "./attachment-preview";

describe("formatFileSize", () => {
  it("formats bytes, kilobytes, and megabytes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("AttachmentStagingList", () => {
  it("renders staged attachments and handles remove callback", () => {
    const onRemove = vi.fn();
    const attachments: ChatAttachment[] = [
      {
        id: "att-1",
        name: "screenshot.png",
        size: 1024 * 100,
        type: "image/png",
        url: "blob:http://localhost/test-blob",
      },
      {
        id: "att-2",
        name: "logs.txt",
        size: 1024 * 50,
        type: "text/plain",
        url: "blob:http://localhost/test-txt",
      },
    ];

    render(<AttachmentStagingList attachments={attachments} onRemove={onRemove} />);

    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByText("logs.txt")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: /remove screenshot\.png/i });
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith("att-1");
  });
});

describe("MessageAttachments", () => {
  it("renders image attachment and allows opening/closing zoom lightbox", () => {
    const attachments: ChatAttachment[] = [
      {
        id: "att-img",
        name: "trade-error.png",
        size: 204800,
        type: "image/png",
        url: "blob:http://localhost/trade-error",
      },
    ];

    render(<MessageAttachments attachments={attachments} />);

    const imgThumbBtn = screen.getByRole("button");
    fireEvent.click(imgThumbBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const closeLightboxBtn = screen.getByRole("button", { name: /close zoomed preview/i });
    fireEvent.click(closeLightboxBtn);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
