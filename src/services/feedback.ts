type Listener = (message: string) => void;
const listeners = new Set<Listener>();
export function notifyChange(message: string) { listeners.forEach(listener => listener(message)); }
export function subscribeFeedback(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
