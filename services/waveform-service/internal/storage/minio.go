// Package storage provides a MinIO-backed waveform repository.
// Reads FloodGate Waveform (.fgw) binary format: 128-byte header + float32 sample array.
package storage

import (
	"context"
	"encoding/binary"
	"fmt"
	"log/slog"
	"math"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"waveformservice/internal/config"
)

// FGW binary format constants.
const (
	fgwMagic      = "FGW\x01"
	fgwHeaderSize = 128
)

// FGWHeader represents the parsed FGW file header.
type FGWHeader struct {
	NSamples   uint64  `json:"n_samples"`
	SampleRate float64 `json:"sample_rate"`
	StartTime  float64 `json:"start_time"`
	Unit       string  `json:"unit"`
	EventID    string  `json:"event_id"`
	ChannelID  string  `json:"channel_id"`
	TestID     string  `json:"test_id"`
	HeaderSize uint32  `json:"-"`
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

// ParseFGWHeader parses the FGW header from the first 128 bytes.
func ParseFGWHeader(raw []byte) (*FGWHeader, error) {
	if len(raw) < fgwHeaderSize {
		return nil, fmt.Errorf("FGW header too short: %d bytes", len(raw))
	}

	magic := string(raw[0:4])
	if magic != fgwMagic {
		return nil, fmt.Errorf("invalid FGW magic: %q", magic)
	}

	verMajor := binary.LittleEndian.Uint16(raw[4:6])
	if verMajor != 1 {
		return nil, fmt.Errorf("unsupported FGW version: %d", verMajor)
	}

	headerSize := binary.LittleEndian.Uint32(raw[8:12])
	nSamples := binary.LittleEndian.Uint64(raw[16:24])
	sampleRate := math.Float64frombits(binary.LittleEndian.Uint64(raw[24:32]))
	startTime := math.Float64frombits(binary.LittleEndian.Uint64(raw[32:40]))

	unitLen := int(raw[42])
	unit := string(raw[43 : 43+unitLen])

	eidLen := int(raw[58])
	eventID := string(raw[59 : 59+eidLen])

	cidLen := int(raw[90])
	channelID := string(raw[91 : 91+cidLen])

	tidLen := int(raw[106])
	testID := string(raw[107 : 107+tidLen])

	return &FGWHeader{
		NSamples:   nSamples,
		SampleRate: sampleRate,
		StartTime:  startTime,
		Unit:       unit,
		EventID:    eventID,
		ChannelID:  channelID,
		TestID:     testID,
		HeaderSize: headerSize,
	}, nil
}

// GetWaveformRaw streams the raw FGW bytes from MinIO.
// The caller must close the returned object when done.
func (c *Client) GetWaveformRaw(ctx context.Context, testID, eventID, channelID string) (*minio.Object, int64, error) {
	key := fmt.Sprintf("%s/%s/%s.fgw", testID, eventID, channelID)

	obj, err := c.mc.GetObject(ctx, c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, fmt.Errorf("minio get %q: %w", key, err)
	}

	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		if isNotFound(err) {
			return nil, 0, &NotFoundError{Key: key}
		}
		return nil, 0, fmt.Errorf("stat %q: %w", key, err)
	}

	return obj, stat.Size, nil
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
