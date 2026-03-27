// Package storage provides a MinIO-backed waveform repository.
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"waveformservice/internal/config"
)

// WaveformData is the structure stored in MinIO and returned to callers.
// Object key: {testId}/{eventId}/{channelId}.json
type WaveformData struct {
	EventID    string    `json:"event_id"`
	ChannelID  string    `json:"channel_id"`
	TestID     string    `json:"test_id"`
	SampleRate float64   `json:"sample_rate"`
	NSamples   int       `json:"n_samples"`
	StartTime  float64   `json:"start_time"`
	Unit       string    `json:"unit"`
	Values     []float32 `json:"values"`
}

// Client wraps the MinIO SDK with domain-specific helpers.
type Client struct {
	mc     *minio.Client
	bucket string
	logger *slog.Logger
}

// NewClient creates a MinIO client from config and verifies connectivity.
func NewClient(cfg *config.Config, logger *slog.Logger) (*Client, error) {
	mc, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseTLS,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client init: %w", err)
	}
	return &Client{mc: mc, bucket: cfg.MinioBucket, logger: logger}, nil
}

// GetWaveform fetches a single channel's waveform from MinIO.
func (c *Client) GetWaveform(ctx context.Context, testID, eventID, channelID string) (*WaveformData, error) {
	key := fmt.Sprintf("%s/%s/%s.json", testID, eventID, channelID)

	obj, err := c.mc.GetObject(ctx, c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio get %q: %w", key, err)
	}
	defer obj.Close()

	raw, err := io.ReadAll(obj)
	if err != nil {
		// MinIO SDK wraps S3 errors inside the Read call
		if isNotFound(err) {
			return nil, &NotFoundError{Key: key}
		}
		return nil, fmt.Errorf("reading %q: %w", key, err)
	}

	var data WaveformData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("unmarshal %q: %w", key, err)
	}
	return &data, nil
}

// NotFoundError is returned when the requested object does not exist in MinIO.
type NotFoundError struct {
	Key string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("waveform not found: %s", e.Key)
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "NoSuchKey") ||
		strings.Contains(s, "does not exist") ||
		strings.Contains(s, "not found")
}
