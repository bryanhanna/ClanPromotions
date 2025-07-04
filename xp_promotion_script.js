// Required Libraries
const { google } = require('googleapis');
const axios = require('axios');
const { JWT } = require('google-auth-library');

// ==== CONFIGURATION ====
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const SHEET_NAME = 'Sheet1';
const CREDENTIALS = require('./credentials.json'); // Google service account key
const USER_AGENT = 'bryanh0590';
const API_KEY = 'YOUR_WISE_OLD_MAN_API_KEY';
const GROUP_ID = 6371; // Replace with your group ID
const RATE_LIMIT_DELAY = 3000; // 3 seconds to avoid rate limit

// Rank requirements
const RANKS = [
  { name: 'Thief', months: 0, xp: 0 },
  { name: 'Recruit', months: 1, xp: 0.1 },
  { name: 'Corporal', months: 2, xp: 0.5 },
  { name: 'Sergeant', months: 3, xp: 1 },
  { name: 'Lieutenant', months: 4, xp: 2 },
  { name: 'Captain', months: 5, xp: 3 },
  { name: 'General', months: 6, xp: 8 },
  { name: 'Officer', months: 9, xp: 12 },
  { name: 'Commander', months: 12, xp: 20 },
  { name: 'Colonel', months: 15, xp: 25 },
  { name: 'Brigadier', months: 17, xp: 30 },
  { name: 'Admiral', months: 20, xp: 50 },
  { name: 'Marshall', months: 24, xp: 75 }
];

// Authorize Google Sheets API
async function authorize() {
  const auth = new JWT({
    email: CREDENTIALS.client_email,
    key: CREDENTIALS.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

// Get XP gained from WOM API
async function getXpGained(username, joinDate) {
  const startDate = new Date(joinDate).toISOString();
  const endDate = new Date().toISOString();

  try {
    const res = await axios.get(
      `https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}/gained`,
      {
        headers: {
          'x-api-key': API_KEY,
          'user-agent': USER_AGENT
        },
        params: { startDate, endDate }
      }
    );

    return res.data?.data?.skills?.overall?.experience?.gained || 0;
  } catch (err) {
    console.error(`Error fetching XP for ${username}:`, err.response?.data || err.message);
    return null;
  }
}

// Determine correct rank
function determineRank(monthsInClan, xpGained) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (monthsInClan >= RANKS[i].months && xpGained >= RANKS[i].xp * 1e6) {
      return RANKS[i].name;
    }
  }
  return 'Thief';
}

// Main logic
async function run() {
  const sheets = await authorize();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:D`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }

  for (let i = 0; i < rows.length; i++) {
    const [rsn, , joinDate] = rows[i];
    if (!rsn || !joinDate) continue;

    const monthsInClan = (new Date().getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    const xpGained = await getXpGained(rsn, joinDate);
    if (xpGained === null) continue;

    const recommendedRank = determineRank(monthsInClan, xpGained);

    // Update column E (XP Gained) and F (Recommended Rank)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!E${i + 2}:F${i + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[xpGained, recommendedRank]]
      }
    });

    console.log(`${rsn}: ${xpGained} XP, Suggest ${recommendedRank}`);
    await new Promise(res => setTimeout(res, RATE_LIMIT_DELAY));
  }

  console.log('Finished XP and promotion check.');
}

run().catch(console.error);
