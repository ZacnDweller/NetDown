function initMap() {
  if (map) return;
  map = L.map('map').setView([-2.5, 118.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function renderMapMarkers() {
  if (!map) return;
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  reports.forEach((report) => {
    const lat = typeof report.lat === 'number' ? report.lat : cityCoordinates[report.city]?.[0];
    const lng = typeof report.lng === 'number' ? report.lng : cityCoordinates[report.city]?.[1];
    if (lat && lng) {
      const marker = L.marker([lat, lng], { icon: redIcon() }).addTo(map);
      marker.bindPopup(`<b>${report.provider}</b><br>${report.city}<br>${report.type}`);
    }
  });
}

function redIcon() {
  return L.divIcon({
    html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:9999px;border:2px solid white"></div>',
    className: 'bg-transparent border-none',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}
