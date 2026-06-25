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

# Ejecutar con workers optimizados para evitar bloqueos
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "2", "--timeout-keep-alive", "60"]
