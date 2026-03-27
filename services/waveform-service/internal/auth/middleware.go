// Package auth provides JWT validation middleware for the waveform service.
//
// Two token sources are supported on every secured endpoint:
//
//  1. Bearer token  (Authorization: Bearer <jwt>)
//     Used by the React SPA after PKCE login and by machine clients using
//     client-credentials grant.
//
//  2. Session cookie  (Cookie: session_token=<jwt>)
//     Used when a BFF proxy performs the OIDC flow server-side and plants the
//     Keycloak access token in an HttpOnly cookie.
//
// Bearer takes precedence. If neither is present a 401 is returned.
// The JWKS is fetched from Keycloak's discovery endpoint and cached with a
// configurable TTL; a cache miss triggers an immediate re-fetch (key rotation).
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"waveformservice/internal/config"
)

// Claims mirrors the Keycloak JWT payload fields we care about.
type Claims struct {
	jwt.RegisteredClaims
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	PreferredUsername string `json:"preferred_username"`
}

type contextKey struct{}

// JWKSCache fetches and caches RSA public keys from a Keycloak JWKS endpoint.
// It is safe for concurrent use.
type JWKSCache struct {
	mu     sync.RWMutex
	keys   map[string]*rsa.PublicKey // kid → public key
	expiry time.Time
	cfg    *config.Config
	logger *slog.Logger
	client *http.Client
}

// NewJWKSCache returns an initialised (but not yet populated) JWKS cache.
func NewJWKSCache(cfg *config.Config, logger *slog.Logger) *JWKSCache {
	return &JWKSCache{
		keys:   make(map[string]*rsa.PublicKey),
		cfg:    cfg,
		logger: logger,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// KeyFunc satisfies the jwt.Keyfunc signature expected by golang-jwt/jwt.
func (c *JWKSCache) KeyFunc(token *jwt.Token) (interface{}, error) {
	if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
		return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
	}
	kid, _ := token.Header["kid"].(string)

	c.mu.RLock()
	key, ok := c.keys[kid]
	expired := time.Now().After(c.expiry)
	c.mu.RUnlock()

	if !ok || expired {
		if err := c.refresh(); err != nil {
			return nil, fmt.Errorf("JWKS refresh: %w", err)
		}
		c.mu.RLock()
		key, ok = c.keys[kid]
		c.mu.RUnlock()
		if !ok {
			return nil, errors.New("unknown key id: " + kid)
		}
	}
	return key, nil
}

// jwksResponse is the JSON structure returned by the JWKS endpoint.
type jwksResponse struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Use string `json:"use"`
		N   string `json:"n"` // base64url-encoded RSA modulus
		E   string `json:"e"` // base64url-encoded RSA exponent
	} `json:"keys"`
}

func (c *JWKSCache) refresh() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	resp, err := c.client.Get(c.cfg.JWKSUri())
	if err != nil {
		return fmt.Errorf("fetching JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("decoding JWKS: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" || k.Use != "sig" || k.Kid == "" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nb),
			E: int(new(big.Int).SetBytes(eb).Int64()),
		}
	}

	c.keys = keys
	c.expiry = time.Now().Add(c.cfg.JWKSCacheTTL)
	c.logger.Info("jwks refreshed", "key_count", len(keys))
	return nil
}

// Middleware returns a chi-compatible middleware that validates every request.
func Middleware(cache *JWKSCache, cfg *config.Config, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, source := extractToken(r, cfg)
			if raw == "" {
				jsonError(w, http.StatusUnauthorized, "not authenticated")
				return
			}

			opts := []jwt.ParserOption{
				jwt.WithValidMethods([]string{"RS256"}),
				jwt.WithIssuedAt(),
				jwt.WithIssuer(cfg.KeycloakIssuer()),
			}
			if cfg.JWTVerifyAudience {
				opts = append(opts, jwt.WithAudience(cfg.KeycloakClientID))
			}

			token, err := jwt.ParseWithClaims(raw, &Claims{}, cache.KeyFunc, opts...)
			if err != nil || !token.Valid {
				logger.Warn("auth failed", "source", source, "error", err)
				jsonError(w, http.StatusForbidden, "invalid or expired token")
				return
			}

			claims := token.Claims.(*Claims)
			logger.Debug("auth ok",
				"subject", claims.Subject,
				"username", claims.PreferredUsername,
				"source", source,
			)
			ctx := context.WithValue(r.Context(), contextKey{}, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClaimsFromCtx retrieves the validated claims injected by Middleware.
func ClaimsFromCtx(ctx context.Context) *Claims {
	c, _ := ctx.Value(contextKey{}).(*Claims)
	return c
}

func extractToken(r *http.Request, cfg *config.Config) (token, source string) {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), "bearer"
	}
	if cfg.CookieAuthEnabled {
		if c, err := r.Cookie(cfg.SessionCookieName); err == nil {
			return c.Value, "cookie"
		}
	}
	return "", ""
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}
