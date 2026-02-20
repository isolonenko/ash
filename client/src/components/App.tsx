import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ConnectionInvite, ChatPayload, DataChannelMessage } from "@shared/types";
import { useIdentity } from "@/hooks/useIdentity";
import { useContacts } from "@/hooks/useContacts";
import { useConnection } from "@/hooks/useConnection";
import { useCall } from "@/hooks/useCall";
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

  // Refs to forward call signals — breaks circular dependency between useConnection and useCall
  const callSignalRef = useRef<(msg: DataChannelMessage) => void>(() => {});
  const remoteTrackRef = useRef<(event: RTCTrackEvent) => void>(() => {});

  // ── Connection hook (App-level) ────────────────────────

  const {
    connectionState,
    connectedPeerKey,
    isConnecting,
    rtcManager,
    connectTo,
    sendChat,
    sendTyping,
    sendFile,
    sendCallSignal,
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
    onCallSignal: useCallback((msg: DataChannelMessage) => {
      callSignalRef.current(msg);
    }, []),
    onRemoteTrack: useCallback((event: RTCTrackEvent) => {
      remoteTrackRef.current(event);
    }, []),
  });

  // ── Call hook (App-level) ──────────────────────────────

  const call = useCall({
    rtcManager,
    send: sendCallSignal,
    localPublicKey: identity?.publicKey ?? "",
    peerPublicKey: connectedPeerKey,
  });

  callSignalRef.current = call.handleCallMessage;
  remoteTrackRef.current = call.handleRemoteTrack;

  const getContactName = useCallback(
    (key: string | null): string => {
      if (!key) return "Unknown";
      const contact = contacts.find((c) => c.publicKey === key);
      return contact?.name || shortenKey(key);
    },
    [contacts],
  );

  // Auto-advance to chat view if already authenticated
  useEffect(() => {
    if (isAuthenticated && view === "login") {
      setView("chat");
    }
  }, [isAuthenticated, view]);

  // Parse deep link on mount and on hash change
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
          onRename={renameContact}
          onDelete={deleteContact}
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
          callState={call.callState}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          callType={call.currentCallType ?? "audio"}
          isAudioEnabled={call.isAudioEnabled}
          isVideoEnabled={call.isVideoEnabled}
          onStartCall={call.startCall}
          onEndCall={call.endCall}
          onToggleAudio={call.toggleAudio}
          onToggleVideo={call.toggleVideo}
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

      {call.callState === "incoming-ringing" && (
        <IncomingCallModal
          callerName={getContactName(connectedPeerKey)}
          callType={call.incomingCallType ?? "audio"}
          onAccept={call.acceptCall}
          onReject={call.rejectCall}
        />
      )}
    </div>
  );
};
