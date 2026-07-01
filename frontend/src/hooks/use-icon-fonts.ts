// Icon font loader — carga siempre desde assets locales en builds nativos
// y desde CDN solo en web/Expo Go.
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import { Platform } from "react-native";

const ICON_VECTOR_VERSION = "14.0.2";

const ICON_FAMILIES: Record<string, string> = {
  anticon: "AntDesign",
  entypo: "Entypo",
  evilicons: "EvilIcons",
  feather: "Feather",
  FontAwesome: "FontAwesome",
  Fontisto: "Fontisto",
  foundation: "Foundation",
  ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
  "material-community": "MaterialCommunityIcons",
  material: "MaterialIcons",
  octicons: "Octicons",
  "simple-line-icons": "SimpleLineIcons",
  zocial: "Zocial",
  "FontAwesome5Free-Regular": "FontAwesome5_Regular",
  "FontAwesome5Free-Solid": "FontAwesome5_Solid",
  "FontAwesome5Free-Brand": "FontAwesome5_Brands",
  "FontAwesome6Free-Regular": "FontAwesome6_Regular",
  "FontAwesome6Free-Solid": "FontAwesome6_Solid",
  "FontAwesome6Free-Brand": "FontAwesome6_Brands",
};

const cdnUrl = (file: string): string =>
  `https://cdn.jsdelivr.net/npm/@expo/vector-icons@${ICON_VECTOR_VERSION}/build/vendor/react-native-vector-icons/Fonts/${file}.ttf`;

// En builds nativos release los íconos están autolinkeados — useFonts({}) = true inmediato
// En web y Expo Go cargamos desde CDN
const iconFontMap = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(ICON_FAMILIES).map(([key, file]) => [key, cdnUrl(file)]),
  );

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts(
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? iconFontMap()
      : {},
  );
