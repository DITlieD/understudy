export function createNotifier() {
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    ping() {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
