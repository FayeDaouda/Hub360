'use client';

import { useCallback, useEffect, useState } from 'react';
import { toIsoDay } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { getMesDemandes } from '@/lib/demandes';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import type { DemandeAbsence, DemandeRemboursement, SoldeConges } from '@/lib/types';
import { Skeleton } from '@/components/ui/feedback';

// Éléments communs aux demandes de Mon espace (congés et absences,
// remboursements santé).

export type Attachment = { nom: string; url: string };
type MyRequests = { solde: SoldeConges; absences: DemandeAbsence[]; remboursements: DemandeRemboursement[] };

export const errorMessage = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

// Dates saisies au format de la maquette (JJ/MM/AAAA) ; null si invalide.
export function parseDayInput(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && toIsoDay(d) === iso ? iso : null;
}

// Saisie JJ/MM/AAAA au clavier numérique : les « / » sont posés pendant la
// frappe — le pavé numérique d'un iPhone n'en a pas (revue mobile 20/10/2026).
export function maskDayInput(entry: string): string {
  const c = entry.replace(/\D/g, '').slice(0, 8);
  return c.length > 4
    ? `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`
    : c.length > 2
      ? `${c.slice(0, 2)}/${c.slice(2)}`
      : c;
}

// Pièce jointe présentée comme la case de la maquette (« Justificatif joint ») :
// cocher ouvre le sélecteur de fichiers ; la case est cochée dès qu'un fichier
// est joint (décocher le retire).
export function AttachmentBox({
  label,
  files,
  multiple,
  onChange,
  onError,
}: {
  label: string;
  files: Attachment[];
  multiple?: boolean;
  onChange: (f: Attachment[]) => void;
  onError: (m: string) => void;
}) {
  return (
    <label className="me-case-jointe">
      <input
        type="checkbox"
        checked={files.length > 0}
        onChange={(e) => {
          if (!e.target.checked) onChange([]);
        }}
        onClick={(e) => {
          if (files.length === 0) {
            e.preventDefault();
            (e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null)?.click();
          }
        }}
      />
      <span>
        {label}
        {files.length > 0 && <span className="cell-sub"> · {files.map((f) => f.nom).join(', ')}</span>}
      </span>
      <input
        type="file"
        accept={FICHIERS_ACCEPTES.rh}
        hidden
        multiple={multiple}
        onChange={(e) =>
          Promise.all(Array.from(e.target.files ?? []).map(lireFichier))
            .then((l) => onChange(l.map(({ nom, url }) => ({ nom, url }))))
            .catch((err) => onError(errorMessage(err, 'Fichier illisible.')))
        }
      />
    </label>
  );
}

// Demandes du compte connecté (solde de congés, absences, remboursements).
export function useMyRequests(slug: string) {
  const [data, setData] = useState<MyRequests | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getMesDemandes(slug)
      .then(setData)
      .catch((e) => setError(errorMessage(e, 'Impossible de charger vos demandes.')));
  }, [slug]);
  useEffect(load, [load]);
  return { data, error, load };
}

export function Loading() {
  return (
    <div className="admin-skeleton" aria-hidden>
      <Skeleton />
    </div>
  );
}
