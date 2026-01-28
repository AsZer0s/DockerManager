FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM golang:1.21-alpine AS backend-builder
RUN apk add --no-generated build-base || true 
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./cmd/api/static
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/dockermanager cmd/api/main.go

FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /app/dockermanager .
EXPOSE 9090
CMD ["./dockermanager"]
