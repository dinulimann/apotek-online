# Web app
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build

# API
FROM maven:3.9-eclipse-temurin-17 AS api
WORKDIR /src
COPY backend/pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:17-jre
RUN useradd --system --no-create-home apotek && mkdir -p /data/uploads && chown apotek /data/uploads
COPY --from=api /src/target/apotek-0.0.1-SNAPSHOT.jar /app/app.jar
COPY --from=web /web/dist /app/static
USER apotek
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar", "--spring.web.resources.static-locations=file:/app/static/"]
