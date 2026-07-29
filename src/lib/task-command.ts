export type ParsedTaskCommand = {
  title: string;
  mention: string | null;
};

/**
 * Detect `/task` commands. Mention + `/task` + title can appear in any order.
 * Examples:
 *   /task @user1 do this task
 *   @user1 /task do this task
 *   /task do this task @user1
 */
export function parseTaskCommand(input: string): ParsedTaskCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const taskToken = /(^|\s)\/task(?=\s|$)/i;
  if (!taskToken.test(trimmed)) return null;

  let rest = trimmed.replace(taskToken, " ").replace(/\s+/g, " ").trim();

  const mentionMatch = rest.match(/@([a-zA-Z0-9._-]+)/);
  const mention = mentionMatch?.[1]?.toLowerCase() ?? null;
  if (mentionMatch) {
    rest = rest.replace(mentionMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Drop any extra @mentions from the title remnant
  rest = rest.replace(/@([a-zA-Z0-9._-]+)/g, " ").replace(/\s+/g, " ").trim();

  if (!rest) {
    return { title: "", mention };
  }

  return { title: rest, mention };
}

export function matchesMentionHandle(
  handle: string,
  user: { name: string; email: string },
): boolean {
  const normalized = handle.toLowerCase();
  const emailLocal = user.email.split("@")[0]?.toLowerCase() ?? "";
  const nameCompact = user.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameUnderscore = user.name.toLowerCase().replace(/\s+/g, "_");

  return (
    emailLocal === normalized ||
    nameCompact === normalized ||
    nameUnderscore === normalized
  );
}

/** True when the message is a leave command (`/leave`), optionally with extra whitespace. */
export function isLeaveCommand(input: string): boolean {
  return /^\s*\/leave\s*$/i.test(input);
}
