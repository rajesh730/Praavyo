/**
 * Upload validation for the CSV import screens.
 */

export const validateFile = (file, options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedTypes = ["text/csv", "application/vnd.ms-excel"],
  } = options;

  if (!file) return "File is required";
  if (file.size > maxSize)
    return `File must be smaller than ${maxSize / 1024 / 1024}MB`;
  if (!allowedTypes.includes(file.type) && !file.name.endsWith(".csv")) {
    return "Only CSV files are allowed";
  }
  return null;
};
