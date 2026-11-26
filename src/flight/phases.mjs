// The phase vocabulary, in one place.
//
// The simulator already used these eight names and these colors, and the Rust
// `simulate_mission` tool emits the same eight, which is why a planned mission
// can play in the simulator at all. Keeping them here stops the two drifting.

export const PHASE_SEQUENCE = {
  STANDBY: "#8892a4",
  TRANSIT: "#c8a96e",
  APPROACH: "#f6ad55",
  ANCHORING: "#fc8181",
  DRILLING: "#68d391",
  EXTRACTING: "#63b3ed",
  RETURNING: "#fc8181",
  COMPLETE: "#63b3ed",
};

export const PHASE_NAMES = Object.keys(PHASE_SEQUENCE);
