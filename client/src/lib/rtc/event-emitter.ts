// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEventEmitter<Events extends { [K in keyof Events]: (...args: any[]) => void }> {
  private listeners = new Map<keyof Events, Set<Events[keyof Events]>>()

  on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as Events[keyof Events])

    return () => {
      set!.delete(handler as Events[keyof Events])
    }
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) {
      ;(handler as Events[K])(...args)
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
