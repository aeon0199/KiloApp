import { FormEvent } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("submits prompt when send is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());

    render(
      <Composer
        composer="Ship it"
        setComposer={vi.fn()}
        busy={false}
        providers={null}
        agents={[]}
        activeAgentName="code"
        activeModelName="no model"
        activeModel={null}
        onSubmit={onSubmit}
        onAbort={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectModel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows stop action while busy and calls abort", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();

    render(
      <Composer
        composer="Running"
        setComposer={vi.fn()}
        busy={true}
        providers={null}
        agents={[]}
        activeAgentName="code"
        activeModelName="no model"
        activeModel={null}
        onSubmit={vi.fn()}
        onAbort={onAbort}
        onSelectAgent={vi.fn()}
        onSelectModel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("opens access menu when full access pill is clicked", async () => {
    const user = userEvent.setup();

    render(
      <Composer
        composer=""
        setComposer={vi.fn()}
        busy={false}
        providers={null}
        agents={[]}
        activeAgentName="code"
        activeModelName="no model"
        activeModel={null}
        onSubmit={vi.fn()}
        onAbort={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectModel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /full access/i }));
    expect(screen.getByText(/access mode/i)).toBeInTheDocument();
  });
});
