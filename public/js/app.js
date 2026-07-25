// ---------- Storage (profile/logs live in the browser - no database) ----------
const KEYS = { profile: "fitTrackProfile", food: "fitTrackFood", activity: "fitTrackActivity" };

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let profile = load(KEYS.profile, null);
let foodLogs = load(KEYS.food, []);
let activityLogs = load(KEYS.activity, []);

// ---------- Fitness math ----------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcBMI(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}
function bmiCategory(bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}
// Mifflin-St Jeor equation
function calcBMR({ weightKg, heightCm, age, gender }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "female" ? base - 161 : base + 5);
}
function calcDailyGoal(p) {
  const bmr = calcBMR(p);
  const maintenance = Math.round(bmr * 1.375); // light activity multiplier, kept simple on purpose
  const adjust = { lose: -0.15, maintain: 0, gain: 0.15 }[p.goal] || 0;
  const goal = Math.round(maintenance * (1 + adjust));
  return { bmr, maintenance, goal };
}

const MET_TABLE = {
  walking: 3.5,
  running: 9.8,
  cycling: 7.5,
  swimming: 8.0,
  yoga: 2.5,
  weight_training: 5.0,
  hiit: 8.5,
  dancing: 5.5,
};
const ACTIVITY_EMOJI = {
  walking: "🚶",
  running: "🏃",
  cycling: "🚴",
  swimming: "🏊",
  yoga: "🧘",
  weight_training: "🏋️",
  hiit: "🔥",
  dancing: "💃",
};
function calcCaloriesBurned(activityType, minutes, weightKg) {
  const met = MET_TABLE[activityType] || 4;
  return Math.round((met * 3.5 * weightKg) / 200 * minutes);
}

// ---------- Small UI helpers ----------
function showToast(message, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast show" + (type === "error" ? " error" : "");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${name}`));
  if (name === "dashboard") renderDashboard();
  if (name === "food") renderFood();
  if (name === "activity") renderActivity();
  if (name === "profile") renderProfileForm();
}

// ---------- Onboarding gate ----------
function hasCompleteProfile() {
  return profile && profile.age && profile.heightCm && profile.weightKg && profile.goal;
}

function renderGate() {
  document.getElementById("mainApp").style.display = hasCompleteProfile() ? "block" : "none";
  document.getElementById("onboardGate").style.display = hasCompleteProfile() ? "none" : "block";
}

// ---------- Dashboard ----------
function renderDashboard() {
  if (!hasCompleteProfile()) return;
  const date = todayStr();
  const { goal } = calcDailyGoal(profile);
  const bmi = calcBMI(profile.weightKg, profile.heightCm);

  const consumed = foodLogs.filter((f) => f.date === date).reduce((s, f) => s + f.calories, 0);
  const burned = activityLogs.filter((a) => a.date === date).reduce((s, a) => s + a.caloriesBurned, 0);
  const net = consumed - burned;
  const pct = Math.min(100, Math.round((net / goal) * 100));

  document.getElementById("dashGreeting").textContent = `Hi ${profile.name || "there"} 👋`;
  document.getElementById("dashGoal").textContent = `${goal} kcal`;
  document.getElementById("dashConsumed").textContent = consumed;
  document.getElementById("dashBurned").textContent = burned;
  document.getElementById("dashNet").textContent = net;
  document.getElementById("dashBar").style.width = `${Math.max(0, pct)}%`;

  renderBmiScale(bmi);
  renderWeeklyChart();
}

// ---------- BMI scale ----------
// Maps a BMI value onto a fixed 15-35 visual range and slides the marker
// (▲) to that position along the colored Underweight/Normal/Overweight/Obese bar.
function renderBmiScale(bmi) {
  const MIN_BMI = 15;
  const MAX_BMI = 35;
  const pct = Math.max(0, Math.min(100, ((bmi - MIN_BMI) / (MAX_BMI - MIN_BMI)) * 100));

  const marker = document.getElementById("bmiMarker");
  marker.style.left = `${pct}%`;

  const category = bmiCategory(bmi);
  const emoji = { Underweight: "🔵", Normal: "🟢", Overweight: "🟠", Obese: "🔴" }[category] || "";

  document.getElementById("dashBmiValue").textContent = bmi;
  document.getElementById("dashBmiCategory").textContent = `${emoji} ${category}`;
}

// ---------- Weekly charts (plain inline SVG - no charting library needed) ----------
function lastNDates(n) {
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}
function shortDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
}

function renderWeeklyChart() {
  const dates = lastNDates(7);
  const eaten = dates.map((d) => foodLogs.filter((f) => f.date === d).reduce((s, f) => s + f.calories, 0));
  const burned = dates.map((d) => activityLogs.filter((a) => a.date === d).reduce((s, a) => s + a.caloriesBurned, 0));

  const width = 320, height = 130, padBottom = 18, padTop = 6;
  const maxVal = Math.max(1, ...eaten, ...burned);
  const groupWidth = width / dates.length;
  const barWidth = groupWidth / 3.2;

  let bars = "";
  dates.forEach((d, i) => {
    const cx = i * groupWidth + groupWidth / 2;
    const eatenH = ((height - padBottom - padTop) * eaten[i]) / maxVal;
    const burnedH = ((height - padBottom - padTop) * burned[i]) / maxVal;

    bars += `<rect x="${cx - barWidth - 2}" y="${height - padBottom - eatenH}" width="${barWidth}" height="${eatenH}" rx="2" fill="var(--growth)"></rect>`;
    bars += `<rect x="${cx + 2}" y="${height - padBottom - burnedH}" width="${barWidth}" height="${burnedH}" rx="2" fill="#f5a623"></rect>`;
    bars += `<text x="${cx}" y="${height - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${shortDayLabel(d)}</text>`;
  });

  document.getElementById("weeklyChart").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">${bars}</svg>`;
}

function renderWeeklyBurnedChart() {
  const el = document.getElementById("weeklyBurnedChart");
  if (!el) return;

  const dates = lastNDates(7);
  const burned = dates.map((d) => activityLogs.filter((a) => a.date === d).reduce((s, a) => s + a.caloriesBurned, 0));

  const width = 320, height = 120, padBottom = 18, padTop = 6;
  const maxVal = Math.max(1, ...burned);
  const groupWidth = width / dates.length;
  const barWidth = groupWidth * 0.5;

  let bars = "";
  dates.forEach((d, i) => {
    const cx = i * groupWidth + groupWidth / 2;
    const h = ((height - padBottom - padTop) * burned[i]) / maxVal;
    bars += `<rect x="${cx - barWidth / 2}" y="${height - padBottom - h}" width="${barWidth}" height="${h}" rx="2" fill="#f5a623"></rect>`;
    bars += `<text x="${cx}" y="${height - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${shortDayLabel(d)}</text>`;
  });

  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">${bars}</svg>`;
}

// ---------- Food ----------
const MEAL_EMOJI = { breakfast: "🌅", lunch: "☀️", dinner: "🌙" };

function renderFood() {
  const date = todayStr();
  const list = document.getElementById("foodList");
  const todays = foodLogs.filter((f) => f.date === date).sort((a, b) => a.id - b.id);

  list.innerHTML = "";
  if (todays.length === 0) {
    list.innerHTML = `<div class="empty-note">No food logged today yet.</div>`;
    return;
  }
  todays.forEach((f) => {
    const row = document.createElement("div");
    row.className = "log-item";
    row.innerHTML = `
      <div>
        <div class="name">${f.foodName}</div>
        <div class="meta">${MEAL_EMOJI[f.mealType] || ""} ${f.mealType}${f.source === "ai" ? " · 🤖 AI estimate" : ""}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="cals">${f.calories} kcal</div>
        <button class="remove" data-id="${f.id}">&times;</button>
      </div>`;
    row.querySelector(".remove").addEventListener("click", () => {
      foodLogs = foodLogs.filter((x) => x.id !== f.id);
      save(KEYS.food, foodLogs);
      renderFood();
      renderDashboard();
    });
    list.appendChild(row);
  });
}

function addFoodEntry({ foodName, calories, mealType, source }) {
  const entry = { id: Date.now(), foodName, calories: Number(calories), mealType, date: todayStr(), source: source || "manual" };
  foodLogs.push(entry);
  save(KEYS.food, foodLogs);
  renderFood();
  renderDashboard();
}

// ---------- Activity ----------
function renderActivity() {
  const date = todayStr();
  const list = document.getElementById("activityList");
  const todays = activityLogs.filter((a) => a.date === date).sort((a, b) => a.id - b.id);
  renderWeeklyBurnedChart();

  list.innerHTML = "";
  if (todays.length === 0) {
    list.innerHTML = `<div class="empty-note">No activity logged today yet.</div>`;
    return;
  }
  todays.forEach((a) => {
    const row = document.createElement("div");
    row.className = "log-item";
    row.innerHTML = `
      <div>
        <div class="name">${ACTIVITY_EMOJI[a.activityType] || "🏋️"} ${a.activityType.replace("_", " ")}</div>
        <div class="meta">${a.durationMinutes} min</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="cals">${a.caloriesBurned} kcal</div>
        <button class="remove" data-id="${a.id}">&times;</button>
      </div>`;
    row.querySelector(".remove").addEventListener("click", () => {
      activityLogs = activityLogs.filter((x) => x.id !== a.id);
      save(KEYS.activity, activityLogs);
      renderActivity();
      renderDashboard();
    });
    list.appendChild(row);
  });
}

// ---------- Profile form (shared by onboarding gate + Profile tab) ----------
function fillProfileForm(prefix) {
  if (!profile) return;
  document.getElementById(`${prefix}Name`).value = profile.name || "";
  document.getElementById(`${prefix}Age`).value = profile.age || "";
  document.getElementById(`${prefix}Gender`).value = profile.gender || "female";
  document.getElementById(`${prefix}Height`).value = profile.heightCm || "";
  document.getElementById(`${prefix}Weight`).value = profile.weightKg || "";
  document.querySelectorAll(`#${prefix}GoalPills .goal-pill`).forEach((p) => {
    p.classList.toggle("selected", p.dataset.goal === profile.goal);
  });
}

function renderProfileForm() {
  fillProfileForm("profile");
}

function wireGoalPills(prefix) {
  document.querySelectorAll(`#${prefix}GoalPills .goal-pill`).forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(`#${prefix}GoalPills .goal-pill`).forEach((p) => p.classList.remove("selected"));
      pill.classList.add("selected");
    });
  });
}
function selectedGoal(prefix) {
  const el = document.querySelector(`#${prefix}GoalPills .goal-pill.selected`);
  return el ? el.dataset.goal : null;
}

function saveProfileFromForm(prefix, errorElId) {
  const name = document.getElementById(`${prefix}Name`).value.trim();
  const age = Number(document.getElementById(`${prefix}Age`).value);
  const gender = document.getElementById(`${prefix}Gender`).value;
  const heightCm = Number(document.getElementById(`${prefix}Height`).value);
  const weightKg = Number(document.getElementById(`${prefix}Weight`).value);
  const goal = selectedGoal(prefix);

  const errorEl = document.getElementById(errorElId);
  errorEl.classList.remove("show");

  if (!name || !age || !heightCm || !weightKg || !goal) {
    errorEl.textContent = "Please fill in every field and pick a goal.";
    errorEl.classList.add("show");
    return false;
  }
  if (age < 10 || age > 100) {
    errorEl.textContent = "Age must be between 10 and 100.";
    errorEl.classList.add("show");
    return false;
  }
  if (heightCm < 100 || heightCm > 250) {
    errorEl.textContent = "Height must be between 100 and 250 cm.";
    errorEl.classList.add("show");
    return false;
  }
  if (weightKg < 25 || weightKg > 300) {
    errorEl.textContent = "Weight must be between 25 and 300 kg.";
    errorEl.classList.add("show");
    return false;
  }

  profile = { name, age, gender, heightCm, weightKg, goal };
  save(KEYS.profile, profile);
  return true;
}

// ---------- AI Food Snap ----------
// The actual Gemini call happens on the server (server.js) so the API key
// never has to live in the browser. This just uploads the photo to our
// own /api/analyze-food endpoint and shows the result.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function wireFoodSnap() {
  const input = document.getElementById("snapInput");
  const zone = document.getElementById("snapZone");
  const preview = document.getElementById("snapPreview");
  const resultBox = document.getElementById("snapResult");

  zone.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    resultBox.innerHTML = `<span class="spinner"></span> Analyzing photo…`;
    resultBox.style.display = "block";

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/analyze-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI analysis failed.");

      resultBox.innerHTML = `
        <div style="margin-bottom:8px;">🍽️ <strong>${data.foodName}</strong> — ~${data.calories} kcal
          <span style="color:var(--muted); font-size:11.5px;">(${data.confidence} confidence)</span>
        </div>
        <div class="field-row">
          <select id="snapMealType">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
          <button class="btn btn-primary" id="snapAddBtn">Add to log</button>
        </div>`;

      document.getElementById("snapAddBtn").addEventListener("click", () => {
        const mealType = document.getElementById("snapMealType").value;
        addFoodEntry({ foodName: data.foodName, calories: data.calories, mealType, source: "ai" });
        showToast("✅ Added to today's food log");
        resultBox.style.display = "none";
        preview.style.display = "none";
        input.value = "";
      });
    } catch (err) {
      resultBox.innerHTML = "";
      resultBox.style.display = "none";
      showToast(err.message, "error");
    }
  });
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  wireGoalPills("onboard");
  wireGoalPills("profile");
  wireFoodSnap();
  renderGate();
  if (hasCompleteProfile()) switchTab("dashboard");

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("onboardForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (saveProfileFromForm("onboard", "onboardError")) {
      renderGate();
      switchTab("dashboard");
      showToast("Profile set up! Welcome to FitTrackGenaitrinity.");
    }
  });

  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (saveProfileFromForm("profile", "profileError")) {
      renderDashboard();
      showToast("✅ Profile updated");
    }
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("This clears your profile and all logged food/activity from this browser. Continue?")) return;
    localStorage.removeItem(KEYS.profile);
    localStorage.removeItem(KEYS.food);
    localStorage.removeItem(KEYS.activity);
    profile = null;
    foodLogs = [];
    activityLogs = [];
    renderGate();
  });

  document.getElementById("foodForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const foodName = document.getElementById("foodName").value.trim();
    const calories = Number(document.getElementById("foodCalories").value);
    const mealType = document.getElementById("foodMealType").value;
    if (!foodName || !calories) return showToast("Enter a food name and calories.", "error");
    addFoodEntry({ foodName, calories, mealType });
    e.target.reset();
    showToast("✅ Food logged");
  });

  document.getElementById("activityForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const activityType = document.getElementById("activityType").value;
    const durationMinutes = Number(document.getElementById("activityDuration").value);
    if (!durationMinutes || durationMinutes <= 0) return showToast("Enter a valid duration.", "error");
    const caloriesBurned = calcCaloriesBurned(activityType, durationMinutes, profile.weightKg);
    activityLogs.push({ id: Date.now(), activityType, durationMinutes, caloriesBurned, date: todayStr() });
    save(KEYS.activity, activityLogs);
    e.target.reset();
    renderActivity();
    renderDashboard();
    showToast("✅ Activity logged");
  });
});
