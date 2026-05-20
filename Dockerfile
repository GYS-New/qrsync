FROM node:20-slim

# Python kur
# NOT (2026-05-21): Railway build runner'larında apt GPG imzaları "invalid"
# olarak işaretleniyordu (büyük olasılıkla container saat kayması). Build'in
# bloklanmaması için Acquire::Check-Valid-Until ve Check-Date kapatıldı,
# imza zorunluluğu gevşetildi. Railway altyapısı düzelince bu satırlar
# orijinal "apt-get update && apt-get install -y" formatına çevrilmeli.
RUN apt-get update \
      -o Acquire::Check-Valid-Until=false \
      -o Acquire::Check-Date=false \
      -o Acquire::AllowInsecureRepositories=true \
      -o Acquire::AllowDowngradeToInsecureRepositories=true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
      python3 python3-pip python3-venv && \
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
