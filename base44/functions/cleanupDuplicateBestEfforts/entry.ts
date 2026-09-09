import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const canonicalName = (name) => {
    const nameStr = String(name || "").trim().toLowerCase();
    const map = {
        "400m": "400m", "800m": "800m", "1000m": "1k", "1k": "1k", "1 mile": "1 mile", "1 mi": "1 mile",
        "2 miles": "2 mile", "2 mile": "2 mile", "2 mi": "2 mile", "5k": "5k", "10k": "10k", "15k": "15k", "20k": "20k",
        "10 miles": "10 mile", "10 mile": "10 mile", "10 mi": "10 mile",
        "half marathon": "half marathon", "marathon": "marathon", "50k": "50k", "100k": "100k",
        "50 miles": "50 mile", "50 mile": "50 mile", "50 mi": "50 mile",
        "100 miles": "100 mile", "100 mile": "100 mile", "100 mi": "100 mile",
        "__import_complete__": "__import_complete__",
        "__import_complete_run__": "__import_complete_run__",
        "__import_complete_ride__": "__import_complete_ride__"
    };
    return map[nameStr] || nameStr;
};

const normalizeActivityId = (v) => String(v ?? "").trim();
const createUniqueKey = (effort) => {
    const activityId = normalizeActivityId(effort.activity_id_norm || effort.activity_id);
    const distanceName = effort.distance_name_canon || effort.distance_name;
    const activityType = String(effort.activity_type || "").trim();
    return `${activityType}|${activityId}|${canonicalName(distanceName)}`;
};

// Function to determine which record is better
const isBetter = (a, b) => {
    if (String(a.distance_name_canon || '').startsWith('__import_complete')) {
        return new Date(a.created_date) > new Date(b.created_date) ? a : b;
    }
    const aElapsed = Number(a.elapsed_time_s);
    const bElapsed = Number(b.elapsed_time_s);
    if (aElapsed !== bElapsed) {
        return aElapsed < bElapsed ? a : b;
    }
    const aRank = Number(a.rank || 999);
    const bRank = Number(b.rank || 999);
    if (aRank !== bRank) {
        return aRank < bRank ? a : b;
    }
    return new Date(a.updated_date) > new Date(b.updated_date) ? a : b;
};


Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });

    try {
        const { dry_run = true } = await req.json().catch(() => ({}));
        console.log(`[CLEANUP] Starting... Dry run: ${dry_run}`);

        const BestEffort = base44.asServiceRole.entities.BestEffort;

        const allEfforts = [];
        let offset = 0;
        while (true) {
            const batch = await BestEffort.filter({}, '-created_date', 1000, offset);
            if (!batch || batch.length === 0) break;
            allEfforts.push(...batch);
            offset += batch.length;
            if (batch.length < 1000) break;
        }
        console.log(`[CLEANUP] Scanned ${allEfforts.length} total effort records.`);

        const toUpdate = [];
        const toDelete = new Set();
        const duplicates = new Map();

        // First pass: compute keys and group duplicates
        for (const effort of allEfforts) {
            const distName = effort.distance_name_canon || effort.distance_name;
            const key = createUniqueKey(effort);

            if (!effort.activity_distance_key || effort.activity_distance_key !== key) {
                toUpdate.push({ id: effort.id, data: { activity_distance_key: key, distance_name_canon: canonicalName(distName) } });
            }

            if (duplicates.has(key)) {
                duplicates.get(key).push(effort);
            } else {
                duplicates.set(key, [effort]);
            }
        }

        // Second pass: identify which duplicates to delete
        for (const [key, records] of duplicates.entries()) {
            if (records.length > 1) {
                let best = records[0];
                for (let i = 1; i < records.length; i++) {
                    best = isBetter(best, records[i]);
                }
                for (const record of records) {
                    if (record.id !== best.id) {
                        toDelete.add(record.id);
                    }
                }
            }
        }

        const deleteIds = Array.from(toDelete);
        console.log(`[CLEANUP] Planned actions: ${toUpdate.length} updates, ${deleteIds.length} deletions.`);

        if (!dry_run) {
            console.log(`[CLEANUP] Executing DB operations...`);
            const MINI_BATCH = 20;
            const MINI_DELAY_MS = 100;
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            let updatedCount = 0;
            let deletedCount = 0;

            // Update keys in mini-batches (20 concurrent) with short pauses
            for (let i = 0; i < toUpdate.length; i += MINI_BATCH) {
                const mini = toUpdate.slice(i, i + MINI_BATCH);
                await Promise.all(mini.map(upd => BestEffort.update(upd.id, upd.data).catch(() => {})));
                updatedCount += mini.length;
                if (i + MINI_BATCH < toUpdate.length) await sleep(MINI_DELAY_MS);
            }
            console.log(`[CLEANUP] Updated ${updatedCount}/${toUpdate.length} records.`);

            // Delete duplicates in mini-batches (20 concurrent) with short pauses
            for (let i = 0; i < deleteIds.length; i += MINI_BATCH) {
                const mini = deleteIds.slice(i, i + MINI_BATCH);
                await Promise.all(mini.map(id => BestEffort.delete(id).catch(() => {})));
                deletedCount += mini.length;
                if (i + MINI_BATCH < deleteIds.length) await sleep(MINI_DELAY_MS);
            }
            console.log(`[CLEANUP] Deleted ${deletedCount}/${deleteIds.length} records.`);
            console.log('[CLEANUP] DB operations complete.');
        }

        return Response.json({
            success: true,
            dry_run,
            summary: {
                total_records_scanned: allEfforts.length,
                records_to_update_key: toUpdate.length,
                duplicate_records_to_delete: deleteIds.length,
            },
            updates_planned: toUpdate.map(u => u.id),
            deletions_planned: deleteIds,
        });

    } catch (error) {
        console.error("Cleanup error:", error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});