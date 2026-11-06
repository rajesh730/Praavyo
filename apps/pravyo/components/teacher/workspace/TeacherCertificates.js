'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
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
      <div className="flex items-center gap-2 p-4">
        <BadgeCheck className="text-success" aria-hidden />
        <h2 className="font-semibold text-ink">My certificates</h2>
        <span className="text-sm text-muted tabular-nums">{certificates.length}</span>
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
            <a
              href={certificate.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand hover:text-brand-strong hover:underline"
            >
              View <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
