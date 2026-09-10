'use client';

import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { poserPin } from '@/lib/projets';
import type { ProjetExecution } from '@/lib/types';

const pin = L.divIcon({
  className: 'carte-pin',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Centre Dakar par défaut tant qu'il n'y a pas de pin (on ne géocode pas
// `localisation` — l'admin place le point à la main).
const DAKAR: [number, number] = [14.7167, -17.4677];

function ClicPourPoser({ onPoser }: { onPoser: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPoser(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

type Props = {
  slug: string;
  projet: ProjetExecution;
  onChange: (projet: ProjetExecution) => void;
  grand?: boolean;
};

export function PinEditor({ slug, projet, onChange, grand = false }: Props) {
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);
  const pose = projet.latitude != null && projet.longitude != null;

  async function poser(lat: number | null, lng: number | null) {
    setEnvoi(true);
    try {
      onChange(await poserPin(slug, projet.id, { latitude: lat, longitude: lng }));
    } finally {
      setEnvoi(false);
    }
  }

  async function copierCoords() {
    if (!pose) return;
    try {
      await navigator.clipboard.writeText(`${projet.latitude}, ${projet.longitude}`);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      /* clipboard indisponible — silencieux */
    }
  }

  return (
    <div>
      <div className={`fiche-carte${grand ? ' fiche-carte--grand' : ''}`}>
        <MapContainer
          center={pose ? [projet.latitude!, projet.longitude!] : DAKAR}
          zoom={pose ? 15 : 12}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {!pose && <ClicPourPoser onPoser={(lat, lng) => poser(lat, lng)} />}
          {pose && (
            <Marker
              position={[projet.latitude!, projet.longitude!]}
              icon={pin}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  poser(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="fiche-carte-actions">
        <span className="cell-sub">
          {pose
            ? 'Glisse le pin pour ajuster.'
            : 'Clique sur la carte pour poser le pin du projet.'}
        </span>
        {pose && (
          <>
            <button type="button" className="lien-inline" onClick={copierCoords}>
              <Copy size={13} strokeWidth={2} aria-hidden />
              {copie ? 'Copié' : 'Copier les coordonnées'}
            </button>
            <a
              className="lien-inline"
              href={`https://www.google.com/maps?q=${projet.latitude},${projet.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} strokeWidth={2} aria-hidden />
              Ouvrir dans Google Maps
            </a>
            <button
              type="button"
              className="lien-inline"
              disabled={envoi}
              onClick={() => poser(null, null)}
            >
              Retirer le pin
            </button>
          </>
        )}
      </div>
    </div>
  );
}
