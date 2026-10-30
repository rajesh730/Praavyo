"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight as FaExchangeAlt, School as FaSchool, LoaderCircle as FaSpinner } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

const STATUS_COPY = {
  PENDING_RELEASE: "Waiting for your current school to approve release.",
  RELEASED: "Release approved. Choose the school you are joining.",
  PENDING_ADMISSION: "Waiting for the selected school to approve admission.",
  COMPLETED: "Transfer completed.",
  REJECTED: "Transfer rejected.",
  CANCELLED: "Transfer cancelled.",
};

export default function StudentTransferRequestPanel() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [data, setData] = useState(null);
  const [reason, setReason] = useState("");
  const [submittingSchoolId, setSubmittingSchoolId] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/student/transfer", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load transfer status");
      setData(json.data);
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Transfer unavailable",
        message: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const transfer = data?.transfer;
  const schools = useMemo(() => data?.schools || [], [data?.schools]);
  const statusText = STATUS_COPY[transfer?.status] || "No active transfer request.";

  const canRequest = !transfer;
  const canSelectSchool = transfer?.status === "RELEASED";
  const canCancel = ["PENDING_RELEASE", "RELEASED", "PENDING_ADMISSION", "PENDING"].includes(
    transfer?.status
  );

  const provinces = useMemo(
    () => uniqueSorted(schools.map((school) => school.province)),
    [schools]
  );

  const districts = useMemo(
    () =>
      uniqueSorted(
        schools
          .filter((school) => !provinceFilter || school.province === provinceFilter)
          .map((school) => school.district)
      ),
    [schools, provinceFilter]
  );

  const filteredSchools = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    return schools.filter((school) => {
      if (provinceFilter && school.province !== provinceFilter) return false;
      if (districtFilter && school.district !== districtFilter) return false;
      if (query && !school.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [schools, provinceFilter, districtFilter, nameQuery]);

  const requestTransfer = async () => {
    try {
      setWorking(true);
      setFeedback(null);
      const res = await fetch("/api/student/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to request transfer");
      setData(json.data);
      setReason("");
      setFeedback({
        type: "success",
        title: "Transfer requested",
        message: json.message,
      });
    } catch (error) {
      setFeedback({ type: "error", title: "Request failed", message: error.message });
    } finally {
      setWorking(false);
    }
  };

  const selectDestination = async (schoolId) => {
    if (!schoolId) return;
    try {
      setWorking(true);
      setSubmittingSchoolId(schoolId);
      setFeedback(null);
      const res = await fetch("/api/student/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select_school", toSchool: schoolId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to select school");
      setData(json.data);
      setFeedback({
        type: "success",
        title: "Admission requested",
        message: json.message,
      });
    } catch (error) {
      setFeedback({ type: "error", title: "Selection failed", message: error.message });
    } finally {
      setWorking(false);
      setSubmittingSchoolId("");
    }
  };

  const cancelTransfer = async () => {
    if (!window.confirm("Cancel your transfer request?\n\nYou would need to request the transfer again.")) return;
    try {
      setWorking(true);
      setFeedback(null);
      const res = await fetch("/api/student/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to cancel transfer");
      setData(json.data);
      setFeedback({ type: "success", title: "Transfer cancelled", message: json.message });
    } catch (error) {
      setFeedback({ type: "error", title: "Cancel failed", message: error.message });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
            <FaExchangeAlt />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Take Transfer</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Request release from your current school, then choose your next
              registered school after the transfer code is issued.
            </p>
          </div>
        </div>
        {loading && <FaSpinner className="animate-spin text-muted" />}
      </div>

      {feedback && (
        <div className="mt-4">
          <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />
        </div>
      )}

      {!loading && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase text-muted">
                Current Status
              </p>
              <p className="mt-2 text-base font-semibold text-ink">
                {transfer ? transfer.status.replaceAll("_", " ") : "No request"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">{statusText}</p>

              {transfer?.transferCode && (
                <div className="mt-4 rounded-card border border-success-line bg-success-soft p-3">
                  <p className="text-xs font-semibold uppercase text-success">
                    Transfer Code
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-success">
                    {transfer.transferCode}
                  </p>
                </div>
              )}

              {transfer?.toSchool && (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <FaSchool className="text-muted" />
                  Selected school: {transfer.toSchool.name}
                </p>
              )}
            </div>

            {canRequest && (
              <div className="card p-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink">
                    Reason
                  </span>
                  <textarea
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    className="input w-full"
                    placeholder="Optional reason for transfer"
                  />
                </label>
                <button
                  type="button"
                  disabled={working}
                  onClick={requestTransfer}
                  className="btn btn-primary inline-flex w-full items-center justify-center"
                >
                  Request Transfer
                </button>
              </div>
            )}

            {canSelectSchool && (
              <div className="card p-4 space-y-3">
                <p className="text-xs font-semibold uppercase text-muted">
                  Choose the school you are joining
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink">
                      Province
                    </span>
                    <select
                      value={provinceFilter}
                      onChange={(e) => {
                        setProvinceFilter(e.target.value);
                        setDistrictFilter("");
                      }}
                      className="input w-full"
                    >
                      <option value="">All provinces</option>
                      {provinces.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink">
                      District
                    </span>
                    <select
                      value={districtFilter}
                      onChange={(e) => setDistrictFilter(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">All districts</option>
                      {districts.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink">
                    Search by school name
                  </span>
                  <input
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder="Type a school name"
                    className="input w-full"
                  />
                </label>

                <div>
                  <span className="mb-2 block text-xs font-semibold text-ink">
                    School you are joining
                  </span>
                  {filteredSchools.length === 0 ? (
                    <p className="rounded-card border border-dashed border-line bg-surface px-3 py-6 text-center text-sm font-semibold text-muted">
                      No schools match your filters.
                    </p>
                  ) : (
                    <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {filteredSchools.map((school) => {
                        const location = [school.district, school.province]
                          .filter(Boolean)
                          .join(", ") || school.location;
                        const isSubmitting = submittingSchoolId === school.id;
                        return (
                          <li
                            key={school.id}
                            className="card flex items-center gap-3 p-3"
                          >
                            <SchoolLogoMark
                              imageUrl={school.logoUrl}
                              name={school.name}
                              className="h-11 w-11"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink">
                                {school.name}
                              </p>
                              {location && (
                                <p className="truncate text-xs font-semibold text-muted">
                                  {location}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => selectDestination(school.id)}
                              className="btn btn-primary btn-sm inline-flex shrink-0 items-center justify-center gap-1"
                            >
                              {isSubmitting && (
                                <FaSpinner className="animate-spin" />
                              )}
                              Request Admission
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {!canRequest && !canSelectSchool && (
              <div className="card p-4">
                <p className="text-sm leading-6 text-muted">
                  Your transfer request is being processed. Check this section for
                  updates.
                </p>
              </div>
            )}
          </div>

          <div className="card p-4">
            {canCancel ? (
              <button
                type="button"
                disabled={working}
                onClick={cancelTransfer}
                className="btn btn-secondary inline-flex w-full items-center justify-center"
              >
                Cancel Request
              </button>
            ) : (
              <p className="text-sm leading-6 text-muted">
                No active request to cancel.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
