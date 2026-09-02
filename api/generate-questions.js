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
        Identifica el tema principal (ej: Ciencias, Matemáticas, Geometría).
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria basándote en ellos.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.

        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos (Ejercicios Gráficos (IA)).
        Como el tema puede requerir precisión matemática (geometría, fracciones, planos), NO pidas imágenes fotográficas.
        En su lugar, para al menos 5 de estas preguntas, DEBES generar un gráfico vectorial usando código SVG nativo.
        
        REGLA CRÍTICA PARA EL SVG (ANTIFALLOS JSON):
        1. DEBES usar EXCLUSIVAMENTE COMILLAS SIMPLES (') para todos los atributos del SVG. 
        ESTÁ ESTRICTAMENTE PROHIBIDO usar comillas dobles (") dentro del código SVG. 
        Ejemplo CORRECTO: <svg viewBox='0 0 200 200'><circle cx='100' cy='100' fill='yellow'/></svg>
        Ejemplo INCORRECTO: <svg viewBox="0 0 200 200">
        2. Todo el código SVG debe ir en una sola línea sin saltos de línea (\\n).
        ` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "masterImagePrompt": "", 
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
              "svgCode": "<svg viewBox='0 0 200 200'><text x='50' y='50'>X</text></svg>", 
              "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
              "answer": "La respuesta correcta"
            }
          ]
        }
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
