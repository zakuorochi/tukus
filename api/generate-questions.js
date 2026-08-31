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

        // Validación más robusta: buscamos si algún tipo incluye la palabra "Gráficos"
        const requestsImages = questionTypes.some(type => type.includes('Gráficos'));

        const promptText = `
        Eres un pedagogo experto. Analiza las fotos de los apuntes escolares adjuntos.
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.
        
        ${requestsImages ? `ATENCIÓN: Se solicitaron ejercicios gráficos. Para algunas preguntas, establece "requiresImage": true y escribe en "imagePrompt" una descripción corta EN INGLÉS de la ilustración necesaria. Por ejemplo: "a simple line art illustration of a plant cell, educational style".` : ''}

        Devuelve un objeto JSON con esta estructura exacta:
        {
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
              "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
              "answer": "La respuesta correcta",
              "requiresImage": false,
              "imagePrompt": "" 
            }
          ]
        }
        `;

        console.log("Enviando petición a Gemini...");
        const result = await model.generateContent([promptText, ...imageParts]);
        const parsedData = JSON.parse(result.response.text());

        let finalQuestions = parsedData.questions;

        // Llamada a Runware (FLUX)
        if (requestsImages && process.env.RUNWARE_API_KEY) {
            console.log("Procesando imágenes con Runware FLUX...");
            
            finalQuestions = await Promise.all(parsedData.questions.map(async (q) => {
                if (q.requiresImage && q.imagePrompt) {
                    try {
                        const runwareResponse = await fetch('https://api.runware.ai/v1', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify([{
                                taskType: "imageInference",
                                taskUUID: crypto.randomUUID(),
                                positivePrompt: q.imagePrompt,
                                model: "bfl-flux-2-klein-4b",
                                width: 512, // Reducido para mayor velocidad y menor peso en el PDF
                                height: 512,
                                CFGScale: 3, // Parámetro recomendado para FLUX
                                steps: 20
                            }])
                        });
                        
                        const rwData = await runwareResponse.json();
                        
                        if (rwData && rwData.data && rwData.data[0] && rwData.data[0].imageURL) {
                            q.imageUrl = rwData.data[0].imageURL;
                            console.log(`Imagen generada para pregunta ${q.id}`);
                        }
                    } catch (err) {
                        console.error(`Error de Runware en pregunta ${q.id}:`, err);
                    }
                }
                return q;
            }));
        }

        return res.status(200).json({ success: true, questions: finalQuestions });

    } catch (error) {
        console.error('Error general:', error);
        return res.status(500).json({ success: false, message: 'Error procesando la IA.', error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: { sizeLimit: '4mb' },
        responseLimit: false,
    },
};
