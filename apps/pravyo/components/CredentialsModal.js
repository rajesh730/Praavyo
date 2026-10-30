"use client";

import { Copy as FaCopy, Download as FaDownload, Eye as FaEye, EyeOff as FaEyeSlash, X as FaTimes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function CredentialsModal({ isOpen, credentials, onClose }) {
  const [passwordVisible, setPasswordVisible] = useState(true);
  const [copied, setCopied] = useState(null);
  const credentialList = useMemo(
    () => (Array.isArray(credentials) ? credentials : credentials ? [credentials] : []),
    [credentials]
  );

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || credentialList.length === 0) return null;

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadCredentials = () => {
    const content = credentialList
      .map((entry, index) => {
        let block = `Account ${index + 1}\n`;
        if (entry.name) block += `Name: ${entry.name}\n`;
        if (entry.username) block += `Username: ${entry.username}\n`;
        if (entry.email) block += `Email: ${entry.email}\n`;
        block += `Password: ${entry.password}\n`;
        return block;
      })
      .join("\n")
      .concat("\nIMPORTANT: Share securely and change password on first login.");

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
    );
    element.setAttribute("download", `credentials-${Date.now()}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4">
      <div className="bg-surface p-6 rounded-card border border-line-strong w-full max-w-2xl shadow-pop max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-ink">Account Credentials</h3>
          <button
            onClick={onClose}
            className="text-subtle hover:text-ink text-2xl"
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-4">
          {credentialList.map((entry, index) => (
            <div
              key={`${entry.email || entry.username || index}`}
              className="border border-line-strong rounded-card p-4 bg-surface space-y-4"
            >
              {credentialList.length > 1 && (
                <div className="text-sm font-medium text-ink">
                  Account {index + 1}
                  {entry.name ? ` - ${entry.name}` : ""}
                </div>
              )}

              {entry.username && (
                <div>
                  <label className="block text-subtle text-sm mb-2">Username</label>
                  <div className="flex items-center gap-2 bg-surface p-3 rounded-control border border-line-strong">
                    <input
                      type="text"
                      value={entry.username}
                      readOnly
                      className="input flex-1"
                    />
                    <button
                      onClick={() => copyToClipboard(entry.username, `username-${index}`)}
                      className="text-subtle hover:text-brand transition-colors"
                    >
                      <FaCopy />
                    </button>
                  </div>
                  {copied === `username-${index}` && (
                    <p className="text-success text-xs mt-1">Copied!</p>
                  )}
                </div>
              )}

              {entry.email && (
                <div>
                  <label className="block text-subtle text-sm mb-2">Email</label>
                  <div className="flex items-center gap-2 bg-surface p-3 rounded-control border border-line-strong">
                    <input
                      type="text"
                      value={entry.email}
                      readOnly
                      className="input flex-1"
                    />
                    <button
                      onClick={() => copyToClipboard(entry.email, `email-${index}`)}
                      className="text-subtle hover:text-brand transition-colors"
                    >
                      <FaCopy />
                    </button>
                  </div>
                  {copied === `email-${index}` && (
                    <p className="text-success text-xs mt-1">Copied!</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-subtle text-sm mb-2">Password</label>
                <div className="flex items-center gap-2 bg-surface p-3 rounded-control border border-line-strong">
                  <input
                    type={passwordVisible ? "text" : "password"}
                    value={entry.password}
                    readOnly
                    className="input flex-1"
                  />
                  <button
                    onClick={() => setPasswordVisible(!passwordVisible)}
                    className="text-subtle hover:text-brand transition-colors"
                  >
                    {passwordVisible ? <FaEyeSlash /> : <FaEye />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(entry.password, `password-${index}`)}
                    className="text-subtle hover:text-brand transition-colors"
                  >
                    <FaCopy />
                  </button>
                </div>
                {copied === `password-${index}` && (
                  <p className="text-success text-xs mt-1">Copied!</p>
                )}
              </div>
            </div>
          ))}

          <div className="bg-warning-soft border border-warning-line p-3 rounded-control text-warning text-sm">
            Share these credentials securely. Passwords are not recoverable.
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={downloadCredentials}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <FaDownload /> Download
            </button>
            <button
              onClick={onClose}
              className="btn btn-primary flex-1 font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
