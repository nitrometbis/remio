import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

export async function POST(
  req: Request
) {
  try {
    const formData =
      await req.formData();

    const file =
      formData.get(
        "image"
      ) as File;

    if (!file) {
      return NextResponse.json(
        {
          error:
            "Brak zdjęcia",
        },
        { status: 400 }
      );
    }

    const bytes =
      await file.arrayBuffer();

    const base64 =
      Buffer.from(
        bytes
      ).toString("base64");

    const mime =
      file.type;

    const response =
      await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",

          messages: [
            {
              role: "user",

              content: [
                {
                  type: "text",

                  text: `
Przeanalizuj łazienkę.

Wykryj:
- standard
- płytki
- walk-in
- LED
- ogrzewanie podłogowe
- armaturę
- zakres remontu

Zwróć JSON array usług.
`,
                },

                {
                  type:
                    "image_url",

                  image_url: {
                    url: `data:${mime};base64,${base64}`,
                  },
                },
              ],
            },
          ],
        }
      );

    return NextResponse.json({
      result:
        response.choices[0]
          .message.content,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Błąd OCR",
      },
      { status: 500 }
    );
  }
}