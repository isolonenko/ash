import { createContext, useContext } from "react";
import type { SignalingContextValue } from "@/types";

export const SignalingContext = createContext<SignalingContextValue | null>(null);

export const useSignaling = (): SignalingContextValue => {
  const ctx = useContext(SignalingContext);
  if (!ctx) {
    throw new Error("useSignaling must be used within SignalingProvider");
  }
  return ctx;
};
