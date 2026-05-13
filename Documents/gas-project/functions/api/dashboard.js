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

export async function onRequestGet({ env }) {
  try {
    const token = await getAccessToken(env);

    const [profileRows, expRows, reallocationRow, macroRows] = await Promise.all([
      sheetValues(token, SHEET_ID, "Profile !C3:C9"),
      sheetValues(token, SHEET_ID, "Expenses!A2:F"),
      sheetValues(token, SHEET_ID, "Profile !C10:C10"),
      sheetValues(token, SHEET_ID, "Profile !L2:L16"),
    ]);

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

    const monthStart = new Date(Date.UTC(year, month, 1) - 8 * 3600000);
    const monthEnd = new Date(Date.UTC(year, month + 1, 1) - 8 * 3600000);

    let thisMonthFood = 0,
      todayFood = 0,
      thisMonthSocial = 0,
      thisMonthPetrol = 0;

    for (const row of expRows) {
      if (!row[0]) continue;
      const rowDateStr = String(row[0]).substring(0, 10);
      const d = new Date(row[0]);
      if (d < monthStart || d >= monthEnd) continue;
      const category = (row[5] || "").trim().toLowerCase();
      const amount = parseFloat(row[2]) || 0;

      if (category === "food") {
        thisMonthFood += amount;
        if (rowDateStr === todayStr) todayFood += amount;
      } else if (category === "petrol" || category === "motorcycle") {
        thisMonthPetrol += amount;
      } else if (category !== "allowance") {
        thisMonthSocial += amount;
      }
    }

    const foodBudgetRemaining = monthlyFoodBudget - thisMonthFood;
    const foodDailyBudget = daysLeft > 0 ? foodBudgetRemaining / daysLeft : foodBudgetRemaining;

    // Calculate unspent food budget from past days this month
    const daysPassedThisMonth = day - 1;
    const avgDailyBudget = daysInMonth > 0 ? monthlyFoodBudget / daysInMonth : 0;
    const expectedSpendSoFar = avgDailyBudget * daysPassedThisMonth;
    const actualSpendPastDays = thisMonthFood - todayFood;
    const unspentPastDays = Math.max(0, expectedSpendSoFar - actualSpendPastDays);

    return json({
      caloriesActual: macroNum(0),
      caloriesGoal,
      proteinActual: macroNum(1),
      proteinGoal,
      carbsActual: macroNum(2),
      carbsGoal,
      fatActual: macroNum(3),
      fatGoal,
      foodBudgetBase: monthlyFoodBudget,
      foodBudgetRemaining: foodBudgetRemaining - foodToSocialReallocation,
      foodDailyBudget,
      foodTodaySpend: todayFood,
      foodDailyRemaining: foodDailyBudget - todayFood,
      foodWeeklyBudget: macroNum(10), // L12
      foodWeeklyRemaining: macroNum(4), // L6
      socialBudget: monthlySocialBudget - thisMonthSocial + foodToSocialReallocation,
      socialBudgetBase: monthlySocialBudget,
      socialWeeklyBudget: macroNum(11), // L13
      socialWeeklyRemaining: macroNum(13), // L15
      petrolBudget: monthlyPetrolBudget - thisMonthPetrol,
      petrolBudgetBase: monthlyPetrolBudget,
      petrolWeeklyBudget: macroNum(12), // L14
      petrolWeeklyRemaining: macroNum(14), // L16
      unspentFoodPastDays: foodToSocialReallocation > 0 ? 0 : unspentPastDays,
      foodToSocialReallocation,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
