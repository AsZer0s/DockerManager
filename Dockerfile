# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM golang:1.21-alpine AS backend-builder
# Install build essentials for CGO if needed (though we use modernc sqlite which is CGO-free)
RUN apk add --no-generated build-base || true 
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Copy built frontend to backend/static for embedding
COPY --from=frontend-builder /app/frontend/dist ./static
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/dockermanager cmd/api/main.go

# Stage 3: Final Image
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /app/dockermanager .
EXPOSE 9090
CMD ["./dockermanager"]
