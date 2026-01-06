/**
 * Dialogue Splitter - Automatically splits dialogue-heavy shots into multiple takes
 *
 * Uses 150 WPM speech rate to calculate dialogue duration and splits at natural
 * break points (speaker changes, sentence boundaries) when dialogue exceeds
 * what fits in a single Veo generation (max 8 seconds).
 */

const WPM = 150;
const PAUSE_BETWEEN_SPEAKERS = 0.5; // seconds
const ACTION_BUFFER = 1.0; // seconds for visual establishment before dialogue
const MAX_TAKE_DURATION = 8; // Veo max regular duration
const USABLE_DIALOGUE_TIME = MAX_TAKE_DURATION - ACTION_BUFFER; // ~7 seconds

/**
 * Calculate the duration of a single dialogue line based on word count
 * @param {string} text - The dialogue text
 * @returns {number} Duration in seconds
 */
function calculateLineDuration(text) {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  return (wordCount / WPM) * 60;
}

/**
 * Estimate total dialogue duration including pauses between speakers
 * @param {Array<{speaker: string, text: string}>} dialogue - Array of dialogue lines
 * @returns {number} Total duration in seconds
 */
function estimateDialogueDuration(dialogue) {
  if (!dialogue || dialogue.length === 0) return 0;

  const speakTime = dialogue.reduce((sum, line) => {
    return sum + calculateLineDuration(line.text);
  }, 0);

  // Add pauses between different speakers
  let pauses = 0;
  for (let i = 1; i < dialogue.length; i++) {
    if (dialogue[i].speaker !== dialogue[i - 1].speaker) {
      pauses += PAUSE_BETWEEN_SPEAKERS;
    }
  }

  return speakTime + pauses;
}

/**
 * Check if a shot needs to be split into multiple takes
 * @param {Object} shot - Shot object with dialogue array and duration_target
 * @returns {boolean} True if splitting is needed
 */
function needsSplitting(shot) {
  if (!shot.dialogue || shot.dialogue.length === 0) return false;

  const dialogueDuration = estimateDialogueDuration(shot.dialogue);
  const requiredDuration = dialogueDuration + ACTION_BUFFER;
  const availableDuration = shot.duration_target || MAX_TAKE_DURATION;

  return requiredDuration > availableDuration;
}

/**
 * Find the best Veo duration (4, 6, or 8 seconds) for a given dialogue duration
 * @param {number} dialogueDuration - Duration of dialogue in seconds
 * @param {boolean} isLastTake - Whether this is the last take (can be shorter)
 * @returns {number} Veo duration (4, 6, or 8)
 */
function selectTakeDuration(dialogueDuration, isLastTake = false) {
  const needed = dialogueDuration + ACTION_BUFFER;

  if (needed <= 4) return 4;
  if (needed <= 6) return 6;
  return 8;
}

/**
 * Partition dialogue lines into takes based on duration constraints
 * Prefers breaking at speaker changes when capacity is over 60%
 * @param {Array<{speaker: string, text: string, mood?: string}>} dialogue
 * @param {number} maxDialoguePerTake - Max dialogue seconds per take (default ~7s)
 * @returns {Array<{lines: Array, estimatedDuration: number}>}
 */
function partitionDialogue(dialogue, maxDialoguePerTake = USABLE_DIALOGUE_TIME) {
  if (!dialogue || dialogue.length === 0) return [];

  const takes = [];
  let currentTake = { lines: [], estimatedDuration: 0 };

  for (let i = 0; i < dialogue.length; i++) {
    const line = dialogue[i];
    const lineDuration = calculateLineDuration(line.text);

    // Check if we need a pause (speaker change from previous line in current take)
    const needsPause = currentTake.lines.length > 0 &&
      currentTake.lines[currentTake.lines.length - 1].speaker !== line.speaker;
    const pauseTime = needsPause ? PAUSE_BETWEEN_SPEAKERS : 0;

    const projectedDuration = currentTake.estimatedDuration + lineDuration + pauseTime;

    // Check if adding this line would exceed capacity
    if (projectedDuration > maxDialoguePerTake && currentTake.lines.length > 0) {
      // Commit current take and start new one
      takes.push(currentTake);
      currentTake = { lines: [line], estimatedDuration: lineDuration };
    } else {
      // Add line to current take
      currentTake.lines.push(line);
      currentTake.estimatedDuration = projectedDuration;
    }

    // Check for natural break point at speaker changes
    if (i < dialogue.length - 1) {
      const nextLine = dialogue[i + 1];
      const isSpeakerChange = line.speaker !== nextLine.speaker;
      const isOverThreshold = currentTake.estimatedDuration >= maxDialoguePerTake * 0.6;

      if (isSpeakerChange && isOverThreshold) {
        // Good break point: speaker change and we're over 60% capacity
        takes.push(currentTake);
        currentTake = { lines: [], estimatedDuration: 0 };
      }
    }
  }

  // Don't forget the last take
  if (currentTake.lines.length > 0) {
    takes.push(currentTake);
  }

  return takes;
}

/**
 * Generate action hints for each take based on position and speakers
 * @param {Object} shot - Original shot object
 * @param {Array<{lines: Array}>} takePartitions - Partitioned dialogue
 * @returns {Array<string>} Action hints for each take
 */
function generateActionHints(shot, takePartitions) {
  const baseDescription = shot.description || '';

  return takePartitions.map((take, index) => {
    const isFirst = index === 0;
    const isLast = index === takePartitions.length - 1;
    const speakers = [...new Set(take.lines.map(l => l.speaker))];
    const speakerList = speakers.join(' and ');

    if (takePartitions.length === 1) {
      return baseDescription;
    }

    if (isFirst) {
      return `${baseDescription} ${speakerList} begins speaking.`;
    } else if (isLast) {
      return `Continuing the conversation. ${speakerList} concludes the dialogue. Maintain visual continuity from previous shot.`;
    } else {
      return `Continuing the conversation. ${speakerList} speaks. Maintain visual continuity from previous shot.`;
    }
  });
}

/**
 * Generate a complete take plan for a shot
 * @param {Object} shot - Shot object with dialogue, description, duration_target, etc.
 * @returns {Array<{dialogue_lines: Array, duration: number, action_hint: string, is_first: boolean, is_last: boolean}>|null}
 *          Returns null if no splitting needed, otherwise array of take plans
 */
function generateTakePlan(shot) {
  // If no dialogue or doesn't need splitting, return null (use single take)
  if (!shot.dialogue || shot.dialogue.length === 0) {
    return null;
  }

  if (!needsSplitting(shot)) {
    return null;
  }

  // Partition dialogue into takes
  const partitions = partitionDialogue(shot.dialogue);

  if (partitions.length <= 1) {
    return null; // Single partition means no split needed
  }

  // Generate action hints for each take
  const actionHints = generateActionHints(shot, partitions);

  // Build take plans
  return partitions.map((partition, index) => {
    const isFirst = index === 0;
    const isLast = index === partitions.length - 1;

    return {
      dialogue_lines: partition.lines,
      duration: selectTakeDuration(partition.estimatedDuration, isLast),
      action_hint: actionHints[index],
      is_first: isFirst,
      is_last: isLast,
      estimated_dialogue_seconds: partition.estimatedDuration
    };
  });
}

/**
 * Estimate how many takes a shot will require (for validation/preview)
 * @param {Object} shot - Shot object with dialogue
 * @returns {number} Estimated take count (1 if no splitting needed)
 */
function estimateTakeCount(shot) {
  const plan = generateTakePlan(shot);
  return plan ? plan.length : 1;
}

/**
 * Get a summary of the split plan for logging/debugging
 * @param {Object} shot - Shot object
 * @returns {Object} Summary with take count, durations, and dialogue distribution
 */
function getSplitSummary(shot) {
  const plan = generateTakePlan(shot);

  if (!plan) {
    return {
      needsSplit: false,
      takeCount: 1,
      totalDialogueDuration: estimateDialogueDuration(shot.dialogue || []),
      takes: null
    };
  }

  return {
    needsSplit: true,
    takeCount: plan.length,
    totalDialogueDuration: estimateDialogueDuration(shot.dialogue),
    takes: plan.map((take, i) => ({
      takeNumber: i + 1,
      duration: take.duration,
      dialogueSeconds: take.estimated_dialogue_seconds,
      lineCount: take.dialogue_lines.length,
      speakers: [...new Set(take.dialogue_lines.map(l => l.speaker))]
    }))
  };
}

module.exports = {
  // Core functions
  calculateLineDuration,
  estimateDialogueDuration,
  needsSplitting,
  partitionDialogue,
  generateTakePlan,

  // Utilities
  estimateTakeCount,
  getSplitSummary,
  selectTakeDuration,
  generateActionHints,

  // Constants (for external use if needed)
  WPM,
  PAUSE_BETWEEN_SPEAKERS,
  ACTION_BUFFER,
  MAX_TAKE_DURATION,
  USABLE_DIALOGUE_TIME
};
