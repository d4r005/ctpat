# Usar una imagen oficial de Python ligera
FROM python:3.11-slim

# Establecer el directorio de trabajo en /code
WORKDIR /code

# Instalar dependencias del sistema para procesamiento de imágenes (Pillow)
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar el archivo de requerimientos a la raíz del directorio de trabajo
COPY requirements.txt .

# Instalar las dependencias de Python
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copiar todo el contenido de la carpeta actual al contenedor
# Asegúrate de subir server.py en la raíz del Space de Hugging Face
COPY . .

# Hugging Face Spaces requiere escuchar en el puerto 7860 por defecto
# Usamos el comando uvicorn directamente para mayor estabilidad en Docker
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
