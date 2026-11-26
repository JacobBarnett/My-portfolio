import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ShipPicker from "./ShipPicker";
import catalogue from "../../mining-physics/data/ships.json";

// The component asks the engine, which needs wasm and a browser, so the engine
// call is stubbed and fed the real catalogue file. That way the fixture cannot
// drift from the data the app ships.
jest.mock("../engine/call.mjs", () => ({
  ask: jest.fn(),
}));
const { ask } = require("../engine/call.mjs");

const ENVELOPES = {
  "osiris-rex": {
    specs_published: true,
    delta_v_capacity_km_s: 1.82,
    objects_reachable_with_a_full_hold: 0,
    objects_in_catalogue: 50,
    cannot_reach_anything: {
      note: "OSIRIS-REx carries 1.82 km/s of delta v with an empty hold. The easiest round trip in this catalogue needs 3.55 km/s, so it cannot make any of them.",
    },
  },
  psyche: {
    specs_published: true,
    delta_v_capacity_km_s: 8.93,
    objects_reachable_with_a_full_hold: 0,
    objects_in_catalogue: 50,
    no_hold_note: "Psyche can fly a round trip in this catalogue, 40 of the 50 objects, but it has no sample mechanism at all, so it would come home empty.",
  },
  vestri: { specs_published: false, objects_in_catalogue: 50, objects_reachable_with_a_full_hold: 0 },
  "ion-freighter": {
    specs_published: true,
    delta_v_capacity_km_s: 62.02,
    objects_reachable_with_a_full_hold: 40,
    objects_in_catalogue: 50,
  },
};

beforeEach(() => {
  ask.mockImplementation(async (tool, input) => {
    if (tool === "list_ships") return catalogue;
    if (tool === "ship_envelope") return ENVELOPES[input.ship_id] ?? { specs_published: true };
    return {};
  });
});

const show = (shipId = "ion-freighter") =>
  render(<ShipPicker shipId={shipId} onPick={() => {}} />);

test("the fleet is split into real ships and invented ones", async () => {
  show();
  await waitFor(() => expect(screen.getByText("OSIRIS-REx")).toBeInTheDocument());

  expect(screen.getByText("Flown")).toBeInTheDocument();
  expect(screen.getByText("Being built")).toBeInTheDocument();
  expect(screen.getByText("Does not exist")).toBeInTheDocument();

  for (const name of ["OSIRIS-REx", "Hayabusa2", "Psyche", "Vestri", "Ion Freighter"]) {
    // The selected ship appears twice, once in the list and once in the detail
    // header, so this asks for at least one.
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  }
});

test("picking a ship reports it upward", async () => {
  const onPick = jest.fn();
  render(<ShipPicker shipId="ion-freighter" onPick={onPick} />);
  await waitFor(() => expect(screen.getByText("Hayabusa2")).toBeInTheDocument());

  fireEvent.click(screen.getByText("Hayabusa2"));
  expect(onPick).toHaveBeenCalledWith("hayabusa2");
});

test("a real spacecraft shows what it actually brought home", async () => {
  show("osiris-rex");
  await waitFor(() => expect(screen.getByText("Brought home for real")).toBeInTheDocument());
  expect(screen.getByText("121.6 g")).toBeInTheDocument();
  expect(screen.getByText(/cannot make any of them/)).toBeInTheDocument();
});

test("an orbiter is shown as having no hold rather than an empty one", async () => {
  show("psyche");
  await waitFor(() => expect(screen.getByText("nothing, it is an orbiter")).toBeInTheDocument());
  expect(screen.getByText("none")).toBeInTheDocument();
  expect(screen.getByText(/no sample mechanism/)).toBeInTheDocument();
});

test("an unpublished figure reads as unpublished, never as zero", async () => {
  show("vestri");
  await waitFor(() => expect(screen.getAllByText("Vestri").length).toBeGreaterThan(1));

  const notPublished = screen.getAllByText("not published");
  expect(notPublished.length).toBeGreaterThan(2);
  expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
  expect(screen.getByText("specs secret")).toBeInTheDocument();
});

test("an invented ship says which of its numbers are invented", async () => {
  show("ion-freighter");
  await waitFor(() => expect(screen.getAllByText("Ion Freighter").length).toBeGreaterThan(1));

  expect(screen.getByText(/in flight figure measured on Hayabusa2/)).toBeInTheDocument();

  fireEvent.click(screen.getByText(/where these numbers come from/i));
  const invented = screen.getAllByText("Invented");
  expect(invented.length).toBeGreaterThan(2);
  expect(screen.getByText(/JAXA mu10/)).toBeInTheDocument();
});

test("the sources panel shows where sources disagree with each other", async () => {
  show("osiris-rex");
  await waitFor(() => expect(screen.getAllByText("OSIRIS-REx").length).toBeGreaterThan(1));

  fireEvent.click(screen.getByText(/where these numbers come from/i));
  expect(screen.getByText(/Where sources disagree/)).toBeInTheDocument();
  expect(screen.getByText(/880 kg dry/)).toBeInTheDocument();
});

test("the grams warning is always on screen", async () => {
  show();
  await waitFor(() => expect(screen.getByText(/measured in grams/)).toBeInTheDocument());
});

test("an engine that will not load says so instead of rendering an empty fleet", async () => {
  ask.mockImplementation(async () => ({
    error: "engine_unavailable",
    hint: "The physics engine could not be loaded, so none of these numbers can be shown. Reload the page.",
  }));
  show();
  await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
});
