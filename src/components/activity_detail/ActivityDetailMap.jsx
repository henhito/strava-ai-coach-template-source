import React from 'react';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import { Card, CardContent } from '@/components/ui/card';
import 'leaflet/dist/leaflet.css';

// Leaflet's default icon can have issues with bundlers, this is a common fix.
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function ActivityDetailMap({ activity, streams }) {
  const latlngStream = streams.find(s => s.type === 'latlng');

  if (!latlngStream || !latlngStream.data || latlngStream.data.length === 0) {
    return (
        <Card>
            <CardContent className="h-96 flex items-center justify-center text-gray-500">
                No map data available for this activity.
            </CardContent>
        </Card>
    );
  }

  const polyline = latlngStream.data;
  const bounds = L.latLngBounds(polyline);

  return (
    <Card>
      <CardContent className="p-0">
        <MapContainer
          bounds={bounds}
          style={{ height: '400px', width: '100%' }}
          scrollWheelZoom={false}
          className="rounded-lg"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline pathOptions={{ color: '#F97316', weight: 4 }} positions={polyline} />
        </MapContainer>
      </CardContent>
    </Card>
  );
}