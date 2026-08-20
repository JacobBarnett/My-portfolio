// Package handler exposes the debt settlement payoff projection as a Vercel
// serverless function.
//
// The calculation itself lives in internal/payoff and is the same code that
// runs in the standalone Go service at
// github.com/JacobBarnett/debt-settlement-tracker.
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/JacobBarnett/My-portfolio/internal/payoff"
)

// maxBodyBytes bounds the request body. The payload is three numbers, so
// anything larger is a mistake or an attack.
const maxBodyBytes = 4 << 10

type errorResponse struct {
	Error string `json:"error"`
}

// Handler is the entry point Vercel invokes for /api/project-payoff.
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "only POST is supported")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req payoff.Request
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be valid JSON: "+err.Error())
		return
	}

	projection, err := payoff.Project(req, time.Now())
	if err != nil {
		if errors.Is(err, payoff.ErrInvalidRequest) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		log.Printf("projection failed: %v", err)
		writeError(w, http.StatusInternalServerError, "could not calculate projection")
		return
	}

	writeJSON(w, http.StatusOK, projection)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("writing response failed: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}
