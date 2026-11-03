"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProgressIndicator from "@/components/ProgressIndicator";
import SearchableDropdown from "@/components/SearchableDropdown";
import {
  nepalLocationData,
  schoolTypes,
  affiliationBoards,
  getAvailableDistricts,
} from "@/lib/nepalLocationData";
import { School as FaSchool, MapPin as FaMapMarkerAlt, UserRound as FaUserTie, Lock as FaLock, House as FaHome } from "lucide-react";

const STEPS = [
  { id: "basic", title: "School Info", icon: FaSchool },
  { id: "location", title: "Location", icon: FaMapMarkerAlt },
  { id: "principal", title: "Principal", icon: FaUserTie },
  { id: "login", title: "Login Info", icon: FaLock },
];

const getCurrentNepaliYearApprox = () => {
  const today = new Date();
  const nepaliNewYearHasStarted = today.getMonth() > 3 || (today.getMonth() === 3 && today.getDate() >= 14);
  return today.getFullYear() + (nepaliNewYearHasStarted ? 57 : 56);
};

const validateEstablishedYear = (value, calendar = "AD") => {
  const cleanedValue = String(value || "").trim();
  if (!/^\d{4}$/.test(cleanedValue)) {
    return "Enter a 4-digit established year";
  }

  const year = Number.parseInt(cleanedValue, 10);
  const currentAdYear = new Date().getFullYear();
  const currentBsYear = getCurrentNepaliYearApprox();

  if (calendar === "BS") {
    if (year < 1957 || year > currentBsYear) {
      return `Enter a valid BS year up to ${currentBsYear}`;
    }
    return "";
  }

  if (year < 1900 || year > currentAdYear) {
    return `Enter a valid AD year up to ${currentAdYear}`;
  }

  return "";
};



export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [formData, setFormData] = useState({
    // Basic Information
    schoolName: "",
    schoolNameNepali: "",
    schoolType: "",
    customSchoolType: "",
    affiliation: "",
    customAffiliation: "",
    establishedYear: "",
    establishedYearCalendar: "AD",
    // The school's IEMIS registration number, issued by the government.
    iemisNumber: "",
    schoolPhone: "",
    schoolEmail: "",

    // Location Information
    province: "",
    district: "",
    municipality: "",
    customMunicipality: "",
    ward: "",
    tole: "",
    streetAddress: "",
    postalCode: "",

    // Principal Information
    principalName: "",
    principalPhone: "",
    alternatePhone: "",

    // Login Information
    email: "",
    password: "",
    confirmPassword: "",
    website: "",

    // Education Levels
    educationLevels: {
      school: true, // Default to true as it's the only option now
    },
    schoolConfig: {
      schoolLevel: {
        minGrade: 1,
        maxGrade: 10,
      },
    },
  });

  const [stepErrors, setStepErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const updateFormData = useCallback((updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const isStrongPassword = (pwd) => {
    return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwd || "");
  };

  const validateStep = (stepIndex) => {
    const errors = {};

    switch (stepIndex) {
      case 0: // Basic Info
        if (!formData.schoolName.trim())
          errors.schoolName = "School name is required";
        if (!formData.schoolType) errors.schoolType = "School type is required";
        if (
          formData.schoolType === "Other (Specify)" &&
          !formData.customSchoolType.trim()
        ) {
          errors.customSchoolType = "Custom school type is required";
        }
        if (!formData.affiliation)
          errors.affiliation = "Affiliation is required";
        if (
          formData.affiliation === "Other (Specify)" &&
          !formData.customAffiliation.trim()
        ) {
          errors.customAffiliation = "Custom affiliation is required";
        }
        {
          const yearError = validateEstablishedYear(
            formData.establishedYear,
            formData.establishedYearCalendar
          );
          if (yearError) errors.establishedYear = yearError;
        }
        if (!formData.iemisNumber.trim())
          errors.iemisNumber = "School IEMIS registration number is required";
        else if (!/^[A-Za-z0-9-]{1,50}$/.test(formData.iemisNumber.trim()))
          errors.iemisNumber = "Use letters, numbers and hyphens only";
        if (!formData.schoolPhone.trim())
          errors.schoolPhone = "School phone is required";
        if (!formData.schoolEmail.trim())
          errors.schoolEmail = "School email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.schoolEmail))
          errors.schoolEmail = "Valid email is required";
        if (
          !formData.schoolConfig.schoolLevel?.maxGrade ||
          formData.schoolConfig.schoolLevel.maxGrade < 1 ||
          formData.schoolConfig.schoolLevel.maxGrade > 10
        ) {
          errors.maxGrade = "Select the highest grade your school offers";
        }
        break;

      case 1: // Location
        if (!formData.province) errors.province = "Province is required";
        if (!formData.district) errors.district = "District is required";
        if (!formData.municipality.trim())
          errors.municipality = "Municipality is required";
        if (!formData.ward) errors.ward = "Ward number is required";
        break;

      case 2: // Principal
        if (!formData.principalName.trim())
          errors.principalName = "Principal name is required";
        if (!formData.principalPhone.trim())
          errors.principalPhone = "Principal phone is required";
        break;

      case 3: // Login
        if (!isStrongPassword(formData.password)) {
          errors.password =
            "Password must be at least 8 characters with letter and number";
        }
        if (formData.password !== formData.confirmPassword) {
          errors.confirmPassword = "Passwords do not match";
        }
        break;
    }

    return errors;
  };

  const handleNext = () => {
    const errors = validateStep(currentStep);
    if (Object.keys(errors).length > 0) {
      setStepErrors({ ...stepErrors, [currentStep]: errors });
      return;
    }

    setStepErrors({ ...stepErrors, [currentStep]: {} });
    setCompletedSteps((prev) => [...new Set([...prev, currentStep])]);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex) => {
    // Allow clicking on current step, previous steps, or next step if current is completed
    if (stepIndex <= currentStep || completedSteps.includes(stepIndex - 1)) {
      setCurrentStep(stepIndex);
    }
  };

  const handleLocationChange = (field, value) => {
    const updates = { [field]: value };

    if (field === "province") {
      updates.district = "";
      updates.municipality = "";
      updates.ward = "";
    } else if (field === "district") {
      updates.municipality = "";
      updates.ward = "";
    }

    updateFormData(updates);
  };

  const handleSubmit = async () => {
    const finalErrors = validateStep(currentStep);
    if (Object.keys(finalErrors).length > 0) {
      setStepErrors({ ...stepErrors, [currentStep]: finalErrors });
      return;
    }

    setLoading(true);

    try {
      const educationLevels = { school: true };
      const schoolConfig = {
        schoolLevel: {
          minGrade: 1,
          maxGrade: formData.schoolConfig.schoolLevel?.maxGrade || 10,
        },
      };

      const municipality = formData.municipality.trim();
      const locationParts = [
        formData.streetAddress,
        formData.tole,
        municipality,
        formData.ward ? `Ward ${formData.ward}` : "",
        formData.district,
        formData.province,
        formData.postalCode ? `Postal Code ${formData.postalCode}` : "",
      ].filter(Boolean);

      // Prepare final form data
      const submitData = {
        ...formData,
        municipality,
        educationLevels,
        email: formData.schoolEmail, // Use school email for login
        establishedYear: parseInt(formData.establishedYear), // Convert to number
        establishedYearCalendar: formData.establishedYearCalendar,
        schoolLocation: locationParts.join(", "),
        schoolConfig,
      };

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/login");
      } else {
        setStepErrors({
          ...stepErrors,
          [currentStep]: { submit: data.message || "Registration failed" },
        });
      }
    } catch (error) {
      console.error("Registration error:", error);
      setStepErrors({
        ...stepErrors,
        [currentStep]: { submit: "Something went wrong. Please try again." },
      });
    } finally {
      setLoading(false);
    }
  };

  const renderBasicInfoStep = () => {
    const errors = stepErrors[0] || {};

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              School Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${
                errors.schoolName
                  ? "input input-invalid"
                  : "input"
              }`}
              value={formData.schoolName}
              onChange={(e) => updateFormData({ schoolName: e.target.value })}
              placeholder="Enter school name"
            />
            {errors.schoolName && (
              <p className="text-danger text-sm mt-1">{errors.schoolName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              School Name (Nepali)
            </label>
            <input
              type="text"
              className="input w-full"
              value={formData.schoolNameNepali}
              onChange={(e) =>
                updateFormData({ schoolNameNepali: e.target.value })
              }
              placeholder="School name in Nepali"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              School Type <span className="text-danger">*</span>
            </label>
            <SearchableDropdown
              options={schoolTypes.map((type, index) => ({
                id: index,
                name: type,
              }))}
              value={formData.schoolType}
              onChange={(value) => updateFormData({ schoolType: value })}
              placeholder="Select school type"
              error={errors.schoolType}
              searchable={false}
            />
            {formData.schoolType === "Other (Specify)" && (
              <div className="mt-3">
                <input
                  type="text"
                  className={`input w-full ${
                    errors.customSchoolType
                      ? "input input-invalid"
                      : "input"
                  }`}
                  value={formData.customSchoolType}
                  onChange={(e) =>
                    updateFormData({ customSchoolType: e.target.value })
                  }
                  placeholder="Specify school type"
                />
                {errors.customSchoolType && (
                  <p className="text-danger text-sm mt-1">
                    {errors.customSchoolType}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Affiliation <span className="text-danger">*</span>
            </label>
            <SearchableDropdown
              options={affiliationBoards.map((board, index) => ({
                id: index,
                name: board,
              }))}
              value={formData.affiliation}
              onChange={(value) => updateFormData({ affiliation: value })}
              placeholder="Select affiliation"
              error={errors.affiliation}
              searchable={false}
            />
            {formData.affiliation === "Other (Specify)" && (
              <div className="mt-3">
                <input
                  type="text"
                  className={`input w-full ${
                    errors.customAffiliation
                      ? "input input-invalid"
                      : "input"
                  }`}
                  value={formData.customAffiliation}
                  onChange={(e) =>
                    updateFormData({ customAffiliation: e.target.value })
                  }
                  placeholder="Specify affiliation"
                />
                {errors.customAffiliation && (
                  <p className="text-danger text-sm mt-1">
                    {errors.customAffiliation}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Established Year <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select
                value={formData.establishedYearCalendar}
                onChange={(e) =>
                  updateFormData({ establishedYearCalendar: e.target.value })
                }
                className="input w-full"
                aria-label="Established year calendar"
              >
                <option value="AD">AD</option>
                <option value="BS">BS</option>
              </select>
              <input
                type="text"
                inputMode="numeric"
                className={`input w-full ${
                  errors.establishedYear ? "input input-invalid" : "input"
                }`}
                value={formData.establishedYear || ""}
                onChange={(e) =>
                  updateFormData({ establishedYear: e.target.value })
                }
                placeholder={
                  formData.establishedYearCalendar === "BS" ? "2057" : "2000"
                }
                maxLength={4}
              />
            </div>
            <p className="mt-1 text-sm text-subtle">
              Choose AD or BS first, then enter the year in that calendar.
            </p>
            {errors.establishedYear && (
              <p className="text-danger text-sm mt-1">
                {errors.establishedYear}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              School IEMIS Registration Number <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={errors.iemisNumber ? "input input-invalid w-full" : "input w-full"}
              value={formData.iemisNumber}
              onChange={(e) =>
                updateFormData({ iemisNumber: e.target.value })
              }
              placeholder="IEMIS number issued by the government"
              autoComplete="off"
            />
            {errors.iemisNumber ? (
              <p className="text-danger text-sm mt-1">{errors.iemisNumber}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">Printed on every report card. Each school&apos;s IEMIS number can be registered only once.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              School Phone <span className="text-danger">*</span>
            </label>
            <input
              type="tel"
              className={`input w-full ${
                errors.schoolPhone ? "input input-invalid" : "input"
              }`}
              value={formData.schoolPhone}
              onChange={(e) => updateFormData({ schoolPhone: e.target.value })}
              placeholder="01xxxxxxx or 98xxxxxxxx"
            />
            {errors.schoolPhone && (
              <p className="text-danger text-sm mt-1">{errors.schoolPhone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Email Address <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              className={`input w-full ${
                errors.schoolEmail ? "input input-invalid" : "input"
              }`}
              value={formData.schoolEmail}
              onChange={(e) => updateFormData({ schoolEmail: e.target.value })}
              placeholder="info@schoolname.edu.np"
            />
            {errors.schoolEmail && (
              <p className="text-danger text-sm mt-1">{errors.schoolEmail}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Highest Grade Offered <span className="text-danger">*</span>
          </label>
          <select
            className={`input w-full ${
              errors.maxGrade ? "input input-invalid" : "input"
            }`}
            value={formData.schoolConfig.schoolLevel?.maxGrade || 10}
            onChange={(e) =>
              updateFormData({
                schoolConfig: {
                  ...formData.schoolConfig,
                  schoolLevel: {
                    minGrade: 1,
                    maxGrade: Number.parseInt(e.target.value, 10),
                  },
                },
              })
            }
          >
            {[5, 6, 7, 8, 9, 10].map((grade) => (
              <option key={grade} value={grade}>
                Grade {grade}
              </option>
            ))}
          </select>
          <p className="text-subtle text-sm mt-2">
            Student groups and grade filters will be created from Grade 1 up to
            this grade.
          </p>
          {errors.maxGrade && (
            <p className="text-danger text-sm mt-1">{errors.maxGrade}</p>
          )}
        </div>
      </div>
    );
  };

  const renderLocationStep = () => {
    const errors = stepErrors[1] || {};
    const availableDistricts = getAvailableDistricts(formData.province);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Province <span className="text-danger">*</span>
            </label>
            <SearchableDropdown
              options={nepalLocationData.provinces}
              value={formData.province}
              onChange={(value) => handleLocationChange("province", value)}
              placeholder="Select Province"
              error={errors.province}
              allowCustom
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              District <span className="text-danger">*</span>
            </label>
            <SearchableDropdown
              options={availableDistricts}
              value={formData.district}
              onChange={(value) => handleLocationChange("district", value)}
              placeholder="Select District"
              disabled={!formData.province}
              error={errors.district}
              allowCustom
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Municipality/VDC <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${
                errors.municipality ? "input input-invalid" : "input"
              }`}
              value={formData.municipality}
              onChange={(e) => updateFormData({ municipality: e.target.value })}
              placeholder="Enter municipality, rural municipality, or VDC"
            />
            {errors.municipality && (
              <p className="text-danger text-sm mt-1">{errors.municipality}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Ward No. <span className="text-danger">*</span>
            </label>
            <select
              className={`input w-full ${
                errors.ward ? "input input-invalid" : "input"
              }`}
              value={formData.ward}
              onChange={(e) => updateFormData({ ward: e.target.value })}
              disabled={!formData.municipality}
            >
              <option value="">Select Ward</option>
              {Array.from({ length: 35 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Ward {i + 1}
                </option>
              ))}
            </select>
            {errors.ward && (
              <p className="text-danger text-sm mt-1">{errors.ward}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Area/Tole
            </label>
            <input
              type="text"
              className="input w-full"
              value={formData.tole}
              onChange={(e) => updateFormData({ tole: e.target.value })}
              placeholder="e.g., Kaushaltar, Gatthaghar, Lokanthali"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Postal Code
            </label>
            <input
              type="text"
              className="input w-full"
              value={formData.postalCode}
              onChange={(e) => updateFormData({ postalCode: e.target.value })}
              placeholder="44600"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Street Address
          </label>
          <textarea
            className="input w-full"
            value={formData.streetAddress}
            onChange={(e) => updateFormData({ streetAddress: e.target.value })}
            placeholder="Enter detailed street address"
          />
        </div>
      </div>
    );
  };

  const renderPrincipalStep = () => {
    const errors = stepErrors[2] || {};

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Principal Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${
                errors.principalName ? "input input-invalid" : "input"
              }`}
              value={formData.principalName}
              onChange={(e) =>
                updateFormData({ principalName: e.target.value })
              }
              placeholder="Enter principal's full name"
            />
            {errors.principalName && (
              <p className="text-danger text-sm mt-1">
                {errors.principalName}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Principal Phone <span className="text-danger">*</span>
            </label>
            <input
              type="tel"
              className={`input w-full ${
                errors.principalPhone ? "input input-invalid" : "input"
              }`}
              value={formData.principalPhone}
              onChange={(e) =>
                updateFormData({ principalPhone: e.target.value })
              }
              placeholder="98xxxxxxxx"
            />
            {errors.principalPhone && (
              <p className="text-danger text-sm mt-1">
                {errors.principalPhone}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Alternate Phone
            </label>
            <input
              type="tel"
              className="input w-full"
              value={formData.alternatePhone}
              onChange={(e) =>
                updateFormData({ alternatePhone: e.target.value })
              }
              placeholder="01xxxxxxx"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderLoginStep = () => {
    const errors = stepErrors[3] || {};

    return (
      <div className="space-y-4">
        <div className="bg-success border border-success rounded-control p-4">
          <p className="text-sm text-success">
            <strong>Login Email:</strong>{" "}
            {formData.schoolEmail || "Please complete School Info step"}
          </p>
          <p className="text-xs text-success mt-1">
            Your school email from Step 1 will be used for login
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              className={`input w-full ${
                errors.password ? "input input-invalid" : "input"
              }`}
              value={formData.password}
              onChange={(e) => updateFormData({ password: e.target.value })}
              placeholder="Enter secure password"
            />
            {errors.password && (
              <p className="text-danger text-sm mt-1">{errors.password}</p>
            )}
            <p className="text-muted text-sm mt-1">
              Min 8 chars, include letter & number
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Confirm Password <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              className={`input w-full ${
                errors.confirmPassword ? "input input-invalid" : "input"
              }`}
              value={formData.confirmPassword}
              onChange={(e) =>
                updateFormData({ confirmPassword: e.target.value })
              }
              placeholder="Confirm password"
            />
            {errors.confirmPassword && (
              <p className="text-danger text-sm mt-1">
                {errors.confirmPassword}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Website (Optional)
          </label>
          <input
            type="url"
            className="input w-full"
            value={formData.website}
            onChange={(e) => updateFormData({ website: e.target.value })}
            placeholder="https://schoolname.edu.np"
          />
        </div>
      </div>
    );
  };

  const getCurrentStepComponent = () => {
    switch (currentStep) {
      case 0:
        return renderBasicInfoStep();
      case 1:
        return renderLocationStep();
      case 2:
        return renderPrincipalStep();
      case 3:
        return renderLoginStep();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-canvas py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FaHome />
            Back to home
          </Link>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/events"
              className="btn btn-secondary font-semibold transition-colors"
            >
              Events
            </Link>
            <Link
              href="/login"
              className="btn btn-secondary font-semibold transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="text-center mb-5">
          <h1 className="text-3xl font-semibold text-ink mb-2">
            School Registration
          </h1>
          <p className="text-ink">
            Join our platform to manage your school efficiently - Step{" "}
            {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        <div className="bg-surface rounded-card shadow-pop overflow-hidden border border-line-strong">
          <div className="p-4 sm:p-5 border-b border-line-strong">
            <ProgressIndicator
              currentStep={currentStep}
              totalSteps={STEPS.length}
              stepLabels={STEPS.map((step) => step.title)}
              onStepClick={handleStepClick}
              completedSteps={completedSteps}
            />
          </div>

          <div className="p-6">
            <div className="flex items-center mb-4">
              {React.createElement(STEPS[currentStep].icon, {
                className: "h-8 w-8 text-success mr-3",
              })}
              <div>
                <h2 className="text-2xl font-semibold text-ink">
                  {STEPS[currentStep].title}
                </h2>
                <p className="text-ink mt-1">
                  {currentStep === 0 &&
                    "Enter basic school information and contact details"}
                  {currentStep === 1 &&
                    "Provide your school's location details"}
                  {currentStep === 2 && "Enter principal information"}
                  {currentStep === 3 && "Set up login password"}
                </p>
              </div>
            </div>

            {stepErrors[currentStep]?.submit && (
              <div className="bg-danger-soft border border-danger-line text-danger px-4 py-3 rounded-control mb-4">
                {stepErrors[currentStep].submit}
              </div>
            )}

            <div className="min-h-[400px]">{getCurrentStepComponent()}</div>
          </div>

          <div className="px-6 py-6 bg-surface border-t border-line-strong flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                type="button"
                className="text-subtle hover:text-ink transition-colors text-sm"
                onClick={() => router.push("/login")}
              >
                Back to Login
              </button>
            </div>

            <div className="flex items-center space-x-4">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="btn btn-secondary transition-colors"
                  disabled={loading}
                >
                  Previous
                </button>
              )}

              <button
                type="button"
                onClick={
                  currentStep === STEPS.length - 1 ? handleSubmit : handleNext
                }
                className="btn btn-primary transition-colors"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b border-line-strong"></div>
                    <span>Processing...</span>
                  </div>
                ) : currentStep === STEPS.length - 1 ? (
                  "Complete Registration"
                ) : (
                  "Next Step"
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-4">
          <p className="text-subtle text-sm">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-success hover:text-success font-medium"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
