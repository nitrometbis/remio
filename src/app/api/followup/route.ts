export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { estimate, answers } = body;

    const prompt = `
Jesteś profesjonalnym kosztorysantem remontów łazienek.

Masz aktualny kosztorys oraz odpowiedzi klienta.
Zaktualizuj kosztorys na podstawie odpowiedzi.

Zwróć WYŁĄCZNIE JSON w formacie:

{
  "tasks": [
    {
      "name": "Nazwa usługi",
      "labor": 1000,
      "materials": 500,
      "total": 1500
    }
  ],
  "summary": {
    "labor": 1000,
    "materials": 500,
    "total": 1500
  }
}

AKTUALNY KOSZTORYS:
${JSON.stringify(estimate)}

ODPOWIEDZI KLIENTA:
${JSON.stringify(answers)}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "{}";

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Błąd aktualizacji kosztorysu",
      },
      { status: 500 }
    );
  }
}