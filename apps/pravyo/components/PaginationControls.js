export default function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  start,
  end,
}) {
  if (totalPages <= 1) return null;

  const goToPage = (page) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    onPageChange(nextPage);
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-col items-center justify-between gap-2 border-t border-line pt-3 sm:flex-row"
    >
      <p className="text-sm text-muted">
        {typeof totalItems === "number" ? (
          <>
            Showing{" "}
            <span className="font-semibold text-ink">{start || 0}</span>
            {" - "}
            <span className="font-semibold text-ink">{end || 0}</span>
            {" of "}
            <span className="font-semibold text-ink">{totalItems}</span>
          </>
        ) : (
          <>
            Page{" "}
            <span className="font-semibold text-ink">{currentPage}</span>{" "}
            of{" "}
            <span className="font-semibold text-ink">{totalPages}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="btn btn-secondary btn-sm"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="btn btn-secondary btn-sm"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
