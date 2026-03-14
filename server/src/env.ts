export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  PRESENCE: KVNamespace;
  TURN_SHARED_SECRET: string;
  TURN_SERVER_URL: string;
}
