export default function EventListCard({ children, accent = "blue" }) {
  const hoverBorder =
    accent === "purple" ? "hover:border-brand-line" : "hover:border-brand-line";

  return (
    <article
      className={`card overflow-hidden transition-colors ${hoverBorder} `}
    >
      {children}
    </article>
  );
}
