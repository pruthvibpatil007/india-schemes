// Cloudflare Worker: keeps the Gemini API key secret and builds the prompt server-side.
// Setup:
//   1. npm create cloudflare@latest  (or use the dashboard: Workers & Pages > Create > Worker)
//   2. Paste this file as the Worker code.
//   3. Add secret:   wrangler secret put GEMINI_API_KEY      (paste your key there)
//   4. Add variable: ALLOWED_ORIGIN = https://your-site.example   (where the HTML is hosted)
//   5. Deploy, then put the Worker URL into PROXY_URL in sarkari-saathi.html.

const MODEL = "gemini-2.5-flash";

const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];
const SEX = ["Male", "Female", "Other"];
const SITUATION = ["Widow", "Senior citizen", "Farmer", "Student", "Unemployed"];
const INCOME = ["Below ₹1 lakh per year", "₹1–3 lakh per year", "₹3–6 lakh per year", "Above ₹6 lakh per year"];
const LANGUAGE = ["Hindi", "English"];

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  return {
    "Access-Control-Allow-Origin": origin && origin === allowed ? origin : allowed || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function buildPrompt(a) {
  return `You are "Sarkari Saathi", a careful assistant that helps people in India find government welfare schemes (central and state).

PERSON'S ANSWERS:
- State/UT: ${a.state}
- Age: ${a.age}
- Sex: ${a.sex}
- Situation: ${a.situation}
- Family income: ${a.income}
- Reply language: ${a.language}

TASK: Suggest up to 5 real, well-known Indian government schemes (central schemes, plus schemes of the person's state if you are confident they exist) that this person may be eligible for.

RULES:
- Only name schemes you are confident really exist. Never invent a scheme. If unsure, leave it out. If nothing fits, return an empty list and say so in "message".
- Write every text value in ${a.language}, in simple words and short sentences. The reader may have low literacy.
- NEVER state any money amount, pension, subsidy or benefit value as final or certain. Either leave amounts out or say they "may be about" a figure and must be confirmed at the office. Rules and amounts change.
- Eligibility is never certain; use words like "you may be eligible".
- Keep scheme names in their official form (you may add a translation).
- "documents" are the common documents usually asked for (for example Aadhaar, income certificate, bank passbook), as a short list.
- "first_step" is one clear action (for example which office or portal to visit, or whom to ask).
- Do not include a closing disclaimer; the app adds it.

Return ONLY valid JSON in exactly this shape:
{
  "message": "one short friendly sentence",
  "schemes": [ { "name": "scheme name", "why": "one or two sentences on why it may fit this person" } ],
  "documents": [ "document 1", "document 2" ],
  "first_step": "one clear first action"
}`;
}

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (req.method !== "POST") return json({ error: "POST only" }, 405, h);

    const origin = req.headers.get("Origin") || "";
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403, h);

    let a;
    try { a = await req.json(); } catch { return json({ error: "Bad JSON" }, 400, h); }

    // Strict validation: only known values reach the prompt, so the key can't be used for arbitrary prompts.
    const age = parseInt(a.age, 10);
    if (!STATES.includes(a.state) || !SEX.includes(a.sex) || !SITUATION.includes(a.situation) ||
        !INCOME.includes(a.income) || !LANGUAGE.includes(a.language) || !(age >= 1 && age <= 120)) {
      return json({ error: "Invalid answers" }, 400, h);
    }
    const clean = { state: a.state, age, sex: a.sex, situation: a.situation, income: a.income, language: a.language };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(clean) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    if (!res.ok) return json({ error: "Upstream " + res.status }, res.status === 429 ? 429 : 502, h);

    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    try {
      const parsed = JSON.parse(text.replace(/^```json\s*|```\s*$/g, "").trim());
      return json(parsed, 200, h);
    } catch {
      return json({ error: "Bad model output" }, 502, h);
    }
  },
};
