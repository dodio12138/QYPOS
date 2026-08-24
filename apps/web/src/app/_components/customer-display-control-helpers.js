export const POS_LOTTERY_FEEDBACK_MS = 15_000;

export function nextPosLotteryFeedback(tracker = {}, lottery = null) {
  const drawId = lottery?.draw_id || null;
  if (!tracker.initialized) {
    return {
      tracker: { initialized: true, seenDrawId: drawId },
      feedback: null
    };
  }
  if (drawId && drawId !== tracker.seenDrawId) {
    return {
      tracker: { initialized: true, seenDrawId: drawId },
      feedback: lottery
    };
  }
  return {
    tracker: { initialized: true, seenDrawId: tracker.seenDrawId || drawId },
    feedback: null
  };
}
