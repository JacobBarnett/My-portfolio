// Package handler is the Vercel serverless entrypoint for POST
// /api/project-payoff.
//
// Vercel requires each function to be a .go file directly inside api/ that
// exports a Handler function, so this file stays a thin wrapper and the real
// implementation lives in internal/payoffapi where it can be tested normally.
package handler

import (
	"net/http"

	"github.com/JacobBarnett/My-portfolio/internal/payoffapi"
)

// Handler is invoked by Vercel for each request to /api/project-payoff.
func Handler(w http.ResponseWriter, r *http.Request) {
	payoffapi.Handle(w, r)
}
