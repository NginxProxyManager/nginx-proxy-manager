FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/ssofixtures .

FROM alpine:3.22
RUN adduser -D -u 10001 fixture
COPY --from=build /out/ssofixtures /usr/local/bin/ssofixtures
USER fixture
ENTRYPOINT ["/usr/local/bin/ssofixtures"]
