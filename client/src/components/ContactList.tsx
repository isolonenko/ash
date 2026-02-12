import type { Contact } from "@shared/types";
import { shortenKey } from "@/lib/crypto";
import styles from "./ContactList.module.scss";

interface ContactListProps {
  contacts: readonly Contact[];
  onlineMap: ReadonlyMap<string, boolean>;
  activeContactKey: string | null;
  onSelect: (publicKey: string) => void;
  onAdd: () => void;
}

export const ContactList = ({
  contacts,
  onlineMap,
  activeContactKey,
  onSelect,
  onAdd,
}: ContactListProps) => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>Contacts</div>
        <button className={styles.addButton} onClick={onAdd}>
          + Add
        </button>
      </div>

      <div className={styles.list}>
        {contacts.length === 0 ? (
          <div className={styles.empty}>
            No contacts yet. Click + Add to connect with someone.
          </div>
        ) : (
          contacts.map((contact) => {
            const isOnline = onlineMap.get(contact.publicKey) ?? false;
            const isActive = contact.publicKey === activeContactKey;

            return (
              <div
                key={contact.publicKey}
                className={isActive ? styles.active : styles.contactItem}
                onClick={() => onSelect(contact.publicKey)}
              >
                <div className={styles.avatar}>
                  {(contact.name || "?")[0].toUpperCase()}
                </div>

                <div className={styles.contactInfo}>
                  <div className={styles.contactName}>
                    {contact.name || shortenKey(contact.publicKey)}
                  </div>
                  <div className={styles.contactKey}>
                    {shortenKey(contact.publicKey)}
                  </div>
                </div>

                <div
                  className={isOnline ? styles.online : styles.offline}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
