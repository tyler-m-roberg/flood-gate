package config

import (
	"log/slog"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration sourced from environment variables.
type Config struct {
	Port        string
	Environment string
	LogLevel    slog.Level

	// Keycloak / OIDC
	KeycloakURL      string
	KeycloakRealm    string
	KeycloakClientID string

	JWTVerifyAudience bool
	JWKSCacheTTL      time.Duration

	// BFF session-cookie auth
	CookieAuthEnabled bool
	SessionCookieName string

	// MinIO / S3-compatible object storage
	MinioEndpoint  string
	MinioAccessKey string
	MinioSecretKey string
	MinioUseTLS    bool
	MinioBucket    string
}

// Load reads config from environment variables with sane defaults.
func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8002"),
		Environment: getEnv("ENVIRONMENT", "development"),
		LogLevel:    parseLogLevel(getEnv("LOG_LEVEL", "INFO")),

		KeycloakURL:      getEnv("KEYCLOAK_URL", "http://localhost:8080"),
		KeycloakRealm:    getEnv("KEYCLOAK_REALM", "floodgate"),
		KeycloakClientID: getEnv("KEYCLOAK_CLIENT_ID", "floodgate-waveform"),

		JWTVerifyAudience: parseBool(getEnv("JWT_VERIFY_AUDIENCE", "true")),
		JWKSCacheTTL:      time.Duration(parseInt(getEnv("JWKS_CACHE_TTL_SECONDS", "300"))) * time.Second,

		CookieAuthEnabled: parseBool(getEnv("COOKIE_AUTH_ENABLED", "true")),
		SessionCookieName: getEnv("SESSION_COOKIE_NAME", "session_token"),

		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioUseTLS:    parseBool(getEnv("MINIO_USE_TLS", "false")),
		MinioBucket:    getEnv("MINIO_BUCKET", "floodgate-waveforms"),
	}
}

// JWKSUri returns the Keycloak JWKS endpoint.
func (c *Config) JWKSUri() string {
	return c.KeycloakURL + "/realms/" + c.KeycloakRealm + "/protocol/openid-connect/certs"
}

// KeycloakIssuer returns the expected JWT issuer claim value.
func (c *Config) KeycloakIssuer() string {
	return c.KeycloakURL + "/realms/" + c.KeycloakRealm
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func parseBool(s string) bool {
	b, _ := strconv.ParseBool(s)
	return b
}

func parseInt(s string) int {
	i, _ := strconv.Atoi(s)
	return i
}

func parseLogLevel(s string) slog.Level {
	var l slog.Level
	_ = l.UnmarshalText([]byte(s))
	return l
}
