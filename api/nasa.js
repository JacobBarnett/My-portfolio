// Proxies the JPL close approach API for the asteroid browser at /asteroids.
//
// The window used to be hardcoded as 2025-01-01 to 2026-12-31, which worked
// until the end of 2026 and would then have returned an empty list with no
// error, quietly emptying the page. It is now a rolling window around today.
export default async function handler(req, res) {
  const day = (offsetDays) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  const params = new URLSearchParams({
    "dist-max": "0.2",
    "date-min": day(-365),
    "date-max": day(365),
    diameter: "true",
    fullname: "true",
    limit: "60",
    sort: "dist",
  });

  try {
    const response = await fetch(`https://ssd-api.jpl.nasa.gov/cad.api?${params}`);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    // A close approach catalogue does not change minute to minute, and the demo
    // should not wait on JPL twice for the same answer.
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({
      error: "jpl_unreachable",
      hint: "The JPL close approach API could not be reached.",
    });
  }
}
