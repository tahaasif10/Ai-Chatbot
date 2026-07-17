export const MESSAGE_LIMIT_PER_HOUR = 20;
export const TOKEN_LIMIT_PER_DAY = 50000;

const TOKEN_CHARACTER_RATIO = 4;

export function estimateTokens(text) {
  if (typeof text !== "string" || !text.trim()) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / TOKEN_CHARACTER_RATIO));
}

export function estimateMessageTokens(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((total, message) => {
    const attachmentTokens = Array.isArray(message?.attachments)
      ? message.attachments.reduce((sum, attachment) => {
          return sum + estimateTokens(attachment?.extractedText || "");
        }, 0)
      : 0;

    return total + estimateTokens(message?.content || "") + attachmentTokens;
  }, 0);
}

export async function getCurrentUsage(supabase, userId) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: messageCount, error: messageError }, { data, error: tokenError }] =
    await Promise.all([
      supabase
        .from("user_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo),
      supabase
        .from("user_usage_log")
        .select("tokens_used")
        .eq("user_id", userId)
        .gte("created_at", oneDayAgo),
    ]);

  if (messageError) {
    throw messageError;
  }

  if (tokenError) {
    throw tokenError;
  }

  const totalTokensUsed = (data || []).reduce((total, row) => {
    const tokensUsed = Number(row.tokens_used) || 0;
    return total + tokensUsed;
  }, 0);

  return {
    messageCount: messageCount || 0,
    totalTokensUsed,
  };
}

export async function checkRateLimits(supabase, userId) {
  const usage = await getCurrentUsage(supabase, userId);

  return {
    ...usage,
    isMessageLimitExceeded: usage.messageCount >= MESSAGE_LIMIT_PER_HOUR,
    isTokenLimitExceeded: usage.totalTokensUsed >= TOKEN_LIMIT_PER_DAY,
  };
}

export async function logUserUsage(supabase, userId, tokensUsed) {
  const safeTokensUsed = Math.max(0, Math.ceil(Number(tokensUsed) || 0));

  const { error } = await supabase.from("user_usage_log").insert({
    user_id: userId,
    tokens_used: safeTokensUsed,
  });

  if (error) {
    throw error;
  }
}
