import React, { useState, useEffect } from "react";
import { Download } from "lucide-react";
import CSVUploader from "./CSVUploader";
import { DEFAULT_STUDENT_PASSWORD } from "@/lib/passwordGenerator";
import {
  buildNormalizedRow,
  getRowValue,
  friendlyUploadError,
  buildFailedRowsCsv,
  downloadTextFile,
} from "@/lib/bulkUpload";

const EnhancedStudentRegistration = ({ schoolId, onSuccess }) => {
  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const parseDateValue = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const [activeTab, setActiveTab] = useState("single"); // 'single' or 'bulk'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkUploadStatus, setBulkUploadStatus] = useState(null);
  const [grades, setGrades] = useState([]);
  const [sectionsByGrade, setSectionsByGrade] = useState({});
  
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    // Part 1: Student Details
    fullName: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    rollNumber: "",
    registrationNumber: "",
    iemisNumber: "",
    grade: "",
    section: "",
    address: "",
    bloodGroup: "",

    // Part 2: Parent Details
    guardianRelationship: "FATHER",
    parentName: "",
    parentContactNumber: "",
    parentEmail: "",
    parentAlternativeContact: "",
  });

  // Fetch grades
  useEffect(() => {
    const fetchGrades = async () => {
      if (!schoolId) {
        return;
      }
      try {
        const response = await fetch(`/api/schools/${schoolId}/config`);

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.data?.grades) {
          setGrades(data.data.grades);
        }
      } catch (err) {
        setGrades([]);
      }
    };
    fetchGrades();
    // Sections are configured per grade in the school dashboard.
    fetch("/api/school/sections", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => setSectionsByGrade(Object.fromEntries((data?.sections || []).map((row) => [row.grade, row.sections || []]))))
      .catch(() => setSectionsByGrade({}));
  }, [schoolId]);

  const gradeSectionOptions = sectionsByGrade[formData.grade] || [];

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    
    // Validation
    if (!formData.fullName || !formData.grade || !formData.rollNumber || !formData.registrationNumber.trim() || !formData.iemisNumber.trim()) {
      setError("Please fill in all required student details (Name, Grade, Roll Number, Registration Number, Student IEMIS Number)");
      return;
    }
    if (gradeSectionOptions.length && !formData.section) {
      setError(`Choose a section for ${formData.grade}.`);
      return;
    }

    setLoading(true);

    try {
      // Split Full Name
      const nameParts = formData.fullName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "."; // Default if no last name

      // The server sets the starting password (password@123) and the username.
      const payload = {
        // Student
        firstName,
        lastName,
        name: formData.fullName,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth || new Date(),
        gender: formData.gender || "OTHER",
        rollNumber: formData.rollNumber,
        registrationNumber: formData.registrationNumber.trim(),
        iemisNumber: formData.iemisNumber.trim(),
        grade: formData.grade,
        section: formData.section,
        address: formData.address,
        bloodGroup: formData.bloodGroup,
        
        // Parent
        guardianRelationship: formData.guardianRelationship,
        parentName: formData.parentName || "To be added",
        parentContactNumber: formData.parentContactNumber || "To be added",
        parentEmail: formData.parentEmail,
        parentAlternativeContact: formData.parentAlternativeContact,
        
        school: schoolId,
      };

      let response;
      if (editingId) {
        const updatePayload = {
            ...payload,
            dob: payload.dateOfBirth,
            parentPhone: payload.parentContactNumber,
            emergencyContact: payload.parentAlternativeContact
        };
        
        response = await fetch(`/api/students/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatePayload),
        });
      } else {
        response = await fetch("/api/students/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      if (editingId) {
        setSuccess("Student updated successfully!");
        setTimeout(() => {
            setActiveTab('single');
            setEditingId(null);
            setFormData({
                fullName: "",
                phone: "",
                dateOfBirth: "",
                gender: "",
                rollNumber: "",
    registrationNumber: "",
    iemisNumber: "",
                grade: "",
    section: "",
                address: "",
                bloodGroup: "",
                guardianRelationship: "FATHER",
                parentName: "",
                parentContactNumber: "",
                parentEmail: "",
                parentAlternativeContact: "",
            });
        }, 1500);
      } else {
        setSuccess(
          `Student registered. They sign in with IEMIS number ${formData.iemisNumber.trim().toUpperCase()} and password ${DEFAULT_STUDENT_PASSWORD}, then change the password.`
        );
        
        // Reset form after delay
        setTimeout(() => {
            setFormData({
            fullName: "",
            phone: "",
            dateOfBirth: "",
            gender: "",
            rollNumber: "",
    registrationNumber: "",
    iemisNumber: "",
            grade: "",
    section: "",
            address: "",
          bloodGroup: "",
          guardianRelationship: "FATHER",
          parentName: "",
          parentContactNumber: "",
          parentEmail: "",
          parentAlternativeContact: "",
        });
        setSuccess("");
        if (onSuccess) onSuccess();
      }, 10000); // Longer delay to let them read credentials
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (parsedData) => {
    setLoading(true);
    setError("");
    setSuccess("");
    setBulkResult(null);
    setBulkUploadStatus({
      label: "Checking CSV rows",
      detail: `${parsedData.length} row(s) found in the selected file.`,
    });
    try {
        // 1. Map + validate every row in the browser first, keeping the original
        //    CSV row so failures can be exported and fixed.
        const valid = [];
        const invalid = [];

        parsedData.forEach((row, index) => {
            const rowNumber = index + 2; // +1 for header line, +1 for 1-based
            const normalizedRow = buildNormalizedRow(row);
            const fullName = String(getRowValue(normalizedRow, ["fullname", "name"])).trim();
            const rollNumber = String(getRowValue(normalizedRow, ["rollnumber", "rollno", "roll"])).trim();
            const registrationNumber = String(getRowValue(normalizedRow, ["registrationnumber", "registrationno", "regno", "regnumber"])).trim();
            const iemisNumber = String(getRowValue(normalizedRow, ["iemisnumber", "iemisno", "iemis"])).trim();
            const grade = String(getRowValue(normalizedRow, ["grade", "class"])).trim();

            const missing = [];
            if (!fullName) missing.push("FullName");
            if (!rollNumber) missing.push("RollNumber");
            if (!registrationNumber) missing.push("RegistrationNumber");
            if (!iemisNumber) missing.push("IEMISNumber");
            if (!grade) missing.push("Grade");

            if (missing.length > 0) {
                invalid.push({
                    name: fullName || "(no name)",
                    rowNumber,
                    reason: `Missing required value(s): ${missing.join(", ")}`,
                    row,
                });
                return;
            }

            const nameParts = fullName.split(" ").filter(Boolean);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || ".";
            const parsedDob = parseDateValue(getRowValue(normalizedRow, ["dateofbirth", "dob"]));
            const username = fullName.toLowerCase().replace(/\s+/g, "");
            const guardianRelationship =
                String(getRowValue(normalizedRow, ["guardianrelationship", "relationship"]))
                    .trim()
                    .toUpperCase() || "FATHER";

            valid.push({
                _row: row,
                _rowNumber: rowNumber,
                firstName,
                lastName,
                username,
                email: getRowValue(normalizedRow, ["email"]) || "",
                grade,
                section: String(getRowValue(normalizedRow, ["section"])).trim(),
                rollNumber,
                registrationNumber,
                iemisNumber,
                phone: getRowValue(normalizedRow, ["phone", "phonenumber", "contact"]),
                address: getRowValue(normalizedRow, ["address"]),
                gender: getRowValue(normalizedRow, ["gender"]) || "OTHER",
                dateOfBirth: parsedDob || new Date(),
                bloodGroup: getRowValue(normalizedRow, ["bloodgroup", "blood"]),
                guardianRelationship,
                parentName: getRowValue(normalizedRow, ["guardianname", "parentname", "fathername", "mothername"]) || "To be added",
                parentContactNumber: getRowValue(normalizedRow, ["guardianphone", "parentphone", "parentcontact", "guardiancontact"]) || "To be added",
                parentEmail: getRowValue(normalizedRow, ["guardianemail", "parentemail"]) || "",
                parentAlternativeContact: getRowValue(normalizedRow, ["guardianaltphone", "alternatephone", "secondaryphone"]),
            });
        });

        // 2. Nothing usable: explain why (empty file vs. header/cell problems).
        if (valid.length === 0) {
            if (invalid.length === 0) {
                throw new Error("Your file has no data rows. Add students below the header row and try again.");
            }
            setBulkResult({ success: [], failed: invalid });
            setError("No students could be uploaded. Your column headers may not match the template, or required cells (FullName, RollNumber, RegistrationNumber, IEMISNumber, Grade) are empty. Use \"Download Template\" and compare your headings.");
            scrollToTop();
            return;
        }

        // 3. Send only the valid rows.
        setBulkUploadStatus({
          label: "Creating student accounts",
          detail:
            invalid.length > 0
              ? `${valid.length} valid row(s) are being uploaded. ${invalid.length} row(s) will need correction.`
              : `${valid.length} valid row(s) are being uploaded.`,
        });
        const students = valid.map(({ _row, _rowNumber, ...clean }) => clean);
        const response = await fetch("/api/students/bulk-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ students, schoolId }),
        });

        let data = {};
        try { data = await response.json(); } catch { /* non-JSON error page */ }

        if (!response.ok) {
            throw new Error(friendlyUploadError(response.status, data.message, "students"));
        }

        setBulkUploadStatus({
          label: "Preparing upload summary",
          detail: "Reviewing successful rows and rows that need attention.",
        });
        const resultData = data.data || { success: [], failed: [] };

        // 4. Combine the browser-side invalid rows with any server-side failures,
        //    recovering the original CSV row for each so they can be re-exported.
        const serverFailed = (resultData.failed || []).map((f) => {
            const match = valid.find(
                (v) => v.firstName === f.student?.firstName && v.rollNumber === f.student?.rollNumber
            );
            const fullName = f.student
                ? `${f.student.firstName || ""} ${f.student.lastName || ""}`.trim()
                : "Unknown";
            return {
                name: fullName || "Unknown",
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
        setBulkUploadStatus(null);
        setLoading(false);
    }
  };

  const downloadFailedRows = () => {
    if (!bulkResult?.failed?.length) return;
    downloadTextFile("students_failed_rows.csv", buildFailedRowsCsv(bulkResult.failed));
  };

  const downloadCsvTemplate = () => {
    const headers = [
        "FullName*", 
        "RollNumber*", 
        "RegistrationNumber*", 
        "IEMISNumber", 
        "Grade*", 
        "Section", 
        "Gender", 
        "DateOfBirth", 
        "Phone", 
        "Address", 
        "BloodGroup", 
        "GuardianRelationship", 
        "GuardianName", 
        "GuardianPhone", 
        "GuardianEmail", 
        "GuardianAltPhone"
    ];
      const sampleRow = [
        "Sujan Shrestha",
        "12",
        "REG-2083-001",
        "IEMIS-2083-0001",
        "8",
        "A",
        "MALE",
        "2011-06-12",
        "9812345678",
        "Bhaktapur",
        "O+",
        "FATHER",
        "Ram Shrestha",
        "9800000000",
        "ram.shrestha@example.com",
        "9841000000"
      ];
    
      const csvContent = `${headers.join(",")}\n${sampleRow.join(",")}\n`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_registration_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="card text-ink p-4 sm:p-5 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
      <h2 className="font-semibold text-ink">Add New Student</h2>
      <div className="flex gap-2 bg-brand-soft p-1 rounded-card">
            <button 
                onClick={() => {
                    setActiveTab("single");
                    setEditingId(null);
                    setFormData({
                        fullName: "",
                        phone: "",
                        dateOfBirth: "",
                        gender: "",
                        rollNumber: "",
    registrationNumber: "",
                        iemisNumber: "",
                        grade: "",
    section: "",
                        address: "",
                        bloodGroup: "",
                        guardianRelationship: "FATHER",
                        parentName: "",
                        parentContactNumber: "",
                        parentEmail: "",
                        parentAlternativeContact: "",
                    });
                }}
                className={`btn btn-ghost font-semibold transition-colors ${activeTab === 'single' ? 'bg-brand text-white' : 'text-muted hover:bg-surface hover:text-brand-strong'}`}
            >
                {editingId ? 'Edit Student' : 'Single Entry'}
            </button>
            <button 
                onClick={() => setActiveTab("bulk")}
                className={`btn btn-ghost font-semibold transition-colors ${activeTab === 'bulk' ? 'bg-brand text-white' : 'text-muted hover:bg-surface hover:text-brand-strong'}`}
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

      {bulkUploadStatus && activeTab === "bulk" && (
        <div
          className="card mb-4 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span
              className="spinner mt-0.5 h-9 w-9 shrink-0 text-brand-strong"
              style={{ "--pravyo-ring": "4px" }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold text-ink">
                  {bulkUploadStatus.label}
                </p>
                <span className="badge badge-neutral inline-flex w-fit items-center gap-2 text-xs">
                  <span className="" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  In progress
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-muted">
                {bulkUploadStatus.detail}
              </p>
              <div className="mt-4">
                <span />
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkResult && activeTab === 'bulk' && (
        <div className="mb-4 space-y-4">
            {/* Success List */}
            {bulkResult.success.length > 0 && (
                <div className="bg-success-soft border border-success-line rounded-control p-4">
                  <h4 className="text-success font-medium mb-2">Successfully Registered ({bulkResult.success.length})</h4>
                    <div className="max-h-40 overflow-y-auto pr-2">
                    <ul className="list-disc list-inside text-sm text-success space-y-1">
                            {bulkResult.success.map((s, i) => (
                                <li key={i}>
                                    <span className="font-medium">{s.name}</span> 
                          <span className="text-success ml-2 text-xs">({s.username})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Failed List */}
            {bulkResult.failed.length > 0 && (
                <div className="bg-danger-soft border border-danger-line rounded-control p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h4 className="text-danger font-medium">Need attention ({bulkResult.failed.length})</h4>
                    <button
                      onClick={downloadFailedRows}
                      className="btn btn-secondary btn-sm flex items-center gap-1.5 font-medium transition-colors shrink-0"
                    >
                      <Download size={14} /> Download failed rows
                    </button>
                  </div>
                  <p className="text-xs text-danger mb-3">
                    Fix these rows in the downloaded file, then upload it again. Already-added students are skipped automatically.
                  </p>
                    <div className="max-h-48 overflow-y-auto pr-2">
                    <ul className="space-y-2 text-sm text-danger">
                            {bulkResult.failed.map((f, i) => (
                        <li key={i} className="border-b border-danger-line pb-2 last:border-0 last:pb-0">
                          <div className="font-medium text-danger">
                                        {f.rowNumber ? `Row ${f.rowNumber}: ` : ""}{f.name || 'Unknown'}
                                    </div>
                          <div className="text-xs opacity-80 mt-0.5 text-danger">Reason: {f.reason}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
      )}

      {activeTab === "single" ? (
        <div className="space-y-5">
          
          {/* Part 1: Student Details */}
          <div className="space-y-4 transition-colors">
            <h3 className="font-semibold text-brand-strong mb-4">Student Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-1">Student Full Name *</label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  className="input w-full"
                >
                  <option value="">Select Gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Registration Number *</label>
                <input
                  type="text"
                  value={formData.registrationNumber}
                  maxLength={40}
                  placeholder="The school's registration no."
                  onChange={(e) => setFormData({...formData, registrationNumber: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Student IEMIS Number *</label>
                <input
                  type="text"
                  value={formData.iemisNumber}
                  maxLength={50}
                  required
                  placeholder="Government-issued, unique to this student"
                  onChange={(e) => setFormData({...formData, iemisNumber: e.target.value.toUpperCase()})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Roll Number *</label>
                <input
                  type="text"
                  value={formData.rollNumber}
                  onChange={(e) => setFormData({...formData, rollNumber: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Grade *</label>
                <select
                  value={formData.grade}
                  onChange={(e) => setFormData({...formData, grade: e.target.value, section: ""})}
                  className="input w-full"
                >
                  <option value="">Select Grade</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Section{gradeSectionOptions.length ? " *" : ""}</label>
                <select
                  value={formData.section}
                  onChange={(e) => setFormData({...formData, section: e.target.value})}
                  disabled={!gradeSectionOptions.length}
                  className="input w-full"
                >
                  <option value="">{gradeSectionOptions.length ? "Select Section" : "No sections for this grade"}</option>
                  {gradeSectionOptions.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Blood Group (Optional)</label>
                <select
                  value={formData.bloodGroup}
                  onChange={(e) => setFormData({...formData, bloodGroup: e.target.value})}
                  className="input w-full"
                >
                  <option value="">Select Blood Group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="input w-full"
                  rows="2"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-line-strong"></div>

          {/* Part 2: Parent/Guardian Details */}
          <div className="space-y-4 transition-colors">
            <h3 className="font-semibold text-brand-strong mb-4">Parent/Guardian Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Guardian Relationship</label>
                <select
                  value={formData.guardianRelationship}
                  onChange={(e) => setFormData({...formData, guardianRelationship: e.target.value})}
                  className="input w-full"
                >
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="UNCLE">Uncle</option>
                  <option value="AUNT">Aunt</option>
                  <option value="SIBLING">Sibling</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Guardian Full Name</label>
                <input
                  type="text"
                  value={formData.parentName}
                  onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Guardian Contact Number</label>
                <input
                  type="tel"
                  value={formData.parentContactNumber}
                  onChange={(e) => setFormData({...formData, parentContactNumber: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">Guardian Email</label>
                <input
                  type="email"
                  value={formData.parentEmail}
                  onChange={(e) => setFormData({...formData, parentEmail: e.target.value})}
                  className="input w-full"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-1">Alternative Contact (Optional)</label>
                <input
                  type="tel"
                  value={formData.parentAlternativeContact}
                  onChange={(e) => setFormData({...formData, parentAlternativeContact: e.target.value})}
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-line-strong mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary flex items-center gap-2 font-medium transition-colors"
            >
              {loading ? "Registering..." : "Submit Registration"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-medium text-ink mb-2">Upload Student Data</h3>
                <div className="text-muted text-sm space-y-2">
                  <p>Upload a CSV file with the following headers:</p>
                  <div className="card p-3 font-mono text-xs overflow-x-auto text-ink">
                    <span className="text-danger">FullName*</span>, 
                    <span className="text-danger"> RollNumber*</span>, 
                    <span className="text-danger"> RegistrationNumber*</span>, 
                    <span className="text-danger"> IEMISNumber*</span>, 
                    <span className="text-danger"> Grade*</span>, 
                    <span className="text-brand-strong"> Section</span>, 
                    <span className="text-brand-strong"> Gender</span>, 
                    <span className="text-brand-strong"> DateOfBirth</span>, 
                    <span className="text-brand-strong"> Phone</span>, 
                    <span className="text-brand-strong"> Address</span>, 
                    <span className="text-brand-strong"> BloodGroup</span>, 
                    <span className="text-brand-strong"> GuardianRelationship</span>, 
                    <span className="text-brand-strong"> GuardianName</span>, 
                    <span className="text-brand-strong"> GuardianPhone</span>, 
                    <span className="text-brand-strong"> GuardianEmail</span>, 
                    <span className="text-brand-strong"> GuardianAltPhone</span>
                  </div>
                  <p className="text-xs text-subtle">
                    <span className="text-danger">* Mandatory Fields</span> | 
                    <span className="text-brand-strong"> Optional Fields</span>
                  </p>
                  <p className="text-xs text-subtle">
                    Template includes one demo row. Replace it with your data before upload.
                    Section is required for any grade that has sections set up.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                <button
                  onClick={downloadCsvTemplate}
                  className="btn btn-primary flex items-center gap-2 transition-colors shrink-0"
                >
                  <Download size={16} /> Download Template
                </button>
                <div className="card p-3 text-xs text-muted max-w-[260px]">
                  <div className="font-semibold text-brand-strong">Demo row preview</div>
                  <div className="mt-2 space-y-1 text-muted">
                    <div>Name: Sujan Shrestha</div>
                    <div>Roll: 12 | Grade: 8</div>
                    <div>Guardian: Ram Shrestha</div>
                  </div>
                </div>
              </div>
            </div>
            {bulkResult && (
              <div className="card mt-5 p-4 text-sm text-ink">
                <div className="font-semibold text-ink">Bulk upload summary</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
                  <span>Processed: {bulkResult.success.length + bulkResult.failed.length}</span>
                  <span className="text-success">Success: {bulkResult.success.length}</span>
                  <span className="text-danger">Failed: {bulkResult.failed.length}</span>
                </div>
              </div>
            )}
            <div className="mt-4">
              <CSVUploader
                onUpload={handleBulkUpload}
                uploadingLabel="Uploading student rows"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedStudentRegistration;
