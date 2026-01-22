# Use Python with Playwright pre-installed
FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port
EXPOSE 8000

# Run the server
CMD ["python", "server.py"]
