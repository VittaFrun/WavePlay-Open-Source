import type { AlertButton, AlertOptions } from 'react-native';

export type AppDialog = {
  id: number;
  title: string;
  message?: string;
  buttons: readonly AlertButton[];
  options?: AlertOptions;
  icon?: 'update';
};

/** One dialog at a time. IDs make rapid/double taps harmless, including reentrant callbacks. */
export function createDialogQueue() {
  let serial = 0;
  const queue: AppDialog[] = [];
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const read = () => queue[0] ?? null;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const show = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions, icon?: AppDialog['icon']) => {
    const id = ++serial;
    queue.push({id, title, message, buttons: buttons?.length ? buttons.map(button => ({...button})) : [{text: 'Entendido'}], options, icon});
    publish();
    return id;
  };
  const choose = (id: number, index: number) => {
    const dialog = read(), button = dialog?.buttons[index];
    if (!dialog || dialog.id !== id || !button) return;
    queue.shift();
    publish();
    button.onPress?.();
  };
  const dismiss = (id: number) => {
    const dialog = read();
    if (!dialog || dialog.id !== id || !dialog.options?.cancelable) return;
    queue.shift();
    publish();
    dialog.options.onDismiss?.();
  };
  return {read, subscribe, show, choose, dismiss};
}

export const appDialogs = createDialogQueue();
export const AppAlert = {alert: appDialogs.show};
