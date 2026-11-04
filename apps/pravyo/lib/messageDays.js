import { formatParentDate } from "@/lib/parentFormat";

/**
 * A conversation's messages with a day divider before each new day
 * ("Today", "Yesterday", "Monday", "12 Oct"), the way phone chat apps read.
 * Returns [{ type: "day", key, label } | { type: "message", key, message }].
 */
export function withDayBreaks(messages = []) {
  const items = [];
  let lastDay = "";
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const day = Number.isNaN(date.getTime())
      ? ""
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (day && day !== lastDay) {
      items.push({ type: "day", key: `day-${day}`, label: formatParentDate(date, { relative: true }) });
      lastDay = day;
    }
    items.push({ type: "message", key: message.id, message });
  }
  return items;
}
