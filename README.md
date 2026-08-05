# FitTrackGenaitrinity

A simple AI fitness tracker: log food, log activity, track calories vs.
your goal, and snap a photo of food to have Gemini estimate the calories.

Plain **HTML/CSS/JS** frontend + a small **Node.js (Express)** server. No
database, no accounts, no MERN-style complexity — your profile and logs
live in your browser's `localStorage`. The server's only job is to call
the Gemini API so your key never has to sit in the browser.

## Project structure

```
fittrackgenaitrinity/
├── server.js               # the whole backend — one file, serves the frontend + /api/analyze-food
├── public/
│   ├── index.html            # the entire frontend — one page, four tabs
│   ├── css/style.css
│   └── js/app.js               # storage, fitness math, rendering, calls /api/analyze-food
├── package.json
├── .env.example
└── .gitignore
```

## Running it

**1. Install Node.js dependencies** (one time)
```bash
cd fittrackgenaitrinity
npm install
```

**2. Get a free Gemini API key**
https://aistudio.google.com/app/apikey → sign in → Create API Key → copy it

**3. Set up your `.env` file**
```bash
cp .env.example .env
```
Open `.env` and paste your real key:
```
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

**4. Start the server**
```bash
npm start
```
You'll see:
```
🔌  FitTrackGenaitrinity running at http://localhost:3000
✅  GEMINI_API_KEY loaded (starts with: AIzaSy...)
```
Open `http://localhost:3000` in your browser.

If port 3000 is ever busy/blocked, change `PORT` in `.env` to something
else (e.g. `5500`) and restart `npm start`.

## Using it

- First screen: set up your profile (age, gender, height, weight, goal).
- **Dashboard** — today's calories eaten vs. burned vs. your goal, BMI.
- **Food** — log manually, or use **AI Food Snap** to upload a photo and
  have Gemini estimate calories.
- **Activity** — log a workout type + duration, calories burned are
  calculated using standard MET values.
- **Profile** — edit your info, or clear all data from this browser.

