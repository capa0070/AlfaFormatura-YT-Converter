FROM node:18-slim

# Instalar dependências do sistema: python3 (para yt-dlp), ffmpeg, curl
RUN apt-get update && \
    apt-get install -y python3 curl ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Baixar o binário mais recente do yt-dlp
# Usando o release oficial do yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Variável de ambiente para o código achar o yt-dlp e porta
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV PORT=4001

EXPOSE 4001

CMD ["node", "index.js"]
