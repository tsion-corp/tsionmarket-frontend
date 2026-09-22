// Opening the support chat from somewhere that is not the chat itself.
//
// The widget lives at the root of the shell and owns whether it is open. The
// account menu sits in a different subtree, so the two cannot share state
// through props. A module-level subscription is the smallest thing that lets
// one ask and the other answer, with no provider wrapped around the app.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Asks the support chat to open. A no-op when the widget is not mounted. */
export function openSupportChat(): void {
  for (const listener of [...listeners]) listener();
}

/** Subscribes the widget. Returns the unsubscribe for the effect's cleanup. */
export function onOpenSupportChat(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
