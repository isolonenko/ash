import { useState, useEffect, useCallback, useRef } from "react";
import type { Contact } from "@/types";
import {
  getContacts,
  saveContact,
  deleteContact as removeContact,
  updateContactLastSeen,
} from "@/lib/storage";
import { lookupPresence } from "@/lib/signaling";

interface UseContactsResult {
  contacts: readonly Contact[];
  onlineMap: ReadonlyMap<string, boolean>;
  loading: boolean;
  addContact: (publicKey: string, name?: string) => Promise<void>;
  deleteContact: (publicKey: string) => Promise<void>;
  renameContact: (publicKey: string, name: string) => Promise<void>;
  refreshPresence: () => Promise<void>;
}

const PRESENCE_POLL_INTERVAL = 30_000; // 30 seconds

export const useContacts = (): UseContactsResult => {
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [onlineMap, setOnlineMap] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    const all = await getContacts();
    setContacts(all);
    return all;
  }, []);

  const refreshPresence = useCallback(async (providedContacts?: readonly Contact[]) => {
    const all = providedContacts ?? (contacts.length > 0 ? contacts : await getContacts());
    const entries = await Promise.all(
      all.map(async (c) => {
        const presence = await lookupPresence(c.publicKey);
        if (presence?.online) {
          await updateContactLastSeen(c.publicKey, Date.now());
        }
        return [c.publicKey, presence?.online ?? false] as const;
      }),
    );
    setOnlineMap(new Map(entries));
  }, [contacts]);

  useEffect(() => {
    const init = async () => {
      const all = await reload();
      setLoading(false);
      if (all.length > 0) {
        await refreshPresence(all);
      }
    };
    init();
  }, [reload, refreshPresence]);

  // Poll presence periodically
  useEffect(() => {
    if (contacts.length === 0) return;

    pollRef.current = setInterval(refreshPresence, PRESENCE_POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [contacts.length, refreshPresence]);

  const addContact = useCallback(
    async (publicKey: string, name?: string) => {
      const contact: Contact = {
        publicKey,
        name: name ?? "",
        addedAt: Date.now(),
      };
      await saveContact(contact);
      await reload();
    },
    [reload],
  );

  const deleteContactHandler = useCallback(
    async (publicKey: string) => {
      await removeContact(publicKey);
      await reload();
    },
    [reload],
  );

  const renameContact = useCallback(
    async (publicKey: string, name: string) => {
      const existing = contacts.find((c) => c.publicKey === publicKey);
      if (existing) {
        await saveContact({ ...existing, name });
        await reload();
      }
    },
    [contacts, reload],
  );

  return {
    contacts,
    onlineMap,
    loading,
    addContact,
    deleteContact: deleteContactHandler,
    renameContact,
    refreshPresence,
  };
};
