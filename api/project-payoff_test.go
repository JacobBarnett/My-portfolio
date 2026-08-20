package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JacobBarnett/My-portfolio/internal/payoff"
)

func TestHandlerReturnsProjection(t *testing.T) {
	body := `{"enrolled_debt":12000,"settled_amount":2000,"monthly_payment":500}`
	rec := httptest.NewRecorder()
	Handler(rec, httptest.NewRequest(http.MethodPost, "/api/project-payoff", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body)
	}

	var got payoff.Projection
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response failed: %v", err)
	}
	if got.MonthsRemaining != 20 {
		t.Errorf("months_remaining = %d, want 20", got.MonthsRemaining)
	}
	if len(got.Schedule) != 20 {
		t.Errorf("len(schedule) = %d, want 20", len(got.Schedule))
	}
}

func TestHandlerRejectsInvalidPlan(t *testing.T) {
	body := `{"enrolled_debt":0,"settled_amount":0,"monthly_payment":500}`
	rec := httptest.NewRecorder()
	Handler(rec, httptest.NewRequest(http.MethodPost, "/api/project-payoff", strings.NewReader(body)))

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
}

func TestHandlerAnswersPreflight(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(rec, httptest.NewRequest(http.MethodOptions, "/api/project-payoff", nil))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if origin := rec.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("CORS origin = %q, want %q", origin, "*")
	}
}

func TestHandlerRejectsGet(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(rec, httptest.NewRequest(http.MethodGet, "/api/project-payoff", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}
