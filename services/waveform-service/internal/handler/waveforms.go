// Package handler contains HTTP handler functions for the waveform service.
package handler

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"waveformservice/internal/storage"
)

// Health is an unauthenticated liveness endpoint.
func Health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// GetWaveform streams the raw FGW binary for a single channel directly from MinIO.
// URL params: {testId}, {eventId}, {channelId}
// The client parses the 128-byte header and float32 sample array.
func GetWaveform(store *storage.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		testID := chi.URLParam(r, "testId")
		eventID := chi.URLParam(r, "eventId")
		channelID := chi.URLParam(r, "channelId")

		obj, size, err := store.GetWaveformRaw(r.Context(), testID, eventID, channelID)
		if err != nil {
			handleStorageErr(w, err, testID, eventID, channelID)
			return
		}
		defer obj.Close()

		w.Header().Set("Content-Type", "application/x-floodgate-waveform")
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
		w.Header().Set("Cache-Control", "public, max-age=3600, immutable")
		if _, err := io.Copy(w, obj); err != nil {
			slog.Error("stream waveform", "error", err)
		}
	}
}

func handleStorageErr(w http.ResponseWriter, err error, testID, eventID, channelID string) {
	var nfe *storage.NotFoundError
	if errors.As(err, &nfe) {
		slog.Info("waveform not found",
			"test", testID, "event", eventID, "channel", channelID)
		jsonErr(w, http.StatusNotFound, "waveform not found")
	} else {
		slog.Error("waveform fetch failed",
			"test", testID, "event", eventID, "channel", channelID, "error", err)
		jsonErr(w, http.StatusInternalServerError, "internal error")
	}
}

func jsonErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
