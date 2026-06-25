# Usar una imagen oficial de Python
FROM python:3.11-slim

# Establecer el directorio de trabajo
WORKDIR /code

# Instalar dependencias del sistema necesarias para Pillow (procesamiento de imágenes)
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar el archivo de requerimientos primero para aprovechar la cache de Docker
COPY ./requirements.txt /code/requirements.txt

# Instalar las dependencias de Python
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copiar todo el contenido de la carpeta backend al contenedor
COPY . .

# Hugging Face Spaces usa el puerto 7860 por defecto
# Es importante usar 0.0.0.0 para que sea accesible externamente
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
