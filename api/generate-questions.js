import { GoogleGenerativeAI } from "@google/generative-ai";

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
        const { images, grade, questionTypes } = req.body;

        if (!images || !images.length || !grade || !questionTypes || !questionTypes.length) {
            return res.status(400).json({ success: false, message: 'Faltan parámetros (imágenes, grado o tipos de pregunta)' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const imageParts = images.map(imgBase64 => {
            const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, '');
            return {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            };
        });

        // Verificamos si el usuario solicitó imágenes
        const requestsImages = questionTypes.includes('Ejercicios Gráficos (IA)');

        // 4. Prompt actualizado con instrucciones para imágenes
        const promptText = `
        Eres un experto pedagogo, paleógrafo y creador de material educativo para niños.
        Tu tarea es analizar las imágenes adjuntas (fotos de cuadernos escolares escritos a mano).
        Genera exactamente 20 preguntas evaluativas basadas EXCLUSIVAMENTE en esos apuntes.

        Criterios de adaptación:
        - El estudiante cursa el ${grade}° grado de primaria. Ajusta el vocabulario y dificultad.
        - Tipos de pregunta: ${questionTypes.join(', ')}.
        ${requestsImages ? `- ATENCIÓN: El usuario ha solicitado Ejercicios Gráficos. Para temas de geometría, ciencias, biología o conjuntos, incluye preguntas que requieran una imagen (requiresImage: true). Genera un imagePrompt detallado EN INGLÉS para que un modelo de generación de imágenes (FLUX) ilustre el concepto. Mantenlo en estilo 'educational textbook illustration, minimalist vector, clear lines'.` : ''}

        Estructura de la salida (JSON exacto):
        {
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "Pregunta formulada",
              "options": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
              "answer": "Respuesta correcta o sugerida",
              "requiresImage": false,
              "imagePrompt": "" 
            }
          ]
        }
        `;

        const requestContent = [promptText, ...imageParts];
        
        console.log("Enviando petición a Gemini...");
        const result = await model.generateContent(requestContent);
        const responseText = result.response.text();

        const parsedData = JSON.parse(responseText);

        // 5. Interceptar JSON y llamar a Runware (FLUX) en paralelo
        let finalQuestions = parsedData.questions;

        if (requestsImages && process.env.RUNWARE_API_KEY) {
            console.log("Procesando generación de imágenes con Runware...");
            
            finalQuestions = await Promise.all(parsedData.questions.map(async (q) => {
                if (q.requiresImage && q.imagePrompt) {
                    try {
                        const runwareResponse = await fetch('https://api.runware.ai/v1', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.RUNWARE_API_KEY}`
                            },
                            body: JSON.stringify([{
                                taskType: "imageInference",
                                taskUUID: crypto.randomUUID(), // Genera un ID único para la tarea
                                positivePrompt: q.imagePrompt,
                                model: "bfl-flux-2-klein-4b",
                                width: 1024,
                                height: 1024
                            }])
                        });
                        
                        const rwData = await runwareResponse.json();
                        
                        if (rwData && rwData.data && rwData.data[0] && rwData.data[0].imageURL) {
                            q.imageUrl = rwData.data[0].imageURL; // Inyecta la URL de FLUX en la pregunta
                        }
                    } catch (err) {
                        console.error(`Error generando imagen para pregunta ${q.id}:`, err);
                    }
                }
                return q;
            }));
        }

        // 6. Retornar al frontend con las URLs incluidas
        return res.status(200).json({
            success: true,
            questions: finalQuestions
        });

    } catch (error) {
        console.error('Error generando preguntas con Gemini/Runware:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error en el motor de IA al generar el cuestionario.',
            error: error.message 
        });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb', 
        },
    },
};
