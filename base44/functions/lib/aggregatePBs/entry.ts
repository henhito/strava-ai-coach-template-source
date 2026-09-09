/**
 * Normalizes distance names to a consistent, lowercase format.
 * E.g., "Half-Marathon", "half marathon" -> "half marathon"
 * @param {string} name
 * @returns {string}
 */
export const canonicalName = (name) => {
  const nameStr = String(name || '').trim().toLowerCase();
  const canonicalMap = {
    '400m': '400m',
    '800m': '800m',
    '1k': '1k',
    '1/2 mile': '1/2 mile',
    '0.5 mi': '1/2 mile',
    '1 mile': '1 mile',
    '1 mi': '1 mile',
    '1mile': '1 mile',
    '2 mile': '2 miles', // Corrected to '2 miles'
    '2 mi': '2 miles',
    '2mile': '2 miles',
    '5k': '5k',
    '10k': '10k',
    '15k': '15k',
    '10 mile': '10 miles',
    '10 mi': '10 miles',
    '10mile': '10 miles',
    '20k': '20k',
    'half marathon': 'half marathon',
    'half-marathon': 'half marathon',
    '30k': '30k',
    'marathon': 'marathon',
    'full marathon': 'marathon',
    '40k': '40k',
    '50k': '50k',
    '50 mile': '50 miles',
    '50 mi': '50 miles',
    '50mile': '50 miles',
    '100k': '100k',
    '100 mile': '100 miles',
    '100 mi': '100 miles',
    '100mile': '100 miles',
  };
  return canonicalMap[nameStr] || nameStr;
};

/**
 * Groups and ranks best efforts from a flat list.
 * @param {Array<object>} efforts - Array of effort objects.
 * @param {object} options - Configuration options.
 * @param {number} [options.topN=3] - Number of top efforts to return per group.
 * @returns {Map<string, Array<object>>} - A map where keys are "activityType:canonicalDistance"
 *                                        and values are arrays of top efforts.
 */
export const aggregatePBs = (efforts, { topN = 3 } = {}) => {
  if (!efforts || !Array.isArray(efforts)) {
    return new Map();
  }

  const grouped = new Map();

  // 1. Group efforts by activity type and canonical distance name
  for (const effort of efforts) {
    if (!effort || !effort.distance_name || !effort.activity_type) {
      continue;
    }
    const key = `${effort.activity_type}:${canonicalName(effort.distance_name)}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(effort);
  }

  // 2. Sort each group by time and slice to get the top N
  for (const [key, group] of grouped.entries()) {
    const sortedGroup = group.sort((a, b) => {
      const timeA = a.elapsed_time_s ?? Infinity;
      const timeB = b.elapsed_time_s ?? Infinity;
      if (timeA === timeB) {
        const dateA = new Date(a.activity_date || 0).getTime();
        const dateB = new Date(b.activity_date || 0).getTime();
        return dateB - dateA; // If times are equal, prefer newer activity
      }
      return timeA - timeB;
    });
    grouped.set(key, sortedGroup.slice(0, topN));
  }

  return grouped;
};