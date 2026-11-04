"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { useParentApp } from "@/components/parent/ParentAppContext";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import { formatParentDate } from "@/lib/parentFormat";

/**
 * Moving the selected child to another school, in three steps the parent can
 * follow on one screen:
 *
 *   1. Ask the current school to release the child
 *   2. Choose the new school (searchable table)
 *   3. The new school admits the child
 *
 * Each step shows what is happening and the one thing to do. Past transfers
 * are listed underneath.
 */

const STEP_OF = { PENDING_RELEASE: 1, RELEASED: 2, PENDING_ADMISSION: 3, PENDING: 1 };

async function call(method, body, studentId) {
  const url = method === "GET" ? `/api/parent/transfer?studentId=${encodeURIComponent(studentId)}` : "/api/parent/transfer";
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify({ studentId, ...body }) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Something went wrong");
  return json;
}

export default function ParentTransferPage() {
  const { t, selectedChildId, selectedChild } = useParentApp();
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!selectedChildId) return undefined;
    let live = true;
    call("GET", null, selectedChildId)
      .then((json) => live && setState({ key: selectedChildId, data: json.data, error: "" }))
      .catch((error) => live && setState({ key: selectedChildId, data: null, error: error.message }));
    return () => {
      live = false;
    };
  }, [selectedChildId]);

  if (!selectedChildId) return null;
  const loaded = state.key === selectedChildId;
  const data = loaded ? state.data : null;
  const transfer = data?.transfer || null;
  const step = transfer ? STEP_OF[transfer.status] || 1 : 0;

  const run = async (method, body, successText) => {
    setBusy(true);
    setNotice(null);
    try {
      const json = await call(method, body, selectedChildId);
      setState({ key: selectedChildId, data: json.data, error: "" });
      setNotice({ type: "success", text: successText || json.message });
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-ink">{t("transfer.title")}</h1>
        <p className="text-sm text-muted">
          {t("transfer.intro", { name: selectedChild?.name || "", school: selectedChild?.school?.name || "" })}
        </p>
      </div>

      {notice && (
        <p role="status" className={`rounded-card px-4 py-3 text-sm ${notice.type === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
          {notice.text}
        </p>
      )}

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      ) : state.error ? (
        <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p>
      ) : (
        <>
          <Steps step={step} t={t} />

          {/* ---- what to do now ---- */}
          {!transfer && (
            <section className="card space-y-3 p-4">
              <h2 className="font-semibold text-ink">{t("transfer.startTitle")}</h2>
              <p className="text-sm text-muted">{t("transfer.startText", { school: data?.student?.currentSchool?.name || "" })}</p>
              <label className="block">
                <span className="text-sm font-semibold text-ink">{t("transfer.reason")}</span>
                <textarea className="input mt-1 min-h-20 w-full" value={reason} maxLength={500}
                  onChange={(e) => setReason(e.target.value)} placeholder={t("transfer.reasonPlaceholder")} />
              </label>
              <button type="button" disabled={busy} className="btn btn-primary w-full sm:w-auto"
                onClick={async () => {
                  if (await run("POST", { reason }, t("transfer.requested"))) setReason("");
                }}>
                {busy ? t("transfer.sending") : t("transfer.request")}
              </button>
            </section>
          )}

          {transfer && step === 1 && (
            <StatusCard
              title={t("transfer.waitingRelease")}
              text={t("transfer.waitingReleaseText", { school: transfer.fromSchool?.name || "" })}
              onCancel={() => window.confirm(t("transfer.cancelConfirm")) && run("PATCH", { action: "cancel" }, t("transfer.cancelled"))}
              busy={busy}
              t={t}
            />
          )}

          {transfer && step === 2 && (
            <section className="card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink">{t("transfer.chooseTitle")}</h2>
                  <p className="text-sm text-muted">{t("transfer.chooseText")}</p>
                </div>
                {transfer.transferCode && (
                  <span className="rounded-control border border-success-line bg-success-soft px-3 py-1.5 text-sm">
                    <span className="text-muted">{t("transfer.code")}:</span>{" "}
                    <span className="font-mono font-bold text-success">{transfer.transferCode}</span>
                  </span>
                )}
              </div>
              <SchoolPicker
                schools={data?.schools || []}
                busy={busy}
                t={t}
                onChoose={(school) =>
                  window.confirm(t("transfer.chooseConfirm", { school: school.name })) &&
                  run("PATCH", { action: "choose_school", toSchool: school.id }, t("transfer.chosen", { school: school.name }))
                }
              />
              <div className="border-t border-line pt-3">
                <button type="button" disabled={busy} className="btn btn-ghost btn-sm text-danger"
                  onClick={() => window.confirm(t("transfer.cancelConfirm")) && run("PATCH", { action: "cancel" }, t("transfer.cancelled"))}>
                  {t("transfer.cancel")}
                </button>
              </div>
            </section>
          )}

          {transfer && step === 3 && (
            <StatusCard
              title={t("transfer.waitingAdmission", { school: transfer.toSchool?.name || "" })}
              text={t("transfer.waitingAdmissionText")}
              code={transfer.transferCode}
              onCancel={() => window.confirm(t("transfer.cancelConfirm")) && run("PATCH", { action: "cancel" }, t("transfer.cancelled"))}
              busy={busy}
              t={t}
            />
          )}

          {(data?.history || []).length > 0 && <History rows={data.history} t={t} />}
        </>
      )}
    </div>
  );
}

function Steps({ step, t }) {
  const items = [t("transfer.step1"), t("transfer.step2"), t("transfer.step3")];
  return (
    <ol className="grid grid-cols-3 gap-2">
      {items.map((label, index) => {
        const n = index + 1;
        const done = step > n;
        const active = step === n;
        return (
          <li key={label} className={`rounded-card border p-2.5 text-center text-xs font-semibold sm:text-sm ${active ? "border-brand bg-brand-soft text-brand-strong" : done ? "border-success-line bg-success-soft text-success" : "border-line bg-surface text-muted"}`}>
            <span className={`mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full text-xs ${active ? "bg-brand text-white" : done ? "bg-success text-white" : "bg-surface-2 text-muted"}`}>
              {done ? <Check aria-hidden size={13} /> : n}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function StatusCard({ title, text, code = "", onCancel, busy, t }) {
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="text-sm text-muted">{text}</p>
      {code && (
        <p className="text-sm"><span className="text-muted">{t("transfer.code")}:</span> <span className="font-mono font-bold text-success">{code}</span></p>
      )}
      <button type="button" disabled={busy} onClick={onCancel} className="btn btn-ghost btn-sm text-danger">
        {t("transfer.cancel")}
      </button>
    </section>
  );
}

/** Every registered school, as a searchable table: name, place, Choose. */
function SchoolPicker({ schools, busy, onChoose, t }) {
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");

  const provinces = useMemo(() => [...new Set(schools.map((s) => s.province).filter(Boolean))].sort(), [schools]);
  const districts = useMemo(
    () => [...new Set(schools.filter((s) => !province || s.province === province).map((s) => s.district).filter(Boolean))].sort(),
    [schools, province]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools.filter(
      (s) =>
        (!province || s.province === province) &&
        (!district || s.district === district) &&
        (!q || s.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)))
    );
  }, [schools, query, province, district]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr]">
        <select className="input" value={province} onChange={(e) => { setProvince(e.target.value); setDistrict(""); }} aria-label={t("transfer.province")}>
          <option value="">{t("transfer.allProvinces")}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label={t("transfer.district")}>
          <option value="">{t("transfer.allDistricts")}</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="relative col-span-2 block sm:col-span-1">
          <span className="sr-only">{t("transfer.searchSchool")}</span>
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input w-full pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("transfer.searchSchool")} />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{t("transfer.noSchools")}</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
          {shown.slice(0, 200).map((school) => (
            <li key={school.id} className="flex items-center gap-3 px-3 py-2.5">
              <SchoolLogoMark imageUrl={school.logoUrl} name={school.name} className="h-10 w-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{school.name}</span>
                <span className="block truncate text-xs text-muted">{[school.district, school.province].filter(Boolean).join(", ") || school.location}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => onChoose(school)} className="btn btn-primary btn-sm shrink-0">
                {t("transfer.choose")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 200 && <p className="text-xs text-muted">{t("transfer.narrow")}</p>}
    </div>
  );
}

const RESULT_TONE = { COMPLETED: "text-success", APPROVED: "text-success", REJECTED: "text-danger", CANCELLED: "text-muted" };

function History({ rows, t }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold text-ink">{t("transfer.history")}</h2>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 text-ink">
              {row.fromSchool?.name || "—"} → {row.toSchool?.name || "—"}
              {row.decisionReason ? <span className="block text-xs text-muted">{row.decisionReason}</span> : null}
            </span>
            <span className="text-right text-xs">
              <span className={`block font-semibold ${RESULT_TONE[row.status] || "text-muted"}`}>{t(`transfer.status.${row.status}`)}</span>
              <span className="text-muted">{formatParentDate(row.decidedAt || row.requestedAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
