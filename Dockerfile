FROM python:3-alpine

WORKDIR /app
COPY index.html styles.css app.js /app/

EXPOSE 8080
CMD ["python3", "-m", "http.server", "8080"]
