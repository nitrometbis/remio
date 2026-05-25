import { NextRequest, NextResponse } from "next/server";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

(pdfMake as any).vfs =
  pdfFonts.vfs;

export async function POST(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const estimate =
      body.estimate;

    const tasks =
      estimate.tasks || [];

    const docDefinition = {
      content: [
        {
          text: "Kosztorys Remio AI",
          style: "header",
        },

        {
          text: `Metraż: ${estimate.metraz} m²`,
          margin: [0, 10],
        },

        {
          text: `Standard: ${estimate.standard}`,
          margin: [0, 0, 0, 20],
        },

        ...tasks.flatMap(
          (task: any) => [
            {
              text: task.name,
              bold: true,
              margin: [0, 10],
            },

            {
              text: `Robocizna: ${task.labor} PLN`,
            },

            {
              text: `Materiały: ${task.materials} PLN`,
            },

            {
              text: `Suma: ${task.total} PLN`,
              margin: [0, 0, 0, 10],
            },
          ]
        ),

        {
          text: `ŁĄCZNIE: ${estimate.summary.total} PLN`,
          style: "total",
        },
      ],

      styles: {
        header: {
          fontSize: 22,
          bold: true,
        },

        total: {
          fontSize: 18,
          bold: true,
          margin: [0, 30, 0, 0],
        },
      },

      defaultStyle: {
        font: "Roboto",
      },
    };

    const pdfDoc =
      pdfMake.createPdf(
        docDefinition
      );

    const buffer =
      await new Promise<
        Buffer
      >((resolve) => {
        pdfDoc.getBuffer(
          (buf: Uint8Array) => {
            resolve(
              Buffer.from(buf)
            );
          }
        );
      });

    return new NextResponse(
      buffer,
      {
        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            'attachment; filename="kosztorys.pdf"',
        },
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Błąd generowania PDF",
      },
      { status: 500 }
    );
  }
}