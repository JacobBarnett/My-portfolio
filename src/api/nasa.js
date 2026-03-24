export default async function handler(req, res) {
  const url =
    "https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.2&date-min=2025-01-01&date-max=2026-12-31&diameter=true&fullname=true&limit=60&sort=dist";

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch NASA data" });
  }
}
