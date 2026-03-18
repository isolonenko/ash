import { useState, useEffect, useCallback } from "react";
import type { UserIdentity } from "@/types";
import { generateKeyPair } from "@/lib/crypto";
import { getIdentity, saveIdentity, deleteIdentity } from "@/lib/storage";

interface UseIdentityResult {
  identity: UserIdentity | null;
  loading: boolean;
  isAuthenticated: boolean;
  createIdentity: () => Promise<void>;
  destroyIdentity: () => Promise<void>;
}

export const useIdentity = (): UseIdentityResult => {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const existing = await getIdentity();
      if (existing) {
        setIdentity(existing);
      }
      setLoading(false);
    };
    load();
  }, []);

  const createIdentity = useCallback(
    async () => {
      const keyPair = generateKeyPair();
      const newIdentity: UserIdentity = {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        createdAt: Date.now(),
      };
      await saveIdentity(newIdentity);
      setIdentity(newIdentity);
    },
    [],
  );

  const destroyIdentity = useCallback(async () => {
    await deleteIdentity();
    setIdentity(null);
  }, []);

  return {
    identity,
    loading,
    isAuthenticated: identity !== null,
    createIdentity,
    destroyIdentity,
  };
};
