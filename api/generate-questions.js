import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { images, grade, questionTypes } = req.body;

        if (!images || !images.length || !grade || !questionTypes) {
            return res.status(400).json({ success: false, message: 'Faltan parámetros' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const imageParts = images.map(imgBase64 => ({
            inlineData: {
                data: imgBase64.replace(/^data:image\/\w+;base64,/, ''),
                mimeType: "image/jpeg"
            }
        }));

        const requestsImages = questionTypes.some(type => type.includes('Gráficos'));
const promptText = `
        Eres un pedagogo experto. Analiza las fotos de los apuntes adjuntos.
        Identifica el tema principal de los apuntes (ej: Ciencias, Comunicación, Matemáticas, Geometría).
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria basándote en ellos.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.

        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos (Ejercicios Gráficos (IA)).
        Como el tema puede requerir precisión matemática (geometría, fracciones, planos, puntos cardinales, ángulos), NO pidas imágenes fotográficas.
        En su lugar, para al menos 5 de estas preguntas, DEBES generar un gráfico vectorial usando código SVG nativo y limpio en el campo "svgCode".
        
        REGLAS PARA EL SVG:
        1. Debe ser código HTML <svg> válido, responsivo (usa viewBox="0 0 200 200" o similar).
        2. Mantén el diseño escolar, claro, con trazos negros y colores de relleno (ej: fill="lightblue", stroke="black").
        3. Si es de hallar "X", dibuja el triángulo, los ángulos conocidos y pon un <text> con la X en el lugar correcto.
        4. Si son fracciones, dibuja la figura dividida. Si son puntos cardinales, dibuja ejes con N, S, E, O.
        5. Todo el string de svgCode debe ir en una sola línea o usar secuencias de escape correctas en JSON para no romper el formato.
        ` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin usar caracteres Markdown (sin \`\`\`json):
        {
          "masterImagePrompt": "", 
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
              "svgCode": "<svg viewBox='0 0 200 200'><circle cx='100' cy='100' r='50' fill='yellow' stroke='black'/><text x='95' y='105'>X</text></svg>", 
              "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
              "answer": "La respuesta correcta"
            }
          ]
        }
        Nota: Si una pregunta no requiere apoyo visual, pon "svgCode": null.
        `;
        console.log("Enviando petición a Gemini...");
        const result = await model.generateContent([promptText, ...imageParts]);
        const rawText = result.response.text();
        
        let parsedData;
        try {
            parsedData = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Error al leer el JSON de Gemini. Texto crudo recibido:", rawText);
            return res.status(500).json({ success: false, message: 'La IA no devolvió un formato válido.', error: parseError.message });
        }

        if (Array.isArray(parsedData)) {
            parsedData = { questions: parsedData, masterImagePrompt: null };
        } else if (!parsedData.questions) {
            parsedData.questions = [];
        }

        return res.status(200).json({ 
            success: true, 
            questions: parsedData.questions,
            masterImagePrompt: parsedData.masterImagePrompt || null
        });

    } catch (error) {
        console.error('Error general:', error);
        return res.status(500).json({ success: false, message: 'Error procesando la IA.', error: error.message });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' }, responseLimit: false },
};
