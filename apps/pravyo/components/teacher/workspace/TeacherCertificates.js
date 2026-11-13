'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Eye } from 'lucide-react';
import DateTile from '@/components/common/DateTile';

/**
 * The teacher's own certificates — Praavyo trainings their school registered
 * them for. Hidden until there is at least one, so it never shows an empty box.
 */
export default function TeacherCertificates() {
  const [certificates, setCertificates] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/teacher/certificates', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => active && setCertificates(json?.data?.certificates || []))
      .catch(() => active && setCertificates([]));
    return () => {
      active = false;
    };
  }, []);

  if (!certificates?.length) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            My certificates
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success-soft px-1.5 text-2xs font-semibold text-success">{certificates.length}</span>
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted">Praavyo trainings you completed.</p>
        </div>
        <BadgeCheck className="shrink-0 text-2xl text-success" aria-hidden />
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {certificates.map((certificate) => (
          <li key={certificate.id} className="flex items-center gap-3.5 px-4 py-3">
            <DateTile value={certificate.trainedOn} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{certificate.title}</p>
              <p className="truncate text-xs text-muted">
                Praavyo training{certificate.duration ? ` · ${certificate.duration}` : ''}{certificate.schoolName ? ` · ${certificate.schoolName}` : ''}
              </p>
            </div>
            {/* Opens in the dashboard's certificate viewer (DashboardLinkProvider). */}
            <a
              href={certificate.url}
              className="btn btn-soft btn-sm inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            >
              <Eye aria-hidden className="h-3.5 w-3.5" /> View
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
