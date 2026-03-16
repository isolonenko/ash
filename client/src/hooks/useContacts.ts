import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export const contactsQueryKey = ["contacts"] as const;
export const presenceQueryKey = ["presence"] as const;

export const useContacts = (): UseContactsResult => {
  const queryClient = useQueryClient();

  // ── Contacts query ────────────────────────────────────────
  const {
    data: contacts = [],
    isLoading,
  } = useQuery({
    queryKey: contactsQueryKey,
    queryFn: getContacts,
    staleTime: Infinity,
  });

  // ── Presence query (polls every 30s) ──────────────────────
  const contactKeys = contacts.map((c) => c.publicKey);
  const { data: onlineMap = new Map<string, boolean>() } = useQuery({
    queryKey: [...presenceQueryKey, contactKeys],
    queryFn: async (): Promise<ReadonlyMap<string, boolean>> => {
      const all = await getContacts();
      const entries = await Promise.all(
        all.map(async (c) => {
          const presence = await lookupPresence(c.publicKey);
          if (presence?.online) {
            await updateContactLastSeen(c.publicKey, Date.now());
          }
          return [c.publicKey, presence?.online ?? false] as const;
        }),
      );
      return new Map(entries);
    },
    enabled: contacts.length > 0,
    staleTime: PRESENCE_POLL_INTERVAL,
    refetchInterval: PRESENCE_POLL_INTERVAL,
  });

  // ── Mutation callbacks ────────────────────────────────────
  // These are stable because queryClient is a singleton and the
  // storage functions are module-level — no render-time deps.

  const addContact = useCallback(
    async (publicKey: string, name?: string) => {
      const contact: Contact = {
        publicKey,
        name: name ?? "",
        addedAt: Date.now(),
      };
      await saveContact(contact);
      await queryClient.invalidateQueries({ queryKey: contactsQueryKey });
    },
    [queryClient],
  );

  const deleteContact = useCallback(
    async (publicKey: string) => {
      await removeContact(publicKey);
      await queryClient.invalidateQueries({ queryKey: contactsQueryKey });
    },
    [queryClient],
  );

  const renameContact = useCallback(
    async (publicKey: string, name: string) => {
      const current = queryClient.getQueryData<readonly Contact[]>(contactsQueryKey) ?? [];
      const existing = current.find((c) => c.publicKey === publicKey);
      if (existing) {
        await saveContact({ ...existing, name });
        await queryClient.invalidateQueries({ queryKey: contactsQueryKey });
      }
    },
    [queryClient],
  );

  const refreshPresence = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: presenceQueryKey });
  }, [queryClient]);

  return {
    contacts,
    onlineMap,
    loading: isLoading,
    addContact,
    deleteContact,
    renameContact,
    refreshPresence,
  };
};
