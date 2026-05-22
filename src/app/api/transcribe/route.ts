import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { PRICE_LIST } from "@/data/pricing";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type StandardType =
  | "basic"
  | "standard"
  | "premium";

function detectStandard(
  text: string
): StandardType {
  const lower =
    text.toLowerCase();

  if (
    lower.includes("premium") ||
    lower.includes("luksus") ||
    lower.includes("złota armatura") ||
    lower.includes("wielkoformatowe") ||
    lower.includes("gres 120x60") ||
    lower.includes("led") ||
    lower.includes("ogrzewanie podłogowe")
  ) {
    return "premium";
  }

  if (
    lower.includes("budżet") ||
    lower.includes("tanio") ||
    lower.includes("basic")
  ) {
    return "basic";
  }

  return "standard";
}

function detectMetraz(
  text: string
) {
  const match =
    text.match(
      /(\d+(?:[.,]\d+)?)\s?(m2|m²|metrów|metrow)/i
    );

  if (match) {
    return Number(
      match[1].replace(",", ".")
    );
  }

  return 5;
}

function normalizeText(
  text: string
) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}

function findBestPrice(
  taskName: string,
  standard: StandardType
) {
  const pricing =
    PRICE_LIST[standard];

  const normalizedTask =
    normalizeText(taskName);

  // SYNONIMY / AI MAPPING

  const aliases: Record<
    string,
    string[]
  > = {
    "Układanie płytek": [
      "kafelki",
      "glazura",
      "gres",
      "płytki",
      "układanie gresu",
    ],

    "Układanie płytek wielkoformatowych":
      [
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

    "Montaż WC podwieszanego":
      [
        "geberit",
        "wc",
        "toaleta",
        "stelaż",
      ],

    "Montaż umywalki": [
      "umywalka",
      "zlew",
    ],

    "Montaż kabiny walk-in":
      [
        "kabina",
        "walk in",
        "walk-in",
      ],

    "Montaż prysznica walk-in":
      [
        "prysznic",
        "deszczownica",
      ],

    "Montaż armatury": [
      "bateria",
      "armatura",
      "kran",
      "złota armatura",
    ],

    "Instalacja oświetlenia LED":
      [
        "led",
        "taśmy led",
        "oświetlenie",
      ],

    "Montaż ogrzewania podłogowego":
      [
        "podłogówka",
        "mata grzewcza",
        "ogrzewanie",
      ],

    "Malowanie sufitu": [
      "malowanie",
      "sufit",
    ],

    "Prace wykończeniowe i fugowanie":
      [
        "fugi",
        "fugowanie",
        "wykończenie",
      ],

    "Demontaż i przygotowanie podłoża":
      [
        "demontaż",
        "skuwanie",
        "przygotowanie",
      ],
  };

  // 1. DOKŁADNE DOPASOWANIE

  for (const [
    key,
    value,
  ] of Object.entries(
    pricing
  )) {
    const normalizedKey =
      normalizeText(key);

    if (
      normalizedTask.includes(
        normalizedKey
      )
    ) {
      return {
        matchedKey: key,
        price: value,
      };
    }
  }

  // 2. SYNONIMY

  for (const [
    service,
    synonyms,
  ] of Object.entries(
    aliases
  )) {
    for (const synonym of synonyms) {
      if (
        normalizedTask.includes(
          normalizeText(
            synonym
          )
        )
      ) {
        const price =
          pricing[
            service as keyof typeof pricing
          ];

        return {
          matchedKey:
            service,
          price,
        };
      }
    }
  }

  return null;
}

function isPerSquareMeter(
  taskName: string
) {
  const lower =
    normalizeText(taskName);

  const fixedPriceTasks = [
    "montaz wc",
    "montaz umywalki",
    "montaz kabiny",
    "montaz prysznica",
    "montaz armatury",
    "oswietlenie",
  ];

  return !fixedPriceTasks.some(
    (task) =>
      lower.includes(task)
  );
}

function calculateTask(
  taskName: string,
  metraz: number,
  standard: StandardType
) {
  const matched =
    findBestPrice(
      taskName,
      standard
    );

  if (!matched) {
    return {
      name: taskName,

      matchedService:
        "Nie znaleziono",

      labor: 0,

      materials: 0,

      total: 0,
    };
  }

  const useMetraz =
    isPerSquareMeter(
      taskName
    );

  const base =
    matched.price;

  const total = Math.round(
    useMetraz
      ? base * metraz
      : base
  );

  const labor = Math.round(
    total * 0.65
  );

  const materials =
    total - labor;

  return {
    name: taskName,

    matchedService:
      matched.matchedKey,

    labor,

    materials,

    total,
  };
}

export async function POST(
  req: NextRequest
) {
  try {
    const formData =
      await req.formData();

    const file =
      formData.get(
        "file"
      ) as File;

    if (!file) {
      return NextResponse.json(
        {
          error:
            "Brak pliku audio",
        },
        { status: 400 }
      );
    }

    // WHISPER

    const transcription =
      await openai.audio.transcriptions.create(
        {
          file,
          model: "whisper-1",
          language: "pl",
        }
      );

    const text =
      transcription.text;

    // DETEKCJA STANDARDU

    const standard =
      detectStandard(text);

    // DETEKCJA METRAŻU

    const metraz =
      detectMetraz(text);

    // AI TASK EXTRACTION

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
`;

    const completion =
      await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.1,
        }
      );

    const raw =
      completion.choices[0]
        ?.message?.content ||
      "[]";

    const cleaned =
      raw
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    let parsedTasks: string[] =
      [];

    try {
      parsedTasks =
        JSON.parse(cleaned);
    } catch {
      parsedTasks = [];
    }

    // PRICING ENGINE

    const tasks =
      parsedTasks.map(
        (taskName) =>
          calculateTask(
            taskName,
            metraz,
            standard
          )
      );

    // SUMMARY

    const laborTotal =
      tasks.reduce(
        (sum, task) =>
          sum + task.labor,
        0
      );

    const materialsTotal =
      tasks.reduce(
        (sum, task) =>
          sum +
          task.materials,
        0
      );

    const grandTotal =
      laborTotal +
      materialsTotal;

    return NextResponse.json({
      transcription: text,

      estimate: {
        metraz,

        standard,

        tasks,

        summary: {
          labor:
            laborTotal,

          materials:
            materialsTotal,

          total:
            grandTotal,
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
      { status: 500 }
    );
  }
}