// ==========================================
// 1. WEB APP SETUP
// ==========================================
function doGet(e) {
  if (e && e.parameter && e.parameter.widget === '1') {
    const d = getWidgetData();
    return ContentService
      .createTextOutput(JSON.stringify(d || {}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Redirect to Cloudflare Pages dashboard
  return HtmlService.createHtmlOutput(
    '<html><body><script>window.location.href="https://my-dashboard-255.pages.dev";</script></body></html>'
  );
}

// ==========================================
// 2. FETCH DATA FOR THE DASHBOARD
// ==========================================
function getDashboardData() {
  const ss = SpreadsheetApp.openById("1b52-JwOtAj-n3BHOMTMr7_RJIAcayp7O9Og7CoAa8KQ");
  const sheet = ss.getSheetByName('Profile') || ss.getSheetByName('Profile ');
  if (!sheet) return null;

  const profileData = sheet.getRange('C3:C10').getValues();
  const monthlyFoodBudget = parseFloat(String(profileData[0][0]).replace(/[^0-9.]/g, '')) || 0;
  const caloriesGoal = parseFloat(profileData[1][0]) || 0;
  const proteinGoal = parseFloat(profileData[2][0]) || 0;
  const carbsGoal = parseFloat(profileData[3][0]) || 0;
  const fatGoal = parseFloat(profileData[4][0]) || 0;
  const monthlySocialBudget = parseFloat(String(profileData[5][0]).replace(/[^0-9.]/g, '')) || 0;
  const monthlyPetrolBudget = parseFloat(String(profileData[6][0]).replace(/[^0-9.]/g, '')) || 0;
  const foodToSocialReallocation = parseFloat(String(profileData[7][0]).replace(/[^0-9.]/g, '')) || 0;

  const macroData = sheet.getRange('L2:L16').getValues();
  const macroNum = (idx) => parseFloat(String(macroData[idx][0]).replace(/[^0-9.]/g, '')) || 0;

  const now = new Date();
  const tz = "Asia/Singapore";
  const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  
  // Month boundaries in SGT
  const year = parseInt(Utilities.formatDate(now, tz, "yyyy"));
  const month = parseInt(Utilities.formatDate(now, tz, "MM")) - 1; // 0-indexed
  const monthStart = new Date(Date.UTC(year, month, 1) - 8 * 3600000);
  const monthEnd = new Date(Date.UTC(year, month + 1, 1) - 8 * 3600000);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = parseInt(Utilities.formatDate(now, tz, "d"));
  const daysLeft = daysInMonth - dayOfMonth + 1;

  // Sum food spend this month
  const expSheet = ss.getSheetByName('Expenses');
  let thisMonthFood = 0, todayFood = 0, thisMonthSocial = 0, thisMonthPetrol = 0;
  
  if (expSheet) {
    const lastRow = expSheet.getLastRow();
    if (lastRow > 1) {
      const data = expSheet.getRange(2, 1, lastRow - 1, 6).getValues();
      for (const row of data) {
        const rawDate = row[0];
        if (!rawDate) continue;
        const rowDate = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
        if (rowDate < monthStart || rowDate >= monthEnd) continue;
        
        const category = (row[5] || '').toString().trim().toLowerCase();
        const amount = parseFloat(row[2]) || 0;
        const rowDateStr = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");

        if (category === 'food') {
          thisMonthFood += amount;
          if (rowDateStr === todayStr) todayFood += amount;
        } else if (category === 'petrol' || category === 'motorcycle') {
          thisMonthPetrol += amount;
        } else if (category !== 'allowance') {
          thisMonthSocial += amount;
        }
      }
    }
  }

  const foodBudgetRemaining = monthlyFoodBudget - thisMonthFood;
  const foodDailyBudget = daysLeft > 0 ? foodBudgetRemaining / daysLeft : foodBudgetRemaining;

  return {
    caloriesActual: macroNum(0),
    caloriesGoal: caloriesGoal,
    proteinActual: macroNum(1),
    proteinGoal: proteinGoal,
    carbsActual: macroNum(2),
    carbsGoal: carbsGoal,
    fatActual: macroNum(3),
    fatGoal: fatGoal,
    foodBudgetBase: monthlyFoodBudget,
    foodBudgetRemaining: foodBudgetRemaining - foodToSocialReallocation,
    foodDailyBudget: foodDailyBudget,
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
    foodToSocialReallocation: foodToSocialReallocation
  };
}

function getWidgetData() {
  return getDashboardData();
}

// ==========================================
// 3. HISTORY DATA FUNCTIONS
// ==========================================
function getCaloriesHistory() {
  const ss = SpreadsheetApp.openById("1b52-JwOtAj-n3BHOMTMr7_RJIAcayp7O9Og7CoAa8KQ");
  const sheet = ss.getSheetByName('Calories Tracking');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const tz = "Asia/Singapore";
  return data
    .filter(r => r[0])
    .map(r => ({
      dateTime: r[0] ? Utilities.formatDate(new Date(r[0]), tz, "yyyy-MM-dd HH:mm") : '',
      type: r[1] || '',
      item: r[2] || '',
      calories: parseFloat(r[3]) || 0,
      date: r[4] ? r[4].toString().substring(0, 10) : '',
      note: r[5] || '',
      protein: parseFloat(r[6]) || 0,
      carbs: parseFloat(r[7]) || 0,
      fat: parseFloat(r[8]) || 0
    }))
    .reverse();
}

function getExpensesHistory() {
  const ss = SpreadsheetApp.openById("1b52-JwOtAj-n3BHOMTMr7_RJIAcayp7O9Og7CoAa8KQ");
  const sheet = ss.getSheetByName('Expenses');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const tz = "Asia/Singapore";
  return data
    .filter(r => r[0])
    .map(r => ({
      dateTime: r[0] ? Utilities.formatDate(new Date(r[0]), tz, "yyyy-MM-dd HH:mm") : '',
      item: r[1] || '',
      amount: parseFloat(r[2]) || 0,
      paymentMethod: r[3] || '',
      details: r[4] || '',
      category: r[5] || ''
    }))
    .reverse();
}

// ==========================================
// 4. DOPOST FUNCTION
// ==========================================
function doPost(e) {
  const ss = SpreadsheetApp.openById("1b52-JwOtAj-n3BHOMTMr7_RJIAcayp7O9Og7CoAa8KQ");
  const sheet = ss.getSheetByName("Expenses");
  
  if (!sheet) {
    return ContentService.createTextOutput("Error: Sheet tab not found").setMimeType(ContentService.MimeType.TEXT);
  }
  
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput("Error: Invalid JSON").setMimeType(ContentService.MimeType.TEXT);
  }
  
  const timestamp = new Date();
  const formattedDT = Utilities.formatDate(timestamp, "GMT+8", "yyyy-MM-dd HH:mm:ss");
  const uniqueId = data.uid || "exp_" + Math.random().toString(36).substr(2, 9);
  
  const row = [
    formattedDT, 
    data.item || "Unknown", 
    data.amount || 0, 
    data.paymentMethod || "DBS", 
    data.details || "", 
    data.category || "Variable", 
    uniqueId
  ];
  
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  
  return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
}
