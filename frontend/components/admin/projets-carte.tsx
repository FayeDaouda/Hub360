'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { PHASES, type ProjetExecution } from '@/lib/types';

// Pin sans asset image (les icônes Leaflet par défaut cassent avec le bundler
// et la CSP) : un divIcon HTML.
const pin = L.divIcon({
  className: 'carte-pin',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type Props = {
  slug: string;
  projets: ProjetExecution[];
};

// Centre Dakar par défaut, sinon on cadre sur les projets géolocalisés.
const DAKAR: [number, number] = [14.7167, -17.4677];

export function ProjetsCarte({ slug, projets }: Props) {
  const points = useMemo(
    () =>
      projets.filter(
        (p): p is ProjetExecution & { latitude: number; longitude: number } =>
          p.latitude != null && p.longitude != null,
      ),
    [projets],
  );

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    return L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])).pad(
      0.2,
    );
  }, [points]);

  return (
    <div className="projets-carte">
      <MapContainer
        {...(bounds ? { bounds } : { center: DAKAR, zoom: 12 })}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pin}>
            <Popup>
              <strong>{p.programme}</strong>
              <br />
              {p.code} · {PHASES[p.phase]}
              <br />
              <Link href={`/admin/${slug}/projets/${p.id}`}>Ouvrir la fiche</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {points.length < projets.length && (
        <p className="projets-carte-note">
          {projets.length - points.length} projet
          {projets.length - points.length > 1 ? 's' : ''} sans coordonnées — pose le pin depuis
          la fiche.
        </p>
      )}
    </div>
  );
}
