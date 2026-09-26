function logScrapeAttempt({
  productId,
  selectedOption,
  attempt,
  stage,
  success,
  error,
  durationMs,
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    productId: productId ? String(productId) : null,
    selectedOption: selectedOption || null,
    attempt: Number(attempt) || 1,
    stage: stage || 'unknown',
    success: Boolean(success),
    durationMs: Number(durationMs) || 0,
  };

  if (error) {
    entry.error = String(error);
  }

  console.log(JSON.stringify(entry));
}

module.exports = {
  logScrapeAttempt,
};
