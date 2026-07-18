import { SHEET_ID, getAccessToken, sheetValues, json } from "./_shared.js";

const TZ = "Asia/Singapore";

function fmtDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function onRequestGet({ env, request }) {
  const CACHE_KEY = "goals";
  const CACHE_TTL = 300;

  const bust = new URL(request.url).searchParams.get("refresh");
  if (!bust && env.CACHE) {
    const cached = await env.CACHE.get(CACHE_KEY);
    if (cached) return json(JSON.parse(cached));
  }

  try {
    const token = await getAccessToken(env);
    const [goalRows, progressRows] = await Promise.all([
      sheetValues(token, SHEET_ID, "Goals!A2:G"),
      sheetValues(token, SHEET_ID, "Goal Progress!A:D"),
    ]);

    const parseGoal = (r) => ({
      id: r[0] || "",
      created: r[1] || "",
      category: r[2] || "",
      type: r[3] || "",
      title: r[4] || "",
      target: r[5] || "",
      unit: r[6] || "",
      status: r[7] || "Active",
    });

    const parseProgress = (r) => ({
      date: r[0] || "",
      goalId: r[1] || "",
      value: parseFloat(r[2]) || 0,
      note: r[3] || "",
    });

    const goals = goalRows.filter(r => r[0]).map(parseGoal);
    const progress = progressRows.filter(r => r[0]).map(parseProgress);

    // Group progress by goal
    const byGoal = {};
    progress.forEach(p => {
      if (!byGoal[p.goalId]) byGoal[p.goalId] = [];
      byGoal[p.goalId].push(p);
    });

    // Calculate today's progress for each goal
    const today = fmtDate(new Date());
    goals.forEach(g => {
      g.todayValue = 0;
      g.todayNote = "";
      g.totalEntries = byGoal[g.id]?.length || 0;
      g.lastEntry = byGoal[g.id]?.[0]?.date || "";

      if (g.type === "Daily" && byGoal[g.id]) {
        const todayEntry = byGoal[g.id].find(p => p.date === today);
        if (todayEntry) {
          g.todayValue = todayEntry.value;
          g.todayNote = todayEntry.note;
          g.todayCleared = todayEntry.value >= parseFloat(g.target) || g.status === "Completed";
        }
      }
    });

    const result = { goals, progress };

    if (env.CACHE) {
      await env.CACHE.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    }

    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, id, value, note, type } = body;

    const token = await getAccessToken(env);

    if (action === "clear") {
      // Mark a daily goal as cleared for today
      const today = fmtDate(new Date());
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Goal%20Progress:A`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[today, id, parseFloat(value) || 0, note || "Cleared"]],
        }),
      });
      if (!res.ok) return json({ error: `Sheet error: ${await res.text()}` }, 500);
      return json({ success: true });
    }

    if (action === "complete") {
      // Mark a goal as completed
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Goals!G${parseInt(id) + 2}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["Completed"]] }),
      });
      if (!res.ok) return json({ error: `Sheet error: ${await res.text()}` }, 500);
      return json({ success: true });
    }

    if (action === "create") {
      const goalId = "goal_" + Date.now();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Goals:A`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[goalId, fmtDate(new Date()), body.category || "", body.type || "Daily", body.title || "", body.target || "", body.unit || "", "Active"]],
        }),
      });
      if (!res.ok) return json({ error: `Sheet error: ${await res.text()}` }, 500);
      return json({ success: true, id: goalId });
    }

    if (action === "delete") {
      // Delete a goal
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Goals!A${parseInt(id) + 2}:G${parseInt(id) + 2}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return json({ error: `Sheet error: ${await res.text()}` }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
