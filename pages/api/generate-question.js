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

        // 2. Inicializar la API de Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Usamos el modelo solicitado, forzando la salida a JSON
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 3. Preparar las imágenes para la API de Gemini
        const imageParts = images.map(imgBase64 => {
            const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, '');
            return {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            };
        });

        // 4. El "Prompt" (Instrucciones precisas al motor IA)
        const promptText = `
        Eres un experto pedagogo, paleógrafo y creador de material educativo para niños.
        Tu tarea es analizar las imágenes adjuntas, que son fotos de cuadernos escolares escritos a mano.
        Debes leer la información (incluso si la caligrafía infantil es difícil) y generar exactamente 20 preguntas evaluativas basadas EXCLUSIVAMENTE en el contenido de esos apuntes.

        Criterios de adaptación:
        - El estudiante cursa el ${grade}° grado de primaria. Ajusta el vocabulario, la dificultad y el tono de las respuestas a ese nivel cognitivo.
        - Los tipos de pregunta que debes generar son estrictamente de estas categorías: ${questionTypes.join(', ')}.

        Estructura de la salida:
        Debes devolver ÚNICAMENTE un objeto JSON válido, con la siguiente estructura exacta:
        {
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "Pregunta formulada",
              "options": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"], // Solo para Opción Múltiple, si no, déjalo vacío []
              "answer": "Respuesta correcta o sugerida"
            }
          ]
        }
        `;

        // 5. Llamada multimodal a Gemini
        const requestContent = [promptText, ...imageParts];
        
        console.log("Enviando petición a Gemini...");
        const result = await model.generateContent(requestContent);
        const responseText = result.response.text();

        // 6. Parseo del resultado JSON (Ya no necesita Regex porque forzamos JSON en la configuración)
        const parsedData = JSON.parse(responseText);

        // 7. Retornar al frontend
        return res.status(200).json({
            success: true,
            questions: parsedData.questions
        });

    } catch (error) {
        console.error('Error generando preguntas con Gemini:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error en el motor de IA al generar el cuestionario.',
            error: error.message 
        });
    }
}

// CORRECCIÓN CRÍTICA: Aumentar el límite de tamaño del body para que Next.js no corte la petición
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb', 
        },
    },
};
