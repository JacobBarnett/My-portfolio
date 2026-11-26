import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TicTacToe from "./TicTacToe";

// A real smoke test. The stock Create React App test that shipped here looked
// for the text "learn react", which this portfolio has never contained, so it
// could never pass. TicTacToe is the one route with no WebGL in it, which keeps
// this runnable under jsdom. Routes that mount three.js are covered by hand.
test("a route renders inside the router", () => {
  render(
    <MemoryRouter>
      <TicTacToe />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});
