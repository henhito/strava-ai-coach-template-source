import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Config ─────────────────────────────────────────────────────
const SCAN_PAGE_SIZE = 500;          // rows per page fetch
const SCAN_PAGES_PER_RUN = 3;        // pages per scan invocation (1500 rows / call)
const DELETE_BATCH_SIZE = 200;       // deletes per invocation
const MINI_BATCH = 20;
const MINI_DELAY_MS = 100;
const ID_CHUNK_SIZE = 500;           // max ids stored per Cache record (avoid oversized fields)

// ── Helpers ────────────────────────────────────────────────────
function asStr(v) { return v == null ? '' : String(v).trim(); }
function getStravaId(a) {
  const raw = a?.raw_data || {};
  return asStr(a?.strava_id ?? raw?.id ?? null) || null;
}
function fieldCount(a) {
  return Object.values(a || {}).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).length;
}
function tsMs(v) { const t = Date.parse(asStr(v)); return isFinite(t) ? t : 0; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findDuplicatesInGroups(groups, excludeLastSid) {
  const toDelete = [];
  for (const [sid, rows] of Object.entries(groups)) {
    if (sid === excludeLastSid || rows.length <= 1) continue;
    const sorted = [...rows].sort((a, b) => {
      const fd = (b.fc || 0) - (a.fc || 0);
      return fd !== 0 ? fd : tsMs(a.cd) - tsMs(b.cd);
    });
    for (const r of sorted.slice(1)) if (r.id) toDelete.push(r.id);
  }
  return toDelete;
}

async function cacheGet(base44, key) {
  const items = await base44.asServiceRole.entities.Cache.filter({ cache_key: key }, '-created_date', 1);
  return Array.isArray(items) ? (items[0] ?? null) : null;
}
async function cacheSet(base44, key, value, existing) {
  const expires_at = new Date(Date.now() + 7 * 86400_000).toISOString();
  if (existing?.id) {
    await base44.asServiceRole.entities.Cache.update(existing.id, { value, expires_at });
  } else {
    await base44.asServiceRole.entities.Cache.create({ cache_key: key, value, expires_at });
  }
}
async function cacheDel(base44, id) {
  await base44.asServiceRole.entities.Cache.delete(id).catch(() => {});
}

async function fetchPage(base44, offset) {
  let rows;
  try { rows = await base44.asServiceRole.entities.Activity.list('strava_id', SCAN_PAGE_SIZE, offset); } catch {}
  if (!rows?.length) {
    try { rows = await base44.entities.Activity.list('strava_id', SCAN_PAGE_SIZE, offset); } catch {}
  }
  return Array.isArray(rows) ? rows : [];
}

async function deleteActivity(base44, id) {
  try { await base44.asServiceRole.entities.Activity.delete(id); return true; } catch {}
  try { await base44.entities.Activity.delete(id); return true; } catch {}
  return false;
}

// ── Chunked ID queue (avoids storing huge arrays in one Cache record) ──
function metaKey(jobId) { return `dup_meta_${jobId}`; }
function chunkKey(jobId, idx) { return `dup_ids_${jobId}_${idx}`; }
const EMPTY_META = { totalChunks: 0, lastChunkLen: 0, cursorChunk: 0, cursorPos: 0, totalIds: 0 };

async function appendIds(base44, jobId, metaRec, meta, newIds) {
  if (!newIds.length) return { meta, metaRec };
  let idx = 0;
  while (idx < newIds.length) {
    if (meta.totalChunks === 0 || meta.lastChunkLen >= ID_CHUNK_SIZE) {
      meta.totalChunks += 1;
      meta.lastChunkLen = 0;
    }
    const chunkIdx = meta.totalChunks - 1;
    const space = ID_CHUNK_SIZE - meta.lastChunkLen;
    const toAdd = newIds.slice(idx, idx + space);
    const chunkRec = meta.lastChunkLen > 0 ? await cacheGet(base44, chunkKey(jobId, chunkIdx)) : null;
    const existingIds = chunkRec?.value?.ids ?? [];
    const updatedIds = [...existingIds, ...toAdd];
    await cacheSet(base44, chunkKey(jobId, chunkIdx), { ids: updatedIds }, chunkRec);
    meta.lastChunkLen = updatedIds.length;
    idx += toAdd.length;
  }
  meta.totalIds += newIds.length;
  await cacheSet(base44, metaKey(jobId), meta, metaRec);
  return { meta };
}

async function popIds(base44, jobId, meta, count) {
  const results = [];
  while (results.length < count && meta.cursorChunk < meta.totalChunks) {
    const chunkRec = await cacheGet(base44, chunkKey(jobId, meta.cursorChunk));
    const ids = chunkRec?.value?.ids ?? [];
    const remainingInChunk = ids.slice(meta.cursorPos);
    const need = count - results.length;
    const take = remainingInChunk.slice(0, need);
    results.push(...take);
    meta.cursorPos += take.length;
    if (meta.cursorPos >= ids.length) {
      if (chunkRec?.id) await cacheDel(base44, chunkRec.id);
      meta.cursorChunk += 1;
      meta.cursorPos = 0;
    }
  }
  return results;
}

async function cleanupJobCache(base44, jobId) {
  try {
    const [sc, metaRec] = await Promise.all([
      cacheGet(base44, `dup_scan_${jobId}`),
      cacheGet(base44, metaKey(jobId)),
    ]);
    if (sc) await cacheDel(base44, sc.id);
    const totalChunks = metaRec?.value?.totalChunks ?? 0;
    for (let i = 0; i < totalChunks; i++) {
      const rec = await cacheGet(base44, chunkKey(jobId, i));
      if (rec) await cacheDel(base44, rec.id);
    }
    if (metaRec) await cacheDel(base44, metaRec.id);
  } catch (e) {
    console.log('[cleanupJobCache] best-effort cleanup error:', e?.message);
  }
}

// ── Main ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405 });

    const base44 = createClientFromRequest(req);
    const authUser = await base44.auth.me().catch(() => null);
    if (!authUser) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';

    // ── STATUS ────────────────────────────────────────────────
    if (action === 'status') {
      const jobs = await base44.entities.CleanupJob.filter({ job_type: 'duplicate_activities' }, '-created_date', 1);
      const job = Array.isArray(jobs) ? (jobs[0] ?? null) : null;
      return Response.json({ success: true, job });
    }

    // ── STOP ──────────────────────────────────────────────────
    if (action === 'stop') {
      const jobs = await base44.entities.CleanupJob.filter({ job_type: 'duplicate_activities' }, '-created_date', 1);
      const job = Array.isArray(jobs) ? (jobs[0] ?? null) : null;
      if (!job) return Response.json({ success: false, error: 'No active job.' });
      await base44.entities.CleanupJob.update(job.id, { status: 'stopped', request_stop: true });
      return Response.json({ success: true, job: { ...job, status: 'stopped' } });
    }

    // ── RESET ─────────────────────────────────────────────────
    if (action === 'reset') {
      const jobs = await base44.entities.CleanupJob.filter({ job_type: 'duplicate_activities' }, '-created_date', 10).catch(() => []);
      for (const j of (Array.isArray(jobs) ? jobs : [])) {
        await cleanupJobCache(base44, j.id);
        await base44.entities.CleanupJob.delete(j.id).catch(() => {});
      }
      return Response.json({ success: true, message: 'All jobs cleared. Ready to start fresh.' });
    }

    // ── DRY RUN ───────────────────────────────────────────────
    if (action === 'dryrun') {
      console.log('[Worker] Dry run — counting duplicates...');
      const counts = {};
      let totalRows = 0;
      for (let p = 0; p < 30; p++) {
        const page = await fetchPage(base44, p * SCAN_PAGE_SIZE);
        for (const a of page) {
          const sid = getStravaId(a);
          if (sid) counts[sid] = (counts[sid] || 0) + 1;
        }
        totalRows += page.length;
        if (page.length < SCAN_PAGE_SIZE) break;
      }
      const duplicateCount = Object.values(counts).reduce((s, c) => s + Math.max(0, c - 1), 0);
      const isPartial = totalRows >= 30 * SCAN_PAGE_SIZE;
      return Response.json({ success: true, totalRows, duplicateCount, isPartial });
    }

    // ── START / CONTINUE ──────────────────────────────────────
    const existingJobs = await base44.entities.CleanupJob.filter({ job_type: 'duplicate_activities' }, '-created_date', 1);
    const existingJob = Array.isArray(existingJobs) ? (existingJobs[0] ?? null) : null;

    const isResume = existingJob && (existingJob.status === 'scanning' || existingJob.status === 'deleting');
    let job = existingJob;

    if (!isResume) {
      if (job) {
        await cleanupJobCache(base44, job.id);
        await base44.entities.CleanupJob.delete(job.id).catch(() => {});
      }
      job = await base44.entities.CleanupJob.create({
        job_type: 'duplicate_activities',
        status: 'scanning',
        total_duplicates: 0,
        deleted_count: 0,
        started_at: new Date().toISOString(),
      });
    }

    const scanKey = `dup_scan_${job.id}`;

    // ── SCANNING PHASE ────────────────────────────────────────
    if (job.status === 'scanning') {
      const [scanRec, metaRec] = await Promise.all([cacheGet(base44, scanKey), cacheGet(base44, metaKey(job.id))]);
      const scanState = scanRec?.value ?? { offset: 0, boundary: null };
      let meta = metaRec?.value ?? { ...EMPTY_META };

      let { offset, boundary } = scanState;
      const newDeleteIds = [];
      let doneScanning = false;

      for (let p = 0; p < SCAN_PAGES_PER_RUN; p++) {
        const page = await fetchPage(base44, offset);
        if (!page.length) { doneScanning = true; break; }

        const groups = {};
        if (boundary?.sid) {
          groups[boundary.sid] = [...(boundary.rows || [])];
        }
        for (const a of page) {
          const sid = getStravaId(a);
          if (!sid) continue;
          const m = { id: a.id, fc: fieldCount(a), cd: a.created_date, sid };
          if (!groups[sid]) groups[sid] = [];
          groups[sid].push(m);
        }

        const lastSid = getStravaId(page[page.length - 1]);
        doneScanning = page.length < SCAN_PAGE_SIZE;

        if (doneScanning) {
          newDeleteIds.push(...findDuplicatesInGroups(groups, null));
          boundary = null;
        } else {
          newDeleteIds.push(...findDuplicatesInGroups(groups, lastSid));
          boundary = { sid: lastSid, rows: groups[lastSid] ?? [] };
        }

        offset += page.length;
        if (doneScanning) break;
      }

      const { meta: updatedMeta } = await appendIds(base44, job.id, metaRec, meta, newDeleteIds);
      meta = updatedMeta;

      const newStatus = doneScanning ? 'deleting' : 'scanning';

      await Promise.all([
        cacheSet(base44, scanKey, { offset, boundary }, scanRec),
        base44.entities.CleanupJob.update(job.id, { status: newStatus, total_duplicates: meta.totalIds }),
      ]);

      console.log(`[Worker] Scan chunk done. offset=${offset}, found=${meta.totalIds} total dupes, doneScanning=${doneScanning}`);
      return Response.json({
        success: true,
        hasMore: true,
        job: { ...job, status: newStatus, total_duplicates: meta.totalIds, deleted_count: job.deleted_count || 0 },
      });
    }

    // ── DELETING PHASE ────────────────────────────────────────
    if (job.status === 'deleting') {
      const metaRec = await cacheGet(base44, metaKey(job.id));
      if (!metaRec && (job.total_duplicates || 0) > 0) {
        return Response.json({ success: false, error: 'Lost track of pending duplicates. Please reset and restart.' });
      }
      let meta = metaRec?.value ?? { ...EMPTY_META };

      if (meta.cursorChunk >= meta.totalChunks) {
        await base44.entities.CleanupJob.update(job.id, { status: 'completed', completed_at: new Date().toISOString() });
        const updatedJob = await base44.entities.CleanupJob.get(job.id);
        return Response.json({ success: true, job: updatedJob, hasMore: false });
      }

      const batch = await popIds(base44, job.id, meta, DELETE_BATCH_SIZE);

      let deleted = 0;
      for (let i = 0; i < batch.length; i += MINI_BATCH) {
        const mini = batch.slice(i, i + MINI_BATCH);
        const results = await Promise.all(mini.map(id => deleteActivity(base44, id)));
        deleted += results.filter(Boolean).length;
        if (i + MINI_BATCH < batch.length) await sleep(MINI_DELAY_MS);
      }

      await cacheSet(base44, metaKey(job.id), meta, metaRec);

      const newDeletedCount = (job.deleted_count || 0) + deleted;
      const isComplete = meta.cursorChunk >= meta.totalChunks;

      await base44.entities.CleanupJob.update(job.id, {
        status: isComplete ? 'completed' : 'deleting',
        deleted_count: newDeletedCount,
        total_duplicates: job.total_duplicates || 0,
        ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
      });

      const updatedJob = await base44.entities.CleanupJob.get(job.id);
      console.log(`[Worker] Delete batch done. deleted=${newDeletedCount}, isComplete=${isComplete}`);
      return Response.json({ success: true, job: updatedJob, hasMore: !isComplete, deletedThisBatch: deleted });
    }

    return Response.json({ success: false, error: `Unexpected job status: ${job?.status}` });

  } catch (error) {
    console.error('[runDuplicateCleanupWorker] fatal', error);
    return Response.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
});