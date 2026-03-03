import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { MessageWithParts } from "./types";

function makeAssistantMessage(text: string): MessageWithParts {
  return {
    info: {
      id: "msg-1",
      role: "assistant",
      sessionID: "session-1",
      time: { created: Date.now() },
    },
    parts: [{ type: "text", text }],
  };
}

describe("MessageBubble quick replies", () => {
  it("renders clickable options from checklist style prompts", async () => {
    const user = userEvent.setup();
    const onUseQuickReply = vi.fn();

    render(
      <MessageBubble
        message={makeAssistantMessage(
          "- [ ] Instant quote calculator\n- [ ] Photo documentation\n- [ ] Job scheduling/calendar",
        )}
        onUseQuickReply={onUseQuickReply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Photo documentation" }));
    expect(onUseQuickReply).toHaveBeenCalledWith("Photo documentation");
  });

  it("does not render quick replies when there is only one bullet option", () => {
    render(
      <MessageBubble
        message={makeAssistantMessage("- Just one note")}
        onUseQuickReply={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Just one note" })).not.toBeInTheDocument();
  });
});
