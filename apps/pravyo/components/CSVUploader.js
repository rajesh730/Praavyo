"use client";

import { useState } from "react";
import Papa from "papaparse";
import { FileUp as FaFileUpload, FileSpreadsheet as FaFileCsv, CircleAlert as FaExclamationCircle } from "lucide-react";
import { validateFile } from "@/lib/validation";

export default function CSVUploader({
  onUpload,
  label = "Upload CSV",
  uploadingLabel = "Uploading CSV rows",
  maxFileSize = 5 * 1024 * 1024,
}) {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [fileInfo, setFileInfo] = useState(null);
  const busy = parsing || uploading;

  const handleFile = (selectedFile) => {
    if (!selectedFile || busy) return;

    setError("");
    setFileInfo(null);

    const fileError = validateFile(selectedFile, {
      maxSize: maxFileSize,
      allowedTypes: ["text/csv", "application/vnd.ms-excel", "application/csv"],
    });

    if (fileError) {
      setError(fileError);
      return;
    }

    setFile(selectedFile);
    setFileInfo({
      name: selectedFile.name,
      size: (selectedFile.size / 1024).toFixed(2),
    });
  };

  const handleUpload = () => {
    if (!file || busy) {
      setError("Please select a file first");
      return;
    }

    setParsing(true);
    setError("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setParsing(false);

        if (results.errors.length > 0) {
          setError(`CSV parsing error: ${results.errors[0].message}`);
          return;
        }

        if (results.data.length === 0) {
          setError("CSV file is empty. Please add data rows.");
          return;
        }

        setUploading(true);
        try {
          await onUpload(results.data);
          setFile(null);
          setFileInfo(null);
        } catch (uploadError) {
          setError(
            uploadError?.message ||
              "Upload failed. Please check the file and try again."
          );
        } finally {
          setUploading(false);
        }
      },
      error: (parseError) => {
        setParsing(false);
        setError(`Error parsing CSV: ${parseError.message}`);
      },
    });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-control border border-danger-line bg-danger-soft px-4 py-3 text-danger">
          <FaExclamationCircle className="mt-0.5 text-lg" />
          <div>
            <p className="text-sm font-semibold">Validation Error</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div
        className={`rounded-card border border-dashed p-4 sm:p-5 text-center transition-colors ${
          busy
            ? "cursor-not-allowed border-line bg-surface opacity-80"
            : dragging
              ? "cursor-pointer border-brand bg-brand-soft"
              : "cursor-pointer border-line-strong bg-surface hover:border-brand"
        }`}
        onDragEnter={() => {
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!busy) document.getElementById("csv-input").click();
        }}
      >
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          hidden
          disabled={busy}
          onChange={(event) => handleFile(event.target.files[0])}
        />

        {fileInfo ? (
          <div>
            <FaFileCsv className="mx-auto mb-2 text-2xl text-brand-strong" />
            <p className="font-semibold text-ink">{fileInfo.name}</p>
            <p className="text-sm text-muted">{fileInfo.size} KB</p>
          </div>
        ) : (
          <div>
            <FaFileUpload className="mx-auto mb-2 text-2xl text-subtle" />
            <p className="font-semibold text-ink">{label}</p>
            <p className="text-sm text-muted">
              Drag and drop or click to browse
            </p>
            <p className="mt-2 text-xs text-subtle">
              Max file size: {(maxFileSize / 1024 / 1024).toFixed(1)}MB
            </p>
          </div>
        )}
      </div>

      {busy && (
        <div
          className="card p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <span
              className="spinner h-8 w-8 shrink-0 text-brand-strong"
              style={{ "--pravyo-ring": "4px" }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {parsing ? "Reading CSV file" : uploadingLabel}
              </p>
              <p className="text-sm font-semibold text-muted">
                {parsing
                  ? "Checking the file format before import."
                  : "Keep this page open while the server creates accounts."}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <span />
          </div>
        </div>
      )}

      {file && (
        <button
          onClick={handleUpload}
          disabled={busy}
          className="btn btn-primary w-full font-semibold transition-colors"
        >
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {parsing ? "Processing CSV" : "Uploading"}
            </span>
          ) : (
            "Upload & Parse CSV"
          )}
        </button>
      )}
    </div>
  );
}
