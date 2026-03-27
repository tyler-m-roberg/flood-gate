package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"waveformservice/internal/auth"
	"waveformservice/internal/config"
	"waveformservice/internal/handler"
	"waveformservice/internal/storage"
)

func main() {
	cfg := config.Load()

	logLevel := new(slog.LevelVar)
	logLevel.Set(cfg.LogLevel)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	minioClient, err := storage.NewClient(cfg, logger)
	if err != nil {
		logger.Error("minio init failed", "error", err)
		os.Exit(1)
	}

	jwksCache := auth.NewJWKSCache(cfg, logger)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Request logging via slog
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			t := time.Now()
			defer func() {
				logger.Info("request",
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"duration_ms", time.Since(t).Milliseconds(),
					"request_id", middleware.GetReqID(r.Context()),
				)
			}()
			next.ServeHTTP(ww, r)
		})
	})

	// Unauthenticated
	r.Get("/health", handler.Health)

	// Authenticated waveform routes
	r.Route("/api/v1/waveforms", func(r chi.Router) {
		r.Use(auth.Middleware(jwksCache, cfg, logger))
		r.Get("/{testId}/{eventId}/{channelId}", handler.GetWaveform(minioClient))
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("waveform service starting",
			"port", cfg.Port,
			"environment", cfg.Environment,
			"minio_endpoint", cfg.MinioEndpoint,
			"minio_bucket", cfg.MinioBucket,
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("listen error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down gracefully")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
}
