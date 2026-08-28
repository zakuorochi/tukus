import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const { questions, grade } = req.body;

        if (!questions || !Array.isArray(questions)) {
            return res.status(400).json({ success: false, message: 'Faltan las preguntas para generar el PDF' });
        }

        // 2. Crear un nuevo documento PDF
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        let page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const margin = 50;
        let yPosition = height - margin;

        // Función auxiliar para verificar si necesitamos una nueva página
        const checkPageBreak = (spaceNeeded) => {
            if (yPosition - spaceNeeded < margin) {
                page = pdfDoc.addPage();
                yPosition = height - margin;
            }
        };

        // 3. Dibujar el Encabezado del Documento
        page.drawText('TUKU.OS - Cuestionario de Evaluación', {
            x: margin, y: yPosition, size: 18, font: fontBold, color: rgb(0.06, 0.72, 0.5) // Color primary (verde TUKU)
        });
        yPosition -= 25;
        
        page.drawText(`Nivel: ${grade || 'No especificado'}° Primaria`, {
            x: margin, y: yPosition, size: 12, font: font, color: rgb(0.4, 0.4, 0.4)
        });
        yPosition -= 40;

        // 4. Iterar sobre las preguntas y dibujarlas en el PDF
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            
            checkPageBreak(80); // Asegurar que hay espacio para la pregunta y al menos una línea

            // Enunciado de la pregunta
            page.drawText(`${i + 1}. ${q.statement}`, {
                x: margin, y: yPosition, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1),
                maxWidth: width - (margin * 2) // pdf-lib hace un wrap básico si se le pasa maxWidth
            });
            yPosition -= 20; // Espacio después del enunciado

            // Dibujar las opciones si es "Opción Múltiple"
            if (q.type === 'Opción Múltiple' && q.options && q.options.length > 0) {
                const labels = ['A)', 'B)', 'C)', 'D)'];
                q.options.forEach((opt, idx) => {
                    checkPageBreak(25);
                    page.drawText(`${labels[idx]} ${opt}`, {
                        x: margin + 15, y: yPosition, size: 11, font: font, color: rgb(0.2, 0.2, 0.2)
                    });
                    yPosition -= 20;
                });
                yPosition -= 15; // Espacio extra al final de la pregunta
            } else if (q.type === 'Verdadero / Falso') {
                page.drawText(`(  ) Verdadero    (  ) Falso`, {
                    x: margin + 15, y: yPosition, size: 11, font: font, color: rgb(0.2, 0.2, 0.2)
                });
                yPosition -= 35;
            } else {
                // Para "Preguntas y Respuestas" o "Completar", dejamos un par de líneas en blanco
                page.drawLine({
                    start: { x: margin, y: yPosition },
                    end: { x: width - margin, y: yPosition },
                    thickness: 1, color: rgb(0.8, 0.8, 0.8)
                });
                yPosition -= 20;
                page.drawLine({
                    start: { x: margin, y: yPosition },
                    end: { x: width - margin, y: yPosition },
                    thickness: 1, color: rgb(0.8, 0.8, 0.8)
                });
                yPosition -= 30;
            }
        }

        // 5. Serializar el PDF a bytes
        const pdfBytes = await pdfDoc.save();

        // 6. Configurar la respuesta para que el navegador lo entienda como un archivo
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="cuestionario_tuku.pdf"');
        res.setHeader('Content-Length', pdfBytes.length);

        // Enviar el buffer
        return res.status(200).send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('Error generando el PDF:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error al construir el documento PDF',
            error: error.message 
        });
    }
}
