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
    const stats = req.body?.stats as Record<string, unknown> | undefined;
    if (!stats || typeof stats !== "object") {
      res.status(400).send("Missing stats in body");
      return;
    }

    const payload = {
      waterName: typeof stats.waterName === "string" ? stats.waterName : "okänt vatten",
      totalCatches: typeof stats.totalCatches === "number" ? stats.totalCatches : 0,
      general: (stats.general ?? null) as Record<string, unknown> | null,
      currentConditions: (stats.currentConditions ?? null) as Record<string, unknown> | null,
      similarWhenLikeNow: (stats.similarWhenLikeNow ?? null) as Record<string, unknown> | null,
    };

    const systemPrompt =
      "Du är en erfaren fiskeguide för abborrfiske. Du använder ENDAST datan du får och hittar inte på saknad information.";
    const userPrompt = `
Analysera detta vatten och skriv en rekommendation på svenska.

Krav på svar:
1) Svara med exakt två rubriker:
   - Generellt i vattnet
   - När vädret liknar nu
2) Under varje rubrik: 2-4 korta punkter.
3) Väg in flera parametrar samtidigt (betestyp, konkret bete, metod, tid på dygnet, väder, temperatur, lufttryck).
4) Om data för betestyper och metoder för jigg finns, lyft fram dem konkret.
5) Om underlag saknas för del 2, skriv det tydligt utan att gissa.
6) Kort, tydligt och praktiskt (max cirka 170 ord totalt).

Data:
${JSON.stringify(payload, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";

    res.status(200).json({ recommendation: text });
  } catch (err) {
    logger.error("Fel i getWaterRecommendation", err as Error);
    res.set("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "Error generating recommendation", detail: (err as Error)?.message ?? String(err) });
  }
});
