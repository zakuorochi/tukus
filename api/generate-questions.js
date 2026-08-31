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

        // Modificación del Prompt: Un solo prompt maestro para 4 paneles
        const promptText = `
        Eres un pedagogo experto. Analiza las fotos de los apuntes adjuntos.
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.
        
        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos. NO pidas imágenes individuales. 
        En su lugar, crea UN SOLO "masterImagePrompt" EN INGLÉS que describa una cuadrícula de 4 secciones (2x2 grid educational image). 
        Ejemplo: "A 2x2 grid educational illustration. Section 1: Parts of a flower. Section 2: A plant cell. Section 3: Plantae kingdom chart. Section 4: Fungi kingdom chart."
        Además, asegúrate de que al menos 4 de tus preguntas hagan referencia a esta imagen (Ejemplo: "Observa la sección 1 de la cuadrícula. ¿Cuál es...?").` : ''}

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
            // Como responseMimeType es application/json, parseamos directamente
            parsedData = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Error al leer el JSON de Gemini. Texto crudo recibido:", rawText);
            return res.status(500).json({ 
                success: false, 
                message: 'La IA no devolvió un formato válido.',
                error: parseError.message 
            });
        }

        // Validación de seguridad: Si Gemini devolvió directamente un Array en lugar del objeto raíz
        if (Array.isArray(parsedData)) {
            parsedData = { questions: parsedData, masterImagePrompt: null };
        } else if (!parsedData.questions) {
            // Si devolvió un objeto pero puso las preguntas bajo otra llave
            parsedData.questions = [];
        }

        let finalQuestions = parsedData.questions;
        let masterImageUrl = null;

        // Llamada ÚNICA a Runware
        if (requestsImages && parsedData.masterImagePrompt && process.env.RUNWARE_API_KEY) {
            console.log("Procesando CUADRÍCULA MAESTRA con Runware FLUX...");
            try {
                const runwareResponse = await fetch('https://api.runware.ai/v1', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RUNWARE_API_KEY}` },
                    body: JSON.stringify([{
                        taskType: "imageInference",
                        taskUUID: crypto.randomUUID(),
                        positivePrompt: parsedData.masterImagePrompt,
                        model: "bfl-flux-2-klein-4b",
                        width: 1024, // Alta resolución para acomodar las 4 imágenes
                        height: 1024,
                        CFGScale: 3, 
                        steps: 25
                    }])
                });
                const rwData = await runwareResponse.json();
                if (rwData && rwData.data && rwData.data[0] && rwData.data[0].imageURL) {
                    masterImageUrl = rwData.data[0].imageURL;
                }
            } catch (err) {
                console.error(`Error de Runware en Cuadrícula Maestra:`, err);
            }
        }

        return res.status(200).json({ 
            success: true, 
            questions: finalQuestions,
            masterImageUrl: masterImageUrl
        });

    } catch (error) {
        console.error('Error general:', error);
        return res.status(500).json({ success: false, message: 'Error procesando la IA.', error: error.message });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' }, responseLimit: false },
};
