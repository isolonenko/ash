import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ConnectionInvite, DataChannelMessage } from "@/types";
// import { useIdentity } from "@/hooks/useIdentity"; // TODO: Task 4 - re-implement identity system
// import { useContacts } from "@/hooks/useContacts"; // TODO: Task 4 - re-implement contacts system
import { ConnectionProvider } from "@/context/ConnectionContext";
import { useConnectionContext } from "@/context/connection-context";
import { CallProvider } from "@/context/CallContext";
import { useCallContext } from "@/context/call-context";
// import { shortenKey } from "@/lib/crypto"; // TODO: Task 4 - use new crypto utilities
// import { Login } from "./Login"; // TODO: Task 7 - implement new login flow
// import { ContactList } from "./ContactList"; // TODO: Task 4 - implement new contacts UI
import { ChatWindow } from "./ChatWindow";
// import { AddContact } from "./AddContact"; // TODO: Task 4 - implement new add contact UI
// import { IncomingCallModal } from "./IncomingCallModal"; // TODO: Task 9 - implement new call flow
import styles from "./App.module.sass";

// ── Deep link parser ─────────────────────────────────────

const parseDeepLink = (): ConnectionInvite | null => {
  try {
    const hash = window.location.hash;
    const match = hash.match(/#\/connect\/(.+)$/);
    if (!match) return null;

    const decoded = JSON.parse(atob(decodeURIComponent(match[1])));
    if (decoded.publicKey && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    return null;
  } catch (err) {
    console.warn("[DeepLink] Failed to parse invite from URL:", err);
    return null;
  }
};

// ── Renderless: captures connectTo from context into a ref ─

interface ConnectToCaptureProps {
  connectToRef: React.RefObject<
    ((peerPublicKey: string) => Promise<void>) | null
  >;
}

const ConnectToCapture = ({ connectToRef }: ConnectToCaptureProps) => {
  const { connectTo } = useConnectionContext();
  useEffect(() => {
    connectToRef.current = connectTo;
  });
  return null;
};

// ── Incoming call banner (consumes both contexts) ────────

interface IncomingCallBannerProps {
  callerName: string;
}

const IncomingCallBanner = ({ callerName }: IncomingCallBannerProps) => {
  const { callState, incomingCallType, acceptCall, rejectCall } =
    useCallContext();

  if (callState !== "incoming-ringing") return null;

  return (
    <IncomingCallModal
      callerName={callerName}
      callType={incomingCallType ?? "audio"}
      onAccept={acceptCall}
      onReject={rejectCall}
    />
  );
};

// ── Inner app (wrapped by providers) ─────────────────────

interface AppInnerProps {
  contacts: ReturnType<typeof useContacts>["contacts"];
  onlineMap: ReturnType<typeof useContacts>["onlineMap"];
  activeContactKey: string | null;
  showSidebar: boolean;
  showAddContact: boolean;
  identity: ReturnType<typeof useIdentity>["identity"];
  onSelectContact: (publicKey: string) => void;
  onBack: () => void;
  onAdd: () => void;
  onCloseAdd: () => void;
  onContactAdded: (peerPublicKey: string, name?: string) => Promise<void>;
  onRename: ReturnType<typeof useContacts>["renameContact"];
  onDelete: ReturnType<typeof useContacts>["deleteContact"];
  getContactName: (key: string | null) => string;
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
}

const AppInner = ({
  contacts,
  onlineMap,
  activeContactKey,
  showSidebar,
  sidebarCollapsed,
  showAddContact,
  identity,
  onSelectContact,
  onBack,
  onAdd,
  onCloseAdd,
  onContactAdded,
  onRename,
  onDelete,
  getContactName,
  onToggleCollapse,
}: AppInnerProps) => {
  const { connectedPeerKey } = useConnectionContext();

  const activeContact = useMemo(
    () => contacts.find((c) => c.publicKey === activeContactKey) ?? null,
    [contacts, activeContactKey],
  );

  return (
    <div className={styles.app}>
      <div
        className={`${styles.sidebar} ${showSidebar ? styles.sidebarVisible : ""} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            {sidebarCollapsed ? "TC" : "TheChat"}
          </div>
          {!sidebarCollapsed && (
            <button className={styles.addButton} onClick={onAdd}>
              + Add
            </button>
          )}
          <button className={styles.collapseToggle} onClick={onToggleCollapse}>
            {sidebarCollapsed ? "\u203A" : "\u2039"}
          </button>
        </div>
        <ContactList
          contacts={contacts}
          onlineMap={onlineMap}
          activeContactKey={activeContactKey}
          onSelect={onSelectContact}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>

      <div
        className={`${styles.main} ${!showSidebar ? styles.mainVisible : ""}`}
      >
        <ChatWindow contact={activeContact} onBack={onBack} />
      </div>

      {showAddContact && identity && (
        <AddContact
          publicKey={identity.publicKey}
          onContactAdded={onContactAdded}
          onClose={onCloseAdd}
        />
      )}

      <IncomingCallBanner callerName={getContactName(connectedPeerKey)} />
    </div>
  );
};

// ── Root App ─────────────────────────────────────────────

export const App = () => {
  const {
    identity,
    loading: identityLoading,
    isAuthenticated,
    createIdentity,
  } = useIdentity();
  const { contacts, onlineMap, addContact, renameContact, deleteContact } =
    useContacts();

  const [activeContactKey, setActiveContactKey] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<ConnectionInvite | null>(
    () => {
      const fromHash = parseDeepLink();
      if (fromHash) {
        localStorage.setItem("pendingInvite", JSON.stringify(fromHash));
        window.history.replaceState(null, "", window.location.pathname);
        return fromHash;
      }
      const stored = localStorage.getItem("pendingInvite");
      if (stored) {
        try {
          const invite = JSON.parse(stored) as ConnectionInvite;
          if (invite.publicKey && invite.signalingUrl) return invite;
        } catch {
          localStorage.removeItem("pendingInvite");
        }
      }
      return null;
    },
  );
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sidebarCollapsed") === "true";
  });

  const callSignalRef = useRef<(msg: DataChannelMessage) => void>(() => {});
  const remoteTrackRef = useRef<(event: RTCTrackEvent) => void>(() => {});
  const connectToRef = useRef<
    ((peerPublicKey: string) => Promise<void>) | null
  >(null);

  const handlePeerIdentified = useCallback(
    async (peerPublicKey: string) => {
      if (peerPublicKey === identity?.publicKey) return;

      const exists = contacts.some((c) => c.publicKey === peerPublicKey);
      if (!exists) {
        await addContact(peerPublicKey);
      }

      setActiveContactKey(peerPublicKey);
      setShowSidebar(false);
    },
    [contacts, addContact, identity],
  );

  const getContactName = useCallback(
    (key: string | null): string => {
      if (!key) return "Unknown";
      const contact = contacts.find((c) => c.publicKey === key);
      return contact?.name || shortenKey(key);
    },
    [contacts],
  );

  useEffect(() => {
    const processHash = () => {
      const invite = parseDeepLink();
      if (invite) {
        setPendingInvite(invite);
        localStorage.setItem("pendingInvite", JSON.stringify(invite));
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    window.addEventListener("hashchange", processHash);
    return () => window.removeEventListener("hashchange", processHash);
  }, []);

  useEffect(() => {
    if (!pendingInvite || !isAuthenticated) return;

    const invite = pendingInvite;

    const process = async () => {
      setPendingInvite(null);
      localStorage.removeItem("pendingInvite");

      if (invite.publicKey === identity?.publicKey) {
        return;
      }

      const peerKey = invite.publicKey;

      const alreadyExists = contacts.some((c) => c.publicKey === peerKey);

      if (!alreadyExists) {
        await addContact(peerKey);
      }

      setActiveContactKey(peerKey);
      setShowSidebar(false);

      await connectToRef.current?.(peerKey);
    };

    process();
  }, [pendingInvite, isAuthenticated, identity, contacts, addContact]);

  const handleSelectContact = useCallback(
    (publicKey: string) => {
      setActiveContactKey(publicKey);
      setShowSidebar(false);
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
        localStorage.setItem("sidebarCollapsed", "false");
      }
    },
    [sidebarCollapsed],
  );

  const handleBack = useCallback(() => {
    setShowSidebar(true);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }, []);

  const handleContactAdded = useCallback(
    async (peerPublicKey: string, name?: string) => {
      if (peerPublicKey === identity?.publicKey) return;

      const exists = contacts.some((c) => c.publicKey === peerPublicKey);
      if (!exists) {
        await addContact(peerPublicKey, name);
      }
      setActiveContactKey(peerPublicKey);
      setShowAddContact(false);
      setShowSidebar(false);
    },
    [contacts, addContact, identity],
  );

  // ── Render ─────────────────────────────────────────────

  if (identityLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingText}>initializing...</div>
      </div>
    );
  }

  if (!isAuthenticated || !identity) {
    return (
      <Login
        identity={identity}
        loading={identityLoading}
        isAuthenticated={isAuthenticated}
        onCreateIdentity={createIdentity}
        onReady={() => {}}
      />
    );
  }

  return (
    <ConnectionProvider
      publicKey={identity.publicKey}
      onPeerIdentified={handlePeerIdentified}
      callSignalRef={callSignalRef}
      remoteTrackRef={remoteTrackRef}
    >
      <CallProvider
        localPublicKey={identity.publicKey}
        callSignalRef={callSignalRef}
        remoteTrackRef={remoteTrackRef}
      >
        <ConnectToCapture connectToRef={connectToRef} />
        <AppInner
          contacts={contacts}
          onlineMap={onlineMap}
          activeContactKey={activeContactKey}
          showSidebar={showSidebar}
          showAddContact={showAddContact}
          identity={identity}
          onSelectContact={handleSelectContact}
          onBack={handleBack}
          onAdd={() => setShowAddContact(true)}
          onCloseAdd={() => setShowAddContact(false)}
          onContactAdded={handleContactAdded}
          onRename={renameContact}
          onDelete={deleteContact}
          getContactName={getContactName}
          sidebarCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </CallProvider>
    </ConnectionProvider>
  );
};
