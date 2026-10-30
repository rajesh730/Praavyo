import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CredentialsCard } from "@/components/dashboard/TeacherDetailPanel";
import { Download } from "lucide-react";
import CSVUploader from "./CSVUploader";
import {
  buildNormalizedRow,
  getRowValue,
  friendlyUploadError,
  buildFailedRowsCsv,
  downloadTextFile,
} from "@/lib/bulkUpload";

const EMPTY_FORM = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  phone: "",
  focusArea: "",
  qualification: "",
  gender: "",
  address: "",
  dateOfJoining: "",
  designation: "",
  employmentType: "FULL_TIME",
  experience: "",
  bloodGroup: "",
};

const EnhancedTeacherRegistration = ({ schoolId, onSuccess }) => {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams?.get("mode") === "bulk" ? "bulk" : "single");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // Set when the email/username typed already belongs to a Pravyo teacher.
  const [existing, setExisting] = useState(null);
  // Shown once after registration: login details + a link to assign classes.
  const [created, setCreated] = useState(null);

  const set = (key) => (event) => setFormData((current) => ({ ...current, [key]: event.target.value }));

  const lookupEmail = async () => {
    const identifier = formData.email.trim();
    if (identifier.length < 3) { setExisting(null); return; }
    try {
      const response = await fetch(`/api/teachers/lookup?identifier=${encodeURIComponent(identifier)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      setExisting(response.ok && payload.data?.exists ? payload.data : null);
    } catch {
      setExisting(null);
    }
  };

  const suggestUsername = async () => {
    if (formData.username.trim() || !formData.fullName.trim()) return;
    try {
      const response = await fetch(`/api/teachers/lookup?suggestFor=${encodeURIComponent(formData.fullName.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.data?.username) {
        setFormData((current) => (current.username.trim() ? current : { ...current, username: payload.data.username }));
      }
    } catch {
      /* a suggestion is optional */
    }
  };

  const submit = async (body) => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await fetch("/api/teachers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Registration failed");
      setCreated({
        teacherId: data.data?.teacherId,
        name: body.name || existing?.name,
        credentials: data.data?.credentials || null,
        message: data.message,
      });
      setFormData(EMPTY_FORM);
      setExisting(null);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const schoolFields = {
    designation: formData.designation,
    employmentType: formData.employmentType,
    dateOfJoining: formData.dateOfJoining,
  };

  const handleSubmit = () => {
    if (existing && !existing.statusHere) {
      submit({ mode: "existing", identifier: formData.email.trim(), ...schoolFields });
      return;
    }
    if (!formData.fullName.trim() || !formData.email.trim()) {
      setError("Enter the teacher's full name and email.");
      return;
    }
    if (formData.password && formData.password.length < 10) {
      setError("Password must contain at least 10 characters, or leave it blank to generate one.");
      return;
    }
    submit({
      mode: "new",
      name: formData.fullName,
      username: formData.username,
      email: formData.email,
      password: formData.password,
      phone: formData.phone,
      subject: formData.focusArea,
      qualification: formData.qualification,
      gender: formData.gender,
      address: formData.address,
      experience: formData.experience,
      bloodGroup: formData.bloodGroup,
      ...schoolFields,
    });
  };

  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBulkUpload = async (parsedData) => {
    setLoading(true);
    setBulkResult(null);
    setError("");
    setSuccess("");

    try {
        // 1. Map + validate every row in the browser first, tolerating header
        //    differences and keeping the original CSV row for re-export.
        const valid = [];
        const invalid = [];

        parsedData.forEach((row, index) => {
            const rowNumber = index + 2; // +1 header line, +1 for 1-based
            const normalizedRow = buildNormalizedRow(row);
            const fullName = String(getRowValue(normalizedRow, ["fullname", "name"])).trim();
            const email = String(getRowValue(normalizedRow, ["email", "emailaddress"])).trim();
            const subject = String(getRowValue(normalizedRow, ["focusarea", "subject", "subjects", "area"])).trim();

            const missing = [];
            if (!fullName) missing.push("FullName");
            if (!email) missing.push("Email");

            if (missing.length > 0) {
                invalid.push({
                    name: fullName || "(no name)",
                    rowNumber,
                    reason: `Missing required value(s): ${missing.join(", ")}`,
                    row,
                });
                return;
            }

            valid.push({
                _row: row,
                _rowNumber: rowNumber,
                name: fullName,
                email,
                subject,
                phone: getRowValue(normalizedRow, ["phone", "phonenumber", "contact"]),
                qualification: getRowValue(normalizedRow, ["qualification", "qualifications"]),
                gender: getRowValue(normalizedRow, ["gender"]),
                address: getRowValue(normalizedRow, ["address"]),
                dateOfJoining: getRowValue(normalizedRow, ["dateofjoining", "joiningdate", "doj"]),
                designation: getRowValue(normalizedRow, ["designation", "role"]),
                experience: getRowValue(normalizedRow, ["experience", "yearsofexperience"]),
                bloodGroup: getRowValue(normalizedRow, ["bloodgroup", "blood"]),
                username: getRowValue(normalizedRow, ["username", "loginname"]),
            });
        });

        // 2. Nothing usable: explain why (empty file vs. header/cell problems).
        if (valid.length === 0) {
            if (invalid.length === 0) {
                throw new Error("Your file has no data rows. Add teachers below the header row and try again.");
            }
            setBulkResult({ success: [], failed: invalid });
            setError("No teachers could be uploaded. Your column headers may not match the template, or required cells (FullName, Email) are empty. Use \"Download Template\" and compare your headings.");
            scrollToTop();
            return;
        }

        // 3. Send only the valid rows.
        const teachers = valid.map(({ _row, _rowNumber, ...clean }) => clean);
        const response = await fetch("/api/teachers/bulk-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teachers, schoolId }),
        });

        let data = {};
        try { data = await response.json(); } catch { /* non-JSON error page */ }

        if (!response.ok) {
            throw new Error(friendlyUploadError(response.status, data.message, "teachers"));
        }

        const resultData = data.data || { success: [], failed: [] };

        // 4. Combine browser-side invalid rows with server-side failures.
        const serverFailed = (resultData.failed || []).map((f) => {
            const match = valid.find((v) => v.email === f.teacher?.email);
            return {
                name: f.teacher?.name || "Unknown",
                rowNumber: match?._rowNumber,
                reason: f.reason,
                row: match?._row,
            };
        });
        const failed = [...invalid, ...serverFailed];

        setBulkResult({ success: resultData.success || [], failed });
        const total = valid.length + invalid.length;
        setSuccess(`Processed ${total} row(s) — ${(resultData.success || []).length} added, ${failed.length} need attention.`);
        scrollToTop();
        if ((resultData.success || []).length > 0 && onSuccess) onSuccess();
    } catch (err) {
        setError(err.message || "Something went wrong during the upload. Please try again.");
        scrollToTop();
    } finally {
        setLoading(false);
    }
  };

  const downloadCredentials = () => {
    if (!bulkResult?.success?.length) return;
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [["Name", "Username", "Email", "Password"], ...bulkResult.success.map((t) => [t.name, t.username, t.email, t.password])];
    downloadTextFile("teacher_logins.csv", rows.map((row) => row.map(escapeCsv).join(",")).join("\n"));
  };

  const downloadFailedRows = () => {
    if (!bulkResult?.failed?.length) return;
    downloadTextFile("teachers_failed_rows.csv", buildFailedRowsCsv(bulkResult.failed));
  };

  const downloadCsvTemplate = () => {
    const headers = [
        "FullName*",
        "Email*",
        "Username",
        "FocusArea",
        "Phone", 
        "Qualification", 
        "Gender", 
        "Address",
        "DateOfJoining",
        "Designation",
        "Experience",
        "BloodGroup"
    ];
    
    const csvContent = `${headers.join(",")}\n`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teacher_registration_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface text-ink rounded-control shadow-pop p-4 sm:p-5 max-w-4xl mx-auto border border-line-strong">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-ink">Add teacher</h2>
        <div className="flex gap-2 bg-surface p-1 rounded-control">
            <button 
                onClick={() => setActiveTab("single")}
                className={`btn btn-ghost font-medium transition-colors ${activeTab === 'single' ? 'bg-brand text-white hover:bg-brand-strong hover:text-white' : 'text-subtle hover:text-ink'}`}
            >
                Single Entry
            </button>
            <button 
                onClick={() => setActiveTab("bulk")}
                className={`btn btn-ghost font-medium transition-colors ${activeTab === 'bulk' ? 'bg-brand text-white hover:bg-brand-strong hover:text-white' : 'text-subtle hover:text-ink'}`}
            >
                Bulk Upload
            </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger-line text-danger px-4 py-3 rounded-control mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success-soft border border-success-line text-success px-4 py-3 rounded-control mb-4 break-all">
          {success}
        </div>
      )}

      {bulkResult && activeTab === 'bulk' && (
        <div className="mb-4 space-y-4">
            {/* Success List */}
            {bulkResult.success.length > 0 && (
                <div className="bg-success border border-success rounded-control p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-success font-medium">Successfully registered ({bulkResult.success.length})</h4>
                        <button onClick={downloadCredentials} className="btn btn-secondary btn-sm flex items-center gap-1.5 shrink-0">
                            <Download size={14} /> Download logins
                        </button>
                    </div>
                    <p className="text-xs text-success mb-2">Passwords are shown only now. Download the logins and share them with each teacher.</p>
                    <div className="max-h-40 overflow-y-auto pr-2">
                        <ul className="list-disc list-inside text-sm text-success space-y-1">
                            {bulkResult.success.map((t, i) => (
                                <li key={i}>
                                    <span className="font-medium">{t.name}</span> 
                                    <span className="text-success ml-2 text-xs">({t.username || t.email})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Failed List */}
            {bulkResult.failed.length > 0 && (
                <div className="bg-danger border border-danger rounded-control p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-danger font-medium">Need attention ({bulkResult.failed.length})</h4>
                        <button
                            onClick={downloadFailedRows}
                            className="btn btn-primary btn-sm flex items-center gap-1.5 font-medium transition-colors shrink-0"
                        >
                            <Download size={14} /> Download failed rows
                        </button>
                    </div>
                    <p className="text-xs text-danger mb-3">
                        Fix these rows in the downloaded file, then upload it again. Already-added teachers are skipped automatically.
                    </p>
                    <div className="max-h-48 overflow-y-auto pr-2">
                        <ul className="space-y-2 text-sm text-danger">
                            {bulkResult.failed.map((f, i) => (
                                <li key={i} className="border-b border-danger pb-2 last:border-0 last:pb-0">
                                    <div className="font-medium text-danger">
                                        {f.rowNumber ? `Row ${f.rowNumber}: ` : ""}{f.name || 'Unknown'}
                                    </div>
                                    <div className="text-xs opacity-80 mt-0.5">Reason: {f.reason}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
      )}

      {activeTab === "single" ? (
        created ? (
          <div className="space-y-4">
            <div className="bg-success-soft border border-success-line text-ink px-4 py-3 rounded-control">
              <p className="font-semibold">{created.message}</p>
              <p className="mt-1 text-sm text-muted">Next, assign {created.name || "the teacher"}’s grades, subjects and class-teacher role.</p>
            </div>
            {created.credentials && <CredentialsCard credentials={created.credentials} />}
            <div className="flex flex-wrap gap-2">
              {created.teacherId && (
                <Link href={`/school/dashboard?tab=teachers&teacher=${created.teacherId}`} className="btn btn-primary">Assign classes &amp; subjects</Link>
              )}
              <button type="button" onClick={() => setCreated(null)} className="btn btn-secondary">Add another teacher</button>
            </div>
          </div>
        ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-ink mb-1">Email *</label>
              <input
                type="email"
                placeholder="teacher@example.com"
                value={formData.email}
                onChange={(e) => { setExisting(null); set("email")(e); }}
                onBlur={lookupEmail}
                className="input w-full"
              />
              <p className="mt-1 text-xs text-muted">If this teacher already uses Pravyo at another school, we find their account so you can add them without a new login.</p>
            </div>

            {existing && (
              <div className="md:col-span-2 rounded-control border border-brand-line bg-brand-soft p-3 text-sm text-ink">
                {existing.statusHere === "LEFT" ? (
                  <p><strong>{existing.name}</strong> worked at your school before. Open them under Teachers → Left and choose <strong>Rejoin</strong>.</p>
                ) : existing.statusHere ? (
                  <p><strong>{existing.name}</strong> is already a teacher at your school.</p>
                ) : (
                  <p><strong>{existing.name}</strong>{existing.username ? ` (@${existing.username})` : ""} already has a Pravyo teacher account. Add them to your school: they keep their own username and password.</p>
                )}
              </div>
            )}

            {!existing && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1">Full Name *</label>
                  <input type="text" placeholder="Enter full name" value={formData.fullName} onChange={set("fullName")} onBlur={suggestUsername} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Username</label>
                  <input type="text" placeholder="e.g. sita.shrestha" value={formData.username} onChange={set("username")} className="input w-full" autoComplete="off" />
                  <p className="mt-1 text-xs text-muted">The teacher signs in with this username or their email.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Password</label>
                  <input type="text" placeholder="Leave blank to generate one" value={formData.password} onChange={set("password")} className="input w-full" autoComplete="new-password" />
                  <p className="mt-1 text-xs text-muted">At least 10 characters. Shown once after saving.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={set("phone")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Main subject / focus area</label>
                  <input type="text" placeholder="e.g. Science" value={formData.focusArea} onChange={set("focusArea")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Qualification</label>
                  <input type="text" value={formData.qualification} onChange={set("qualification")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Experience (years)</label>
                  <input type="number" min="0" value={formData.experience} onChange={set("experience")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Gender</label>
                  <select value={formData.gender} onChange={set("gender")} className="input w-full">
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Blood group</label>
                  <select value={formData.bloodGroup} onChange={set("bloodGroup")} className="input w-full">
                    <option value="">Select blood group</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1">Address</label>
                  <textarea value={formData.address} onChange={set("address")} className="input w-full" rows="2" />
                </div>
              </>
            )}

            {(!existing || !existing.statusHere) && (
              <div className="md:col-span-2 grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-3">
                <p className="md:col-span-3 text-xs font-semibold uppercase text-muted">At your school</p>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Designation</label>
                  <input type="text" placeholder="e.g. Senior Teacher" value={formData.designation} onChange={set("designation")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Employment</label>
                  <select value={formData.employmentType} onChange={set("employmentType")} className="input w-full">
                    <option value="FULL_TIME">Full time</option>
                    <option value="PART_TIME">Part time</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Date of joining</label>
                  <input type="date" value={formData.dateOfJoining} onChange={set("dateOfJoining")} className="input w-full" />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-line-strong flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={loading || Boolean(existing?.statusHere)}
              className="btn btn-primary flex items-center gap-2 font-medium transition-colors"
            >
              {loading ? "Saving..." : existing ? "Add to my school" : "Register teacher"}
            </button>
          </div>
        </div>
        )
      ) : (
        <div className="space-y-4">
            <div className="bg-surface p-4 sm:p-5 rounded-control border border-line-strong">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="font-medium text-ink mb-2">Upload teacher data</h3>
                        <div className="text-subtle text-sm space-y-2">
                            <p>Upload a CSV file with the following headers:</p>
                            <div className="bg-surface p-3 rounded-control border border-line-strong font-mono text-xs overflow-x-auto">
                                <span className="text-danger">FullName*</span>, 
                                <span className="text-danger"> Email*</span>, 
                                <span className="text-brand"> Username</span>,
                                <span className="text-brand"> FocusArea</span>, 
                                <span className="text-brand"> Phone</span>, 
                                <span className="text-brand"> Qualification</span>, 
                                <span className="text-brand"> Gender</span>, 
                                <span className="text-brand"> Address</span>,
                                <span className="text-brand"> DateOfJoining</span>,
                                <span className="text-brand"> Designation</span>,
                                <span className="text-brand"> Experience</span>,
                                <span className="text-brand"> BloodGroup</span>
                            </div>
                            <p className="text-xs text-muted mt-2">
                                <span className="text-danger">* Mandatory Fields</span> | 
                                <span className="text-brand"> Optional Fields</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={downloadCsvTemplate}
                        className="btn btn-primary flex items-center gap-2 transition-colors shrink-0 ml-4"
                    >
                        <Download size={16} /> Download Template
                    </button>
                </div>
                <CSVUploader onUpload={handleBulkUpload} />
            </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedTeacherRegistration;
