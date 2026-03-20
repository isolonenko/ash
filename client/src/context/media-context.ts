import { createContext, useContext } from "react";
import type { MediaContextValue } from "@/types";

export const MediaContext = createContext<MediaContextValue | null>(null);

export const useMedia = (): MediaContextValue => {
  const ctx = useContext(MediaContext);
  if (!ctx) {
    throw new Error("useMedia must be used within MediaProvider");
  }
  return ctx;
};
