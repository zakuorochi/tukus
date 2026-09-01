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
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.
        
        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos. NO pidas imágenes individuales. 
        En su lugar, crea UN SOLO "masterImagePrompt" EN INGLÉS que describa una cuadrícula de 4 secciones (2x2 grid educational image). 
        
        REGLA ESTRICTA PARA TEXTOS DENTRO DE LA IMAGEN:
        El generador de imágenes alucina letras si no se le dan instrucciones literales. Si necesitas que aparezca texto escrito DENTRO de los paneles (títulos, etiquetas), DEBES indicarlo usando la frase "with the exact text" y poner la palabra en español entre comillas simples tipográficas.
        Ejemplo correcto: "Section 1: A red mushroom, with the exact text 'Hongos Venenosos' written clearly below it. Section 2: A sliced bread, with the exact text 'Levaduras'."
        Trata de mantener los textos dentro de la imagen muy cortos (1 o 2 palabras máximo).
        
        Además, asegúrate de que al menos 4 de tus preguntas en el JSON hagan referencia a esta imagen (Ejemplo: "Observa la sección 1 de la cuadrícula. ¿Cuál es...?").` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "masterImagePrompt": "El prompt de la cuadrícula aquí (solo si pidieron gráficos, sino vacío)",
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
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
