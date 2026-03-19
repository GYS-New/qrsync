FROM node:20-slim

# Python kur
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Python paketleri virtual env ile kur
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install openpyxl qrcode pillow

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 3000
CMD ["npm", "start"]
