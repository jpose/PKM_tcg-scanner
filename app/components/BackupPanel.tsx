'use client';

import { useEffect, useState } from 'react';
import { CollectionItem } from '../types';
import { buildCsv, buildJson, downloadFile, parseBackup } from '../lib/backup';
import { mergeIntoCollection } from '../lib/collection';

const LAST_EXPORT_KEY = 'pokescan_last_export';
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export default function BackupPanel({
  items,
  onChange,
}: {
  items: CollectionItem[];
  onChange: (items: CollectionItem[]) => void;
}) {
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      setLastExport(Number(localStorage.getItem(LAST_EXPORT_KEY)) || null);
    } catch {}
  }, []);

  const day = () => new Date().toISOString().slice(0, 10);
  const stale = items.length > 0 && (!lastExport || Date.now() - lastExport > THIRTY_DAYS);

  function exportJson() {
    downloadFile(`pokescan-classeur-${day()}.json`, buildJson(items), 'application/json');
    const now = Date.now();
    try {
      localStorage.setItem(LAST_EXPORT_KEY, String(now));
    } catch {}
    setLastExport(now);
    setStatus({ ok: true, text: 'Sauvegarde téléchargée. Gardez-la en lieu sûr (Drive, e-mail…).' });
  }

  function exportCsv() {
    downloadFile(`pokescan-classeur-${day()}.csv`, buildCsv(items), 'text/csv;charset=utf-8');
    setStatus({ ok: true, text: 'Fichier Excel téléchargé (il ne peut pas servir à restaurer le classeur).' });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error('Fichier trop volumineux.');
      const { items: next, added, updated } = mergeIntoCollection(parseBackup(await file.text()));
      onChange(next);
      setStatus({
        ok: true,
        text:
          added + updated === 0
            ? 'Rien de nouveau : votre classeur contenait déjà tout.'
            : `${added} carte(s) ajoutée(s), ${updated} quantité(s) mise(s) à jour.`,
      });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Import impossible.' });
    }
  }

  return (
    <section className="panel mx-auto mt-10 max-w-3xl p-4" aria-labelledby="backup-title">
      <h2 id="backup-title" className="font-display text-base">
        Sauvegarde du classeur
      </h2>
      <p className={`mt-1 text-sm font-semibold ${stale ? 'text-dex-deep' : 'text-ink/65'}`}>
        Votre classeur est enregistré dans ce navigateur seulement.{' '}
        {lastExport
          ? `Dernière sauvegarde : ${new Date(lastExport).toLocaleDateString('fr-FR')}.`
          : items.length > 0
            ? 'Vous n’avez pas encore fait de sauvegarde.'
            : 'Vous changez d’appareil ? Importez ici votre dernière sauvegarde.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 && (
          <>
            <button onClick={exportJson} className="btn-chunky bg-pika">
              Sauvegarder (JSON)
            </button>
            <button onClick={exportCsv} className="btn-chunky bg-white">
              Exporter pour Excel
            </button>
          </>
        )}
        <label className="btn-chunky cursor-pointer bg-white">
          Importer une sauvegarde
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        </label>
      </div>
      {status && (
        <p role="status" className={`mt-3 text-sm font-extrabold ${status.ok ? 'text-ink' : 'text-dex-deep'}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}
