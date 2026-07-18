import { SHEET_ID, getAccessToken, sheetValues, json } from "./_shared.js";

const TZ = "Asia/Singapore";

function sgtNow() {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const parts = todayStr.split('-');
  return {
    year: parseInt(parts[0]),
    month: parseInt(parts[1]) - 1,
    day: parseInt(parts[2]),
    todayStr: todayStr,
  };
}

export async function onRequestGet({ env, request }) {
  const CACHE_KEY = "dashboard_v4";
  const CACHE_TTL = 120; // 2 minutes

  const url = new URL(request.url);
  const bust = url.searchParams.get("refresh");

  if (!bust && env.CACHE) {
    const cached = await env.CACHE.get(CACHE_KEY);
    if (cached) return json(JSON.parse(cached));
  }

  try {
    const token = await getAccessToken(env);

    const [profileRows, expRows, archiveExpRows, reallocationRow, macroRows, shoppingRows, goalRows] = await Promise.all([
      sheetValues(token, SHEET_ID, "Profile !C3:C9"),
      sheetValues(token, SHEET_ID, "Expenses!A2:F"),
      sheetValues(token, SHEET_ID, "Archive_Expenses!A2:F"),
      sheetValues(token, SHEET_ID, "Profile !C10:C10"),
      sheetValues(token, SHEET_ID, "Profile !L2:L16"),
      sheetValues(token, SHEET_ID, "Profile !C11:C12"),
      sheetValues(token, SHEET_ID, "Goals!A2:H"),
    ]);

    const allExpRows = [...expRows, ...archiveExpRows];

    const num = (rows, idx) =>
      parseFloat(String((rows[idx] || [])[0] || "0").replace(/[^0-9.]/g, "")) || 0;

    const monthlyFoodBudget = num(profileRows, 0);
    const caloriesGoal = num(profileRows, 1);
    const proteinGoal = num(profileRows, 2);
    const carbsGoal = num(profileRows, 3);
    const fatGoal = num(profileRows, 4);
    const monthlySocialBudget = num(profileRows, 5);
    const monthlyPetrolBudget = num(profileRows, 6);
    const foodToSocialReallocation = num(reallocationRow, 0);

    const macroNum = (idx) =>
      parseFloat(String((macroRows[idx] || [])[0] || "0").replace(/[^0-9.]/g, "")) || 0;

    const { year, month, day, todayStr } = sgtNow();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysLeft = daysInMonth - day + 1;

    // Month boundaries as "yyyy-MM" prefix strings — avoids UTC/SGT parse ambiguity
    const thisMonthPrefix = `${String(year)}-${String(month + 1).padStart(2, "0")}`;

    let thisMonthFood = 0,
      todayFood = 0,
      thisMonthSocial = 0,
      thisMonthPetrol = 0,
      extraIncome = 0;
    const socialBreakdown = {};

    for (const row of allExpRows) {
      if (!row[0]) continue;
      // Dates in sheet are stored as "yyyy-MM-dd HH:mm:ss" in SGT — use string prefix to avoid timezone issues
      const rowDateStr = String(row[0]).substring(0, 10);
      if (!rowDateStr.startsWith(thisMonthPrefix)) continue;
      const category = (row[5] || "").trim();
      const catLower = category.toLowerCase();
      const item = (row[1] || "").toLowerCase();
      const amount = parseFloat(row[2]) || 0;

      if (item.includes("reallocation") || item.includes("budget transfer")) continue;

      // Negative amounts = reimbursements / extra income
      if (amount < 0) {
        extraIncome += Math.abs(amount);
        continue;
      }

      if (catLower === "food") {
        thisMonthFood += amount;
        if (rowDateStr === todayStr) todayFood += amount;
      } else if (catLower === "petrol" || catLower === "motorcycle") {
        thisMonthPetrol += amount;
      } else if (catLower === "social" || catLower === "shopping") {
        thisMonthSocial += amount;
        socialBreakdown[category] = (socialBreakdown[category] || 0) + amount;
      }
    }

    const foodExtraIncome   = 0;
    const socialExtraIncome = extraIncome;

    const foodBudgetRemainingTotal = monthlyFoodBudget - thisMonthFood;
    const foodDailyBudget = daysLeft > 0 ? foodBudgetRemainingTotal / daysLeft : foodBudgetRemainingTotal;
    const availableToAllocate = Math.max(0, foodBudgetRemainingTotal - foodToSocialReallocation);

    // Pace tracking — use total budget (base + extra income) so reimbursements are factored in
    const foodBudgetTotalForPace   = monthlyFoodBudget + foodExtraIncome;
    const socialBudgetTotalForPace = monthlySocialBudget + socialExtraIncome;
    const foodPaceExpected   = daysInMonth > 0 ? (foodBudgetTotalForPace   / daysInMonth) * day : 0;
    const socialPaceExpected = daysInMonth > 0 ? (socialBudgetTotalForPace / daysInMonth) * day : 0;
    const foodOnTrack   = thisMonthFood   <= foodPaceExpected;
    const socialOnTrack = thisMonthSocial <= socialPaceExpected;

    const result = {
      caloriesActual: macroNum(0),
      caloriesGoal,
      proteinActual: macroNum(1),
      proteinGoal,
      carbsActual: macroNum(2),
      carbsGoal,
      fatActual: macroNum(3),
      fatGoal,
      foodBudgetBase: monthlyFoodBudget,
      foodExtraIncome,
      foodBudgetTotal: monthlyFoodBudget + foodExtraIncome,
      foodBudgetRemaining: foodBudgetRemainingTotal,
      foodDailyBudget,
      foodTodaySpend: todayFood,
      foodDailyRemaining: foodDailyBudget - todayFood,
      foodWeeklyBudget: macroNum(10),
      foodWeeklyRemaining: macroNum(4),
      socialBudget: monthlySocialBudget + socialExtraIncome - thisMonthSocial + foodToSocialReallocation,
      socialBudgetBase: monthlySocialBudget,
      socialExtraIncome,
      socialBudgetTotal: monthlySocialBudget + socialExtraIncome,
      socialBreakdown,
      socialWeeklyBudget: macroNum(11),
      socialWeeklyRemaining: macroNum(13),
      petrolBudget: monthlyPetrolBudget - thisMonthPetrol,
      petrolBudgetBase: monthlyPetrolBudget,
      petrolWeeklyBudget: macroNum(12),
      petrolWeeklyRemaining: macroNum(14),
      unspentFoodPastDays: availableToAllocate,
      foodToSocialReallocation,
      extraIncome,
      foodMonthlySpend: thisMonthFood,
      foodPaceExpected,
      foodOnTrack,
      socialMonthlySpend: thisMonthSocial,
      socialPaceExpected,
      socialOnTrack,
      goals: goalRows.filter(r => r[0]).map(r => ({
        id: r[0] || '',
        created: r[1] || '',
        category: r[2] || '',
        type: r[3] || '',
        title: r[4] || '',
        target: r[5] || '',
        unit: r[6] || '',
        status: r[7] || 'Active',
        todayValue: 0,
        todayCleared: false,
      })),
    };

    if (env.CACHE) {
      await env.CACHE.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    }

    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
