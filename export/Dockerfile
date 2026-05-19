FROM dvp-srv-gitlab.campus12avenue.fr:5050/tp-devops-2526/s04/flowfield/export-base:latest
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
EXPOSE 8001
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
