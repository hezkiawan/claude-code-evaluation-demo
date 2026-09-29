import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatusBadge from "@/components/StatusBadge";

// Smoke test: proves the test harness works. Not part of any evaluation.
describe("test harness", () => {
  it("renders a component", () => {
    render(<StatusBadge status="assigned" />);
    expect(screen.getByText("assigned")).toBeInTheDocument();
  });
});
