FROM python:3.11-slim

# OpenCV ve EasyOCR için sistem bağımlılıkları
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Önce requirements — pip layer cache'i için
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# EasyOCR İngilizce modelini build zamanı indir (ilk istek hızlı olsun,
# runtime'da network'e bağlı kalmasın). Model ~64 MB.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=False)"

COPY app.py ocr.py ./

ENV PORT=5000
EXPOSE 5000

# Gunicorn: shell form — $PORT expansion gerekir (Railway dinamik atar).
# Tek worker (EasyOCR model RAM'i shared değil), 2 thread paralel istek.
# Timeout 60sn — ilk /oku isteğinde lazy model load yapılır.
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 2 --timeout 60 app:app
