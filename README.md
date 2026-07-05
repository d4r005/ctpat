---
title: SRIUC API
emoji: 🚛
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# C-TPAT Inspection System (SRIUC)

Sistema de Registro e Inspección de Unidades de Carga (SRIUC) desarrollado para NAF.

## Características

- Registro de entrada y salida de vehículos (Caseta).
- Inspecciones C-TPAT de 19 y 9 puntos con evidencia fotográfica.
- Generación de Tickets de Embarque.
- Reportes consolidados en PDF con firmas digitales.
- Seguimiento en tiempo real vía Google Sheets.
- Envío automático de reportes por correo electrónico.

## Configuración de Seguimiento (Google Sheets & Drive)

El sistema sincroniza automáticamente cada etapa del proceso con una hoja de cálculo en Google Drive.

1. Crea un Google Sheet y añade el script de Webhook proporcionado.
2. Configura la URL del script en la variable de entorno `GOOGLE_SHEET_WEBHOOK_URL`.
3. Para la gestión de archivos en Drive (evidencias fotográficas), configura la variable `GOOGLE_SERVICE_ACCOUNT_JSON` con el contenido del archivo de credenciales de la cuenta de servicio de Google Cloud.

## Credenciales de Correo

El sistema envía reportes automáticos y alertas de seguridad usando:

- **Servidor:** smtp.gmail.com (Puerto 587)
- **Administrador:** d.trujillo@brancoindustries.com

## Administración

El control maestro del sistema (Gestión de Usuarios y KPIs) está restringido a la cuenta de administrador principal.

---
*SRIUC System - Branco Industries © 2026*

## Despliegue
Este backend corre sobre Docker en Hugging Face Spaces.
Ruta de salud: `/api/health`
