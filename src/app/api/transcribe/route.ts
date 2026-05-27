export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { PRICE_LIST } from "@/data/pricing";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type StandardType =
  | "basic"
  | "standard"
  | "premium";

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectStandard(text: string): StandardType {
  const lower = normalizeText(text);

  let premiumPoints = 0;
  let basicPoints = 0;

  const premiumKeywords = [
    "złota armatura",
    "armatura premium",
    "wielkoformatowe",
    "120x60",
    "120x120",
    "gres premium",
    "walk in",
    "walk-in",
    "deszczownica",
    "led",
    "taśmy led",
    "podłogówka",
    "ogrzewanie podłogowe",
    "smart",
    "lustro led",
    "kamień naturalny",
    "spiek",
    "designerskie",
    "luksus",
    "premium",
  ];

  const basicKeywords = [
    "tanio",
    "budżet",
    "basic",
    "ekonomicznie",
    "najtańsze",
    "prosto",
    "bez luksusów",
  ];

  for (const keyword of premiumKeywords) {
    if (lower.includes(keyword)) {
      premiumPoints += 1;
    }
  }

  for (const keyword of basicKeywords) {
    if (lower.includes(keyword)) {
      basicPoints += 1;
    }
  }

  if (premiumPoints >= 2) return "premium";
  if (basicPoints >= 1) return "basic";

  return "standard";
}

function detectMetraz(text: string) {
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s?(m2|m²|metrów|metrow)/i
  );

  if (match) {
    return Number(match[1].replace(",", "."));
  }

  return 5;
}

function findBestPrice(
  taskName: string,
  standard: StandardType
) {
  const pricing = PRICE_LIST[standard];
  const normalizedTask = normalizeText(taskName);

  const aliases: Record<string, string[]> = {
    "Układanie płytek": [
      "kafelki",
      "glazura",
      "gres",
      "płytki",
      "układanie gresu",
    ],

    "Układanie płytek wielkoformatowych": [
      "120x60",
      "wielkoformatowe",
      "duże płytki",
      "gres wielkoformatowy",
    ],

    Hydroizolacja: [
      "izolacja",
      "folia w płynie",
      "uszczelnienie",
    ],

    "Montaż WC podwieszanego": [
      "geberit",
      "wc",
      "toaleta",
      "stelaż",
    ],

    "Montaż umywalki": ["umywalka", "zlew"],

    "Montaż kabiny walk-in": [
      "kabina",
      "walk in",
      "walk-in",
    ],

    "Montaż prysznica walk-in": [
      "prysznic",
      "deszczownica",
    ],

    "Montaż armatury": [
      "bateria",
      "armatura",
      "kran",
      "złota armatura",
    ],

    "Instalacja oświetlenia LED": [
      "led",
      "taśmy led",
      "oświetlenie",
    ],

    "Montaż ogrzewania podłogowego": [
      "podłogówka",
      "mata grzewcza",
      "ogrzewanie",
    ],

    "Malowanie sufitu": ["malowanie", "sufit"],

    "Prace wykończeniowe i fugowanie": [
      "fugi",
      "fugowanie",
      "wykończenie",
    ],

    "Demontaż i przygotowanie podłoża": [
      "demontaż",
      "skuwanie",
      "przygotowanie",
    ],
  };

  for (const [key, value] of Object.entries(pricing)) {
    const normalizedKey = normalizeText(key);

    if (normalizedTask.includes(normalizedKey)) {
      return {
        matchedKey: key,
        price: value,
      };
    }
  }

  for (const [service, synonyms] of Object.entries(aliases)) {
    for (const synonym of synonyms) {
      if (normalizedTask.includes(normalizeText(synonym))) {
        const price =
          pricing[service as keyof typeof pricing];

        return {
          matchedKey: service,
          price,
        };
      }
    }
  }

  return null;
}

function isPerSquareMeter(taskName: string) {
  const lower = normalizeText(taskName);

  const fixedPriceTasks = [
    "montaz wc",
    "montaz umywalki",
    "montaz kabiny",
    "montaz prysznica",
    "montaz armatury",
    "oswietlenie",
  ];

  return !fixedPriceTasks.some((task) =>
    lower.includes(task)
  );
}

function calculateTask(
  taskName: string,
  metraz: number,
  standard: StandardType
) {
  const matched = findBestPrice(
    taskName,
    standard
  );

  if (!matched) {
    return {
      name: taskName,
      matchedService: "Nie znaleziono",
      labor: 0,
      materials: 0,
      total: 0,
    };
  }

  const useMetraz = isPerSquareMeter(taskName);
  const base = matched.price;

  const total = Math.round(
    useMetraz ? base * metraz : base
  );

  const labor = Math.round(total * 0.65);
  const materials = total - labor;

  return {
    name: taskName,
    matchedService: matched.matchedKey,
    labor,
    materials,
    total,
  };
}

async function analyzeImage(image: File | null) {
  if (!image) return "";

  const bytes = await image.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString("base64");
  const mimeType = image.type;

  const vision =
    await openai.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "user",

          content: [
            {
              type: "text",

              text: `
Przeanalizuj zdjęcie łazienki.

Wykryj:
- standard wykończenia
- typ płytek
- walk-in
- LED
- armaturę
- ogrzewanie podłogowe
- poziom luksusu
- wielkość łazienki

Odpowiedz krótko po polsku.
`,
            },

            {
              type: "image_url",

              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

  return (
    vision.choices[0]?.message?.content ||
    ""
  );
}

async function extractTasks(
  text: string,
  imageAnalysis: string
) {
  const prompt = `
Jesteś profesjonalnym parserem remontów łazienek.

Twoim zadaniem jest:
- wykryć zakres prac remontowych,
- znormalizować nazwy usług,
- zwrócić TYLKO poprawny JSON.

Dostępne usługi:
- Demontaż i przygotowanie podłoża
- Hydroizolacja
- Układanie płytek
- Układanie płytek wielkoformatowych
- Montaż WC podwieszanego
- Montaż umywalki
- Montaż kabiny walk-in
- Montaż prysznica walk-in
- Montaż armatury
- Instalacja oświetlenia LED
- Montaż ogrzewania podłogowego
- Malowanie sufitu
- Prace wykończeniowe i fugowanie

WAŻNE:
- używaj WYŁĄCZNIE nazw z listy,
- nie wymyślaj nowych usług,
- nie dodawaj komentarzy,
- nie dodawaj markdown,
- zwróć WYŁĄCZNIE JSON array.

Przykład:
[
  "Hydroizolacja",
  "Układanie płytek",
  "Montaż WC podwieszanego"
]

Opis remontu:
${text}

Analiza zdjęcia:
${imageAnalysis}
`;

  const completion =
    await openai.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.1,
    });

  const raw =
    completion.choices[0]?.message?.content ||
    "[]";

  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) => typeof item === "string"
      );
    }

    return [];
  } catch (error) {
    console.error("AI JSON ERROR", error);
    return [];
  }
}

async function generateFollowUpQuestions(
  text: string,
  imageAnalysis: string
) {
  const fallback = [
    "Czy wymieniasz hydraulikę?",
    "Czy będzie ogrzewanie podłogowe?",
    "Jaki format płytek planujesz?",
    "Czy będzie sufit podwieszany?",
    "Czy armatura ma być standardowa czy premium?",
  ];

  const followUpPrompt = `
Na podstawie opisu remontu wygeneruj maksymalnie 5 krótkich pytań doprecyzowujących kosztorys łazienki.

Pytania mają dotyczyć:
- hydrauliki,
- elektryki,
- ogrzewania,
- standardu,
- płytek,
- sufitu,
- armatury.

Zwróć WYŁĄCZNIE JSON array stringów.

Przykład:
[
  "Czy wymieniasz hydraulikę?",
  "Czy będzie ogrzewanie podłogowe?"
]

Opis:
${text}

Analiza zdjęcia:
${imageAnalysis}
`;

  try {
    const completion =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",

        messages: [
          {
            role: "user",
            content: followUpPrompt,
          },
        ],

        temperature: 0.3,
      });

    const raw =
      completion.choices[0]?.message?.content ||
      "[]";

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (
      Array.isArray(parsed) &&
      parsed.length > 0
    ) {
      return parsed
        .filter(
          (item) =>
            typeof item === "string"
        )
        .slice(0, 5);
    }

    return fallback;
  } catch (error) {
    console.error(
      "FOLLOW UP JSON ERROR",
      error
    );

    return fallback;
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    const formData =
      await req.formData();

    const file =
      formData.get("file") as File;

    const image =
      formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        {
          error: "Brak pliku audio",
        },
        {
          status: 400,
        }
      );
    }

    const bytes =
      await file.arrayBuffer();

    const buffer = Buffer.from(bytes);

    const audioFile =
      await toFile(buffer, file.name);

    const transcription =
      await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "pl",
      });

    const text = transcription.text || "";

    const imageAnalysis =
      await analyzeImage(image);

    const combinedText = `${text}\n${imageAnalysis}`;

    const standard =
      detectStandard(combinedText);

    const metraz =
      detectMetraz(combinedText);

    const parsedTasks =
      await extractTasks(
        text,
        imageAnalysis
      );

    const tasks =
      parsedTasks.map((taskName) =>
        calculateTask(
          taskName,
          metraz,
          standard
        )
      );

    const laborTotal = tasks.reduce(
      (sum, task) => sum + task.labor,
      0
    );

    const materialsTotal = tasks.reduce(
      (sum, task) => sum + task.materials,
      0
    );

    const grandTotal =
      laborTotal + materialsTotal;

    const followUpQuestions =
      await generateFollowUpQuestions(
        text,
        imageAnalysis
      );

    return NextResponse.json({
      transcription: text,

      followUpQuestions,

      imageAnalysis,

      estimate: {
        metraz,
        standard,
        tasks,

        summary: {
          labor: laborTotal,
          materials: materialsTotal,
          total: grandTotal,
        },
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Błąd generowania kosztorysu",
      },
      {
        status: 500,
      }
    );
  }
}