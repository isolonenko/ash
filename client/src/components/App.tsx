import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ConnectionInvite, DataChannelMessage } from "@/types";
import { useIdentity } from "@/hooks/useIdentity";
import { useContacts } from "@/hooks/useContacts";
import { ConnectionProvider, useConnectionContext } from "@/context/ConnectionContext";
import { CallProvider, useCallContext } from "@/context/CallContext";
import { shortenKey } from "@/lib/crypto";
import { Login } from "./Login";
import { ContactList } from "./ContactList";
import { ChatWindow } from "./ChatWindow";
import { AddContact } from "./AddContact";
import { IncomingCallModal } from "./IncomingCallModal";
import styles from "./App.module.scss";

// ── Deep link parser ─────────────────────────────────────

const parseDeepLink = (): ConnectionInvite | null => {
  try {
    const hash = window.location.hash;
    const match = hash.match(/#\/connect\/(.+)$/);
    if (!match) return null;

    const decoded = JSON.parse(atob(match[1]));
    if (decoded.publicKey && decoded.signalingUrl) {
      return decoded as ConnectionInvite;
    }
    return null;
  } catch {
    return null;
  }
};

// ── View state ───────────────────────────────────────────

type View = "login" | "chat";

// ── Renderless: captures connectTo from context into a ref ─

interface ConnectToCaptureProps {
  connectToRef: React.RefObject<((peerPublicKey: string) => Promise<void>) | null>;
}

const ConnectToCapture = ({ connectToRef }: ConnectToCaptureProps) => {
  const { connectTo } = useConnectionContext();
  connectToRef.current = connectTo;
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
}

const AppInner = ({
  contacts,
  onlineMap,
  activeContactKey,
  showSidebar,
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
}: AppInnerProps) => {
  const { connectedPeerKey } = useConnectionContext();

  const activeContact = useMemo(
    () => contacts.find((c) => c.publicKey === activeContactKey) ?? null,
    [contacts, activeContactKey],
  );

  return (
    <div className={styles.app}>
      <div
        className={`${styles.sidebar} ${showSidebar ? styles.sidebarVisible : ""}`}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>TheChat</div>
        </div>
        <ContactList
          contacts={contacts}
          onlineMap={onlineMap}
          activeContactKey={activeContactKey}
          onSelect={onSelectContact}
          onAdd={onAdd}
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
  const {
    contacts,
    onlineMap,
    addContact,
    renameContact,
    deleteContact,
  } = useContacts();

  const [view, setView] = useState<View>("login");
  const [activeContactKey, setActiveContactKey] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<ConnectionInvite | null>(
    null,
  );
  const [showSidebar, setShowSidebar] = useState(true);

  const callSignalRef = useRef<(msg: DataChannelMessage) => void>(() => {});
  const remoteTrackRef = useRef<(event: RTCTrackEvent) => void>(() => {});
  const connectToRef = useRef<((peerPublicKey: string) => Promise<void>) | null>(null);

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
    if (isAuthenticated && view === "login") {
      setView("chat");
    }
  }, [isAuthenticated, view]);

  useEffect(() => {
    const processHash = () => {
      const invite = parseDeepLink();
      if (invite) {
        setPendingInvite(invite);
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    processHash();
    window.addEventListener("hashchange", processHash);
    return () => window.removeEventListener("hashchange", processHash);
  }, []);

  useEffect(() => {
    if (!pendingInvite || !isAuthenticated) return;

    const invite = pendingInvite;
    setPendingInvite(null);

    const process = async () => {
      if (invite.publicKey === identity?.publicKey) {
        return;
      }

      const peerKey = invite.publicKey;

      const alreadyExists = contacts.some(
        (c) => c.publicKey === peerKey,
      );

      if (!alreadyExists) {
        await addContact(peerKey);
      }

      setActiveContactKey(peerKey);
      setShowSidebar(false);
      setView("chat");

      await connectToRef.current?.(peerKey);
    };

    process();
  }, [pendingInvite, isAuthenticated, identity, contacts, addContact]);

  const handleReady = useCallback(() => {
    setView("chat");
  }, []);

  const handleSelectContact = useCallback((publicKey: string) => {
    setActiveContactKey(publicKey);
    setShowSidebar(false);
  }, []);

  const handleBack = useCallback(() => {
    setShowSidebar(true);
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

  if (view === "login" || !isAuthenticated || !identity) {
    return (
      <Login
        identity={identity}
        loading={identityLoading}
        isAuthenticated={isAuthenticated}
        onCreateIdentity={createIdentity}
        onReady={handleReady}
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
        />
      </CallProvider>
    </ConnectionProvider>
  );
};
