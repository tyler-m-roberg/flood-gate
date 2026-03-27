// Package handler contains HTTP handler functions for the waveform service.
package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"waveformservice/internal/storage"
)

// Health is an unauthenticated liveness endpoint.
func Health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// GetWaveform fetches a single channel waveform from MinIO and returns it as JSON.
// URL params: {testId}, {eventId}, {channelId}
// The client reconstructs the time axis from n_samples and sample_rate.
func GetWaveform(store *storage.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		testID := chi.URLParam(r, "testId")
		eventID := chi.URLParam(r, "eventId")
		channelID := chi.URLParam(r, "channelId")

		data, err := store.GetWaveform(r.Context(), testID, eventID, channelID)
		if err != nil {
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
			return
		}

		w.Header().Set("Content-Type", "application/json")
		// Waveform files are immutable once written — safe to cache aggressively.
		w.Header().Set("Cache-Control", "public, max-age=3600, immutable")
		if err := json.NewEncoder(w).Encode(data); err != nil {
			slog.Error("encode waveform response", "error", err)
		}
	}
}

func jsonErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
