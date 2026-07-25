require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" })); // base64 food photos go in the JSON body
app.use(express.static(path.join(__dirname, "public")));

// ---------- Gemini food-photo analysis ----------
// This is the ONE thing that needs a real server: it keeps GEMINI_API_KEY
// out of the browser entirely. Everything else (profile, food/activity
// logs, dashboard math) lives in the browser's localStorage - no database.

// Google renames/retires Gemini models sometimes, so we try a short list
// in order instead of hardcoding one name. Set GEMINI_MODEL in .env to try
// your own choice first.
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-pro-latest",
];

function candidateModels() {
  const configured = process.env.GEMINI_MODEL;
  const list = configured ? [configured, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  return [...new Set(list)];
}

const PROMPT = `You are a nutrition assistant inside a fitness tracker app.
Look at this photo of food and identify the single most likely dish or food item,
then estimate its total calorie count for the portion shown.

Respond with ONLY strict JSON, no markdown fences, no extra text, in exactly this shape:
{"foodName": "string", "calories": number, "confidence": "low" | "medium" | "high"}

If you cannot identify any food in the image, respond with:
{"foodName": null, "calories": null, "confidence": "low"}`;

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

async function callGemini(model, apiKey, mimeType, base64Image) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64Image } }] },
    ],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let lastWorkingModel = null;

app.post("/api/analyze-food", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set. Add it to your .env file and restart the server.",
    });
  }

  const { image, mimeType } = req.body || {};
  if (!image || !mimeType) {
    return res.status(400).json({ error: "Send JSON: { image: '<base64>', mimeType: 'image/jpeg' }." });
  }

  const modelsToTry = lastWorkingModel ? [lastWorkingModel, ...candidateModels()] : candidateModels();
  let response, workingModel = null, lastErrorStatus = 0;

  for (const model of [...new Set(modelsToTry)]) {
    try {
      response = await callGemini(model, apiKey, mimeType, image);
    } catch (err) {
      console.error(`Gemini request failed for model ${model}:`, err);
      continue;
    }
    if (response.ok) {
      workingModel = model;
      break;
    }
    lastErrorStatus = response.status;
    console.error(`Gemini model "${model}" failed:`, response.status, await response.text());
    // Only keep trying other models if this one simply doesn't exist for this
    // key. Any other error (quota, bad request, etc.) won't be fixed by
    // switching models.
    if (response.status !== 404) break;
  }

  if (!workingModel) {
    if (lastErrorStatus === 429) {
      return res.status(429).json({ error: "Gemini's free-tier rate limit was hit. Wait a bit and try again." });
    }
    if (lastErrorStatus === 404) {
      return res.status(502).json({
        error: "None of the usual Gemini model names work for your key. Set GEMINI_MODEL in .env to a model your key supports.",
      });
    }
    return res.status(502).json({ error: "AI food recognition failed. Try again or enter the food manually." });
  }

  lastWorkingModel = workingModel;

  try {
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: "AI did not return a result. Try a clearer photo." });
    }

    const parsed = extractJson(rawText);
    if (!parsed.foodName || parsed.calories === null || parsed.calories === undefined) {
      return res.status(422).json({ error: "Couldn't recognize any food in that photo. Try a clearer, closer shot." });
    }

    res.json({
      foodName: parsed.foodName,
      calories: Math.round(Number(parsed.calories)),
      confidence: parsed.confidence || "medium",
      modelUsed: workingModel,
    });
  } catch (err) {
    console.error("Gemini response handling failed:", err);
    res.status(500).json({ error: "Something went wrong talking to the AI service." });
  }
});

// app.listen(PORT, () => {
//   console.log(`\n🔌  FitTrackGenaitrinity running at http://localhost:${PORT}\n`);

//   const envPath = path.join(__dirname, ".env");
//   const key = process.env.GEMINI_API_KEY;

//   if (!fs.existsSync(envPath)) {
//     console.log(`⚠️  No .env file found at: ${envPath}`);
//     console.log("    Copy .env.example to .env, then add your real key and restart.\n");
//   } else if (!key || key === "your_gemini_api_key_here") {
//     console.log(`⚠️  Found .env but GEMINI_API_KEY is missing or still the placeholder.`);
//     console.log("    Open .env and set GEMINI_API_KEY to your real key, then restart.\n");
//   } else {
//     console.log(`✅  GEMINI_API_KEY loaded (starts with: ${key.slice(0, 6)}...)\n`);
//   }
// });
// Export the Express app for Vercel
module.exports = app;

// Run locally with: npm start
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🔌 FitTrackGenaitrinity running at http://localhost:${PORT}\n`);

    const key = process.env.GEMINI_API_KEY;

    if (!key || key === "your_gemini_api_key_here") {
      console.log("⚠️ GEMINI_API_KEY is missing or still the placeholder.");
    } else {
      console.log(`✅ GEMINI_API_KEY loaded (starts with: ${key.slice(0, 6)}...)`);
    }
  });
}
