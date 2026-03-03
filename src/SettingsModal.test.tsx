import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import type { KiloApi } from "./api";

describe("SettingsModal", () => {
  it("renders health state and recovery actions", async () => {
    const user = userEvent.setup();
    const api = {
      getProfile: vi.fn().mockResolvedValue({ profile: { username: "josh" } }),
    } as unknown as KiloApi;

    const onRestartServer = vi.fn();
    const onReconnect = vi.fn();

    render(
      <SettingsModal
        open={true}
        onClose={vi.fn()}
        api={api}
        providers={null}
        healthText="Offline"
        isOnline={false}
        cliInfo={{ installed: false }}
        connectionState="degraded"
        diagnosticsID="diag-1"
        diagnosticsPath="/tmp/diag.zip"
        uiPreferences={{
          schemaVersion: 1,
          themeVariant: "classic",
          density: "comfortable",
          motion: "full",
        }}
        onChangeUiPreferences={vi.fn()}
        onResetUiAppearance={vi.fn()}
        onRestartServer={onRestartServer}
        onReconnect={onReconnect}
        onCollectDiagnostics={vi.fn().mockResolvedValue(null)}
        onExportDiagnostics={vi.fn().mockResolvedValue(undefined)}
        onReportIssue={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/connection/i)).toBeInTheDocument();
      expect(screen.getByText(/degraded/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /restart server/i }));
    await user.click(screen.getByRole("button", { name: /reconnect/i }));

    expect(onRestartServer).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
