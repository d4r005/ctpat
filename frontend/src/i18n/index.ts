import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const resources = {
  es: {
    translation: {
      "app_name": "SRIUC",
      "inicio": "Inicio",
      "historico": "Histórico",
      "caseta": "Caseta",
      "inspeccion": "Inspección",
      "embarque": "Embarque",
      "panel": "Panel",
      "perfil": "Perfil",
      "configuracion": "Configuración",
      "idioma": "Idioma",
      "cerrar_sesion": "CERRAR SESIÓN",
      "nueva_inspeccion": "NUEVA INSPECCIÓN",
      "inspeccion_19_puntos": "INSPECCIÓN 19 PUNTOS",
      "inspeccion_9_puntos": "INSPECCIÓN 9 PUNTOS",
      "tractor_camion": "Tractor, Camión o Remolque",
      "contenedor_maritimo": "Contenedor Marítimo",
      "selecciona_tipo": "SELECCIONA EL TIPO DE UNIDAD:",
      "bueno": "BUENO",
      "malo": "MALO",
      "no_aplica": "N/A",
      "guardar": "GUARDAR",
      "siguiente": "SIGUIENTE",
      "atras": "ATRÁS",
      "frente": "Frente",
      "atras_unidad": "Atrás",
      "identificacion": "Identificación",
      "firma_inspector": "Firma del Inspector",
      "firma_supervisor": "Firma del Supervisor",
      "aprobada": "APROBADA",
      "rechazada": "RECHAZADA",
      "pendiente": "PENDIENTE",
      "inspecciones_hoy": "INSPECCIONES DE HOY",
      "tiempo_real": "TIEMPO REAL",
      "total_inspecciones": "TOTAL INSPECCIONES",
      "pendientes_sincronizar": "PENDIENTES DE SINCRONIZAR",
      "estado": "ESTADO",
      "en_linea": "EN LÍNEA",
      "fuera_linea": "OFFLINE",
      "sincronizar_ahora": "SINCRONIZAR AHORA",
      "ajustes": "AJUSTES",
      "seleccionar_idioma": "Seleccionar Idioma",
      "hola": "Hola",
      "inspeccion_19_puntos_naf": "Inspección 19 Puntos NAF",
      "hoy": "HOY",
      "con_fallas": "CON FALLAS",
      "nueva_inspeccion_19_puntos": "NUEVA INSPECCIÓN 19 PUNTOS",
      "nueva_inspeccion_9_puntos": "NUEVA INSPECCIÓN 9 PUNTOS",
      "camion_remolque": "Camión / Remolque",
      "no_hay_inspecciones": "No hay inspecciones hoy",
      "nuevas_apareceran_aqui": "Las nuevas inspecciones aparecerán aquí",
      "sin_placas": "Sin placas",
      "con_falla": "CON FALLA",
      "modo_offline": "MODO OFFLINE — Se sincronizará al reconectar"
    }
  },
  en: {
    translation: {
      "app_name": "SRIUC",
      "inicio": "Home",
      "historico": "History",
      "caseta": "Gate",
      "inspeccion": "Inspection",
      "embarque": "Shipping",
      "panel": "Panel",
      "perfil": "Profile",
      "configuracion": "Settings",
      "idioma": "Language",
      "cerrar_sesion": "LOGOUT",
      "nueva_inspeccion": "NEW INSPECTION",
      "inspeccion_19_puntos": "19 POINTS INSPECTION",
      "inspeccion_9_puntos": "9 POINTS INSPECTION",
      "tractor_camion": "Tractor, Truck or Trailer",
      "contenedor_maritimo": "Sea Container",
      "selecciona_tipo": "SELECT UNIT TYPE:",
      "bueno": "GOOD",
      "malo": "BAD",
      "no_aplica": "N/A",
      "guardar": "SAVE",
      "siguiente": "NEXT",
      "atras": "BACK",
      "frente": "Front",
      "atras_unidad": "Back",
      "identificacion": "Identification",
      "firma_inspector": "Inspector Signature",
      "firma_supervisor": "Supervisor Signature",
      "aprobada": "APPROVED",
      "rechazada": "REJECTED",
      "pendiente": "PENDING",
      "inspecciones_hoy": "TODAY'S INSPECTIONS",
      "tiempo_real": "REAL TIME",
      "total_inspecciones": "TOTAL INSPECTIONS",
      "pendientes_sincronizar": "PENDING SYNC",
      "estado": "STATUS",
      "en_linea": "ONLINE",
      "fuera_linea": "OFFLINE",
      "sincronizar_ahora": "SYNC NOW",
      "ajustes": "SETTINGS",
      "seleccionar_idioma": "Select Language",
      "hola": "Hello",
      "inspeccion_19_puntos_naf": "NAF 19 Points Inspection",
      "hoy": "TODAY",
      "con_fallas": "WITH FAILURES",
      "nueva_inspeccion_19_puntos": "NEW 19 POINTS INSPECTION",
      "nueva_inspeccion_9_puntos": "NEW 9 POINTS INSPECTION",
      "camion_remolque": "Truck / Trailer",
      "no_hay_inspecciones": "No inspections today",
      "nuevas_apareceran_aqui": "New inspections will appear here",
      "sin_placas": "No plates",
      "con_falla": "WITH FAILURE",
      "modo_offline": "OFFLINE MODE — Will sync when reconnected"
    }
  },
  zh: {
    translation: {
      "app_name": "SRIUC",
      "inicio": "首页",
      "historico": "历史",
      "caseta": "门卫室",
      "inspeccion": "检查",
      "embarque": "发货",
      "panel": "控制面板",
      "perfil": "个人资料",
      "configuracion": "设置",
      "idioma": "语言",
      "cerrar_sesion": "退出登录",
      "nueva_inspeccion": "新检查",
      "inspeccion_19_puntos": "19点检查",
      "inspeccion_9_puntos": "9点检查",
      "tractor_camion": "拖拉机、卡车或拖车",
      "contenedor_maritimo": "海运集装箱",
      "selecciona_tipo": "选择单位类型：",
      "bueno": "良好",
      "malo": "不良",
      "no_aplica": "不适用",
      "guardar": "保存",
      "siguiente": "下一步",
      "atras": "返回",
      "frente": "正面",
      "atras_unidad": "背面",
      "identificacion": "身份证件",
      "firma_inspector": "检查员签名",
      "firma_supervisor": "主管签名",
      "aprobada": "已通过",
      "rechazada": "已驳回",
      "pendiente": "待定",
      "inspecciones_hoy": "今日检查",
      "tiempo_real": "实时",
      "total_inspecciones": "总检查数",
      "pendientes_sincronizar": "等待同步",
      "estado": "状态",
      "en_linea": "在线",
      "fuera_linea": "离线",
      "sincronizar_ahora": "立即同步",
      "ajustes": "设置",
      "seleccionar_idioma": "选择语言",
      "hola": "你好",
      "inspeccion_19_puntos_naf": "NAF 19点检查",
      "hoy": "今日",
      "con_fallas": "有故障",
      "nueva_inspeccion_19_puntos": "新19点检查",
      "nueva_inspeccion_9_puntos": "新9点检查",
      "camion_remolque": "卡车 / 拖车",
      "no_hay_inspecciones": "今日无检查",
      "nuevas_apareceran_aqui": "新的检查将显示在这里",
      "sin_placas": "无车牌",
      "con_falla": "有故障",
      "modo_offline": "离线模式 — 重新连接后将同步"
    }
  }
};

const LANGUAGE_KEY = 'user-language';

const languageDetector: any = {
  type: 'languageDetector',
  async: true,
  detect: async (callback: any) => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage) {
        return callback(savedLanguage);
      }
    } catch (error) {
      console.log('Error fetching language from storage', error);
    }
    callback('es');
  },
  init: () => {},
  cacheUserLanguage: async (lng: string) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lng);
    } catch (error) {
      console.log('Error saving language to storage', error);
    }
  }
};

i18n
  .use(initReactI18next)
  .use(languageDetector)
  .init({
    resources,
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;
