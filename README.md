# C-TPAT Inspection System (SRIUC) - Updated

Este proyecto ha sido configurado para conectarse con **AppSheet** y utilizar las credenciales de correo proporcionadas.

## Configuración de AppSheet
Se ha implementado una integración con la API oficial de AppSheet. Para activarla, sigue estos pasos:
1. Obtén tu `App ID` y `Access Key` desde la consola de AppSheet (Manage -> Integrations -> IN).
2. Agrega estos valores al archivo `backend/.env`.
3. Consulta `backend/appsheet_setup.md` para más detalles sobre las tablas requeridas (`Inspecciones`, `Caseta`, `Embarque`).

## Credenciales de Correo
Se ha configurado el sistema para enviar reportes automáticos usando:
- **Usuario:** d4r005@gmail.com
- **Servidor:** smtp.gmail.com (Puerto 587)

## Administración
El correo `d4r005@gmail.com` ha sido añadido como administrador tanto en el Backend como en el Frontend.
