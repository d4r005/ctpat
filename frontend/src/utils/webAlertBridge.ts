// react-native-web's Alert.alert() is a literal no-op ( static alert() {} ),
// and Alert.prompt() doesn't exist at all outside iOS. On native (Android/iOS)
// everything using Alert.* works fine, but on the web build (Cloudflare
// Pages) EVERY confirmation, error message, and multi-option menu (like the
// "Camara / Galeria / URL / Cancelar" photo picker) silently did nothing --
// no popup, no error, nothing. That's why users on web saw "no button to add
// a photo" and "I saved but nothing happened".
//
// This bridge lets a single <WebAlertHost/> mounted at the app root render a
// real modal, while every existing `Alert.alert(...)` / `Alert.prompt(...)`
// call site in the app keeps working completely unchanged.

export type AlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: (value?: string) => void;
};

type ShowAlertArgs = {
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  isPrompt?: boolean;
  defaultValue?: string;
};

type Listener = (args: ShowAlertArgs | null) => void;

let listener: Listener | null = null;

export const webAlertBridge = {
  _setListener(fn: Listener | null) {
    listener = fn;
  },
  show(args: ShowAlertArgs) {
    if (listener) listener(args);
  },
  dismiss() {
    if (listener) listener(null);
  },
};
