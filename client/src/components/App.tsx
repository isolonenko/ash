import { useState, useCallback, useEffect, useMemo } from "react";
import type { ConnectionInvite, ChatPayload } from "@shared/types";
import { useIdentity } from "@/hooks/useIdentity";
import { useContacts } from "@/hooks/useContacts";
import { useConnection } from "@/hooks/useConnection";
import { Login } from "./Login";
import { ContactList } from "./ContactList";
import { ChatWindow } from "./ChatWindow";
import { AddContact } from "./AddContact";
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
  } = useContacts();

  const [view, setView] = useState<View>("login");
  const [activeContactKey, setActiveContactKey] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<ConnectionInvite | null>(
    null,
  );
  // Mobile: track whether sidebar or chat panel is shown
  const [showSidebar, setShowSidebar] = useState(true);

  // Incoming message from peer — piped to ChatWindow
  const [incomingChat, setIncomingChat] = useState<ChatPayload | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);

  // ── Peer identification callback ───────────────────────

  const handlePeerIdentified = useCallback(
    async (peerPublicKey: string) => {
      if (peerPublicKey === identity?.publicKey) return;

      const exists = contacts.some((c) => c.publicKey === peerPublicKey);
      if (!exists) {
        await addContact(peerPublicKey);
      }

      // Auto-select the peer who just connected to us
      setActiveContactKey(peerPublicKey);
      setShowSidebar(false);
    },
    [contacts, addContact, identity],
  );

  // ── Connection hook (App-level) ────────────────────────

  const {
    connectionState,
    connectedPeerKey,
    isConnecting,
    connectTo,
    sendChat,
    sendTyping,
    sendFile,
    disconnect,
  } = useConnection({
    publicKey: identity?.publicKey ?? "",
    onChatMessage: useCallback((payload: ChatPayload) => {
      setIncomingChat(payload);
    }, []),
    onTyping: useCallback((isTyping: boolean) => {
      setPeerTyping(isTyping);
    }, []),
    onPeerIdentified: handlePeerIdentified,
  });

  // Auto-advance to chat view if already authenticated
  useEffect(() => {
    if (isAuthenticated && view === "login") {
      setView("chat");
    }
  }, [isAuthenticated, view]);

  // Parse deep link on mount
  useEffect(() => {
    const invite = parseDeepLink();
    if (invite) {
      setPendingInvite(invite);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Process pending invite once identity is ready
  useEffect(() => {
    if (!pendingInvite || !isAuthenticated) return;

    // Clear invite immediately to prevent re-runs when deps change
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

      // Auto-connect to the inviter — this joins their signaling room,
      // which notifies them about us via peer-joined (with our public key)
      await connectTo(peerKey);
    };

    process();
  }, [pendingInvite, isAuthenticated, identity, contacts, addContact, connectTo]);

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
    async (peerPublicKey: string) => {
      if (peerPublicKey === identity?.publicKey) return;

      const exists = contacts.some((c) => c.publicKey === peerPublicKey);
      if (!exists) {
        await addContact(peerPublicKey);
      }
      setActiveContactKey(peerPublicKey);
      setShowAddContact(false);
      setShowSidebar(false);
    },
    [contacts, addContact, identity],
  );

  const activeContact = useMemo(
    () => contacts.find((c) => c.publicKey === activeContactKey) ?? null,
    [contacts, activeContactKey],
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
          onSelect={handleSelectContact}
          onAdd={() => setShowAddContact(true)}
        />
      </div>

      <div
        className={`${styles.main} ${!showSidebar ? styles.mainVisible : ""}`}
      >
        <ChatWindow
          contact={activeContact}
          connectionState={connectionState}
          connectedPeerKey={connectedPeerKey}
          isConnecting={isConnecting}
          incomingChat={incomingChat}
          peerTyping={peerTyping}
          onConnect={connectTo}
          onSendChat={sendChat}
          onSendTyping={sendTyping}
          onSendFile={sendFile}
          onDisconnect={disconnect}
          onBack={handleBack}
        />
      </div>

      {showAddContact && (
        <AddContact
          publicKey={identity.publicKey}
          onContactAdded={handleContactAdded}
          onClose={() => setShowAddContact(false)}
        />
      )}
    </div>
  );
};
