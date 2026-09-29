import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function runWindowAction<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    console.warn(`[WindowControls] Window ${action} failed:`, error);
    return undefined;
  }
}

export function useWindowControls() {
  const appWindow = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    let isCurrent = true;
    let unlisten: (() => void) | undefined;

    const syncMaximized = async () => {
      const maximized = await runWindowAction("state sync", () =>
        appWindow.isMaximized(),
      );
      if (isCurrent && maximized !== undefined) {
        setIsMaximized(maximized);
      }
    };

    void syncMaximized();

    void runWindowAction("resize listener", () =>
      appWindow.onResized(() => void syncMaximized()),
    ).then((stopListening) => {
      if (!stopListening) return;
      if (isCurrent) unlisten = stopListening;
      else stopListening();
    });

    return () => {
      isCurrent = false;
      unlisten?.();
    };
  }, [appWindow]);

  const minimize = async () => {
    if (!appWindow) return;
    await runWindowAction("minimize", () => appWindow.minimize());
  };

  const toggleMaximize = async () => {
    if (!appWindow) return;
    const toggled = await runWindowAction("maximize toggle", async () => {
      await appWindow.toggleMaximize();
      return true;
    });
    if (!toggled) return;

    const maximized = await runWindowAction("state sync", () =>
      appWindow.isMaximized(),
    );
    if (maximized !== undefined) {
      setIsMaximized(maximized);
    }
  };

  const close = async () => {
    if (!appWindow) return;
    await runWindowAction("close", () => appWindow.close());
  };

  return {
    isMaximized,
    minimize,
    toggleMaximize,
    close,
  };
}
