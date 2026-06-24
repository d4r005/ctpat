# Configuración de Conexión con AppSheet

Para que el sistema pueda enviar datos a tu aplicación de AppSheet, necesitas obtener el `App ID` y el `Access Key`.

## Pasos para obtener las llaves (Nueva Interfaz):

1. Inicia sesión en [AppSheet](https://www.appsheet.com/).
2. Abre tu aplicación **Ctpat**.
3. En la barra lateral izquierda (iconos), haz clic en el icono de **Settings** ⚙️ (Engranaje).
4. En el menú superior que aparece, selecciona la pestaña **Integrations**.
5. En el menú lateral de esa sección, selecciona **Inbound Services**.
6. Asegúrate de que **Enable** esté activado.
7. Haz clic en **Show Access Key** para copiar tu llave.
8. El **App ID** aparece en esa misma pantalla (o puedes obtenerlo de la URL del navegador, es el texto después de `?appId=`).

## Configuración en el servidor:

Una vez que tengas estos valores, edita el archivo `.env` en la carpeta `backend/` y agrégalos:

```env
APPSHEET_APP_ID=tu_app_id_aqui
APPSHEET_ACCESS_KEY=tu_access_key_aqui
```

## Estructura de Tablas Requeridas:

El sistema intentará enviar datos a las siguientes tablas en AppSheet:
- `Inspecciones`: Para las inspecciones de 19 puntos.
- `Caseta`: Para los registros de entrada y salida de vehículos.
- `Embarque`: Para los tickets de carga.

**Nota Importante:** Asegúrate de que tus tablas en AppSheet tengan nombres de columna que coincidan con los datos enviados. El sistema aplana los objetos usando guiones bajos (ejemplo: `entry_chofer_nombre`, `exit_sello_salida`).
