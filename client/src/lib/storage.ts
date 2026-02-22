import { openDB, type IDBPDatabase } from "idb";
import type { UserIdentity, Contact, ChatMessage } from "@/types";

// ── Database Setup ───────────────────────────────────────

const DB_NAME = "thechat";
const DB_VERSION = 1;

interface TheChatDB {
  identity: {
    key: string;
    value: UserIdentity;
  };
  contacts: {
    key: string; // publicKey
    value: Contact;
    indexes: {
      "by-added": number;
      "by-last-seen": number;
    };
  };
  messages: {
    key: string; // message id
    value: ChatMessage;
    indexes: {
      "by-contact": string;
      "by-timestamp": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TheChatDB>> | null = null;

const getDb = (): Promise<IDBPDatabase<TheChatDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<TheChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Identity store (single record)
        if (!db.objectStoreNames.contains("identity")) {
          db.createObjectStore("identity");
        }

        // Contacts store
        if (!db.objectStoreNames.contains("contacts")) {
          const contactStore = db.createObjectStore("contacts", {
            keyPath: "publicKey",
          });
          contactStore.createIndex("by-added", "addedAt");
          contactStore.createIndex("by-last-seen", "lastSeen");
        }

        // Messages store
        if (!db.objectStoreNames.contains("messages")) {
          const messageStore = db.createObjectStore("messages", {
            keyPath: "id",
          });
          messageStore.createIndex("by-contact", "contactPublicKey");
          messageStore.createIndex("by-timestamp", "timestamp");
        }
      },
    });
  }
  return dbPromise;
};

// ── Identity ─────────────────────────────────────────────

export const getIdentity = async (): Promise<UserIdentity | undefined> => {
  const db = await getDb();
  return db.get("identity", "me");
};

export const saveIdentity = async (identity: UserIdentity): Promise<void> => {
  const db = await getDb();
  await db.put("identity", identity, "me");
};

export const deleteIdentity = async (): Promise<void> => {
  const db = await getDb();
  await db.delete("identity", "me");
};

// ── Contacts ─────────────────────────────────────────────

export const getContacts = async (): Promise<readonly Contact[]> => {
  const db = await getDb();
  return db.getAllFromIndex("contacts", "by-added");
};

export const getContact = async (
  publicKey: string,
): Promise<Contact | undefined> => {
  const db = await getDb();
  return db.get("contacts", publicKey);
};

export const saveContact = async (contact: Contact): Promise<void> => {
  const db = await getDb();
  await db.put("contacts", contact);
};

export const deleteContact = async (publicKey: string): Promise<void> => {
  const db = await getDb();
  // Delete contact and their messages
  const tx = db.transaction(["contacts", "messages"], "readwrite");
  await tx.objectStore("contacts").delete(publicKey);

  const messageIndex = tx.objectStore("messages").index("by-contact");
  const messages = await messageIndex.getAllKeys(publicKey);
  await Promise.all(
    messages.map((key) => tx.objectStore("messages").delete(key)),
  );

  await tx.done;
};

export const updateContactLastSeen = async (
  publicKey: string,
  timestamp: number,
): Promise<void> => {
  const db = await getDb();
  const contact = await db.get("contacts", publicKey);
  if (contact) {
    await db.put("contacts", { ...contact, lastSeen: timestamp });
  }
};

// ── Messages ─────────────────────────────────────────────

export const getMessages = async (
  contactPublicKey: string,
): Promise<readonly ChatMessage[]> => {
  const db = await getDb();
  return db.getAllFromIndex("messages", "by-contact", contactPublicKey);
};

export const saveMessage = async (message: ChatMessage): Promise<void> => {
  const db = await getDb();
  await db.put("messages", message);
};

export const markMessageRead = async (messageId: string): Promise<void> => {
  const db = await getDb();
  const message = await db.get("messages", messageId);
  if (message) {
    await db.put("messages", { ...message, read: true });
  }
};

export const getUnreadCount = async (
  contactPublicKey: string,
): Promise<number> => {
  const db = await getDb();
  const messages = await db.getAllFromIndex(
    "messages",
    "by-contact",
    contactPublicKey,
  );
  return messages.filter((m) => !m.read && !m.fromMe).length;
};
