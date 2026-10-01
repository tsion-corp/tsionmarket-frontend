import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountModal } from "./account-modal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0x0000000000000000000000000000000000000001",
    solanaAddress: null,
    profile: { name: "Test User", email: "test@example.com", avatarSeed: "did:privy:test" },
    logout: vi.fn(),
  }),
}));

// The name the modal shows is the Ark ID when the wallet has one. The lookup
// behind it needs a query client; this test is about the chrome, so the
// answer is stubbed and one test flips it.
const arkName = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/hooks/use-ark-name", () => ({
  useArkName: () => arkName.value,
}));

vi.mock("@/hooks/use-device-passkey", () => ({
  useDevicePasskey: () => ({
    canAdd: false,
    needsReauth: false,
    adding: false,
    error: null,
    addPasskey: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-unlock-password", () => ({
  useUnlockPassword: () => ({
    canSet: false,
    isSet: false,
    saving: false,
    error: null,
    setPassword: vi.fn(),
  }),
}));
vi.mock("@/features/migrate/components/move-old-money-entry", () => ({
  MoveOldMoneyButton: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>open-migration</button>
  ),
}));
vi.mock("@/components/ui/language-select", () => ({
  LanguageSelect: () => null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
const support = vi.hoisted(() => ({ openSupportChat: vi.fn() }));
vi.mock("@/lib/support-chat/open", () => support);

vi.mock("@/hooks/use-square-avatar", () => ({
  useSquareAvatar: () => null,
  useSquareSeed: () => "seed",
}));

function renderModal() {
  return render(<AccountModal onClose={() => {}} onOpenShine={() => {}} />);
}

describe("AccountModal identity", () => {
  it("names the account by the profile name when the wallet holds no Ark ID", () => {
    renderModal();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("names the account by its Ark ID when the wallet holds one, email unchanged", () => {
    arkName.value = "signor.ark";
    try {
      renderModal();
      expect(screen.getByText("signor.ark")).toBeInTheDocument();
      expect(screen.queryByText("Test User")).toBeNull();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    } finally {
      arkName.value = null;
    }
  });

  // It used to only close the sheet, so tapping it on a phone looked like
  // nothing happened. The desktop menu opens the chat; so does this.
  it("opens the support chat from Help & support, and closes the sheet", () => {
    const onClose = vi.fn();
    render(<AccountModal onClose={onClose} onOpenShine={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /helpSupport/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(support.openSupportChat).toHaveBeenCalledTimes(1);
  });
});
