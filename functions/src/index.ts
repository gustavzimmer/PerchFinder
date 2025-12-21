import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

setGlobalOptions({ maxInstances: 10 });
const OPENAI_KEY = defineSecret("OPENAI_KEY");

export const getWaterRecommendation = onRequest({ secrets: [OPENAI_KEY] }, async (req, res) => {
  // Enkel CORS för browser
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Only POST allowed");
    return;
  }

  // Läs nyckeln INNE I funktionen
  const openaiKey =
    OPENAI_KEY.value() ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY;
  if (!openaiKey) {
    logger.error("OPENAI_KEY saknas i environment/config");
    res.status(500).json({ error: "Servern saknar AI-nyckel (OPENAI_KEY)." });
    return;
  }

  const client = new OpenAI({ apiKey: openaiKey });

  try {
    const stats = req.body?.stats;
    if (!stats) {
      res.status(400).send("Missing stats in body");
      return;
    }

    const prompt = `
      Du är en assistent som hjälper abborrfiskare att planera sitt fiske utifrån deras sparade fångster.
      Här är sammanfattad data för ett vatten:

      Namn: ${stats.waterName ?? "okänt"}
      Antal fångster: ${stats.totalCatches ?? 0}
      Vanligaste beten: ${JSON.stringify(stats.commonLures ?? stats.topLures ?? [])}
      Bästa tid på dygnet: ${stats.bestTimeOfDay ?? "okänt"}
      Medeltemperatur (°C): ${stats.avgTempC ?? "okänt"}
      Vanligaste vädertyp (soligt/molnigt/regn): ${stats.commonWeather ?? "okänt"}
      Lufttryck (hPa): ${stats.avgPressureHpa ?? "okänt"}

      Skriv en kort rekommendation (max 80 ord) på svenska till en fiskare som ska åka dit.
      Nämn:
      - vilket bete som brukar fungera bäst (om data finns)
      - vilken tid på dygnet som verkar bäst
      - vilket väder som brukar ge resultat
      - hur lufttrycket brukar ligga
      Håll tonen enkel och tydlig.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices[0]?.message?.content ?? "";

    res.status(200).json({ recommendation: text });
  } catch (err) {
    logger.error("Fel i getWaterRecommendation", err as Error);
    res.set("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "Error generating recommendation", detail: (err as Error)?.message ?? String(err) });
  }
});
