import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const signIn = vi.fn();
const signOut = vi.fn();
const clearAllLocalData = vi.fn();
const useSession = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => useSession(),
  signIn: (...args: any[]) => signIn(...args),
  signOut: (...args: any[]) => signOut(...args),
}));
vi.mock("@/lib/store", () => ({
  clearAllLocalData: () => clearAllLocalData(),
}));

import { AuthButton } from "@/components/auth-button";

function setUnauthenticated() {
  useSession.mockReturnValue({ data: null, status: "unauthenticated" });
}

function setAuthenticated() {
  useSession.mockReturnValue({
    data: { user: { name: "Test User", email: "test@example.com" } },
    status: "authenticated",
  });
}

describe("AuthButton", () => {
  beforeEach(() => {
    signIn.mockReset();
    signOut.mockReset();
    clearAllLocalData.mockReset();
  });

  it("renders login button and calls signIn(\"google\") when unauthenticated", () => {
    setUnauthenticated();
    render(<AuthButton />);

    const loginButton = screen.getByRole("button", { name: /Accedi/i });
    fireEvent.click(loginButton);

    expect(signIn).toHaveBeenCalledWith("google");
  });

  it("clears local data and calls signOut when authenticated and logout is clicked", async () => {
    setAuthenticated();
    render(<AuthButton />);

    const avatarButton = screen.getByTitle(/test@example\.com/i);
    fireEvent.click(avatarButton);

    const logoutButton = await screen.findByRole("button", { name: /Esci/i });
    fireEvent.click(logoutButton);

    expect(clearAllLocalData).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
