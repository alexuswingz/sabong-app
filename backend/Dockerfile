# Use Python with Playwright pre-installed
FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

WORKDIR /app

# Install xvfb for virtual display (allows non-headless browser)
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port
EXPOSE 8000

# Run with xvfb-run for virtual display - browser won't be headless but has fake display
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x720x24", "python", "server.py"]
