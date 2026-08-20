package payoff

import (
	"errors"
	"testing"
	"time"
)

// start is a fixed clock so schedule dates are deterministic.
var start = time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC)

func TestProjectEvenSplit(t *testing.T) {
	got, err := Project(Request{EnrolledDebt: 12000, SettledAmount: 2000, MonthlyPayment: 500}, start)
	if err != nil {
		t.Fatalf("Project() returned unexpected error: %v", err)
	}

	if want := 20; got.MonthsRemaining != want {
		t.Errorf("MonthsRemaining = %d, want %d", got.MonthsRemaining, want)
	}
	if want := 10000.0; got.TotalRemaining != want {
		t.Errorf("TotalRemaining = %v, want %v", got.TotalRemaining, want)
	}
	if want := "2027-09-15"; got.EstimatedPayoffDate != want {
		t.Errorf("EstimatedPayoffDate = %q, want %q", got.EstimatedPayoffDate, want)
	}
	if len(got.Schedule) != got.MonthsRemaining {
		t.Fatalf("len(Schedule) = %d, want %d", len(got.Schedule), got.MonthsRemaining)
	}

	first := got.Schedule[0]
	if first.ProjectedSettled != 2500 || first.RemainingBalance != 9500 {
		t.Errorf("first month = %+v, want settled 2500 / remaining 9500", first)
	}

	// The plan must land exactly on zero, never overshoot the enrolled debt.
	last := got.Schedule[len(got.Schedule)-1]
	if last.ProjectedSettled != 12000 || last.RemainingBalance != 0 {
		t.Errorf("final month = %+v, want settled 12000 / remaining 0", last)
	}
}

func TestProjectPartialFinalPayment(t *testing.T) {
	// 5000 owed at 1200/month is 4.17 months, so it rounds up to 5 with the
	// last payment covering only the 200 that is left.
	got, err := Project(Request{EnrolledDebt: 5000, SettledAmount: 0, MonthlyPayment: 1200}, start)
	if err != nil {
		t.Fatalf("Project() returned unexpected error: %v", err)
	}

	if want := 5; got.MonthsRemaining != want {
		t.Errorf("MonthsRemaining = %d, want %d", got.MonthsRemaining, want)
	}

	last := got.Schedule[len(got.Schedule)-1]
	if last.ProjectedSettled != 5000 || last.RemainingBalance != 0 {
		t.Errorf("final month = %+v, want settled 5000 / remaining 0", last)
	}
}

func TestProjectAlreadySettled(t *testing.T) {
	got, err := Project(Request{EnrolledDebt: 8000, SettledAmount: 8000, MonthlyPayment: 0}, start)
	if err != nil {
		t.Fatalf("Project() returned unexpected error: %v", err)
	}

	if got.MonthsRemaining != 0 {
		t.Errorf("MonthsRemaining = %d, want 0", got.MonthsRemaining)
	}
	if len(got.Schedule) != 0 {
		t.Errorf("len(Schedule) = %d, want 0", len(got.Schedule))
	}
	if want := "2026-01-15"; got.EstimatedPayoffDate != want {
		t.Errorf("EstimatedPayoffDate = %q, want %q", got.EstimatedPayoffDate, want)
	}
}

func TestProjectInvalidInput(t *testing.T) {
	cases := map[string]Request{
		"zero enrolled debt":       {EnrolledDebt: 0, SettledAmount: 0, MonthlyPayment: 500},
		"negative settled amount":  {EnrolledDebt: 5000, SettledAmount: -1, MonthlyPayment: 500},
		"settled exceeds enrolled": {EnrolledDebt: 5000, SettledAmount: 6000, MonthlyPayment: 500},
		"no monthly payment":       {EnrolledDebt: 5000, SettledAmount: 0, MonthlyPayment: 0},
		"payment too small":        {EnrolledDebt: 5000, SettledAmount: 0, MonthlyPayment: 1},
	}

	for name, req := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Project(req, start); !errors.Is(err, ErrInvalidRequest) {
				t.Errorf("Project() error = %v, want ErrInvalidRequest", err)
			}
		})
	}
}

func TestProjectClampsToMonthEnd(t *testing.T) {
	// Starting on the 31st: AddDate would roll September 31 into October 1,
	// putting two payments in October and none in September.
	from := time.Date(2026, time.August, 31, 0, 0, 0, 0, time.UTC)

	got, err := Project(Request{EnrolledDebt: 6000, SettledAmount: 0, MonthlyPayment: 1000}, from)
	if err != nil {
		t.Fatalf("Project() returned unexpected error: %v", err)
	}

	want := []string{
		"2026-09-30", // September has 30 days
		"2026-10-31",
		"2026-11-30",
		"2026-12-31",
		"2027-01-31",
		"2027-02-28", // 2027 is not a leap year
	}

	if len(got.Schedule) != len(want) {
		t.Fatalf("len(Schedule) = %d, want %d", len(got.Schedule), len(want))
	}

	for i, wantDate := range want {
		if got.Schedule[i].Date != wantDate {
			t.Errorf("month %d date = %q, want %q", i+1, got.Schedule[i].Date, wantDate)
		}
	}

	if got.EstimatedPayoffDate != "2027-02-28" {
		t.Errorf("EstimatedPayoffDate = %q, want %q", got.EstimatedPayoffDate, "2027-02-28")
	}
}

func TestProjectClampsIntoLeapFebruary(t *testing.T) {
	from := time.Date(2028, time.January, 30, 0, 0, 0, 0, time.UTC)

	got, err := Project(Request{EnrolledDebt: 1000, SettledAmount: 0, MonthlyPayment: 1000}, from)
	if err != nil {
		t.Fatalf("Project() returned unexpected error: %v", err)
	}

	// 2028 is a leap year, so the 30th clamps to the 29th rather than the 28th.
	if want := "2028-02-29"; got.Schedule[0].Date != want {
		t.Errorf("month 1 date = %q, want %q", got.Schedule[0].Date, want)
	}
}
