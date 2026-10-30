"use client";

import { useState } from "react";
import { ChevronDown as FaChevronDown, Search as FaSearch, X as FaTimes } from "lucide-react";

export default function SearchableDropdown({
  options = [],
  value,
  onChange,
  placeholder = "Select option",
  searchable = true,
  disabled = false,
  error = null,
  showType = false,
  allowCustom = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOptions = searchable
    ? options.filter((option) =>
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const selectedOption = options.find((opt) => opt.name === value);
  const hasSearchValue = searchTerm.trim().length > 0;

  const handleSelect = (optionName) => {
    onChange(optionName);
    setIsOpen(false);
    setSearchTerm("");
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className="relative">
      <div
        className={`
          card p-3 cursor-pointer flex justify-between items-center transition-colors text-ink
          ${
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:border-brand"
          }
          ${error ? "border-danger" : "border-line-strong"}
          ${isOpen ? "border-brand" : ""}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex-1 flex items-center">
          {selectedOption ? (
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-ink">{selectedOption.name}</span>
                {showType && selectedOption.type && (
                  <span className="text-muted text-sm ml-2">
                    ({selectedOption.type})
                  </span>
                )}
                {selectedOption.nepaliName && (
                  <span className="text-muted text-sm ml-2">
                    - {selectedOption.nepaliName}
                  </span>
                )}
              </div>
              {!disabled && (
                <button
                  onClick={clearSelection}
                  className="text-muted hover:text-brand-strong ml-2"
                  type="button"
                >
                  <FaTimes className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : value ? (
            <span className="text-ink">{value}</span>
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </div>
        <FaChevronDown
          className={`h-4 w-4 text-muted transition-colors ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {isOpen && !disabled && (
        <div className="card absolute z-50 w-full mt-1 overflow-hidden shadow-pop max-h-64">
          {searchable && (
            <div className="p-3 border-b border-line">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted h-4 w-4" />
                <input
                  type="text"
                  className="input w-full pl-10 pr-4"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.id}
                  className="p-3 hover:bg-surface cursor-pointer transition-colors border-b border-line last:border-b-0"
                  onClick={() => handleSelect(option.name)}
                >
                  <div className="font-medium text-ink">{option.name}</div>
                  {showType && option.type && (
                    <div className="text-sm text-muted mt-1">
                      {option.type}
                    </div>
                  )}
                  {option.nepaliName && (
                    <div className="text-sm text-muted mt-1">
                      {option.nepaliName}
                    </div>
                  )}
                </div>
              ))
            ) : allowCustom && hasSearchValue ? (
              <button
                type="button"
                className="w-full p-3 text-left text-sm font-semibold text-brand-strong hover:bg-surface"
                onClick={() => handleSelect(searchTerm.trim())}
              >
                Use &quot;{searchTerm.trim()}&quot;
              </button>
            ) : (
              <div className="p-4 text-muted text-center">
                No options found
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-danger text-sm mt-1">{error}</p>}
    </div>
  );
}
