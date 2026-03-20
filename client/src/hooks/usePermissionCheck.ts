import { useState, useEffect } from "react";

type PermissionState = "granted" | "denied" | "prompt";

interface PermissionCheckResult {
  camera: PermissionState;
  microphone: PermissionState;
}

export function usePermissionCheck(): PermissionCheckResult {
  const [state, setState] = useState<PermissionCheckResult>({
    camera: "prompt",
    microphone: "prompt",
  });

  useEffect(() => {
    if (!navigator.permissions) return;

    const cleanups: (() => void)[] = [];

    const check = async (name: string, key: keyof PermissionCheckResult) => {
      try {
        const status = await navigator.permissions.query({
          name: name as PermissionName,
        });

        setState((prev) => ({ ...prev, [key]: status.state }));

        const handler = () => {
          setState((prev) => ({ ...prev, [key]: status.state }));
        };
        status.addEventListener("change", handler);
        cleanups.push(() => status.removeEventListener("change", handler));
      } catch {
        // Permission name not supported (e.g., Safari)
      }
    };

    check("camera", "camera");
    check("microphone", "microphone");

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return state;
}
