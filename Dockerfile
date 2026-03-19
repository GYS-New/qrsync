FROM node:20-slim

# Python kur
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Python paketleri
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install openpyxl qrcode pillow

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build-time env variables
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 3000
CMD ["npm", "start"]
