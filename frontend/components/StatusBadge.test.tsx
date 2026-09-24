import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge";

describe("StatusBadge", () => {
  it("shows the room status by default", () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("replaces the status with a red Expired pill when expired", () => {
    render(<StatusBadge status="idle" expired />);

    const badge = screen.getByText("Expired");
    expect(badge).toHaveClass("bg-danger", "text-white");
    expect(screen.queryByText("idle")).not.toBeInTheDocument();
  });
});
