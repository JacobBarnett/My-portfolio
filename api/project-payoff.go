// Package handler is the Vercel serverless function behind
// POST /api/project-payoff.
//
// It is deliberately self-contained: Vercel builds each .go file directly
// inside api/ as its own function, so keeping the projection math in this one
// file avoids depending on how the builder resolves sibling packages.
//
// The calculation below mirrors internal/payoff in the standalone service at
// github.com/JacobBarnett/debt-settlement-tracker, where it is unit tested.
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"time"
)

// maxBodyBytes bounds the request body. The payload is three numbers, so
// anything larger is a mistake or an attack.
const maxBodyBytes = 4 << 10

type errorResponse struct {
	Error string `json:"error"`
}

// Handler is invoked by Vercel for each request to /api/project-payoff.
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

	var req Request
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be valid JSON: "+err.Error())
		return
	}

	projection, err := Project(req, time.Now())
	if err != nil {
		if errors.Is(err, ErrInvalidRequest) {
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

// dateLayout is the wire format for every date this package emits.
const dateLayout = "2006-01-02"

// maxProjectedMonths caps a projection at 50 years. Past that the input is
// almost certainly bad data rather than a real payment plan, and we would be
// handing the frontend an unusable schedule.
const maxProjectedMonths = 600

// ErrInvalidRequest wraps every validation failure so callers can classify a
// bad request without string matching. Use errors.Is to test for it.
var ErrInvalidRequest = errors.New("invalid projection request")

// Request holds the inputs to a payoff projection, in dollars.
type Request struct {
	EnrolledDebt   float64 `json:"enrolled_debt"`
	SettledAmount  float64 `json:"settled_amount"`
	MonthlyPayment float64 `json:"monthly_payment"`
}

// Month is one row of the projected settlement schedule.
type Month struct {
	Month            int     `json:"month"`
	Date             string  `json:"date"`
	ProjectedSettled float64 `json:"projected_settled"`
	RemainingBalance float64 `json:"remaining_balance"`
}

// Projection is the result of a payoff calculation.
type Projection struct {
	MonthsRemaining     int     `json:"months_remaining"`
	EstimatedPayoffDate string  `json:"estimated_payoff_date"`
	TotalRemaining      float64 `json:"total_remaining"`
	Schedule            []Month `json:"schedule"`
}

// Validate reports whether the request describes a plan that can be projected.
func (r Request) Validate() error {
	switch {
	case math.IsNaN(r.EnrolledDebt) || math.IsNaN(r.SettledAmount) || math.IsNaN(r.MonthlyPayment):
		return fmt.Errorf("%w: amounts must be finite numbers", ErrInvalidRequest)
	case r.EnrolledDebt <= 0:
		return fmt.Errorf("%w: enrolled_debt must be greater than 0", ErrInvalidRequest)
	case r.SettledAmount < 0:
		return fmt.Errorf("%w: settled_amount cannot be negative", ErrInvalidRequest)
	case r.SettledAmount > r.EnrolledDebt:
		return fmt.Errorf("%w: settled_amount cannot exceed enrolled_debt", ErrInvalidRequest)
	case r.MonthlyPayment <= 0 && r.SettledAmount < r.EnrolledDebt:
		return fmt.Errorf("%w: monthly_payment must be greater than 0", ErrInvalidRequest)
	}
	return nil
}

// Project builds the month-by-month payoff schedule for a plan. The starting
// point is passed in rather than read from the clock so that callers - and
// tests - get a deterministic result.
func Project(req Request, from time.Time) (Projection, error) {
	if err := req.Validate(); err != nil {
		return Projection{}, err
	}

	remaining := round2(req.EnrolledDebt - req.SettledAmount)
	if remaining <= 0 {
		// Already settled: no months left, payoff is effective immediately.
		return Projection{
			MonthsRemaining:     0,
			EstimatedPayoffDate: from.Format(dateLayout),
			TotalRemaining:      0,
			Schedule:            []Month{},
		}, nil
	}

	months := int(math.Ceil(remaining / req.MonthlyPayment))
	if months > maxProjectedMonths {
		return Projection{}, fmt.Errorf(
			"%w: plan would take %d months, which exceeds the %d month limit",
			ErrInvalidRequest, months, maxProjectedMonths,
		)
	}

	schedule := make([]Month, 0, months)
	settled := req.SettledAmount
	for m := 1; m <= months; m++ {
		// The final payment is partial, so never settle past the enrolled debt.
		settled = math.Min(settled+req.MonthlyPayment, req.EnrolledDebt)
		schedule = append(schedule, Month{
			Month:            m,
			Date:             addMonths(from, m).Format(dateLayout),
			ProjectedSettled: round2(settled),
			RemainingBalance: round2(req.EnrolledDebt - settled),
		})
	}

	return Projection{
		MonthsRemaining:     months,
		EstimatedPayoffDate: schedule[len(schedule)-1].Date,
		TotalRemaining:      remaining,
		Schedule:            schedule,
	}, nil
}

// round2 rounds a dollar amount to whole cents.
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// addMonths advances t by n calendar months, clamping to the last day of the
// target month instead of spilling into the next one.
//
// time.Time.AddDate normalises overflow, so "January 31 plus one month" becomes
// March 3 and February is skipped entirely. A payment schedule has to land on
// February 28 instead, otherwise a plan started on the 31st shows two payments
// in one month and none in another.
func addMonths(t time.Time, n int) time.Time {
	year, month, day := t.Date()

	// time.Date normalises the month, so month+n rolls into later years cleanly.
	target := time.Date(year, month+time.Month(n), 1, 0, 0, 0, 0, t.Location())

	if last := daysInMonth(target.Year(), target.Month()); day > last {
		day = last
	}

	return time.Date(
		target.Year(), target.Month(), day,
		t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location(),
	)
}

// daysInMonth returns how many days the given month has. Day 0 of the following
// month is the last day of this one.
func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
