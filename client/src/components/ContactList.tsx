import { useState, useCallback, useRef, useEffect, type FormEvent } from "react";
import type { Contact } from "@/types";
import { shortenKey } from "@/lib/crypto";
import styles from "./ContactList.module.sass";

interface ContactListProps {
  contacts: readonly Contact[];
  onlineMap: ReadonlyMap<string, boolean>;
  activeContactKey: string | null;
  onSelect: (publicKey: string) => void;
  onRename: (publicKey: string, name: string) => void;
  onDelete: (publicKey: string) => void;
}

interface ContextMenuState {
  publicKey: string;
  x: number;
  y: number;
}

export const ContactList = ({
  contacts,
  onlineMap,
  activeContactKey,
  onSelect,
  onRename,
  onDelete,
}: ContactListProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, publicKey: string) => {
      e.preventDefault();
      setContextMenu({ publicKey, x: e.clientX, y: e.clientY });
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  useEffect(() => {
    if (editingKey) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingKey]);

  const handleStartRename = useCallback(
    (publicKey: string) => {
      const contact = contacts.find((c) => c.publicKey === publicKey);
      setEditingKey(publicKey);
      setEditName(contact?.name ?? "");
      setContextMenu(null);
    },
    [contacts],
  );

  const handleConfirmRename = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!editingKey) return;
      onRename(editingKey, editName.trim());
      setEditingKey(null);
      setEditName("");
    },
    [editingKey, editName, onRename],
  );

  const handleCancelRename = useCallback(() => {
    setEditingKey(null);
    setEditName("");
  }, []);

  const handleDelete = useCallback(
    (publicKey: string) => {
      setContextMenu(null);
      onDelete(publicKey);
    },
    [onDelete],
  );

  return (
    <div className={styles.container}>

      <div className={styles.list}>
        {contacts.length === 0 ? (
          <div className={styles.empty}>
            No contacts yet. Click + Add to connect with someone.
          </div>
        ) : (
          contacts.map((contact) => {
            const isOnline = onlineMap.get(contact.publicKey) ?? false;
            const isActive = contact.publicKey === activeContactKey;
            const isEditing = editingKey === contact.publicKey;

            return (
              <div
                key={contact.publicKey}
                className={isActive ? styles.active : styles.contactItem}
                onClick={() => !isEditing && onSelect(contact.publicKey)}
                onContextMenu={(e) => handleContextMenu(e, contact.publicKey)}
              >
                <div className={styles.avatar}>
                  {(contact.name || "?")[0].toUpperCase()}
                </div>

                <div className={styles.contactInfo}>
                  {isEditing ? (
                    <form onSubmit={handleConfirmRename} className={styles.renameForm}>
                      <input
                        ref={editInputRef}
                        className={styles.renameInput}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleConfirmRename}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") handleCancelRename();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>
                  ) : (
                    <>
                      <div className={styles.contactName}>
                        {contact.name || shortenKey(contact.publicKey)}
                      </div>
                      <div className={styles.contactKey}>
                        {shortenKey(contact.publicKey)}
                      </div>
                    </>
                  )}
                </div>

                <div
                  className={isOnline ? styles.online : styles.offline}
                />
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => handleStartRename(contextMenu.publicKey)}
          >
            Rename
          </button>
          <button
            className={styles.contextMenuItemDanger}
            onClick={() => handleDelete(contextMenu.publicKey)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
