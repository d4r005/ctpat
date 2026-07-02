# Usar una imagen oficial de Python ligera
FROM python:3.11-slim

# Optimizar Python para contenedores
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Establecer el directorio de trabajo
WORKDIR /code

# Instalar solo lo estrictamente necesario para Pillow y Motor
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev \
    zlib1g-dev \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias primero para aprovechar el cache de Docker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend (excluyendo lo del .dockerignore)
COPY . .

# Puerto estándar de Hugging Face
EXPOSE 7860

# IMPORTANTE: un solo worker.
# Con --workers 2 cada worker es un PROCESO separado con su propia memoria
# (os.environ). El refresco de GMAIL_ACCESS_TOKEN/GOOGLEDRIVE_ACCESS_TOKEN
# (vía /api/admin/refresh-*-token, llamado por la automatización cada ~45 min)
# sólo actualiza el proceso que atendió esa petición HTTP -- el otro worker
# se queda con el token viejo/expirado en memoria, y HF reparte las peticiones
# al azar entre ambos, así que ~50% de los envíos de correo fallaban con
# "401 invalid authentication credentials" de forma intermitente, dando la
# falsa impresión de que Gmail fallaba al azar. Un solo worker (async, ya usa
# BackgroundTasks/asyncio.to_thread para no bloquear) elimina el problema de raíz.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--timeout-keep-alive", "60"]
