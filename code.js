let map, userMarker, routeLine;
let lastCoords = null;
let currentRouteCoords = null;

// Build a loop of randomized waypoints around the start to explore nearby streets.
function buildLoopWaypoints(start, desiredMeters, opts = {}) {
  const minRadiusM = 80; // keep loops from being too tiny
  const circumference = Math.max(desiredMeters, minRadiusM * 2 * Math.PI);
  const rMeters = circumference / (2 * Math.PI);
  const avoidMain = !!opts.avoidMain;
  const radiusScale = avoidMain ? 0.6 : 1.0; // smaller loops to stay on local streets
  const latRad = start.lat * Math.PI / 180;
  const dLat = (rMeters * radiusScale) / 111000;
  const dLng = (rMeters * radiusScale) / (111000 * Math.cos(latRad));

  // Choose 4–8 waypoints based on distance (roughly one every ~400m), add jitter for variety
  const N = avoidMain
    ? Math.min(12, Math.max(6, Math.round(desiredMeters / 300)))
    : Math.min(8, Math.max(4, Math.round(desiredMeters / 400)));
  const pts = [];
  for (let i = 0; i < N; i++) {
    const base = (i / N) * 2 * Math.PI;
    const jitter = (Math.random() - 0.5) * 0.4; // +/- ~23°
    const angle = base + jitter;
    const rLat = dLat * (0.85 + Math.random() * 0.30);
    const rLng = dLng * (0.85 + Math.random() * 0.30);
    const lat = start.lat + rLat * Math.sin(angle);
    const lng = start.lng + rLng * Math.cos(angle);
    pts.push([lng, lat]); // OSRM expects [lng,lat]
  }
  return pts;
}

// --- Segment routing helpers for "random walk" style loops ---
async function routeSegment(fromLngLat, toLngLat) {
  const url = `https://router.project-osrm.org/route/v1/foot/${fromLngLat[0]},${fromLngLat[1]};${toLngLat[0]},${toLngLat[1]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data || !data.routes || !data.routes.length) return null;
  const r = data.routes[0];
  return { geometry: r.geometry, distance: r.distance, coords: r.geometry.coordinates };
}
function randomNearby(from, meters, biasBearingRad = null) {
  const latRad = from[1] * Math.PI / 180;
  const dLat = meters / 111000;
  const dLng = meters / (111000 * Math.cos(latRad));
  let theta = Math.random() * 2 * Math.PI;
  if (biasBearingRad !== null) {
    const w = 0.65; // bias strength 0..1
    theta = (1 - w) * theta + w * biasBearingRad;
  }
  const r = 0.7 + Math.random() * 0.6; // 0.7–1.3x meters
  const lat = from[1] + dLat * r * Math.sin(theta);
  const lng = from[0] + dLng * r * Math.cos(theta);
  return [lng, lat]; // [lng,lat]
}
function bearingRad(from, to) {
  const φ1 = from[1] * Math.PI / 180;
  const φ2 = to[1] * Math.PI / 180;
  const λ1 = from[0] * Math.PI / 180;
  const λ2 = to[0] * Math.PI / 180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  return Math.atan2(y, x);
}

async function generatePath(distanceMeters, coords) {
  if (routeLine) map.removeLayer(routeLine);
  currentRouteCoords = null;

  const startLL = [coords.lng, coords.lat]; // [lng,lat]
  let cur = startLL;
  let total = 0;

  // hop size tuned for foot routing; use smaller hops when avoiding mains
  const avoidMain = !!window.__avoidMainroads?.checked;
  const minHop = avoidMain ? 90 : 140;   // meters
  const maxHop = avoidMain ? 200 : 260;  // meters

  const targetOut = distanceMeters * 0.60; // explore until ~60% used
  const maxSegments = 30; // safety cap

  // Collect coordinates as we go (LineString)
  const allCoords = [cur];

  // OUTBOUND: free exploration
  for (let i = 0; i < maxSegments && total < targetOut; i++) {
    const hop = minHop + Math.random() * (maxHop - minHop);
    const nextGuess = randomNearby(cur, hop, null); // no bias outbound
    const seg = await routeSegment(cur, nextGuess);
    if (!seg) continue; // try another random hop
    total += seg.distance;
    // append coords but skip duplicate join point
    for (let j = 1; j < seg.coords.length; j++) allCoords.push(seg.coords[j]);
    cur = seg.coords[seg.coords.length - 1];
  }

  // RETURN: biased toward start, but still "random"
  let guard = 0;
  while (guard < maxSegments && total < distanceMeters * 0.95) {
    const hop = minHop + Math.random() * (maxHop - minHop);
    const bias = bearingRad(cur, startLL);
    const nextGuess = randomNearby(cur, hop, bias);
    const seg = await routeSegment(cur, nextGuess);
    if (!seg) { guard++; continue; }
    total += seg.distance;
    for (let j = 1; j < seg.coords.length; j++) allCoords.push(seg.coords[j]);
    cur = seg.coords[seg.coords.length - 1];
    guard++;
    // if we're close to target, finish by routing straight to start
    if (total >= distanceMeters * 0.90) break;
  }

  // Final leg back home
  const back = await routeSegment(cur, startLL);
  if (back) {
    total += back.distance;
    for (let j = 1; j < back.coords.length; j++) allCoords.push(back.coords[j]);
  }

  // Draw + store
  const geo = { type: 'LineString', coordinates: allCoords };
  routeLine = L.geoJSON(geo, { style: { color: 'blue' } }).addTo(map);
  map.fitBounds(routeLine.getBounds());
  currentRouteCoords = allCoords;
}

function openInGoogleMaps() {
  if (!currentRouteCoords || currentRouteCoords.length < 2) return;
  // Always end where we started for a loop
  const origin = currentRouteCoords[0];
  const destination = origin;

  // Downsample and de-dup points (Google Maps URL waypoint limits ~25, be conservative)
  const maxTotal = 12; // origin + 10 waypoints + destination
  // Filter points so consecutive ones are at least ~20m apart
  const filtered = [currentRouteCoords[0]];
  for (let i = 1; i < currentRouteCoords.length; i++) {
    const a = filtered[filtered.length - 1];
    const b = currentRouteCoords[i];
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const lat1 = a[1] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const hav = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    const dist = 2 * 6371000 * Math.asin(Math.sqrt(hav)); // meters
    if (dist > 20) filtered.push(b);
  }
  // Ensure last equals origin for loop
  if (filtered[filtered.length - 1][0] !== origin[0] || filtered[filtered.length - 1][1] !== origin[1]) {
    filtered.push(origin);
  }

  const step = Math.max(1, Math.floor(filtered.length / maxTotal));
  const sampled = filtered.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== origin) sampled.push(origin);

  const waypointPairs = sampled.slice(1, -1).map(c => `${c[1]},${c[0]}`);
  const waypoints = waypointPairs.join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin[1]},${origin[0]}&destination=${destination[1]},${destination[0]}&travelmode=walking`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  window.open(url, '_blank');
}

function stepsToMeters(steps, feet, inches) {
  let heightCm = 0;
  if (feet || inches) {
    let totalInches = (feet || 0) * 12 + (inches || 0);
    heightCm = totalInches * 2.54;
  }
  let stepLength = heightCm ? heightCm * 0.415 / 100 : 0.75;
  return steps * stepLength;
}

document.addEventListener('DOMContentLoaded', () => {
  // Use existing checkbox from HTML
  window.__avoidMainroads = document.getElementById('avoidMainroads');

  map = L.map('map').setView([0, 0], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  window.mapRef = map;

  navigator.geolocation.getCurrentPosition(pos => {
    let coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    lastCoords = coords;
    userMarker = L.marker([coords.lat, coords.lng]).addTo(map);
    map.setView([coords.lat, coords.lng], 16);
  });

  document.getElementById('generateBtn').addEventListener('click', () => {
    let steps = parseInt(document.getElementById('stepsInput').value);
    let feet = parseInt(document.getElementById('heightFeet').value);
    let inches = parseInt(document.getElementById('heightInches').value);
    if (steps && lastCoords) {
      let meters = stepsToMeters(steps, feet, inches);
      generatePath(meters, lastCoords);
    }
  });

  document.getElementById('redoBtn').addEventListener('click', () => {
    if (lastCoords) {
      let steps = parseInt(document.getElementById('stepsInput').value);
      let feet = parseInt(document.getElementById('heightFeet').value);
      let inches = parseInt(document.getElementById('heightInches').value);
      let meters = stepsToMeters(steps, feet, inches);
      generatePath(meters, lastCoords);
    }
  });

  document.getElementById('gmapsBtn').onclick = openInGoogleMaps;
});