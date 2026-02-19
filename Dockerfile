# Usar uma imagem base oficial do Python leve
FROM python:3.9-slim

# Instalar dependências do sistema necessárias (incluindo FFmpeg)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar requirements.txt e instalar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Garantir que gunicorn está instalado
RUN pip install gunicorn

# Copiar o código da API
COPY api/ ./api/

# Expor a porta (o Render injeta a env PORT, mas expomos a padrão para documentação)
EXPOSE 10000

# Comando para rodar a aplicação usando Gunicorn
# Bind no 0.0.0.0:$PORT (usando shell form para expandir a variável, ou fixo se preferir, mas Render pede bind na env PORT)
# O Render define a env var PORT automaticamente (default 10000).
CMD gunicorn -w 4 -b 0.0.0.0:$PORT api.index:app
