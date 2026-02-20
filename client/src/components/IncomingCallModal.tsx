import type { CallType } from "@shared/types";
import styles from "./IncomingCallModal.module.scss";

interface IncomingCallModalProps {
  callerName: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal = ({
  callerName,
  callType,
  onAccept,
  onReject,
}: IncomingCallModalProps) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>INCOMING CALL</div>
        <div className={styles.callerName}>{callerName}</div>
        <div className={styles.callTypeLabel}>
          [{callType.toUpperCase()}]
        </div>
        <div className={styles.actions}>
          <button className={styles.acceptButton} onClick={onAccept}>
            [ACCEPT]
          </button>
          <button className={styles.rejectButton} onClick={onReject}>
            [REJECT]
          </button>
        </div>
      </div>
    </div>
  );
};
