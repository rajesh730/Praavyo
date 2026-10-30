// Inline loading indicator. Inherits the current text colour, so it matches
// whatever button or surface it sits on.
export default function Spinner({ className = "" }) {
  return <span role="status" aria-label="Loading" className={`spinner ${className}`} />;
}
