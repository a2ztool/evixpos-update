import * as React from "react";

/** Parse a "Task Card" message body to extract title. */
export const parseTaskTitle = (msg: string): string | null => {
  if (!msg) return null;
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.title) return parsed.title;
  } catch { /* fallthrough */ }
  const subscriptionMatch = msg.match(/\*\*Subscription:\*\*\s*(.+)/);
  if (subscriptionMatch?.[1]) return subscriptionMatch[1].trim();
  const titleMatch = msg.match(/\*\*Title:\*\*\s*(.+)/);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  return null;
};

/** Render a chat message string with @mentions highlighted. */
export const renderWithMentions = (text: string): React.ReactNode => {
  if (!text) return text;
  const parts = text.split(/(@[\w.\-]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@") && p.length > 1) {
      return (
        <span
          key={i}
          className="inline-flex items-center px-1 py-0 rounded bg-primary/15 text-primary font-medium"
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
};
